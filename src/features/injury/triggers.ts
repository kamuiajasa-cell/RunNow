/**
 * Injury triggers for runners, ported from Run Now ("Pemicu cedera"). Pure functions on run summaries: no strings, no
 * database, so the UI owns the wording. The load ratio (ACWR) is not repeated here: `fitness/trainingLoad.ts` already
 * has it and the Readiness signal uses it.
 *
 * Levels: -1 no data yet, 0 safe, 1 watch out, 2 high.
 */
const DAY_SEC = 86400;

export type TriggerLevel = -1 | 0 | 1 | 2;
export type TriggerId = 'cadence' | 'frequency' | 'longRun' | 'jump';

export interface RunInput {
  /** Unix seconds. */
  start: number;
  /** Active seconds. */
  duration: number;
  /** Metres. */
  distance: number;
  /** Steps counted for the run (0 when the source has none). */
  steps: number;
}

export interface Trigger {
  id: TriggerId;
  level: TriggerLevel;
  /** The numbers behind the level, for the UI to print. Empty while `level` is -1. */
  values: Record<string, number>;
}

export interface TriggerOptions {
  /**
   * False for run-walk training: steps divided by active time mixes walking and running, so the average reads low
   * and would raise a false alarm. The cadence trigger then stays at -1 (no data).
   */
  cadence?: boolean;
}

/** Runs shorter than this are warm-ups or GPS noise and are not counted (Run Now: 1 km). */
export const MIN_RUN_M = 1000;
export const CADENCE_DAYS = 28;
export const MIN_CADENCE_RUNS = 3;
export const SAFE_CADENCE = 168;
export const LOW_CADENCE = 160;
export const MAX_SAFE_STREAK = 4;
export const LONG_RUN_SHARE_WATCH = 40;
export const LONG_RUN_SHARE_HIGH = 50;
/** Weekly distance of the week before must be at least this for a jump to mean anything. */
export const MIN_BASE_WEEK_KM = 8;
export const JUMP_WATCH_PCT = 30;
export const JUMP_HIGH_PCT = 50;

const isRun = (r: RunInput): boolean => r.distance >= MIN_RUN_M && r.duration > 0;

function cadence(runs: readonly RunInput[], nowSec: number): Trigger {
  const since = nowSec - CADENCE_DAYS * DAY_SEC;
  const w = runs.filter((r) => r.start > since && r.steps > 0);
  if (w.length < MIN_CADENCE_RUNS) return { id: 'cadence', level: -1, values: {} };
  const km = w.reduce((s, r) => s + r.distance, 0);
  // Weighted by distance, like Run Now: a long run says more about your stride than a short one.
  const avg = w.reduce((s, r) => s + (r.steps / (r.duration / 60)) * r.distance, 0) / km;
  const level: TriggerLevel = avg < LOW_CADENCE ? 2 : avg < SAFE_CADENCE ? 1 : 0;
  return { id: 'cadence', level, values: { avg: Math.round(avg), runs: w.length } };
}

function frequency(runs: readonly RunInput[], todayStart: number): Trigger {
  const days = new Set(runs.map((r) => Math.floor((r.start - todayStart) / DAY_SEC)));
  // Streak counts back from today, or from yesterday when today has no run yet.
  let streak = 0;
  for (let d = days.has(0) ? 0 : -1; days.has(d); d--) streak++;
  let maxStreak = 0;
  let cur = 0;
  for (let d = -27; d <= 0; d++) {
    cur = days.has(d) ? cur + 1 : 0;
    maxStreak = Math.max(maxStreak, cur);
  }
  let week = 0;
  for (let d = -6; d <= 0; d++) if (days.has(d)) week++;
  const level: TriggerLevel = streak >= 5 || week >= 6 ? 2 : streak >= 4 || maxStreak >= 5 ? 1 : 0;
  return { id: 'frequency', level, values: { streak, week, maxStreak } };
}

function longRun(runs: readonly RunInput[], nowSec: number): Trigger {
  const w = runs.filter((r) => r.start > nowSec - 7 * DAY_SEC);
  const total = w.reduce((s, r) => s + r.distance, 0) / 1000;
  const longest = Math.max(0, ...w.map((r) => r.distance)) / 1000;
  // Needs two runs and 10 km, or one long run always looks like 100 % of the week.
  if (w.length < 2 || total < 10) return { id: 'longRun', level: -1, values: {} };
  const share = (longest / total) * 100;
  const level: TriggerLevel = share >= LONG_RUN_SHARE_HIGH ? 2 : share >= LONG_RUN_SHARE_WATCH ? 1 : 0;
  return { id: 'longRun', level, values: { share: Math.round(share), longestKm: longest, totalKm: total } };
}

function jump(runs: readonly RunInput[], nowSec: number): Trigger {
  const km = (from: number, to: number) =>
    runs.filter((r) => r.start > from && r.start <= to).reduce((s, r) => s + r.distance, 0) / 1000;
  const thisWeek = km(nowSec - 7 * DAY_SEC, nowSec);
  const lastWeek = km(nowSec - 14 * DAY_SEC, nowSec - 7 * DAY_SEC);
  if (lastWeek < MIN_BASE_WEEK_KM) return { id: 'jump', level: -1, values: {} };
  const pct = (thisWeek / lastWeek - 1) * 100;
  const level: TriggerLevel = pct > JUMP_HIGH_PCT ? 2 : pct > JUMP_WATCH_PCT ? 1 : 0;
  return { id: 'jump', level, values: { pct: Math.round(pct), thisWeekKm: thisWeek, lastWeekKm: lastWeek } };
}

/**
 * The four triggers for `nowSec`. `todayStart` is local midnight today (unix seconds), which keeps the day counting
 * in the phone's time zone. Pass run workouts only (see `isRunSport`); runs under 1 km are ignored here.
 */
export function injuryTriggers(
  runs: readonly RunInput[],
  nowSec: number,
  todayStart: number,
  options: TriggerOptions = {},
): Trigger[] {
  const r = runs.filter(isRun);
  const cad: Trigger = options.cadence === false ? { id: 'cadence', level: -1, values: {} } : cadence(r, nowSec);
  return [cad, frequency(r, todayStart), longRun(r, nowSec), jump(r, nowSec)];
                   }
