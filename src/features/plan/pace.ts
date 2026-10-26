import type { RunAdvice } from '../injury/pain';
import type { RunInput } from '../injury/triggers';

const DAY_SEC = 86400;

export const PACE_LOOKBACK_DAYS = 90;
/** Lari lebih pendek dari ini tidak dipakai untuk menaksir pace (Run Now: 1,5 km). */
export const MIN_PACE_RUN_KM = 1.5;
/** Pace yang masuk akal untuk lari: 3 sampai 12 menit per km. */
export const MIN_SANE_PACE = 180;
export const MAX_SANE_PACE = 720;
/** Pace santai = median pace lari 90 hari ×1,05 (belum ada data detak, jadi sedikit lebih pelan dari rata-ratamu). */
export const EASY_FACTOR = 1.05;

export type DayKind = 'easy' | 'recovery' | 'long';

/** Pace santai (detik per km) dari lari terbaru, atau null kalau kurang dari 2 lari valid. */
export function easyPace(runs: readonly RunInput[], nowSec: number): number | null {
  const paces = runs
    .filter((r) => r.start > nowSec - PACE_LOOKBACK_DAYS * DAY_SEC && r.distance >= MIN_PACE_RUN_KM * 1000 && r.duration > 0)
    .map((r) => r.duration / (r.distance / 1000))
    .filter((p) => p >= MIN_SANE_PACE && p <= MAX_SANE_PACE)
    .sort((a, b) => a - b);
  if (paces.length < 2) return null;
  return paces[paces.length >> 1] * EASY_FACTOR;
}

export interface DayPaceInput {
  /** Pace santai, detik per km (dari `easyPace`). */
  easy: number;
  km: number;
  /** Hari lari panjang. */
  long: boolean;
  /** Minggu pemulihan. */
  recoveryWeek: boolean;
  /** Kemarin ada lari: pace hari ini sedikit lebih pelan. */
  afterRunDay: boolean;
  advice: RunAdvice;
}

export interface DayTarget {
  kind: DayKind;
  km: number;
  /** Batas cepat dan batas lambat, detik per km. */
  paceLo: number;
  paceHi: number;
  minutes: number;
  /** Nyeri sedang: pola lari-jalan ringan (1 menit lari, 2 menit jalan), waktu ×1,25. */
  slow: boolean;
}

/** Target satu hari lari. Null kalau nyeri berat: tidak ada lari hari itu. */
export function dayTarget(input: DayPaceInput): DayTarget | null {
  if (input.advice === 'stop') return null;
  let b = input.easy;
  if (input.recoveryWeek) b *= 1.04;
  if (input.afterRunDay) b *= 1.04;
  if (input.long) b *= 1.05;
  let slow = false;
  if (input.advice === 'noHard') {
    b *= 1.3;
    slow = true;
  } else if (input.advice === 'reduce') {
    b *= 1.12;
  }
  return {
    kind: input.long ? 'long' : input.recoveryWeek ? 'recovery' : 'easy',
    km: input.km,
    paceLo: Math.round(b * 0.97),
    paceHi: Math.round(b * 1.07),
    minutes: Math.round((input.km * b * 1.02 * (slow ? 1.25 : 1)) / 60),
    slow,
  };
}

/** 378 detik per km → "6:18". */
export function formatPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
