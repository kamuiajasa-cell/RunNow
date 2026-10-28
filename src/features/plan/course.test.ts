import { describe, expect, it } from 'bun:test';

import { dayCourse, LOW_BASE_KM, resolveStyle, runSegmentPace } from './course';

const base = { name: 'Lari 26 Okt', km: 5.5, paceLo: 367, paceHi: 404, minutes: 35, slow: false };

describe('resolveStyle', () => {
  const ctx = { coachType: null, slow: false, baseKm: 20 };
  it('a forced style wins, except that moderate pain always means run-walk', () => {
    expect(resolveStyle('continuous', ctx)).toBe('continuous');
    expect(resolveStyle('runwalk', ctx)).toBe('runwalk');
    expect(resolveStyle('continuous', { ...ctx, slow: true })).toBe('runwalk');
  });
  it('auto runs continuously for an established runner', () => {
    expect(resolveStyle('auto', ctx)).toBe('continuous');
    expect(resolveStyle('auto', { ...ctx, coachType: 'easy' })).toBe('continuous');
  });
  it('auto uses run-walk for a walk-run session, a low weekly base, or moderate pain', () => {
    expect(resolveStyle('auto', { ...ctx, coachType: 'walkrun' })).toBe('runwalk');
    expect(resolveStyle('auto', { ...ctx, baseKm: LOW_BASE_KM - 0.1 })).toBe('runwalk');
    expect(resolveStyle('auto', { ...ctx, slow: true })).toBe('runwalk');
  });
});

describe('runSegmentPace', () => {
  it('the run part is faster than the average of the whole session, and averages back', () => {
    const p = runSegmentPace(378, 225, 30);
    expect(p).toBeGreaterThan(340);
    expect(p).toBeLessThan(370);
    const km = 225 / p + 30 / 660;
    expect(255 / km).toBeCloseTo(378, 6);
  });
});

describe('dayCourse', () => {
  it('continuous: warm-up, one run with a distance and pace range, cool-down', () => {
    const c = dayCourse({ ...base, style: 'continuous' });
    expect(c.name).toBe('Lari 26 Okt');
    expect(c.blocks.map((b) => b.steps.map((s) => s.kind))).toEqual([['warmup'], ['run'], ['cooldown']]);
    expect(c.blocks[0].steps[0]).toMatchObject({ target: 'time', targetValue: 300, intensity: 'none' });
    expect(c.blocks[1].steps[0]).toEqual({ kind: 'run', target: 'distance', targetValue: 4600, intensity: 'pace', low: 367, high: 404 });
    expect(c.blocks[2].steps[0]).toMatchObject({ kind: 'cooldown', targetValue: 300 });
  });

  it('a short day gets a shorter warm-up and cool-down', () => {
    const c = dayCourse({ ...base, km: 3, minutes: 20, style: 'continuous' });
    expect(c.blocks[0].steps[0].targetValue).toBe(180);
    expect(c.blocks[1].steps[0].targetValue).toBe(2500);
  });

  it('run-walk: 3:45 run and 0:30 walk repeated to fill the session time', () => {
    const c = dayCourse({ ...base, style: 'runwalk' });
    expect(c.blocks[1].repeat).toBe(6);
    const [run, walk] = c.blocks[1].steps;
    expect(run).toMatchObject({ kind: 'run', target: 'time', targetValue: 225, intensity: 'pace' });
    expect(walk).toMatchObject({ kind: 'walk', target: 'time', targetValue: 30, intensity: 'none' });
    expect(run.low).toBeLessThan(367);
    expect(run.high).toBeLessThan(404);
    expect(run.low).toBeLessThan(run.high);
  });

  it('moderate pain gives 1 minute of running and 2 minutes of walking', () => {
    const c = dayCourse({ ...base, minutes: 44, slow: true, style: 'runwalk' });
    const [run, walk] = c.blocks[1].steps;
    expect(run.targetValue).toBe(60);
    expect(walk.targetValue).toBe(120);
    expect(c.blocks[1].repeat).toBe(11);
  });

  it('stays inside the limits of the watch contract', () => {
    for (const style of ['continuous', 'runwalk'] as const) {
      const c = dayCourse({ ...base, km: 30, minutes: 1000, paceLo: 40, paceHi: 2000, style });
      for (const b of c.blocks) {
        expect(b.repeat).toBeGreaterThan(0);
        expect(b.repeat <= 99).toBe(true);
        for (const s of b.steps) {
          expect(s.targetValue > 0).toBe(true);
          if (s.intensity === 'pace') {
            expect(s.low >= 60 && s.high <= 900 && s.low <= s.high).toBe(true);
          }
        }
      }
    }
  });
});
