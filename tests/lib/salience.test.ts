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

test('computeSalience redistributes null predictionError distinctly from zero', () => {
  const withZero = computeSalience({
    emotionalIntensity: 0.6,
    recencyScore: 0.4,
    predictionError: 0,
    decayFactor: 0.5,
  });
  const withNull = computeSalience({
    emotionalIntensity: 0.6,
    recencyScore: 0.4,
    predictionError: null,
    decayFactor: 0.5,
  });
  expect(withNull).not.toBeCloseTo(withZero);
  expect(withNull).toBeCloseTo(0.6 * (0.3 + 0.2 / 3) + 0.4 * (0.3 + 0.2 / 3) + 0.5 * (0.2 + 0.2 / 3));
});

test('softGateScore penalises low-salience memories', () => {
  const high = softGateScore(0.9, 0.8, 0.5);
  const low = softGateScore(0.9, 0.2, 0.5);
  expect(high).toBeGreaterThan(low);
  expect(high).toBeCloseTo(0.9);
  expect(low).toBeCloseTo(0.9 * 0.3);
});
