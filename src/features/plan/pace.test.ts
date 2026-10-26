import { describe, expect, it } from 'bun:test';

import type { RunInput } from '../injury/triggers';
import { dayTarget, easyPace, formatPace } from './pace';

const DAY = 86400;
const NOW = 1000 * DAY;
/** Lari `km` km dengan pace `pace` detik per km, `back` hari lalu. */
const run = (back: number, km: number, pace: number): RunInput => ({ start: NOW - back * DAY, duration: km * pace, distance: km * 1000, steps: 0 });
const base = { easy: 360, km: 6, long: false, recoveryWeek: false, afterRunDay: false, advice: 'ok' as const };

describe('easyPace', () => {
  it('is the median pace times 1.05', () => {
    expect(easyPace([run(1, 5, 340), run(3, 5, 360), run(5, 5, 400)], NOW)).toBeCloseTo(378, 6);
  });
  it('needs two valid runs; ignores short, old and absurd ones', () => {
    expect(easyPace([run(1, 5, 360)], NOW)).toBe(null);
    expect(easyPace([run(1, 1, 360), run(2, 5, 360), run(100, 5, 360), run(3, 5, 900)], NOW)).toBe(null);
  });
});

describe('dayTarget', () => {
  it('an easy day', () => {
    expect(dayTarget(base)).toEqual({ kind: 'easy', km: 6, paceLo: 349, paceHi: 385, minutes: 37, slow: false });
  });
  it('a long run is 5 percent slower', () => {
    expect(dayTarget({ ...base, long: true })).toMatchObject({ kind: 'long', paceLo: 367, paceHi: 404 });
  });
  it('a recovery week and a day after a run are 4 percent slower each', () => {
    expect(dayTarget({ ...base, recoveryWeek: true })).toMatchObject({ kind: 'recovery', paceLo: 363 });
    expect(dayTarget({ ...base, recoveryWeek: true, afterRunDay: true })).toMatchObject({ paceLo: 378 });
  });
  it('mild pain slows 12 percent, moderate pain turns it into slow run-walk', () => {
    expect(dayTarget({ ...base, advice: 'reduce' })).toMatchObject({ paceLo: 391, slow: false });
    expect(dayTarget({ ...base, advice: 'noHard' })).toMatchObject({ paceLo: 454, minutes: 60, slow: true });
  });
  it('severe pain means no run', () => {
    expect(dayTarget({ ...base, advice: 'stop' })).toBe(null);
  });
});

describe('formatPace', () => {
  it('prints minutes and seconds', () => {
    expect(formatPace(378)).toBe('6:18');
    expect(formatPace(365.4)).toBe('6:05');
  });
});
