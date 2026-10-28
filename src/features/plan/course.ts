import type { RunningCourse, RunningCourseBlock, RunningCourseStep } from '@/wear';

import type { CoachRunType } from './coachHints';

/** Pilihan gaya kursus: Otomatis memilih sendiri, lainnya dipaksa. */
export type CourseStyle = 'auto' | 'continuous' | 'runwalk';
export type ResolvedStyle = 'continuous' | 'runwalk';

/** Pola lari-jalan biasa: 3:45 lari, 0:30 jalan. */
export const RUN_SEC = 225;
export const WALK_SEC = 30;
/** Pola ringan untuk nyeri sedang: 1 menit lari, 2 menit jalan. */
export const SLOW_RUN_SEC = 60;
export const SLOW_WALK_SEC = 120;
/** Kecepatan jalan kaki yang dianggap: 11:00 per km. */
export const WALK_PACE = 660;
/** Di bawah jarak mingguan ini, Otomatis memilih lari-jalan. */
export const LOW_BASE_KM = 12;

const PACE_MIN_S = 60;
const PACE_MAX_S = 900;
const REPEAT_MAX = 99;

export interface StyleContext {
  /** Jenis sesi Coach hari itu, atau null. */
  coachType: CoachRunType | null;
  /** Nyeri sedang: pola lari-jalan ringan. */
  slow: boolean;
  /** Rata-rata jarak mingguan 28 hari terakhir, km. */
  baseKm: number;
}

/**
 * Otomatis: lari-jalan kalau Coach menjadwalkan lari-jalan, kalau nyeri sedang, atau kalau jarak mingguanmu masih di
 * bawah 12 km (pemula atau baru kembali). Selain itu lari terus.
 */
export function resolveStyle(pref: CourseStyle, ctx: StyleContext): ResolvedStyle {
  if (ctx.slow) return 'runwalk';
  if (pref !== 'auto') return pref;
  return ctx.coachType === 'walkrun' || ctx.baseKm < LOW_BASE_KM ? 'runwalk' : 'continuous';
}

export interface DayCourseInput {
  /** Nama kursus di jam (maksimal 64 byte). */
  name: string;
  km: number;
  /** Rentang pace seluruh sesi, detik per km (cepat dulu). */
  paceLo: number;
  paceHi: number;
  /** Perkiraan menit seluruh sesi. */
  minutes: number;
  slow: boolean;
  style: ResolvedStyle;
}

const clampPace = (s: number): number => Math.max(PACE_MIN_S, Math.min(PACE_MAX_S, Math.round(s)));

const plain = (kind: 'warmup' | 'cooldown' | 'walk', seconds: number): RunningCourseStep => ({
  kind,
  target: 'time',
  targetValue: seconds,
  intensity: 'none',
  low: 0,
  high: 0,
});

/**
 * Pace bagian lari saja, kalau seluruh sesi (dengan jedanya) rata-rata `avg`: bagian lari lebih cepat dari rata-rata
 * karena jalan menurunkannya.
 */
export function runSegmentPace(avg: number, runSec: number, walkSec: number): number {
  const cycle = runSec + walkSec;
  return runSec / (cycle / avg - walkSec / WALK_PACE);
}

/**
 * Kursus satu hari lari: pemanasan, bagian utama, pendinginan. Lari terus = satu langkah lari dengan target jarak dan
 * rentang pace. Lari-jalan = lari dan jalan bergantian dengan target waktu; pace bagian lari sudah disesuaikan supaya
 * rata-rata seluruh sesi sama dengan targetnya.
 */
export function dayCourse(input: DayCourseInput): RunningCourse {
  const warm = input.km >= 4 ? 300 : 180;
  const blocks: RunningCourseBlock[] = [{ repeat: 1, steps: [plain('warmup', warm)] }];

  if (input.style === 'continuous') {
    const walkKm = (warm * 2) / WALK_PACE;
    const metres = Math.max(500, Math.round((input.km - walkKm) * 10) * 100);
    blocks.push({
      repeat: 1,
      steps: [
        {
          kind: 'run',
          target: 'distance',
          targetValue: metres,
          intensity: 'pace',
          low: clampPace(input.paceLo),
          high: clampPace(input.paceHi),
        },
      ],
    });
  } else {
    const runSec = input.slow ? SLOW_RUN_SEC : RUN_SEC;
    const walkSec = input.slow ? SLOW_WALK_SEC : WALK_SEC;
    const cycle = runSec + walkSec;
    const mainSec = Math.max(cycle, input.minutes * 60 - warm * 2);
    const repeat = Math.max(1, Math.min(REPEAT_MAX, Math.round(mainSec / cycle)));
    const avg = (input.paceLo + input.paceHi) / 2;
    const scale = runSegmentPace(avg, runSec, walkSec) / avg;
    blocks.push({
      repeat,
      steps: [
        {
          kind: 'run',
          target: 'time',
          targetValue: runSec,
          intensity: 'pace',
          low: clampPace(input.paceLo * scale),
          high: clampPace(input.paceHi * scale),
        },
        plain('walk', walkSec),
      ],
    });
  }

  blocks.push({ repeat: 1, steps: [plain('cooldown', warm)] });
  return { name: input.name, blocks };
}
