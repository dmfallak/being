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
  upsertDescriptor: vi.fn().mockResolvedValue('new-desc-id'),
  upsertEntity: vi.fn().mockResolvedValue('entity-id'),
  linkDescriptorToEntity: vi.fn().mockResolvedValue(undefined),
  upsertEntityRelation: vi.fn().mockResolvedValue(undefined),
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

test('memoryTool execute: remember returns alreadyKnown when similar descriptor exists', async () => {
  // searchDescriptors mock returns similarity 0.92 which is >= 0.85
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute(
    { args: ['remember', 'Devin', 'is very direct in communication'], userId: 'u1' },
    {} as any,
  );
  expect(result.alreadyKnown).toBe(true);
  expect(result.similar.content).toBe('values directness');
});

test('memoryTool execute: remember writes new descriptor when no similar exists', async () => {
  const { searchDescriptors, upsertDescriptor, upsertEntity, linkDescriptorToEntity } = await import('../../src/lib/graph.js');
  vi.mocked(searchDescriptors).mockResolvedValueOnce([]); // no similar
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute(
    { args: ['remember', 'Devin', 'enjoys hiking on weekends'], userId: 'u1' },
    {} as any,
  );
  expect(result.remembered).toBe(true);
  expect(result.entity).toBe('Devin');
  expect(upsertDescriptor).toHaveBeenCalledWith('u1', 'enjoys hiking on weekends', 'user', 0.8, expect.anything());
  expect(upsertEntity).toHaveBeenCalledWith('u1', 'Devin');
  expect(linkDescriptorToEntity).toHaveBeenCalledWith('u1', 'entity-id', 'new-desc-id');
});

test('memoryTool execute: remember respects explicit category', async () => {
  const { searchDescriptors, upsertDescriptor } = await import('../../src/lib/graph.js');
  vi.mocked(searchDescriptors).mockResolvedValueOnce([]);
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  await memoryTool.execute(
    { args: ['remember', 'Being', 'finds repetitive questions draining', 'being'], userId: 'u1' },
    {} as any,
  );
  expect(upsertDescriptor).toHaveBeenCalledWith('u1', 'finds repetitive questions draining', 'being', 0.8, expect.anything());
});

test('memoryTool execute: link asserts a relation', async () => {
  const { upsertEntityRelation } = await import('../../src/lib/graph.js');
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute(
    { args: ['link', 'Devin', 'works_on', 'Being Project'], userId: 'u1' },
    {} as any,
  );
  expect(result.linked).toBe(true);
  expect(result.from).toBe('Devin');
  expect(result.type).toBe('works_on');
  expect(result.to).toBe('Being Project');
  expect(upsertEntityRelation).toHaveBeenCalledWith('u1', 'Devin', 'Being Project', 'works_on');
});

test('memoryTool execute: remember returns error when args missing', async () => {
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute({ args: ['remember', 'Devin'], userId: 'u1' }, {} as any);
  expect(result.error).toContain('remember requires entity and content');
});

test('memoryTool execute: link returns error when args missing', async () => {
  const { memoryTool } = await import('../../src/lib/memoryTool.js');
  const result = await memoryTool.execute({ args: ['link', 'Devin', 'works_on'], userId: 'u1' }, {} as any);
  expect(result.error).toContain('link requires fromName, type, toName');
});
