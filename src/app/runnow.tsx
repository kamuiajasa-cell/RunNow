import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import { listWorkouts, type WorkoutRow } from '@/db/queries';
import { isLinkUp } from '@/features/device/linkState';
import { RUNNOW_HTML } from '@/features/runnow/runnowHtml';
import { loadWellness, type WellnessRow } from '@/features/runnow/wellness';
import { useLiveHeartRate } from '@/features/today/useLiveHeartRate';
import { sportCategory } from '@/features/workouts/sportCategory';
import { useWatch } from '@/state/WatchProvider';
import { useTheme } from '@/theme';

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
  const { dataVersion, linkState } = useWatch();
  const { colors } = useTheme();
  const webRef = useRef<WebView>(null);
  const [loadCount, setLoadCount] = useState(0);

  // Detak live dari jam. Hook ini hanya meminta jam mengirim detak saat layar ini aktif dan aplikasi di depan.
  const live = useLiveHeartRate(isLinkUp(linkState));

  // Hanya MEMBACA database; tidak ada yang ditulis ke joyofit.db.
  const push = useCallback(async () => {
    try {
      const rows = await listWorkouts(db);
      const acts = rows.slice(0, 500).map(toAct).filter((a): a is Act => a !== null);
      // Hari tanpa data apa pun tidak dikirim, supaya tidak ada baris kosong di index.html.
      const wellness: WellnessRow[] = (await loadWellness(db)).filter((w) => Object.keys(w).length > 1);
      const payload = { acts, wellness };
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WebView
        ref={webRef}
        style={{ flex: 1, backgroundColor: colors.background }}
        originWhitelist={['*']}
        source={{ html: RUNNOW_HTML, baseUrl: 'https://runnow.local/' }}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => setLoadCount((n) => n + 1)}
        onError={(e) => console.warn('RunNow WebView error', e.nativeEvent)}
        onHttpError={(e) => console.warn('RunNow WebView HTTP', e.nativeEvent.statusCode, e.nativeEvent.url)}
      />
    </View>
  );
}
