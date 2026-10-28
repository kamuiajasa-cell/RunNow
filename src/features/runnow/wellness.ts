import type { SQLiteDatabase } from 'expo-sqlite';

import {
  listDailySteps,
  listHrvReadingsSince,
  listRestingHeartRateByDay,
  listSleepScores,
  listSleepSince,
} from '@/db/queries';
import { buildNights, sleepByDay } from '@/features/sleep/nights';
import { addDays, dayBounds } from '@/features/trends/series';
import { startOfLocalDay } from '@/features/today/stats';

/** Satu hari di S.wellness milik index.html. Field yang tidak ada di database tidak dikirim (tidak ditimpa null). */
export interface WellnessRow {
  id: string;
  restingHR?: number;
  hrv?: number;
  sleepSecs?: number;
  steps?: number;
}

/** Tanggal lokal YYYY-MM-DD dari detik unix (awal hari lokal). */
function localId(sec: number): string {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Wellness per hari untuk `days` hari terakhir, dengan rumus yang sama seperti tab Hari ini dan Tren:
 * - steps: jumlah langkah per hari lokal (listDailySteps)
 * - restingHR: nadi istirahat terendah hari itu (listRestingHeartRateByDay)
 * - sleepSecs: tidur yang berakhir di hari itu, termasuk tidur siang (buildNights + sleepByDay), dalam detik
 * - hrv: bacaan HRV malam terakhir yang berakhir di hari itu (rmssd, ms)
 * Hanya membaca database.
 */
export async function loadWellness(db: SQLiteDatabase, days = 60): Promise<WellnessRow[]> {
  const today = startOfLocalDay(Math.floor(Date.now() / 1000));
  const dayStarts: number[] = [];
  for (let i = days - 1; i >= 0; i--) dayStarts.push(addDays(today, -i));
  const bounds = dayBounds(dayStarts);

  const [steps, resting, segments, scores, hrv] = await Promise.all([
    listDailySteps(db, bounds),
    listRestingHeartRateByDay(db, bounds),
    listSleepSince(db, dayStarts[0] - 12 * 3600),
    listSleepScores(db),
    listHrvReadingsSince(db, dayStarts[0]),
  ]);

  const sleep = sleepByDay(buildNights(segments, scores));

  return dayStarts.map((start, i) => {
    const end = i + 1 < dayStarts.length ? dayStarts[i + 1] : addDays(start, 1);
    const row: WellnessRow = { id: localId(start) };

    const st = steps.get(start);
    if (st && st > 0) row.steps = st;

    const rhr = resting.get(start);
    if (rhr && rhr > 0) row.restingHR = rhr;

    const asleep = sleep.get(start)?.asleepSeconds;
    if (asleep && asleep > 0) row.sleepSecs = Math.round(asleep);

    // Bacaan malam terakhir yang berakhir di hari ini (sama dengan kartu HRV di tren).
    let lastNight: number | undefined;
    let lastEnd = -Infinity;
    for (const r of hrv) {
      if (r.source !== 'night' || !(r.rmssd > 0)) continue;
      if (r.end < start || r.end >= end) continue;
      if (r.end > lastEnd) {
        lastEnd = r.end;
        lastNight = r.rmssd;
      }
    }
    if (lastNight !== undefined) row.hrv = Math.round(lastNight);

    return row;
  });
}
