/** Pain check per body area (Run Now "Saran & penanganan"). Pure: the UI owns the wording. Scale 0 to 10. */
export const PAIN_AREAS = ['knee', 'shin', 'calf', 'foot', 'ham', 'hip', 'back'] as const;
export type PainArea = (typeof PAIN_AREAS)[number];
export type PainReport = Partial<Record<PainArea, number>>;

export type PainBand = 'none' | 'mild' | 'moderate' | 'severe';
export type RunAdvice = 'ok' | 'reduce' | 'noHard' | 'stop';

export const clampPain = (v: number): number => (Number.isFinite(v) ? Math.min(10, Math.max(0, Math.round(v))) : 0);

/** 0 none, 1 to 3 mild, 4 to 6 moderate, 7 or more severe. */
export function painBand(v: number): PainBand {
  const p = clampPain(v);
  return p === 0 ? 'none' : p <= 3 ? 'mild' : p <= 6 ? 'moderate' : 'severe';
}

/** The strictest advice any area calls for: severe stops running, moderate drops hard sessions and long runs, mild cuts 30 to 50 %. */
export function runAdvice(report: PainReport): RunAdvice {
  const worst = Math.max(0, ...PAIN_AREAS.map((a) => clampPain(report[a] ?? 0)));
  const b = painBand(worst);
  return b === 'severe' ? 'stop' : b === 'moderate' ? 'noHard' : b === 'mild' ? 'reduce' : 'ok';
}

/** Areas with pain above zero, worst first. */
export function activePain(report: PainReport): { area: PainArea; value: number; band: PainBand }[] {
  return PAIN_AREAS.map((area) => ({ area, value: clampPain(report[area] ?? 0) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((x) => ({ ...x, band: painBand(x.value) }));
}
