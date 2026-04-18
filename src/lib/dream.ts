// src/lib/dream.ts
export const DECAY_FACTOR = 0.98;
export const MIN_DREAM_GAP_MS = 8 * 60 * 60 * 1000;

export type ShouldDreamInputs = {
  hasUnprocessed: boolean;
  lastDreamStartedAt: Date | null;
  now: Date;
};

export function shouldDream(inputs: ShouldDreamInputs): boolean {
  const { hasUnprocessed, lastDreamStartedAt, now } = inputs;
  if (!hasUnprocessed) return false;
  if (lastDreamStartedAt === null) return true;
  const elapsedMs = now.getTime() - lastDreamStartedAt.getTime();
  return elapsedMs >= MIN_DREAM_GAP_MS;
}

export function computeDecayedSalience(oldSalience: number, daysSince: number): number {
  const clampedSalience = Math.max(0, Math.min(1, oldSalience));
  const clampedDays = Math.max(0, daysSince);
  const decayed = clampedSalience * Math.pow(DECAY_FACTOR, clampedDays);
  return Math.max(0, Math.min(1, decayed));
}
