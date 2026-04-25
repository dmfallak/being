// tests/lib/neo4j.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/config.js', () => ({
  config: {
    GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
    DATABASE_URL: 'postgres://being:being@localhost:5433/being',
    NEO4J_URI: 'bolt://localhost:7687',
  },
}));

vi.mock('neo4j-driver', () => {
  const run = vi.fn().mockResolvedValue({ records: [] });
  const close = vi.fn().mockResolvedValue(undefined);
  return {
    default: {
      driver: vi.fn(() => ({ session: vi.fn(() => ({ run, close })), close: vi.fn().mockResolvedValue(undefined) })),
    },
  };
});

test('getSession returns an object with run and close', async () => {
  const { getSession } = await import('../../src/lib/neo4j.js');
  const session = getSession();
  expect(typeof session.run).toBe('function');
  expect(typeof session.close).toBe('function');
  await session.close();
});
