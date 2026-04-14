// tests/lib/salience.test.ts
import { expect, test } from 'vitest';
import { computeSalience, softGateScore } from '../../src/lib/salience.js';

test('computeSalience weights intensity, recency, prediction error, decay', () => {
  const score = computeSalience({
    emotionalIntensity: 1.0,
    recencyScore: 1.0,
    predictionError: 1.0,
    decayFactor: 1.0,
  });
  expect(score).toBeCloseTo(1.0);
});

test('computeSalience zeros prediction error when absent', () => {
  const withError = computeSalience({
    emotionalIntensity: 1.0,
    recencyScore: 1.0,
    predictionError: 1.0,
    decayFactor: 1.0,
  });
  const withoutError = computeSalience({
    emotionalIntensity: 1.0,
    recencyScore: 1.0,
    predictionError: null,
    decayFactor: 1.0,
  });
  // Without prediction error, remaining weights are redistributed
  expect(withoutError).toBeCloseTo(withError);
});

test('softGateScore penalises low-salience memories', () => {
  const high = softGateScore(0.9, 0.8, 0.5);
  const low = softGateScore(0.9, 0.2, 0.5);
  expect(high).toBeGreaterThan(low);
  expect(high).toBeCloseTo(0.9);
  expect(low).toBeCloseTo(0.9 * 0.3);
});
