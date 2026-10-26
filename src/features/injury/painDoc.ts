import { clampPain, PAIN_AREAS, type PainArea, type PainReport } from './pain';

/** Catatan nyeri yang tersimpan di HP: nilai per area dan kapan terakhir diubah (unix detik). */
export interface PainDoc {
  at: number;
  report: PainReport;
}

export const EMPTY_PAIN: PainDoc = { at: 0, report: {} };

/** Catatan yang lebih tua dari ini dianggap basi: nyeri berubah, jadi saran tidak lagi berpatokan padanya. */
export const PAIN_STALE_DAYS = 3;

const DAY_SEC = 86400;

export function parsePainDoc(raw: string | null | undefined): PainDoc {
  if (!raw) return EMPTY_PAIN;
  try {
    const v = JSON.parse(raw) as { at?: unknown; report?: Record<string, unknown> } | null;
    if (!v || typeof v.at !== 'number' || !Number.isFinite(v.at) || typeof v.report !== 'object' || v.report === null) {
      return EMPTY_PAIN;
    }
    const report: PainReport = {};
    for (const area of PAIN_AREAS) {
      const n = v.report[area];
      if (typeof n === 'number') {
        const p = clampPain(n);
        if (p > 0) report[area] = p;
      }
    }
    return { at: v.at, report };
  } catch {
    return EMPTY_PAIN;
  }
}

export const serializePainDoc = (doc: PainDoc): string => JSON.stringify(doc);

/** Dokumen baru dengan satu area diubah; nilai 0 menghapus area itu. Dokumen lama tidak disentuh. */
export function setPain(doc: PainDoc, area: PainArea, value: number, nowSec: number): PainDoc {
  const report: PainReport = { ...doc.report };
  const p = clampPain(value);
  if (p > 0) report[area] = p;
  else delete report[area];
  return { at: nowSec, report };
}

export const isStale = (doc: PainDoc, nowSec: number): boolean =>
  doc.at === 0 || nowSec - doc.at > PAIN_STALE_DAYS * DAY_SEC;

/** Nyeri yang berlaku sekarang: kosong kalau catatannya basi. */
export const currentPain = (doc: PainDoc, nowSec: number): PainReport => (isStale(doc, nowSec) ? {} : doc.report);
