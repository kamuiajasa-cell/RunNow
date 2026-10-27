import type { WeekPhase } from '../coach/plans/types';
import type { RunAdvice } from '../injury/pain';
import type { RunInput } from '../injury/triggers';
import type { CoachHints, CoachSession } from './coachHints';
import { distributeWeek, longestRecentKm, longRunDay, runDaysPerWeek, type RunDays } from './days';
import { dayTarget, easyPace, type DayTarget } from './pace';
import { round1, weeklyTargets } from './weekly';

/** Rencana dua minggu: minggu ini (rinci) dan minggu depan (draf). */
export const PLAN_WEEKS = 2;
/** Lari panjang hanya kalau jaraknya memang panjang. */
export const LONG_RUN_MIN_KM = 4;
/** Sesi keras Coach: hanya dijalankan kalau tidak ada nyeri sama sekali. */
const HARD_TYPES: ReadonlySet<string> = new Set(['tempo', 'intervals', 'race', 'retest']);

export type DayStatus = 'past' | 'today' | 'future';

export interface PlanDay {
  /** Tengah malam lokal, unix detik. */
  start: number;
  status: DayStatus;
  /** Km yang benar-benar dilari hari itu (dari jam). */
  doneKm: number;
  /** Km hari itu: yang sudah dilari, isian sendiri, atau saran rencana. 0 = istirahat. */
  km: number;
  /** True kalau `km` datang dari isian sendiri. */
  edited: boolean;
  /** Sesi Coach hari itu (jenisnya sudah diturunkan ke santai kalau ada nyeri), atau null. */
  coach: CoachSession | null;
  /** Sesi keras Coach diganti lari santai karena nyeri. */
  downgraded: boolean;
  /** Target pace dan waktu. Null untuk hari yang sudah dilari, hari istirahat, sesi keras, nyeri berat, atau pace belum diketahui. */
  target: DayTarget | null;
}

export interface PlanWeek {
  /** Senin 00.00 lokal, unix detik. */
  start: number;
  /** Batas jarak minggu ini, km. */
  targetKm: number;
  /** Minggu pemulihan: dipilih sendiri, atau fase cutback dan taper dari Coach. */
  recovery: boolean;
  /** Fase minggu ini menurut Coach, null kalau tanpa Coach. */
  coachPhase: WeekPhase | null;
  /** Coach meminta lebih banyak dari yang aman: jarak dibatasi pengaman cedera. */
  capped: boolean;
  plannedKm: number;
  doneKm: number;
  days: PlanDay[];
}

export interface Plan {
  weeks: PlanWeek[];
  runDays: RunDays;
  /** False kalau lari terbaru belum cukup untuk menaksir pace: hari lari tetap diisi, tapi tanpa target pace. */
  paceKnown: boolean;
  coach: CoachHints | null;
}

export interface PlanInput {
  runs: readonly RunInput[];
  nowSec: number;
  /** Tengah malam lokal hari ini, unix detik. */
  todayStart: number;
  advice: RunAdvice;
  /** Minggu pemulihan (0 = minggu ini, 1 = minggu depan), atau null kalau saklar tapering mati. */
  recoveryWeek: number | null;
  /** Isian sendiri per hari: kunci dari `overrideKey`, nilai km. */
  overrides?: Readonly<Record<string, number>>;
  /** Rencana Coach untuk dua minggu ini (dari `coachHints`), atau null. */
  coach?: CoachHints | null;
}

export const overrideKey = (week: number, day: number): string => `${week}-${day}`;

