// tests/lib/waking.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.9, 0.1]),
}));

vi.mock('../../src/lib/db.js', () => ({
  getEntityFactEmbeddings: vi.fn().mockResolvedValue([
    { id: '1', content: 'Alex values directness', salience: 0.8, similarity: 0.9 },
    { id: '2', content: 'Alex mentioned enjoying hiking', salience: 0.3, similarity: 0.2 },
  ]),
}));

test('buildContextBudget returns facts ordered by soft gate score', async () => {
  const { buildContextBudget } = await import('../../src/lib/waking.js');
  const budget = await buildContextBudget('u1', 'Tell me about yourself', 0.5);
  expect(budget.length).toBeGreaterThan(0);
  // High salience + high similarity should rank first
  expect(budget[0]).toContain('directness');
});

test('buildContextBudget respects maxItems limit', async () => {
  const { buildContextBudget } = await import('../../src/lib/waking.js');
  const budget = await buildContextBudget('u1', 'hello', 0.5, 1);
  expect(budget).toHaveLength(1);
});
