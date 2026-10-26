import type { RunInput } from '../injury/triggers';
import { round1 } from './weekly';

const DAY_SEC = 86400;

export type RunDays = 3 | 4 | 5;

/** Hari lari per jumlah hari, Senin = 0: 3 hari Sen, Kam, Sab; 4 hari Sen, Rab, Kam, Sab; 5 hari ditambah Min. */
export const DAY_PATTERNS: Record<RunDays, readonly number[]> = {
  3: [0, 3, 5],
  4: [0, 2, 3, 5],
  5: [0, 2, 3, 5, 6],
};
/** Hari terakhir dalam pola = lari panjang, dengan bobot lebih besar. */
export const LONG_RUN_WEIGHT = 1.6;
/** Lari panjang tidak lebih dari lari terpanjang terakhir ×1,1, tapi boleh sampai 5 km. */
export const LONG_RUN_GROWTH = 1.1;
export const LONG_RUN_FLOOR_KM = 5;
/** Sisa jarak di bawah ini tidak dibagi lagi. */
export const MIN_REMAINDER_KM = 2;
/** Satu lari tidak lebih pendek dari ini: hari paling awal dibuang dulu sampai cukup. */
export const MIN_RUN_KM = 2.5;

/** Hari lari panjang untuk pola ini: hari terakhirnya. */
export function longRunDay(runDays: RunDays): number {
  const days = DAY_PATTERNS[runDays];
  return days[days.length - 1];
}

/** Jumlah lari per minggu dari 28 hari terakhir, dibulatkan dan dijepit 3 sampai 5. */
export function runDaysPerWeek(runs: readonly RunInput[], nowSec: number): RunDays {
  const n = runs.filter((r) => r.start > nowSec - 28 * DAY_SEC && r.distance >= 1000).length / 4;
  return Math.max(3, Math.min(5, Math.round(n))) as RunDays;
}

/** Lari terpanjang 28 hari terakhir, km. */
export function longestRecentKm(runs: readonly RunInput[], nowSec: number): number {
  return Math.max(0, ...runs.filter((r) => r.start > nowSec - 28 * DAY_SEC).map((r) => r.distance)) / 1000;
}

export interface DaysInput {
  /** Target jarak minggu ini, km. */
  targetKm: number;
  runDays: RunDays;
  longestKm: number;
  /** Tujuh nilai (Senin sampai Minggu): km yang sudah ada, baik lari nyata maupun isian sendiri; 0 = kosong. */
  fixed: readonly number[];
  /** Tujuh nilai: hari yang sudah lewat tidak boleh diisi rencana. */
  locked: readonly boolean[];
}

/**
 * Membagi sisa jarak minggu ini ke hari-hari lari yang masih kosong. Mengembalikan tujuh nilai: yang sudah ada
 * tetap, yang baru direncanakan terisi, sisanya 0 (istirahat).
 */
export function distributeWeek(input: DaysInput): number[] {
  const out = input.fixed.map((k) => (k > 0 ? k : 0));
  const rem = input.targetKm - out.reduce((s, k) => s + k, 0);
  if (!(rem >= MIN_REMAINDER_KM)) return out;
  const long = longRunDay(input.runDays);
  const open = DAY_PATTERNS[input.runDays].filter((d) => !input.locked[d] && out[d] <= 0);
  while (open.length > 1 && rem / open.length < MIN_RUN_KM) open.shift();
  if (open.length === 0) return out;
  const weights = open.map((d) => (d === long ? LONG_RUN_WEIGHT : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  open.forEach((d, i) => {
    let km = (rem * weights[i]) / sum;
    if (d === long) km = Math.min(km, Math.max(LONG_RUN_FLOOR_KM, input.longestKm * LONG_RUN_GROWTH));
    out[d] = round1(km);
  });
  return out;
}
