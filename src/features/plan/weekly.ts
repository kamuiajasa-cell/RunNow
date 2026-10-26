import type { RunAdvice } from '../injury/pain';
import type { RunInput } from '../injury/triggers';

const DAY_SEC = 86400;

/** Dasar jarak mingguan tidak pernah di bawah ini (Run Now: 6 km). */
export const MIN_BASE_KM = 6;
/** Kenaikan per minggu, kumulatif: 10 %, 10 %, 8 %, 5 %. */
export const GROWTH = [1.1, 1.1, 1.08, 1.05] as const;
/** Minggu pemulihan (tapering) memakai sebagian dari jarak yang tercapai. */
export const RECOVERY_FACTOR = 0.75;
/** Pengaman cedera: nyeri hanya boleh menurunkan batas, tidak pernah menaikkannya. */
export const PAIN_LIMIT_FACTOR: Record<RunAdvice, number> = { ok: 1, reduce: 0.7, noHard: 0.35, stop: 0 };

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Rata-rata km per minggu dari 28 hari sebelum `weekStart` (Senin 00.00 lokal, unix detik). */
export function baseWeeklyKm(runs: readonly RunInput[], weekStart: number): number {
  const from = weekStart - 28 * DAY_SEC;
  const km = runs.filter((r) => r.start >= from && r.start < weekStart && r.distance > 0).reduce((s, r) => s + r.distance, 0) / 1000;
  return Math.max(km / 4, MIN_BASE_KM);
}

/** Lama tidak lari menurunkan batas: lebih dari 14 hari ×0,8, lebih dari 7 hari ×0,9. Tanpa riwayat dihitung 99 hari. */
export function layoffFactor(runs: readonly RunInput[], weekStart: number): number {
  const before = runs.filter((r) => r.start < weekStart && r.distance > 0).map((r) => r.start);
  const gap = before.length ? Math.round((weekStart - Math.max(...before)) / DAY_SEC) : 99;
  return gap > 14 ? 0.8 : gap > 7 ? 0.9 : 1;
}

export interface WeeklyInput {
  runs: readonly RunInput[];
  /** Senin 00.00 lokal minggu pertama, unix detik. */
  weekStart: number;
  /** Berapa minggu yang direncanakan (2). */
  weeks: number;
  /** Indeks minggu pemulihan (0 atau 1), atau null kalau saklar tapering mati. */
  recoveryWeek: number | null;
  advice: RunAdvice;
}

export interface WeekTarget {
  /** Senin 00.00 lokal minggu ini, unix detik. */
  start: number;
  km: number;
  recovery: boolean;
}

/** Target jarak tiap minggu. Murni: hasilnya hanya bergantung pada masukannya. */
export function weeklyTargets(input: WeeklyInput): WeekTarget[] {
  const base = baseWeeklyKm(input.runs, input.weekStart);
  const gf = layoffFactor(input.runs, input.weekStart);
  const m = PAIN_LIMIT_FACTOR[input.advice];
  let cur = 1;
  let k = 0;
  return Array.from({ length: input.weeks }, (_, w) => {
    const recovery = w === input.recoveryWeek;
    let factor: number;
    if (recovery) factor = cur * RECOVERY_FACTOR;
    else {
      cur *= GROWTH[Math.min(k, GROWTH.length - 1)];
      k++;
      factor = cur;
    }
    return { start: input.weekStart + w * 7 * DAY_SEC, km: round1(base * factor * gf * m), recovery };
  });
                       }
