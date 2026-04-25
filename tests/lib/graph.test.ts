// tests/lib/graph.test.ts
import { expect, test, vi, beforeEach } from 'vitest';

const run = vi.fn();
const close = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/neo4j.js', () => ({
  getSession: vi.fn(() => ({ run, close })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
});

test('upsertEntity returns the node id', async () => {
  run.mockResolvedValue({ records: [{ get: (k: string) => k === 'id' ? 'entity-uuid-1' : null }] });
  const { upsertEntity } = await import('../../src/lib/graph.js');
  const id = await upsertEntity('u1', 'Devin');
  expect(id).toBe('entity-uuid-1');
  expect(run).toHaveBeenCalledWith(expect.stringContaining('MERGE'), expect.objectContaining({ userId: 'u1', name: 'Devin' }));
});

test('upsertDescriptor returns the node id', async () => {
  run.mockResolvedValue({ records: [{ get: (k: string) => k === 'id' ? 'desc-uuid-1' : null }] });
  const { upsertDescriptor } = await import('../../src/lib/graph.js');
  const id = await upsertDescriptor('u1', 'seems to value directness', 'user', 0.7);
  expect(id).toBe('desc-uuid-1');
});

test('upsertDescriptor passes embedding when provided', async () => {
  run.mockResolvedValue({ records: [{ get: () => 'desc-uuid-2' }] });
  const { upsertDescriptor } = await import('../../src/lib/graph.js');
  await upsertDescriptor('u1', 'content', 'user', 0.7, [0.1, 0.2, 0.3]);
  expect(run).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ embedding: [0.1, 0.2, 0.3] }));
});

test('linkDescriptorToEntity runs a MERGE query', async () => {
  run.mockResolvedValue({ records: [] });
  const { linkDescriptorToEntity } = await import('../../src/lib/graph.js');
  await linkDescriptorToEntity('u1', 'entity-uuid-1', 'desc-uuid-1');
  expect(run).toHaveBeenCalledWith(expect.stringContaining('HAS_DESCRIPTOR'), expect.any(Object));
});

test('upsertEntityRelation runs a MERGE query with freeform type', async () => {
  run.mockResolvedValue({ records: [] });
  const { upsertEntityRelation } = await import('../../src/lib/graph.js');
  await upsertEntityRelation('u1', 'Devin', 'Being Project', 'works on');
  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('RELATES_TO'),
    expect.objectContaining({ fromName: 'Devin', toName: 'Being Project', type: 'works on' }),
  );
});

test('supersedeDescriptor sets supersededAt', async () => {
  run.mockResolvedValue({ records: [] });
  const { supersedeDescriptor } = await import('../../src/lib/graph.js');
  await supersedeDescriptor('desc-uuid-1', 'u1');
  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('supersededAt'),
    expect.objectContaining({ id: 'desc-uuid-1', userId: 'u1' }),
  );
});

test('reinforceDescriptor increments salience', async () => {
  run.mockResolvedValue({ records: [] });
  const { reinforceDescriptor } = await import('../../src/lib/graph.js');
  await reinforceDescriptor('desc-uuid-1', 'u1');
  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('salience'),
    expect.objectContaining({ id: 'desc-uuid-1', userId: 'u1' }),
  );
});

test('updateDescriptorSaliences batches updates via UNWIND', async () => {
  run.mockResolvedValue({ records: [] });
  const { updateDescriptorSaliences } = await import('../../src/lib/graph.js');
  await updateDescriptorSaliences([{ id: 'd1', salience: 0.5 }, { id: 'd2', salience: 0.3 }], 'u1');
  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('UNWIND'),
    expect.objectContaining({ userId: 'u1' }),
  );
});

test('updateDescriptorSaliences no-ops on empty array', async () => {
  const { updateDescriptorSaliences } = await import('../../src/lib/graph.js');
  await updateDescriptorSaliences([], 'u1');
  expect(run).not.toHaveBeenCalled();
});

test('getActiveDescriptors returns DescriptorNode array', async () => {
  const fakeNode = {
    properties: {
      id: 'd1', content: 'values directness', userId: 'u1',
      category: 'user', salience: 0.7, supersededAt: null,
      embedding: null, createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', lastReinforcedAt: '2026-01-01T00:00:00Z',
    },
  };
  run.mockResolvedValue({ records: [{ get: () => fakeNode }] });
  const { getActiveDescriptors } = await import('../../src/lib/graph.js');
  const result = await getActiveDescriptors('u1');
  expect(result).toHaveLength(1);
  expect(result[0]!.content).toBe('values directness');
  expect(result[0]!.category).toBe('user');
});

test('getActiveDescriptors filters by category when provided', async () => {
  run.mockResolvedValue({ records: [] });
  const { getActiveDescriptors } = await import('../../src/lib/graph.js');
  await getActiveDescriptors('u1', 'world');
  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('category'),
    expect.objectContaining({ category: 'world' }),
  );
});

test('searchDescriptors calls vector index query', async () => {
  run.mockResolvedValue({ records: [] });
  const { searchDescriptors } = await import('../../src/lib/graph.js');
  await searchDescriptors('u1', [0.1, 0.2, 0.3], 5);
  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('descriptor_embedding'),
    expect.objectContaining({ limit: 5, embedding: [0.1, 0.2, 0.3] }),
  );
});

test('describeEntity returns entity with descriptors and relations', async () => {
  const fakeRec = {
    get: (k: string) => {
      if (k === 'e') return { properties: { id: 'e1', name: 'Devin', userId: 'u1', createdAt: '2026-01-01T00:00:00Z' } };
      if (k === 'descriptors') return [];
      if (k === 'relations') return [];
      return null;
    },
  };
  run.mockResolvedValue({ records: [fakeRec] });
  const { describeEntity } = await import('../../src/lib/graph.js');
  const result = await describeEntity('u1', 'Devin');
  expect(result).not.toBeNull();
  expect(result!.entity.name).toBe('Devin');
});

test('describeEntity returns null when entity not found', async () => {
  run.mockResolvedValue({ records: [] });
  const { describeEntity } = await import('../../src/lib/graph.js');
  const result = await describeEntity('u1', 'Unknown');
  expect(result).toBeNull();
});
