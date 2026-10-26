import { describe, expect, it } from 'bun:test';

import type { RunInput } from '../injury/triggers';
import { buildPlan, dayStartOf, mondayStart, overrideKey } from './plan';

/** Senin 26 Oktober 2026, tengah malam lokal. */
const MON = Math.floor(new Date(2026, 9, 26).getTime() / 1000);
const at = (off: number, hour = 7) => dayStartOf(MON, off) + hour * 3600;
const run = (off: number, km: number, pace = 360): RunInput => ({ start: at(off), duration: km * pace, distance: km * 1000, steps: 0 });
/** Empat minggu lalu: Senin, Kamis, Sabtu, tiap kali 6 km di pace 6:00. */
const history = [-4, -3, -2, -1].flatMap((w) => [run(w * 7, 6), run(w * 7 + 3, 6), run(w * 7 + 5, 6)]);
const base = { runs: history, nowSec: at(0, 6), todayStart: MON, advice: 'ok' as const, recoveryWeek: null };
const kms = (w: { days: { km: number }[] }) => w.days.map((d) => d.km);

describe('dates', () => {
  it('finds the Monday of any day that week', () => {
    expect(mondayStart(dayStartOf(MON, 3))).toBe(MON);
    expect(mondayStart(dayStartOf(MON, 6))).toBe(MON);
    expect(mondayStart(MON)).toBe(MON);
  });
});

describe('buildPlan', () => {
  it('plans two weeks on Mon, Thu and Sat for a three-day runner', () => {
    const p = buildPlan(base);
    expect(p.runDays).toBe(3);
    expect(p.paceKnown).toBe(true);
    expect(p.weeks.map((w) => w.targetKm)).toEqual([19.8, 21.8]);
    expect(kms(p.weeks[0])).toEqual([5.5, 0, 0, 5.5, 0, 6.6, 0]);
    expect(kms(p.weeks[1])).toEqual([6.1, 0, 0, 6.1, 0, 6.6, 0]);
  });
  it('gives each run day a pace and time target; the long run is slower', () => {
    const [mon, , , thu, , sat] = buildPlan(base).weeks[0].days;
    expect(mon.target).toMatchObject({ kind: 'easy', paceLo: 367, paceHi: 404 });
    expect(thu.target?.kind).toBe('easy');
    expect(sat.target).toMatchObject({ kind: 'long', paceLo: 385, paceHi: 425 });
  });
  it('a recovery week is lower and its days are recovery runs', () => {
    const p = buildPlan({ ...base, recoveryWeek: 1 });
    expect(p.weeks[1].recovery).toBe(true);
    expect(p.weeks[1].targetKm).toBeLessThan(p.weeks[0].targetKm);
    expect(p.weeks[1].days[0].target?.kind).toBe('recovery');
    expect(p.weeks[0].recovery).toBe(false);
  });
  it('mid-week: finished days stay, past days are not planned, the rest shares what is left', () => {
    const thu = dayStartOf(MON, 3);
    const p = buildPlan({ ...base, runs: [...history, run(0, 5)], nowSec: thu + 12 * 3600, todayStart: thu });
    expect(kms(p.weeks[0])).toEqual([5, 0, 0, 5.7, 0, 6.6, 0]);
    expect(p.weeks[0].days.map((d) => d.status)).toEqual(['past', 'past', 'past', 'today', 'future', 'future', 'future']);
    expect(p.weeks[0].doneKm).toBe(5);
    expect(p.weeks[0].days[0].target).toBe(null);
  });
  it('keeps a day the person filled in and plans around it', () => {
    const p = buildPlan({ ...base, overrides: { [overrideKey(0, 1)]: 8 } });
    expect(kms(p.weeks[0])).toEqual([3.3, 8, 0, 3.3, 0, 5.2, 0]);
    expect(p.weeks[0].days[1].edited).toBe(true);
    expect(p.weeks[0].days[0].edited).toBe(false);
    expect(p.weeks[0].days[1].target?.paceLo).toBe(381);
  });
  it('plans no run at all under severe pain', () => {
    const p = buildPlan({ ...base, advice: 'stop' });
    expect(p.weeks.map((w) => w.targetKm)).toEqual([0, 0]);
    expect(p.weeks.flatMap(kms).every((k) => k === 0)).toBe(true);
  });
  it('without history it still plans, but has no pace to offer', () => {
    const p = buildPlan({ ...base, runs: [] });
    expect(p.paceKnown).toBe(false);
    expect(p.weeks[0].days.every((d) => d.target === null)).toBe(true);
    expect(p.weeks[0].plannedKm).toBeGreaterThan(0);
  });
});
