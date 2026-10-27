import type { CoachPlan, PlanGoal, PlanLevel } from '../coach/doc';
import { generatePlan, weekIndexAt } from '../coach/plans/generate';
import type { HrZone, SessionType, WeekPhase } from '../coach/plans/types';

export type CoachRunType = Exclude<SessionType, 'strength'>;

/** Satu sesi lari dari rencana Coach. */
export interface CoachSession {
  type: CoachRunType;
  /** Menit seluruh sesi, sudah termasuk penyesuaian mingguan Coach. */
  minutes: number;
  /** Zona detak sasaran bagian utama, 1 sampai 5. */
  zone: HrZone | null;
}

export interface CoachWeekHint {
  /** Fase minggu menurut Coach; null kalau minggu ini di luar rencana. */
  phase: WeekPhase | null;
  /** Tujuh nilai, Senin sampai Minggu: sesi lari Coach hari itu, atau null. */
  days: (CoachSession | null)[];
}

export interface CoachHints {
  goal: PlanGoal;
  level: PlanLevel;
  /** Minggu ke berapa dalam rencana Coach (mulai 1) untuk minggu pertama kalender kita; null kalau di luar rencana. */
  weekNumber: number | null;
  totalWeeks: number;
  weeks: CoachWeekHint[];
}

/**
 * Apa kata rencana Coach untuk hari-hari kalender kita. `weekDays`: untuk tiap minggu, tujuh tanggal lokal
 * `YYYY-MM-DD` (Senin sampai Minggu). Null kalau tidak ada rencana lari, atau rencananya belum mulai atau sudah
 * selesai untuk minggu-minggu ini. Murni: memakai generator rencana Coach apa adanya.
 */
export function coachHints(plan: CoachPlan | null, weekDays: readonly (readonly string[])[]): CoachHints | null {
  if (!plan || plan.kind !== 'run' || weekDays.length === 0) return null;
  const generated = generatePlan(plan);
  const byDay = new Map<string, CoachSession>();
  for (const week of generated) {
    for (const s of week.sessions) {
      if (s.kind !== 'run' || s.type === 'strength' || s.beforeStart) continue;
      byDay.set(s.day, { type: s.type, minutes: s.minutes, zone: s.run?.zone ?? null });
    }
  }
  const phaseOfMonday = new Map(generated.map((w) => [w.startDay, w.phase]));
  const weeks: CoachWeekHint[] = weekDays.map((days) => ({
    phase: phaseOfMonday.get(days[0]) ?? null,
    days: days.map((d) => byDay.get(d) ?? null),
  }));
  if (weeks.every((w) => w.phase === null && w.days.every((d) => d === null))) return null;
  const index = weekIndexAt(plan, weekDays[0][0]);
  return {
    goal: plan.goal,
    level: plan.level,
    weekNumber: index >= 0 && index < plan.weeks ? index + 1 : null,
    totalWeeks: plan.weeks,
    weeks,
  };
}
