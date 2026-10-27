import { describe, expect, it } from 'bun:test';

import type { CoachPlan } from '../coach/doc';
import { addDays } from '../coach/time';
import { coachHints } from './coachHints';

const plan = (over: Partial<CoachPlan> = {}): CoachPlan => ({
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
  ...over,
});

/** Tujuh tanggal Senin sampai Minggu mulai dari `monday`. */
const week = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
const THIS = week('2026-10-26');
const NEXT = week('2026-11-02');

describe('coachHints', () => {
  it('is null without a run plan', () => {
    expect(coachHints(null, [THIS, NEXT])).toBe(null);
    expect(coachHints(plan({ kind: 'strength', goal: 'strengthFull' }), [THIS, NEXT])).toBe(null);
  });

  it('maps the sessions of the plan onto the calendar days', () => {
    const h = coachHints(plan(), [THIS, NEXT])!;
    expect(h.weekNumber).toBe(1);
    expect(h.totalWeeks).toBe(10);
    expect(h.weeks[0].phase).toBe('build');
    expect(h.weeks[0].days.map((d) => d?.type ?? null)).toEqual(['easy', null, 'tempo', 'recovery', null, 'long', null]);
    expect(h.weeks[1].days.map((d) => d?.type ?? null)).toEqual(['easy', null, 'intervals', 'recovery', null, 'long', null]);
    expect(h.weeks[0].days[5]?.minutes).toBe(45);
  });

  it('reports the cutback week of the plan', () => {
    const h = coachHints(plan(), [week('2026-11-09'), week('2026-11-16')])!;
    expect(h.weeks[0].phase).toBe('build');
    expect(h.weeks[1].phase).toBe('cutback');
    expect(h.weekNumber).toBe(3);
  });

  it('a walk-run plan gives walk-run sessions with a zone', () => {
    const h = coachHints(plan({ goal: 'runWalk', level: 'beginner', daysPerWeek: 3, weekdays: [0, 2, 4], weeks: 8 }), [THIS, NEXT])!;
    expect(h.weeks[0].days[0]).toMatchObject({ type: 'walkrun', minutes: 34, zone: 3 });
    expect(h.weeks[0].days[1]).toBe(null);
  });

  it('is null once the plan is over, and half-filled when it ends mid-window', () => {
    expect(coachHints(plan(), [week('2027-02-01'), week('2027-02-08')])).toBe(null);
    const h = coachHints(plan({ weeks: 1 }), [THIS, NEXT])!;
    expect(h.weeks[0].phase).not.toBe(null);
    expect(h.weeks[1]).toEqual({ phase: null, days: [null, null, null, null, null, null, null] });
  });

  it('is null before the plan starts', () => {
    expect(coachHints(plan({ startDay: '2026-12-07' }), [THIS, NEXT])).toBeNull();
  });
});
