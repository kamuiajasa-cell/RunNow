import { describe, expect, it } from 'bun:test';

import { currentPain, EMPTY_PAIN, isStale, parsePainDoc, PAIN_STALE_DAYS, serializePainDoc, setPain } from './painDoc';

const DAY = 86400;

describe('parsePainDoc', () => {
  it('gives an empty document for missing or broken input', () => {
    expect(parsePainDoc(null)).toEqual(EMPTY_PAIN);
    expect(parsePainDoc('{')).toEqual(EMPTY_PAIN);
    expect(parsePainDoc('{"at":"x","report":{}}')).toEqual(EMPTY_PAIN);
    expect(parsePainDoc('{"at":5}')).toEqual(EMPTY_PAIN);
  });
  it('round trips, and drops unknown areas and zeros', () => {
    const doc = { at: 100, report: { knee: 4, calf: 2 } };
    expect(parsePainDoc(serializePainDoc(doc))).toEqual(doc);
    expect(parsePainDoc('{"at":1,"report":{"knee":0,"elbow":5,"calf":12}}')).toEqual({ at: 1, report: { calf: 10 } });
  });
});

describe('setPain', () => {
  it('sets, clamps and removes an area', () => {
    let d = setPain(EMPTY_PAIN, 'knee', 3, 10);
    expect(d).toEqual({ at: 10, report: { knee: 3 } });
    d = setPain(d, 'knee', 15, 20);
    expect(d.report.knee).toBe(10);
    d = setPain(d, 'knee', 0, 30);
    expect(d).toEqual({ at: 30, report: {} });
  });
  it('leaves the document it was given alone', () => {
    const before = { at: 5, report: { hip: 2 } };
    setPain(before, 'hip', 6, 9);
    expect(before).toEqual({ at: 5, report: { hip: 2 } });
  });
});

describe('stale pain', () => {
  const doc = { at: 100 * DAY, report: { shin: 5 } };
  it('is current for three days, then ignored', () => {
    expect(isStale(doc, 100 * DAY + PAIN_STALE_DAYS * DAY)).toBe(false);
    expect(currentPain(doc, 100 * DAY + PAIN_STALE_DAYS * DAY)).toEqual({ shin: 5 });
    expect(isStale(doc, 100 * DAY + PAIN_STALE_DAYS * DAY + 1)).toBe(true);
    expect(currentPain(doc, 100 * DAY + PAIN_STALE_DAYS * DAY + 1)).toEqual({});
  });
  it('an empty document is stale', () => {
    expect(isStale(EMPTY_PAIN, 1000)).toBe(true);
  });
});
