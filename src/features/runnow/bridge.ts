import type { SQLiteDatabase } from 'expo-sqlite';

import { getWorkout, listWorkoutPoints, listWorkouts, type WorkoutPointRow } from '@/db/queries';
import { sportCategory } from '@/features/workouts/sportCategory';
import { parseSummary } from '@/features/workouts/summary';

/** Berapa latihan yang dikirim, berapa di antaranya lengkap dengan titik, dan batas titik per latihan. */
const MAX_WORKOUTS = 40;
const WITH_POINTS = 15;
const MAX_POINTS = 300;

/** [tSec sejak mulai, hr, speed m/s, alt m, cadence spm, lat, lon]: urutan yang dibaca index.html. */
type Pt = [number, number | null, number | null, number | null, number | null, number | null, number | null];

export interface WatchWorkout {
  start: number; // ms
  kind: 'run' | 'ride' | 'walk' | 'weight' | 'other';
  sport: string;
  durSec: number;
  movSec: number;
  distM: number;
  kcal: number;
  steps: number;
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  cad: number | null;
  strideM: number | null;
  avgPaceSec: number | null;
  elevUp: number | null;
  elevDown: number | null;
  aerobic: number | null;
  anaerobic: number | null;
  load: number | null;
  recoveryH: number | null;
  vo2max: number | null;
  pts: Pt[];
  /** Hitungan dari database jam, untuk catatan di index.html. Tidak ada untuk latihan di luar 15 terbaru. */
  diag?: { rows: number; hr: number; summary: boolean };
}

const toSec = (ts: number) => (ts > 1e11 ? ts / 1000 : ts);

function meters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Kecepatan dari jarak antar titik GPS di mana baris tidak membawa kecepatan. */
function fillSpeed(grid: Pt[], step: number): void {
  let prev = -1;
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i];
    if (!g || g[5] == null || g[6] == null) continue;
    const p = prev >= 0 ? grid[prev] : undefined;
    if (p && p[5] != null && p[6] != null) {
      const v = meters(p[5], p[6], g[5], g[6]) / ((i - prev) * step);
      if (v < 12) {
        for (let k = prev + 1; k <= i; k++) {
          const q = grid[k];
          if (q && q[2] == null) q[2] = v;
        }
      }
    }
    prev = i;
  }
}

/** Baris titik tiap sumber hanya berisi sebagian kolom (GPS: lat/lon; sampel: hr/alt), jadi digabung ke grid waktu yang rata. */
function resample(rows: WorkoutPointRow[], start: number, spanSec: number): Pt[] {
  if (rows.length === 0) return [];
  const step = Math.max(1, Math.ceil(spanSec / MAX_POINTS));
  const n = Math.floor(spanSec / step) + 1;
  const grid: Pt[] = Array.from({ length: n }, (_, i) => [i * step, null, null, null, null, null, null]);
  for (const r of rows) {
    const g = grid[Math.round((toSec(r.ts) - start) / step)];
    if (!g) continue;
    if (r.hr != null && r.hr > 0) g[1] = r.hr;
    if (r.speed != null) g[2] = r.speed;
    if (r.alt != null) g[3] = r.alt;
    if (r.cadence != null) g[4] = r.cadence;
    if (r.lat != null && r.lon != null) {
      g[5] = r.lat;
      g[6] = r.lon;
    }
  }
  fillSpeed(grid, step);
  let last = grid.length - 1;
  while (last > 0 && grid[last]!.slice(1).every((v) => v == null)) last--;
  return grid.slice(0, last + 1);
}

const kindOf = (c: string): WatchWorkout['kind'] =>
  c === 'run' ? 'run' : c === 'ride' ? 'ride' : c === 'walk' ? 'walk' : c === 'gym' ? 'weight' : 'other';

const mean = (v: (number | null)[]): number | null => {
  const x = v.filter((n): n is number => n != null && n > 0);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};

export async function buildWorkouts(db: SQLiteDatabase): Promise<WatchWorkout[]> {
  const rows = (await listWorkouts(db)).filter((w) => w.complete && w.duration > 0).slice(0, MAX_WORKOUTS);
  const out: WatchWorkout[] = [];
  for (let i = 0; i < rows.length; i++) {
    const w = rows[i]!;
    const full = await getWorkout(db, w.id);
    const s = parseSummary(full?.summaryJson ?? '{}');
    const rawPts = i < WITH_POINTS ? await listWorkoutPoints(db, w.id) : null;
    const pts = rawPts ? resample(rawPts, w.start, Math.max(w.end - w.start, w.duration)) : [];
    const km = w.distance / 1000;
    out.push({
      start: w.start * 1000,
      kind: kindOf(sportCategory(w.sportName, s.kind)),
      sport: w.sportName,
      durSec: w.duration,
      movSec: w.duration,
      distM: w.distance,
      kcal: w.calories,
      steps: w.steps,
      avgHr: w.avgHr,
      maxHr: w.maxHr,
      minHr: s.minHr ?? null,
      cad: s.avgCadence ?? mean(pts.map((p) => p[4])),
      strideM: s.avgStepLengthM ?? null,
      avgPaceSec: s.avgPaceSecPerKm ?? (km > 0 ? w.duration / km : null),
      elevUp: s.elevationGain ?? null,
      elevDown: s.elevationLoss ?? null,
      aerobic: s.aerobicEffect ?? null,
      anaerobic: s.anaerobicEffect ?? null,
      load: s.workoutLoad ?? null,
      recoveryH: s.recoveryHours ?? null,
      vo2max: s.vo2max ?? null,
      pts,
      diag: rawPts
        ? {
            rows: rawPts.length,
            hr: rawPts.filter((r) => r.hr != null && r.hr > 0).length,
            summary: !!full?.summaryJson && full.summaryJson !== '{}',
          }
        : undefined,
    });
  }
  return out;
}

/** Bentuk yang diterima window.nativeImport di index.html. Wellness (HR istirahat, HRV, tidur) belum dikirim. */
export async function buildPayload(db: SQLiteDatabase) {
  const workouts = await buildWorkouts(db);
  const acts = workouts.map((w) => [
    w.start,
    w.kind,
    w.movSec / 60,
    w.distM / 1000,
    w.avgHr ?? 0,
    w.maxHr ?? 0,
    null,
    w.cad ?? 0,
    w.load ?? null,
  ]);
  return { acts, workouts };
}
