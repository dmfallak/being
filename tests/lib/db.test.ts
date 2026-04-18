import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/config.js', () => ({
  config: { GOOGLE_GENERATIVE_AI_API_KEY: 'test-key', DATABASE_URL: 'postgres://localhost/test' },
}));

vi.mock('pg', () => {
  const Pool = vi.fn(function(this: any) {
    this.query = vi.fn().mockResolvedValue({ rows: [{ val: 1 }] });
  });
  return {
    default: { Pool },
  };
});

import { db } from '../../src/lib/db.js';

test('db should be able to query', async () => {
  const result = await db.query('SELECT 1 as val');
  expect(result.rows[0].val).toBe(1);
});
