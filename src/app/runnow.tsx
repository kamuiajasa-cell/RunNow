import { useSQLiteContext } from 'expo-sqlite';
import { useEventListener } from 'expo';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { listWorkouts, type WorkoutRow } from '@/db/queries';
import { isLinkUp } from '@/features/device/linkState';
import { RUNNOW_HTML } from '@/features/runnow/runnowHtml';
import { buildWorkouts } from '@/features/runnow/bridge';
import { applyPlan, showTest } from '@/features/runnow/notify';
import { runRpc } from '@/features/runnow/rpc';
import { loadWellness, type WellnessRow } from '@/features/runnow/wellness';
import { useLiveHeartRate } from '@/features/today/useLiveHeartRate';
import { sportCategory } from '@/features/workouts/sportCategory';
import { useWatch } from '@/state/WatchProvider';
import { HuaweiWear } from '@/wear';
import { useTheme } from '@/theme';

/** Alamat halaman yang bisa diubah tanpa build APK. Hanya alamat ini (dan versi bawaan) yang boleh dibuka dan dipercaya. */
const REMOTE_PAGE = 'https://runnow2.kamui-aja-sa.workers.dev/';
/** Ubah ke true hanya setelah halaman di alamat itu sudah berisi versi terbaru index.html (ada Cadangan data dan Pengaturan jam). */
const USE_REMOTE_PAGE = true;
const BUNDLED_ORIGIN = 'https://runnow.local/';

/**
 * index.html punya sistem notifikasi yang memanggil Android.setPlan(json) dan Android.test(...).
 * WebView tidak punya objek Android, jadi dipasang penggantinya yang meneruskan panggilan itu ke React Native.
 * Dipasang sebelum halaman dimuat, jadi berlaku untuk versi bawaan maupun versi online.
 */
const ANDROID_SHIM = `window.Android={
  setPlan:function(j){window.ReactNativeWebView.postMessage(JSON.stringify({type:"plan",plan:j}))},
  test:function(t,b,g){window.ReactNativeWebView.postMessage(JSON.stringify({type:"test",title:t,body:b,big:g}))}
};true;`;

/** Bentuk satu latihan di S.acts milik index.html: [startMs, jenis, menit, km, avgHR, maxHR, bestSegs, cadence, load, id]. */
type Act = [number, 'run' | 'ride' | 'walk' | 'weight' | 'other', number, number, number, number, null, number, number, string];

function toAct(w: WorkoutRow): Act | null {
  if (!w.complete || w.duration <= 0) return null;
  const cat = sportCategory(w.sportName);
  const kind = cat === 'run' || cat === 'walk' || cat === 'ride' ? cat : cat === 'gym' ? 'weight' : 'other';
  // start dan duration di database dalam detik, distance dalam meter; index.html memakai ms, menit, km.
  return [w.start * 1000, kind, w.duration / 60, w.distance / 1000, w.avgHr ?? 0, w.maxHr ?? 0, null, 0, 0, `jf:${w.start}`];
}

