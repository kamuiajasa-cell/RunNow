import { describe, expect, it } from 'bun:test';

import { emptyPrefs, parsePrefs, rollPrefs, serializePrefs, setOverride, setRecovery } from './planPrefs';

const WEEK = 7 * 86400;
const WS = 1000 * 86400;

describe('parsePrefs', () => {
  it('gives null for missing or broken input', () => {
    expect(parsePrefs(null)).toBe(null);
    expect(parsePrefs('{')).toBe(null);
    expect(parsePrefs('{"recoveryWeek":1}')).toBe(null);
  });
  it('round trips', () => {
    const p = { weekStart: WS, recoveryWeek: 1 as const, overrides: { '0-1': 8, '1-5': 12.5 } };
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
  });
  it('drops entries that make no sense', () => {
    const raw = JSON.stringify({ weekStart: WS, recoveryWeek: 7, overrides: { '0-1': 8, '2-1': 5, '0-9': 5, '0-2': -3, '0-3': 500, '0-4': 'x' } });
    expect(parsePrefs(raw)).toEqual({ weekStart: WS, recoveryWeek: null, overrides: { '0-1': 8 } });
  });
});

describe('rollPrefs', () => {
  const saved = { weekStart: WS, recoveryWeek: 1 as const, overrides: { '0-1': 8, '1-3': 6 } };
  it('keeps this week as it is', () => {
    expect(rollPrefs(saved, WS)).toBe(saved);
  });
  it('a week later, next week becomes this week', () => {
    expect(rollPrefs(saved, WS + WEEK)).toEqual({ weekStart: WS + WEEK, recoveryWeek: 0, overrides: { '0-3': 6 } });
  });
  it('a recovery week that has passed is switched off', () => {
    expect(rollPrefs({ ...saved, recoveryWeek: 0 }, WS + WEEK).recoveryWeek).toBe(null);
  });
  it('starts clean after two weeks away, or with nothing saved', () => {
    expect(rollPrefs(saved, WS + 2 * WEEK)).toEqual(emptyPrefs(WS + 2 * WEEK));
    expect(rollPrefs(null, WS)).toEqual(emptyPrefs(WS));
  });
});

describe('edits', () => {
  it('sets, clamps and removes an entry without touching the original', () => {
    const p = emptyPrefs(WS);
    const a = setOverride(p, 0, 2, 7.26);
    expect(a.overrides).toEqual({ '0-2': 7.3 });
    expect(p.overrides).toEqual({});
    expect(setOverride(a, 0, 2, 500).overrides).toEqual({ '0-2': 60 });
    expect(setOverride(a, 0, 2, null).overrides).toEqual({});
    expect(setOverride(a, 0, 2, 0).overrides).toEqual({});
  });
  it('switches the recovery week', () => {
    expect(setRecovery(emptyPrefs(WS), 1).recoveryWeek).toBe(1);
    expect(setRecovery(setRecovery(emptyPrefs(WS), 1), null).recoveryWeek).toBe(null);
  });
});
