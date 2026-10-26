import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { PainArea } from './pain';
import { EMPTY_PAIN, parsePainDoc, serializePainDoc, setPain, type PainDoc } from './painDoc';

const KEY = 'runnow.injury.pain';

let held: PainDoc | null = null;
const listeners = new Set<() => void>();

function publish(next: PainDoc): void {
  held = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Catatan nyeri, dibaca sekali dari HP dan dipakai bersama semua layar. `loaded` false sampai pembacaan selesai:
 * layar jangan menerima ketukan sebelum itu, supaya catatan lama tidak tertimpa kosong.
 */
export function usePain(): {
  doc: PainDoc;
  loaded: boolean;
  setArea: (area: PainArea, value: number) => void;
  clear: () => void;
} {
  const snapshot = useSyncExternalStore(subscribe, () => held);

  useEffect(() => {
    if (held) return;
    let live = true;
    void Storage.getItem(KEY)
      .catch(() => null)
      .then((raw) => {
        if (live && !held) publish(parsePainDoc(raw));
      });
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback((next: PainDoc) => {
    publish(next);
    void Storage.setItem(KEY, serializePainDoc(next)).catch(() => {});
  }, []);

  const setArea = useCallback(
    (area: PainArea, value: number) => {
      save(setPain(held ?? EMPTY_PAIN, area, value, Math.floor(Date.now() / 1000)));
    },
    [save],
  );

  const clear = useCallback(() => {
    save({ at: Math.floor(Date.now() / 1000), report: {} });
  }, [save]);

  return { doc: snapshot ?? EMPTY_PAIN, loaded: snapshot !== null, setArea, clear };
                                        }
