import { describe, expect, it } from 'bun:test';

import type { RunInput } from '../injury/triggers';
import { distributeWeek, longestRecentKm, longRunDay, runDaysPerWeek } from './days';

const DAY = 86400;
const NOW = 1000 * DAY;
const run = (back: number, km: number): RunInput => ({ start: NOW - back * DAY, duration: km * 360, distance: km * 1000, steps: 0 });
const none = [0, 0, 0, 0, 0, 0, 0];
const open = [false, false, false, false, false, false, false];

describe('longRunDay', () => {
  it('is the last day of the pattern', () => {
    expect(longRunDay(3)).toBe(5);
    expect(longRunDay(4)).toBe(5);
    expect(longRunDay(5)).toBe(6);
  });
});

describe('runDaysPerWeek', () => {
  it('follows the last 28 days, between 3 and 5', () => {
    expect(runDaysPerWeek([], NOW)).toBe(3);
    expect(runDaysPerWeek(Array.from({ length: 14 }, (_, i) => run(i + 1, 5)), NOW)).toBe(4);
    expect(runDaysPerWeek(Array.from({ length: 27 }, (_, i) => run(i + 1, 5)), NOW)).toBe(5);
  });
  it('ignores runs under 1 km and older than 28 days', () => {
    expect(runDaysPerWeek([run(1, 0.5), run(30, 10), run(2, 0.9)], NOW)).toBe(3);
  });
});

describe('longestRecentKm', () => {
  it('is the longest run of 28 days', () => {
    expect(longestRecentKm([run(2, 6), run(5, 8), run(40, 20)], NOW)).toBe(8);
    expect(longestRecentKm([], NOW)).toBe(0);
  });
});

describe('distributeWeek', () => {
  it('splits a week over the pattern days with a capped long run', () => {
    expect(distributeWeek({ targetKm: 22, runDays: 3, longestKm: 8, fixed: none, locked: open })).toEqual([6.1, 0, 0, 6.1, 0, 8.8, 0]);
  });
  it('drops the earliest days when each run would be too short', () => {
    expect(distributeWeek({ targetKm: 6, runDays: 3, longestKm: 8, fixed: none, locked: open })).toEqual([0, 0, 0, 2.3, 0, 3.7, 0]);
  });
  it('leaves the week alone when under 2 km remain', () => {
    expect(distributeWeek({ targetKm: 22, runDays: 3, longestKm: 8, fixed: [0, 21, 0, 0, 0, 0, 0], locked: open })).toEqual([0, 21, 0, 0, 0, 0, 0]);
  });
  it('keeps what is done, skips past days, and caps the long run', () => {
    const locked = [true, true, true, false, false, false, false];
    expect(distributeWeek({ targetKm: 22, runDays: 4, longestKm: 6, fixed: [5, 0, 0, 0, 0, 0, 0], locked })).toEqual([5, 0, 0, 6.5, 0, 6.6, 0]);
  });
  it('does not touch a day the person filled in', () => {
    expect(distributeWeek({ targetKm: 20, runDays: 3, longestKm: 10, fixed: [0, 0, 0, 5, 0, 0, 0], locked: open })).toEqual([5.8, 0, 0, 5, 0, 9.2, 0]);
  });
  it('five days put the long run on Sunday', () => {
    expect(distributeWeek({ targetKm: 30, runDays: 5, longestKm: 12, fixed: none, locked: open })).toEqual([5.4, 0, 5.4, 5.4, 0, 5.4, 8.6]);
  });
});
