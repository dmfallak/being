import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/config.js', () => ({
  config: {
    GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
    DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgres://being:being@localhost:5433/being',
  },
}));

import { db } from '../../src/lib/db.js';

test('db should be able to query', async () => {
  const result = await db.query('SELECT 1 as val');
  expect(result.rows[0].val).toBe(1);
});

test('insertDreamArtifact and getLatestArtifacts round-trip', async () => {
  const { insertDreamRun, finalizeDreamRun, insertDreamArtifact, getLatestArtifacts } = await import('../../src/lib/db.js');
  const run = await insertDreamRun('u-art', new Date());
  await finalizeDreamRun(run.id, { conversations_processed: 0, facts_created: 0, facts_reinforced: 0, cap_hit: false, parse_failures: 0, error: null });
  await insertDreamArtifact(run.id, 'u-art', 'residue', 'I keep thinking about the droplet.', null);
  await insertDreamArtifact(run.id, 'u-art', 'relational_portrait', 'Devin is an engineer by trade.', null);
  const artifacts = await getLatestArtifacts('u-art');
  expect(artifacts.residue).toBe('I keep thinking about the droplet.');
  expect(artifacts.relationalPortrait).toBe('Devin is an engineer by trade.');
  expect(artifacts.selfModel).toBeUndefined();
});
