// tests/lib/memoryTool.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/graph.js', () => ({
  searchDescriptors: vi.fn().mockResolvedValue([
    { id: 'd1', content: 'values directness', category: 'user', salience: 0.7, similarity: 0.92,
      userId: 'u1', supersededAt: null, embedding: null, createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', lastReinforcedAt: '2026-01-01T00:00:00Z' },
  ]),
  describeEntity: vi.fn().mockResolvedValue({
    entity: { id: 'e1', name: 'Devin', userId: 'u1', createdAt: '2026-01-01T00:00:00Z' },
    descriptors: [
      { id: 'd1', content: 'values directness', category: 'user', salience: 0.7,
        supersededAt: null, embedding: null, createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z', lastReinforcedAt: '2026-01-01T00:00:00Z', userId: 'u1' },
    ],
    relations: [{ toName: 'Being Project', type: 'works on' }],
  }),
}));

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

test('memoryTool execute: search returns descriptors with similarity scores', async () => {
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute({ args: ['search', 'directness'], userId: 'u1' }, {} as any);
  expect(result.results).toHaveLength(1);
  expect(result.results[0]!.content).toBe('values directness');
  expect(result.results[0]!.similarity).toBeCloseTo(0.92);
});

test('memoryTool execute: about returns entity description', async () => {
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute({ args: ['about', 'Devin'], userId: 'u1' }, {} as any);
  expect(result.entity.name).toBe('Devin');
  expect(result.descriptors).toHaveLength(1);
  expect(result.relations[0]).toMatchObject({ toName: 'Being Project', type: 'works on' });
});

test('memoryTool execute: about returns null when entity not found', async () => {
  const { describeEntity } = await import('../../src/lib/graph.js');
  vi.mocked(describeEntity).mockResolvedValueOnce(null);
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute({ args: ['about', 'Unknown'], userId: 'u1' }, {} as any);
  expect(result.found).toBe(false);
});

test('memoryTool execute: unknown command returns error', async () => {
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute({ args: ['invalid'], userId: 'u1' }, {} as any);
  expect(result.error).toContain('unknown command');
});
