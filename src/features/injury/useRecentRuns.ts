import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { listWorkouts } from '@/db/queries';
import { isRunSport } from '@/features/lactate/fromHardestRun';

import type { RunInput } from './triggers';

const LOOKBACK_DAYS = 60;

/**
 * Lari 60 hari terakhir dari database jam; null sampai pembacaan selesai. `dataVersion` memicu baca ulang
 * setelah sinkron.
 */
export function useRecentRuns(dataVersion: number): RunInput[] | null {
  const db = useSQLiteContext();
  const [runs, setRuns] = useState<RunInput[] | null>(null);

  useEffect(() => {
    let live = true;
    const since = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
    listWorkouts(db)
      .then((rows) => {
        if (!live) return;
        setRuns(
          rows
            .filter((w) => w.complete && w.start > since && isRunSport(w.sportType))
            .map((w) => ({ start: w.start, duration: w.duration, distance: w.distance, steps: w.steps })),
        );
      })
      .catch(() => {
        if (live) setRuns([]);
      });
    return () => {
      live = false;
    };
  }, [db, dataVersion]);

  return runs;
      }
