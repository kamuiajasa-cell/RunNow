import { describe, expect, it } from 'bun:test';

import type { RunInput } from '../injury/triggers';
import { baseWeeklyKm, layoffFactor, weeklyTargets } from './weekly';

const DAY = 86400;
const WS = 1000 * DAY;
/** Lari `km` kilometer, `back` hari sebelum awal minggu. */
const run = (back: number, km: number): RunInput => ({ start: WS - back * DAY, duration: km * 360, distance: km * 1000, steps: 0 });
/** Empat minggu lari 20 km, terakhir 3 hari sebelum awal minggu: dasar 20 km, tanpa pengurangan. */
const steady = [run(3, 20), run(10, 20), run(17, 20), run(24, 20)];

describe('baseWeeklyKm', () => {
  it('averages the four weeks before the week start', () => {
    expect(baseWeeklyKm(steady, WS)).toBe(20);
  });
  it('is never under 6 km, and ignores runs of this week and older than 28 days', () => {
    expect(baseWeeklyKm([], WS)).toBe(6);
    expect(baseWeeklyKm([run(-1, 50), run(40, 50)], WS)).toBe(6);
  });
});

describe('layoffFactor', () => {
  it('cuts the limit after a long break', () => {
    expect(layoffFactor([run(3, 5)], WS)).toBe(1);
    expect(layoffFactor([run(8, 5)], WS)).toBe(0.9);
    expect(layoffFactor([run(15, 5)], WS)).toBe(0.8);
    expect(layoffFactor([], WS)).toBe(0.8);
  });
});

describe('weeklyTargets', () => {
  const base = { runs: steady, weekStart: WS, weeks: 2, recoveryWeek: null, advice: 'ok' as const };
  it('grows 10 percent a week', () => {
    expect(weeklyTargets(base).map((w) => w.km)).toEqual([22, 24.2]);
  });
  it('a recovery week takes 75 percent of the level reached', () => {
    const t = weeklyTargets({ ...base, recoveryWeek: 1 });
    expect(t.map((w) => w.km)).toEqual([22, 16.5]);
    expect(t.map((w) => w.recovery)).toEqual([false, true]);
  });
  it('pain only lowers the limit', () => {
    expect(weeklyTargets({ ...base, advice: 'reduce' })[0].km).toBe(15.4);
    expect(weeklyTargets({ ...base, advice: 'noHard' })[0].km).toBe(7.7);
    expect(weeklyTargets({ ...base, advice: 'stop' }).map((w) => w.km)).toEqual([0, 0]);
  });
  it('starts a week after the first one', () => {
    expect(weeklyTargets(base).map((w) => w.start)).toEqual([WS, WS + 7 * DAY]);
  });
  it('a lapsed runner starts low', () => {
    expect(weeklyTargets({ ...base, runs: [] })[0].km).toBe(5.3);
    expect(weeklyTargets({ ...base, runs: [run(10, 40)] })[0].km).toBe(9.9);
  });
});
