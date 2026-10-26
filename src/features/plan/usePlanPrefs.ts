import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { parsePrefs, rollPrefs, serializePrefs, setOverride, setRecovery, type PlanPrefs } from './planPrefs';

const KEY = 'runnow.plan.prefs';

interface Snap {
  loaded: boolean;
  prefs: PlanPrefs | null;
}

let snap: Snap = { loaded: false, prefs: null };
const listeners = new Set<() => void>();

function publish(next: Snap): void {
  snap = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pilihan rencana (tapering dan isian km sendiri), dibaca sekali dari HP dan dipakai bersama semua layar.
 * `weekStart` = Senin 00.00 lokal minggu ini: pilihan lama bergeser otomatis kalau minggunya sudah ganti.
 * `loaded` false sampai pembacaan selesai: layar jangan menerima ketukan sebelum itu.
 */
export function usePlanPrefs(weekStart: number): {
  prefs: PlanPrefs;
  loaded: boolean;
  setKm: (week: number, day: number, km: number | null) => void;
  setTaper: (recoveryWeek: 0 | 1 | null) => void;
  clearKm: () => void;
} {
  const s = useSyncExternalStore(subscribe, () => snap);

  useEffect(() => {
    if (snap.loaded) return;
    let live = true;
    void Storage.getItem(KEY)
      .catch(() => null)
      .then((raw) => {
        if (live && !snap.loaded) publish({ loaded: true, prefs: parsePrefs(raw) });
      });
    return () => {
      live = false;
    };
  }, []);

  const prefs = useMemo(() => rollPrefs(s.prefs, weekStart), [s.prefs, weekStart]);

  const save = useCallback((next: PlanPrefs) => {
    publish({ loaded: true, prefs: next });
    void Storage.setItem(KEY, serializePrefs(next)).catch(() => {});
  }, []);

  const setKm = useCallback(
    (week: number, day: number, km: number | null) => save(setOverride(rollPrefs(snap.prefs, weekStart), week, day, km)),
    [save, weekStart],
  );
  const setTaper = useCallback(
    (recoveryWeek: 0 | 1 | null) => save(setRecovery(rollPrefs(snap.prefs, weekStart), recoveryWeek)),
    [save, weekStart],
  );
  const clearKm = useCallback(() => save({ ...rollPrefs(snap.prefs, weekStart), overrides: {} }), [save, weekStart]);

  return { prefs, loaded: s.loaded, setKm, setTaper, clearKm };
}
