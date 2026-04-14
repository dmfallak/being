// tests/lib/dreaming.test.ts
import { expect, test } from 'vitest';
import { rankContexts } from '../../src/lib/dreaming.js';

test('rankContexts sorts by computed salience descending', async () => {
  const contexts = [
    { id: '1', emotionalIntensity: 0.1, recencyScore: 0.1 },
    { id: '2', emotionalIntensity: 0.9, recencyScore: 0.9 },
  ];
  const ranked = await rankContexts(contexts);
  expect(ranked[0]?.id).toBe('2');
});
