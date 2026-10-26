import { overrideKey } from './plan';
import { round1 } from './weekly';

const WEEK_SEC = 7 * 86400;

/** Isian sendiri tidak masuk akal di atas ini (km per hari). */
export const MAX_OVERRIDE_KM = 60;

/** Pilihan pengguna untuk rencana: tersimpan di HP, bergeser tiap minggu baru. */
export interface PlanPrefs {
  /** Senin 00.00 lokal minggu pertama saat disimpan, unix detik. */
  weekStart: number;
  /** Minggu pemulihan (tapering): null mati, 0 minggu ini, 1 minggu depan (relatif terhadap `weekStart`). */
  recoveryWeek: 0 | 1 | null;
  /** Isian sendiri per hari: kunci dari `overrideKey`, nilai km. */
  overrides: Record<string, number>;
}

export const emptyPrefs = (weekStart: number): PlanPrefs => ({ weekStart, recoveryWeek: null, overrides: {} });

/** Null kalau kosong atau rusak. Isian di luar kisaran dibuang. */
export function parsePrefs(raw: string | null | undefined): PlanPrefs | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { weekStart?: unknown; recoveryWeek?: unknown; overrides?: Record<string, unknown> } | null;
    if (!v || typeof v.weekStart !== 'number' || !Number.isFinite(v.weekStart)) return null;
    const overrides: Record<string, number> = {};
    if (typeof v.overrides === 'object' && v.overrides !== null) {
      for (const [key, km] of Object.entries(v.overrides)) {
        if (/^[01]-[0-6]$/.test(key) && typeof km === 'number' && Number.isFinite(km) && km > 0 && km <= MAX_OVERRIDE_KM) {
          overrides[key] = round1(km);
        }
      }
    }
    return { weekStart: v.weekStart, recoveryWeek: v.recoveryWeek === 0 || v.recoveryWeek === 1 ? v.recoveryWeek : null, overrides };
  } catch {
    return null;
  }
}

export const serializePrefs = (p: PlanPrefs): string => JSON.stringify(p);

/**
 * Menyesuaikan pilihan dengan minggu sekarang. Satu minggu lebih baru: minggu depan menjadi minggu ini. Lebih
 * lama dari itu: mulai bersih.
 */
export function rollPrefs(p: PlanPrefs | null, weekStart: number): PlanPrefs {
  if (!p) return emptyPrefs(weekStart);
  const ahead = Math.round((weekStart - p.weekStart) / WEEK_SEC);
  if (ahead === 0) return p;
  if (ahead !== 1) return emptyPrefs(weekStart);
  const overrides: Record<string, number> = {};
  for (const [key, km] of Object.entries(p.overrides)) {
    if (key.startsWith('1-')) overrides[`0-${key.slice(2)}`] = km;
  }
  return { weekStart, recoveryWeek: p.recoveryWeek === 1 ? 0 : null, overrides };
}

/** Mengisi satu hari sendiri; null atau 0 menghapus isian itu. */
export function setOverride(p: PlanPrefs, week: number, day: number, km: number | null): PlanPrefs {
  const overrides = { ...p.overrides };
  const key = overrideKey(week, day);
  if (km === null || !Number.isFinite(km) || km <= 0) delete overrides[key];
  else overrides[key] = round1(Math.min(km, MAX_OVERRIDE_KM));
  return { ...p, overrides };
}

export const setRecovery = (p: PlanPrefs, recoveryWeek: 0 | 1 | null): PlanPrefs => ({ ...p, recoveryWeek });
