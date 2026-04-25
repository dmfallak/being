import { expect, test, vi } from 'vitest';

const run = vi.fn().mockResolvedValue({ records: [] });
const close = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/neo4j.js', () => ({
  getSession: vi.fn(() => ({ run, close })),
}));

test('initGraph creates all four constraints and indexes', async () => {
  const { initGraph } = await import('../../src/db/init-graph.js');
  await initGraph();
  const queries = run.mock.calls.map(c => c[0] as string);
  expect(queries.some(q => q.includes('entity_unique'))).toBe(true);
  expect(queries.some(q => q.includes('descriptor_unique'))).toBe(true);
  expect(queries.some(q => q.includes('entity_embedding'))).toBe(true);
  expect(queries.some(q => q.includes('descriptor_embedding'))).toBe(true);
  expect(close).toHaveBeenCalled();
});

test('initGraph is idempotent — runs twice without throwing', async () => {
  const { initGraph } = await import('../../src/db/init-graph.js');
  await expect(initGraph()).resolves.not.toThrow();
  vi.clearAllMocks();
  run.mockResolvedValue({ records: [] });
  close.mockResolvedValue(undefined);
  await expect(initGraph()).resolves.not.toThrow();
});