export default function RunNowScreen() {
  const db = useSQLiteContext();
  const { dataVersion, linkState, sync } = useWatch();
  const router = useRouter();
  const { colors } = useTheme();
  const webRef = useRef<WebView>(null);
  const [loadCount, setLoadCount] = useState(0);
  // Kalau alamat online gagal dimuat, pakai versi bawaan di dalam APK.
  const [useBundled, setUseBundled] = useState(false);
  const remote = USE_REMOTE_PAGE && !useBundled;
  const source = remote ? { uri: REMOTE_PAGE } : { html: RUNNOW_HTML, baseUrl: BUNDLED_ORIGIN };

  const isTrusted = (url: string | undefined) =>
    !!url && (url.startsWith(BUNDLED_ORIGIN) || (USE_REMOTE_PAGE && url.startsWith(REMOTE_PAGE)));
  // Mode bawaan: konten milik kita dan navigasinya dikunci, jadi semua pesan dari sini dipercaya.
  // Mode online: hanya pesan dari alamat online yang dipercaya.

  // Hanya halaman tepercaya yang boleh dibuka di layar ini. Tautan lain dibuka di browser.
  const onShouldStart = useCallback((req: WebViewNavigation | { url: string }) => {
    if (isTrusted(req.url) || req.url === 'about:blank') return true;
    void Linking.openURL(req.url).catch(() => undefined);
    return false;
  }, []);

  const onFail = useCallback(() => {
    if (remote) setUseBundled(true);
  }, [remote]);

  // Detak live dari jam. Hook ini hanya meminta jam mengirim detak saat layar ini aktif dan aplikasi di depan.
  const live = useLiveHeartRate(isLinkUp(linkState));

  // Hanya MEMBACA database; tidak ada yang ditulis ke joyofit.db.
  const push = useCallback(async () => {
    try {
      const rows = await listWorkouts(db);
      const acts = rows.slice(0, 500).map(toAct).filter((a): a is Act => a !== null);
      // Hari tanpa data apa pun tidak dikirim, supaya tidak ada baris kosong di index.html.
      const wellness: WellnessRow[] = (await loadWellness(db)).filter((w) => Object.keys(w).length > 1);
      // Latihan detail (grafik, zona, titik GPS/detak) untuk halaman Aktivitas di index.html.
      const workouts = await buildWorkouts(db);
      const payload = { acts, workouts, wellness };
      webRef.current?.injectJavaScript(`window.nativeImport && window.nativeImport(${JSON.stringify(payload)}); true;`);
    } catch (e) {
      console.warn('RunNow: kirim data gagal', e);
    }
  }, [db]);

  // Sekali setelah halaman selesai dimuat, dan lagi setiap sinkron jam menyimpan data baru.
  useEffect(() => {
    if (loadCount > 0) void push();
  }, [loadCount, dataVersion, push]);

  // Setiap bacaan detak dari jam diteruskan ke grafik live di index.html.
  useEffect(() => {
    if (!live) return;
    webRef.current?.injectJavaScript(
      `window.nativeLiveHr && window.nativeLiveHr(${JSON.stringify(live.bpm)}, ${JSON.stringify(live.ts)}); true;`,
    );
  }, [live]);

  // Panggilan dari index.html (pengaturan jam). Hanya metode yang diizinkan di rpcRules.ts yang dijalankan.
  const onMessage = useCallback((e: WebViewMessageEvent) => {
    // Navigasi WebView sudah dikunci ke halaman tepercaya (onShouldStart), jadi pesan datang dari sana.
    let msg: { type?: unknown; id?: unknown; method?: unknown; args?: unknown; plan?: unknown; title?: unknown; body?: unknown; big?: unknown };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    // Teks di baris status kartu Notifikasi index.html (elemen #nm), kalau kartunya sedang tampil.
    const say = (text: string) =>
      webRef.current?.injectJavaScript(`var e=document.getElementById("nm");if(e)e.textContent=${JSON.stringify(text)};true;`);
    if (msg.type === 'plan' && typeof msg.plan === 'string') {
      void applyPlan(msg.plan).then((r) => {
        if (r === 'denied') say('Izin notifikasi belum diberikan. Aktifkan lewat Pengaturan Android, Aplikasi, Run Now, Notifikasi.');
      });
      return;
    }
    if (msg.type === 'test' && typeof msg.title === 'string') {
      void showTest({
        title: msg.title,
        body: typeof msg.body === 'string' ? msg.body : '',
        big: typeof msg.big === 'string' ? msg.big : undefined,
      }).then((ok) => {
        if (!ok) say('Gagal mengirim notifikasi tes. Cek izin notifikasi di Pengaturan Android.');
      });
      return;
    }
    if (msg.type !== 'rpc' || typeof msg.id !== 'number' || typeof msg.method !== 'string') return;
    const id = msg.id;
    const args = Array.isArray(msg.args) ? msg.args : [];
    const reply = (ok: boolean, value: unknown) =>
      webRef.current?.injectJavaScript(`window.__rn && window.__rn(${id}, ${ok}, ${JSON.stringify(value ?? null)}); true;`);
    runRpc(msg.method, args, { sync: () => sync(), open: (route) => router.navigate(route as Href) }).then(
      (value) => reply(true, value),
      (err: unknown) => reply(false, err instanceof Error ? err.message : String(err)),
    );
  }, [sync, router]);

  // Progres hitung mundur HRV dari jam, diteruskan ke halaman.
  useEventListener(HuaweiWear, 'onHrvProgress', (ev) => {
    webRef.current?.injectJavaScript(`window.__hrvTick && window.__hrvTick(${Number(ev.secondsLeft)}); true;`);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WebView
        ref={webRef}
        style={{ flex: 1, backgroundColor: colors.background }}
        originWhitelist={['*']}
        source={source}
        injectedJavaScriptBeforeContentLoaded={ANDROID_SHIM}
        onShouldStartLoadWithRequest={onShouldStart}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => setLoadCount((n) => n + 1)}
        onMessage={onMessage}
        onError={(e) => {
          console.warn('RunNow WebView error', e.nativeEvent);
          onFail();
        }}
        onHttpError={(e) => {
          console.warn('RunNow WebView HTTP', e.nativeEvent.statusCode, e.nativeEvent.url);
          if (e.nativeEvent.statusCode >= 500) onFail();
        }}
      />
    </View>
  );
}
