import { describe, expect, it } from 'bun:test';

import type { CoachPlan } from '../coach/doc';
import { localDay } from '../coach/time';
import type { RunInput } from '../injury/triggers';
import { coachHints } from './coachHints';
import { buildPlan, dayStartOf } from './plan';

const plan: CoachPlan = {
  id: 'p1',
  kind: 'run',
  goal: 'run10k',
  level: 'intermediate',
  daysPerWeek: 4,
  setting: null,
  weekdays: [0, 2, 3, 5],
  startDay: '2026-10-26',
  weeks: 10,
  createdAt: new Date(2026, 9, 20).getTime(),
  updatedAt: 0,
  adjust: {},
};

/** Setup untuk Senin `monday`: empat minggu lalu Senin, Kamis, Sabtu tiap kali 6 km di pace 6:00. */
function setup(monday: Date, coachPlan: CoachPlan | null = plan) {
  const mon = Math.floor(monday.getTime() / 1000);
  const run = (off: number, km: number): RunInput => ({ start: dayStartOf(mon, off) + 7 * 3600, duration: km * 360, distance: km * 1000, steps: 0 });
  const runs = [-4, -3, -2, -1].flatMap((w) => [run(w * 7, 6), run(w * 7 + 3, 6), run(w * 7 + 5, 6)]);
  const weekDays = [0, 1].map((w) => Array.from({ length: 7 }, (_, d) => localDay(dayStartOf(mon, w * 7 + d))));
  return {
    runs,
    nowSec: dayStartOf(mon, 0) + 6 * 3600,
    todayStart: mon,
    advice: 'ok' as const,
    recoveryWeek: null,
    coach: coachHints(coachPlan, weekDays),
  };
}

const MON = new Date(2026, 9, 26);
const kms = (w: { days: { km: number }[] }) => w.days.map((d) => d.km);

describe('buildPlan with a Coach plan', () => {
  it('takes the run days and kinds from Coach and caps the week at the safe limit', () => {
    const p = buildPlan(setup(MON));
    const w0 = p.weeks[0];
    expect(w0.targetKm).toBe(19.8);
    expect(w0.capped).toBe(true);
    expect(w0.coachPhase).toBe('build');
    expect(kms(w0)).toEqual([4.4, 0, 4.4, 4.4, 0, 6.6, 0]);
    expect(w0.days.map((d) => d.coach?.type ?? null)).toEqual(['easy', null, 'tempo', 'recovery', null, 'long', null]);
    expect(p.weeks[1].targetKm).toBe(21.8);
    expect(kms(p.weeks[1])).toEqual([4.7, 0, 4.7, 4.7, 0, 6.6, 0]);
  });

  it('gives easy, recovery and long days a pace, and hard sessions none', () => {
    const d = buildPlan(setup(MON)).weeks[0].days;
    expect(d[0].target).toMatchObject({ kind: 'easy', paceLo: 367 });
    expect(d[2].target).toBeNull();
    expect(d[3].target).toMatchObject({ kind: 'recovery', paceLo: 397 });
    expect(d[5].target).toMatchObject({ kind: 'long', paceLo: 385 });
  });

  it('mild pain turns a hard session into an easy run', () => {
    const p = buildPlan({ ...setup(MON), advice: 'reduce' });
    expect(p.weeks[0].targetKm).toBe(13.9);
    const wed = p.weeks[0].days[2];
    expect(wed.downgraded).toBe(true);
    expect(wed.coach?.type).toBe('easy');
    expect(wed.target).not.toBeNull();
    expect(p.weeks[0].days[0].downgraded).toBe(false);
  });

  it('severe pain plans nothing', () => {
    const p = buildPlan({ ...setup(MON), advice: 'stop' });
    expect(p.weeks.map((w) => w.targetKm)).toEqual([0, 0]);
    expect(p.weeks.flatMap(kms).every((k) => k === 0)).toBe(true);
  });

  it('a cutback week from Coach is a recovery week without a second cut in distance', () => {
    const p = buildPlan(setup(new Date(2026, 10, 9)));
    expect(p.weeks[0].recovery).toBe(false);
    expect(p.weeks[1].recovery).toBe(true);
    expect(p.weeks[1].coachPhase).toBe('cutback');
    expect(p.weeks[1].targetKm).toBe(19.8);
    expect(p.weeks[1].capped).toBe(false);
    expect(kms(p.weeks[1])).toEqual([4, 0, 4.8, 4, 0, 6.6, 0]);
  });

  it('falls back to the run history for a week the Coach plan does not cover', () => {
    const p = buildPlan(setup(MON, { ...plan, weeks: 1 }));
    expect(p.weeks[0].coachPhase).toBe('taper');
    expect(p.weeks[0].recovery).toBe(true);
    expect(p.weeks[1].coachPhase).toBeNull();
    expect(kms(p.weeks[1])).toEqual([6.1, 0, 0, 6.1, 0, 6.6, 0]);
  });

  it('keeps a day the person filled in and shares the rest by Coach minutes', () => {
    const p = buildPlan({ ...setup(MON), overrides: { '0-1': 8 } });
    expect(kms(p.weeks[0])).toEqual([2.6, 8, 2.6, 2.6, 0, 3.9, 0]);
    expect(p.weeks[0].days[1].edited).toBe(true);
    expect(p.weeks[0].days[1].coach).toBeNull();
  });

  it('without a Coach plan the result carries no Coach data', () => {
    const p = buildPlan(setup(MON, null));
    expect(p.coach).toBeNull();
    expect(p.weeks[0].coachPhase).toBeNull();
    expect(p.weeks[0].capped).toBe(false);
    expect(kms(p.weeks[0])).toEqual([5.5, 0, 0, 5.5, 0, 6.6, 0]);
  });
});
