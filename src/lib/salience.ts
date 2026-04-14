// src/lib/salience.ts
export type SalienceInputs = {
  emotionalIntensity: number;
  recencyScore: number;
  predictionError: number | null;
  decayFactor: number;
};

/**
 * Computes a [0,1] salience score.
 * Weights: intensity 30%, recency 30%, prediction error 20%, decay 20%.
 * When predictionError is null, its 20% is redistributed evenly to the other three.
 */
export function computeSalience(inputs: SalienceInputs): number {
  const { emotionalIntensity, recencyScore, predictionError, decayFactor } = inputs;

  if (predictionError !== null) {
    return (
      emotionalIntensity * 0.3 +
      recencyScore * 0.3 +
      predictionError * 0.2 +
      decayFactor * 0.2
    );
  }

  // Redistribute prediction error weight evenly across the other three
  return (
    emotionalIntensity * (0.3 + 0.2 / 3) +
    recencyScore * (0.3 + 0.2 / 3) +
    decayFactor * (0.2 + 0.2 / 3)
  );
}

/**
 * Applies soft salience gate to a semantic similarity score.
 * Memories below the threshold are penalised (multiplied by 0.3) rather than dropped.
 */
export function softGateScore(
  semanticSimilarity: number,
  salience: number,
  threshold: number,
): number {
  const multiplier = salience >= threshold ? 1.0 : 0.3;
  return semanticSimilarity * multiplier;
}
