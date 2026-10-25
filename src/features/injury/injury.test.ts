import { describe, expect, it } from 'bun:test';

import { activePain, painBand, runAdvice } from './pain';
import { injuryTriggers, type RunInput } from './triggers';

const DAY = 86400;
const TODAY = 100 * DAY;
const NOW = TODAY + 12 * 3600;
/** A run `back` days ago at noon. Cadence in steps per minute. */
const run = (back: number, km = 5, cad = 170, min = 30): RunInput => ({
  start: TODAY - back * DAY + 12 * 3600,
  duration: min * 60,
  distance: km * 1000,
  steps: cad * min,
});
const get = (runs: RunInput[], id: string) => injuryTriggers(runs, NOW, TODAY).find((t) => t.id === id)!;

describe('cadence', () => {
  it('needs three runs with steps', () => {
    expect(get([run(1), run(2)], 'cadence').level).toBe(-1);
  });
  it('cuts at 160 and 168', () => {
    expect(get([run(1, 5, 170), run(3, 5, 170), run(5, 5, 170)], 'cadence').level).toBe(0);
    expect(get([run(1, 5, 165), run(3, 5, 165), run(5, 5, 165)], 'cadence').level).toBe(1);
    expect(get([run(1, 5, 155), run(3, 5, 155), run(5, 5, 155)], 'cadence').level).toBe(2);
  });
  it('weights by distance', () => {
    const t = get([run(1, 10, 150), run(3, 1, 190), run(5, 1, 190)], 'cadence');
    expect(t.values.avg).toBeLessThan(160);
  });
  it('ignores runs older than 28 days and runs under 1 km', () => {
    expect(get([run(30), run(31), run(32)], 'cadence').level).toBe(-1);
    expect(get([run(1, 0.5), run(2, 0.5), run(3, 0.5)], 'cadence').level).toBe(-1);
  });
  it('can be switched off for run-walk', () => {
    const runs = [run(1, 5, 150), run(3, 5, 150), run(5, 5, 150)];
    const off = injuryTriggers(runs, NOW, TODAY, { cadence: false }).find((t) => t.id === 'cadence')!;
    expect(off.level).toBe(-1);
  });
});

describe('frequency', () => {
  it('safe with a day off', () => {
    expect(get([run(0), run(2), run(4)], 'frequency').level).toBe(0);
  });
  it('streak of 4 is watch, 5 is high', () => {
    expect(get([run(0), run(1), run(2), run(3)], 'frequency').level).toBe(1);
    expect(get([run(0), run(1), run(2), run(3), run(4)], 'frequency').level).toBe(2);
  });
  it('streak starts from yesterday when today has no run', () => {
    const t = get([run(1), run(2), run(3), run(4)], 'frequency');
    expect(t.values.streak).toBe(4);
    expect(t.level).toBe(1);
  });
  it('6 run days in 7 is high', () => {
    expect(get([run(0), run(1), run(2), run(4), run(5), run(6)], 'frequency').level).toBe(2);
  });
});

describe('longRun', () => {
  it('no data under two runs or 10 km', () => {
    expect(get([run(1, 12)], 'longRun').level).toBe(-1);
    expect(get([run(1, 4), run(3, 4)], 'longRun').level).toBe(-1);
  });
  it('cuts at 40 and 50 percent', () => {
    expect(get([run(1, 6), run(3, 6), run(5, 6)], 'longRun').level).toBe(0);
    expect(get([run(1, 8), run(3, 6), run(5, 6)], 'longRun').level).toBe(1);
    expect(get([run(1, 10), run(3, 5), run(5, 5)], 'longRun').level).toBe(2);
  });
});

describe('jump', () => {
  it('no data when last week is under 8 km', () => {
    expect(get([run(1, 20), run(9, 5)], 'jump').level).toBe(-1);
  });
  it('cuts at 30 and 50 percent', () => {
    expect(get([run(1, 10), run(9, 10)], 'jump').level).toBe(0);
    expect(get([run(1, 14), run(9, 10)], 'jump').level).toBe(1);
    expect(get([run(1, 16), run(9, 10)], 'jump').level).toBe(2);
  });
});

describe('pain', () => {
  it('bands', () => {
    expect([0, 1, 3, 4, 6, 7, 10].map(painBand)).toEqual(['none', 'mild', 'mild', 'moderate', 'moderate', 'severe', 'severe']);
  });
  it('advice follows the worst area', () => {
    expect(runAdvice({})).toBe('ok');
    expect(runAdvice({ knee: 2 })).toBe('reduce');
    expect(runAdvice({ knee: 2, calf: 5 })).toBe('noHard');
    expect(runAdvice({ knee: 2, calf: 5, back: 8 })).toBe('stop');
  });
  it('clamps and sorts', () => {
    expect(activePain({ knee: 3, calf: 12, foot: -2 }).map((x) => [x.area, x.value])).toEqual([['calf', 10], ['knee', 3]]);
  });
});
