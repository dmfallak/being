// tests/lib/dream.test.ts
import { expect, test } from 'vitest';
import { shouldDream, computeDecayedSalience } from '../../src/lib/dream.js';

test('shouldDream: true when unprocessed exist and no prior dream', () => {
  const now = new Date('2026-04-17T09:00:00Z');
  expect(shouldDream({ hasUnprocessed: true, lastDreamStartedAt: null, now })).toBe(true);
});

test('shouldDream: false when no unprocessed conversations', () => {
  const now = new Date('2026-04-17T09:00:00Z');
  expect(
    shouldDream({
      hasUnprocessed: false,
      lastDreamStartedAt: new Date('2026-04-16T00:00:00Z'),
      now,
    }),
  ).toBe(false);
});

test('shouldDream: true when last dream was on a prior calendar day AND >=8h ago', () => {
  const now = new Date('2026-04-17T00:30:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-16T14:00:00Z'),
      now,
    }),
  ).toBe(true);
});

test('shouldDream: false when last dream was earlier today and <8h ago', () => {
  const now = new Date('2026-04-17T14:00:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-17T09:00:00Z'),
      now,
    }),
  ).toBe(false);
});

test('shouldDream: true when >=8h elapsed even within same calendar day', () => {
  const now = new Date('2026-04-17T22:00:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-17T13:00:00Z'),
      now,
    }),
  ).toBe(true);
});

test('shouldDream: false across midnight when <8h gap (prevents re-trigger)', () => {
  // 11pm yesterday → 12:15am today: prior calendar day but only 1h15m elapsed.
  // We must NOT re-trigger on the midnight edge.
  const now = new Date('2026-04-17T00:15:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-16T23:00:00Z'),
      now,
    }),
  ).toBe(false);
});

test('computeDecayedSalience: identity at zero days', () => {
  expect(computeDecayedSalience(0.8, 0)).toBeCloseTo(0.8);
});

test('computeDecayedSalience: ~50% at ~34 days with DECAY_FACTOR 0.98', () => {
  // 0.98^34 ≈ 0.5047
  expect(computeDecayedSalience(1.0, 34)).toBeCloseTo(0.98 ** 34, 6);
});

test('computeDecayedSalience: clamps to [0, 1]', () => {
  expect(computeDecayedSalience(1.5, 0)).toBeLessThanOrEqual(1.0);
  expect(computeDecayedSalience(-0.2, 0)).toBeGreaterThanOrEqual(0.0);
  expect(computeDecayedSalience(0.5, 1e6)).toBeGreaterThanOrEqual(0.0);
});
