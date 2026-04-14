// src/lib/dreaming.ts
import { computeSalience } from './salience.js';

export type Context = {
  id: string;
  emotionalIntensity?: number;
  recencyScore?: number;
  predictionError?: number | null;
  decayFactor?: number;
};

export async function rankContexts(contexts: Context[]): Promise<Context[]> {
  return [...contexts].sort((a, b) => {
    const sA = computeSalience({
      emotionalIntensity: a.emotionalIntensity ?? 0,
      recencyScore: a.recencyScore ?? 0,
      predictionError: a.predictionError ?? null,
      decayFactor: a.decayFactor ?? 1,
    });
    const sB = computeSalience({
      emotionalIntensity: b.emotionalIntensity ?? 0,
      recencyScore: b.recencyScore ?? 0,
      predictionError: b.predictionError ?? null,
      decayFactor: b.decayFactor ?? 1,
    });
    return sB - sA;
  });
}
