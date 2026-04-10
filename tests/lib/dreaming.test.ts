import { expect, test } from 'vitest';
import { rankContexts } from '../../src/lib/dreaming.js';

test('dreaming should rank contexts by emotional intensity', async () => {
  const contexts = [{ id: '1', intensity: 0.1 }, { id: '2', intensity: 0.9 }];
  const ranked = await rankContexts(contexts);
  expect(ranked[0].id).toBe('2');
});