/** Tengah malam lokal `offset` hari setelah `base` (aman terhadap pergantian jam musim). */
export function dayStartOf(base: number, offset: number): number {
  const d = new Date(base * 1000);
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Senin 00.00 lokal pada pekan yang memuat `todayStart`. */
export function mondayStart(todayStart: number): number {
  const back = (new Date(todayStart * 1000).getDay() + 6) % 7;
  return dayStartOf(todayStart, -back);
}

/** Sesi keras Coach turun jadi lari santai kalau ada nyeri; yang lain apa adanya. */
function effectiveSession(s: CoachSession | null, advice: RunAdvice): { session: CoachSession | null; downgraded: boolean } {
  if (s && advice !== 'ok' && HARD_TYPES.has(s.type)) return { session: { ...s, type: 'easy' }, downgraded: true };
  return { session: s, downgraded: false };
}

/**
 * Merangkai batas mingguan, pembagian hari, dan target pace menjadi rencana dua minggu. Murni. Dengan rencana Coach:
 * hari lari dan jenis sesinya dari Coach, jarak mingguan = yang lebih kecil antara permintaan Coach (menit diubah
 * ke km dengan pace santai) dan batas aman dari riwayat lari dan nyeri.
 */
export function buildPlan(input: PlanInput): Plan {
  const { runs, nowSec, todayStart, advice } = input;
  const overrides = input.overrides ?? {};
  const hints = input.coach ?? null;
  const weekStart = mondayStart(todayStart);
  const runDays = runDaysPerWeek(runs, nowSec);
  const longest = longestRecentKm(runs, nowSec);
  const easy = easyPace(runs, nowSec);
  const targets = weeklyTargets({ runs, weekStart, weeks: PLAN_WEEKS, recoveryWeek: input.recoveryWeek, advice });

  const total = 7 * PLAN_WEEKS;
  // Awal tiap hari dari kemarin (offset -1) sampai batas akhir pekan kedua.
  const starts = Array.from({ length: total + 2 }, (_, k) => dayStartOf(weekStart, k - 1));
  const actualKm = (off: number): number =>
    runs.filter((r) => r.start >= starts[off + 1] && r.start < starts[off + 2]).reduce((s, r) => s + r.distance, 0) / 1000;
  const todayOff = Math.max(0, starts.indexOf(todayStart) - 1);

  const planned: number[][] = [];
  const edited: boolean[][] = [];
  const sessions: { session: CoachSession | null; downgraded: boolean }[][] = [];
  const weekTargets: number[] = [];
  const capped: boolean[] = [];
  for (let w = 0; w < PLAN_WEEKS; w++) {
    const fixed: number[] = [];
    const locked: boolean[] = [];
    const own: boolean[] = [];
    for (let d = 0; d < 7; d++) {
      const off = w * 7 + d;
      const done = actualKm(off);
      const mine = overrides[overrideKey(w, d)] ?? 0;
      const past = off < todayOff;
      locked.push(past);
      own.push(!past && done <= 0 && mine > 0);
      fixed.push(past || done > 0 ? done : mine > 0 ? mine : 0);
    }
    const coachDays = hints?.weeks[w]?.days ?? [];
    const eff = Array.from({ length: 7 }, (_, d) => effectiveSession(coachDays[d] ?? null, advice));
    const coachIdx = eff.flatMap((e, d) => (e.session ? [d] : []));
    const useCoach = coachIdx.length > 0;

    let target = targets[w].km;
    let isCapped = false;
    if (useCoach && easy !== null) {
      const minutes = eff.reduce((s, e) => s + (e.session?.minutes ?? 0), 0);
      const coachKm = round1((minutes * 60) / easy);
      isCapped = coachKm > target;
      target = Math.min(target, coachKm);
    }
    planned.push(
      distributeWeek({
        targetKm: target,
        runDays,
        longestKm: longest,
        fixed,
        locked,
        ...(useCoach
          ? {
              pattern: coachIdx,
              weightByDay: eff.map((e) => e.session?.minutes ?? 0),
              longDay: eff.findIndex((e) => e.session?.type === 'long'),
            }
          : {}),
      }),
    );
    edited.push(own);
    sessions.push(eff);
    weekTargets.push(target);
    capped.push(isCapped);
  }

  const kmAt = (off: number): number => (off < 0 ? actualKm(off) : (planned[Math.floor(off / 7)]?.[off % 7] ?? 0));

  const weeks: PlanWeek[] = planned.map((kms, w) => {
    const phase = hints?.weeks[w]?.phase ?? null;
    const recovery = targets[w].recovery || phase === 'cutback' || phase === 'taper';
    const days: PlanDay[] = kms.map((km, d) => {
      const off = w * 7 + d;
      const doneKm = actualKm(off);
      const status: DayStatus = off < todayOff ? 'past' : off === todayOff ? 'today' : 'future';
      const { session, downgraded } = sessions[w][d];
      const hard = session !== null && HARD_TYPES.has(session.type);
      const wantsTarget = status !== 'past' && doneKm <= 0 && km > 0 && easy !== null && !hard;
      const isLong = session ? session.type === 'long' : d === longRunDay(runDays) && km >= LONG_RUN_MIN_KM;
      const target = wantsTarget
        ? dayTarget({
            easy,
            km,
            long: isLong,
            recoveryWeek: recovery || session?.type === 'recovery',
            afterRunDay: kmAt(off - 1) > 0,
            advice,
          })
        : null;
      return { start: starts[off + 1], status, doneKm: round1(doneKm), km, edited: edited[w][d], coach: session, downgraded, target };
    });
    return {
      start: starts[w * 7 + 1],
      targetKm: weekTargets[w],
      recovery,
      coachPhase: phase,
      capped: capped[w],
      plannedKm: round1(days.reduce((s, x) => s + x.km, 0)),
      doneKm: round1(days.reduce((s, x) => s + x.doneKm, 0)),
      days,
    };
  });

  return { weeks, runDays, paceKnown: easy !== null, coach: hints };
}
