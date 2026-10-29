import { useEventListener } from 'expo';
import { useIsFocused } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildPayload } from '@/features/runnow/bridge';
import { INDEX_HTML } from '@/features/runnow/indexHtml';
import { applyPlan, showTest } from '@/features/runnow/notify';
import { useWatch } from '@/state/WatchProvider';
import { HuaweiWear } from '@/wear';

/**
 * index.html sudah punya sistem notifikasi untuk APK lamanya: ia memanggil Android.setPlan(json) dan Android.test(...).
 * WebView ini tidak punya objek Android, jadi kita pasang penggantinya yang meneruskan panggilan itu ke React Native.
 * HTML tidak perlu diubah.
 */
const ANDROID_SHIM = `window.Android={
  setPlan:function(j){window.ReactNativeWebView.postMessage(JSON.stringify({type:"plan",plan:j}))},
  test:function(t,b,g){window.ReactNativeWebView.postMessage(JSON.stringify({type:"test",title:t,body:b,big:g}))}
};true;`;

type Msg = { type?: string; on?: boolean; plan?: string; title?: string; body?: string; big?: string };

/** Run Now: index.html di dalam WebView.
 * - Data latihan dari joyofit.db dikirim ke window.nativeImport (hanya dibaca, tidak ditulis).
 * - HR live: HTML meminta lewat postMessage {type:"live", on}; bacaan jam diteruskan ke window.LV.add(bpm, ts).
 * - Notifikasi: Android.setPlan / Android.test dari HTML dijadwalkan sebagai notifikasi lokal Android.
 */
export default function RunNowScreen() {
  const db = useSQLiteContext();
  const { dataVersion, linkState } = useWatch();
  const ref = useRef<WebView>(null);
  const loaded = useRef(false);
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(() => AppState.currentState === 'active');
  const [htmlWantsLive, setHtmlWantsLive] = useState(false);

  const push = useCallback(async () => {
    try {
      const payload = await buildPayload(db);
      ref.current?.injectJavaScript(`window.nativeImport&&window.nativeImport(${JSON.stringify(payload)});true;`);
    } catch (e) {
      console.warn('RunNow: gagal mengirim data', e);
    }
  }, [db]);

  useEffect(() => {
    if (loaded.current) void push();
  }, [dataVersion, push]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  useEventListener(HuaweiWear, 'onHeartRate', (e) => {
    ref.current?.injectJavaScript(`window.LV&&window.LV.add(${Number(e.bpm)},${Number(e.ts)});true;`);
  });

  const linkUp = linkState === 'connected' || linkState === 'syncing';
  const wanted = htmlWantsLive && focused && foreground && linkUp;
  useEffect(() => {
    if (!wanted) return;
    HuaweiWear.setLiveHeartRate(true).catch((e: unknown) => console.warn('HR live tidak menyala', e));
    return () => {
      HuaweiWear.setLiveHeartRate(false).catch((e: unknown) => console.warn('HR live tidak berhenti', e));
    };
  }, [wanted]);

  /** Menulis pesan ke baris status di kartu Notifikasi HTML (elemen #nm), kalau kartunya sedang tampil. */
  const say = (text: string) =>
    ref.current?.injectJavaScript(`var e=document.getElementById("nm");if(e)e.textContent=${JSON.stringify(text)};true;`);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: Msg;
    try {
      m = JSON.parse(e.nativeEvent.data) as Msg;
    } catch {
      return; // pesan yang bukan JSON diabaikan
    }
    if (m.type === 'live') setHtmlWantsLive(m.on === true);
    else if (m.type === 'plan' && typeof m.plan === 'string') {
      void applyPlan(m.plan).then((r) => {
        if (r === 'denied') say('Izin notifikasi belum diberikan. Aktifkan lewat Pengaturan Android, Aplikasi, Run Now, Notifikasi.');
      });
    } else if (m.type === 'test' && typeof m.title === 'string') {
      void showTest({ title: m.title, body: m.body ?? '', big: m.big }).then((ok) => {
        if (!ok) say('Gagal mengirim notifikasi tes. Cek izin notifikasi di Pengaturan Android.');
      });
    }
  };

  return (
    <WebView
      ref={ref}
      originWhitelist={['https://runnow.local']}
      source={{ html: INDEX_HTML, baseUrl: 'https://runnow.local/' }}
      injectedJavaScriptBeforeContentLoaded={ANDROID_SHIM}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      onMessage={onMessage}
      onLoadEnd={() => {
        loaded.current = true;
        void push();
      }}
    />
  );
}
