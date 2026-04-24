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

test('upsertEntityFact stores category when provided', async () => {
  const { upsertEntityFact, getEntityFacts } = await import('../../src/lib/db.js');
  await upsertEntityFact('u-cat', 'user fact', 0.7, 'user', undefined);
  await upsertEntityFact('u-cat', 'world fact', 0.7, 'world', undefined);
  const facts = await getEntityFacts('u-cat');
  const userFact = facts.find(f => f.content === 'user fact');
  const worldFact = facts.find(f => f.content === 'world fact');
  expect(userFact?.category).toBe('user');
  expect(worldFact?.category).toBe('world');
});

test('getActiveFactsByCategory returns only non-superseded facts of given category', async () => {
  const { upsertEntityFact, getActiveFactsByCategory, supersedeEntityFact, getEntityFacts } = await import('../../src/lib/db.js');
  await upsertEntityFact('u-cat2', 'active user fact', 0.7, 'user', undefined);
  await upsertEntityFact('u-cat2', 'active world fact', 0.7, 'world', undefined);
  const facts = await getEntityFacts('u-cat2');
  const toSupersede = facts.find(f => f.content === 'active user fact')!;
  await supersedeEntityFact(toSupersede.id, 'u-cat2');
  const active = await getActiveFactsByCategory('u-cat2', 'user');
  expect(active.map(f => f.content)).not.toContain('active user fact');
});

test('getActiveFacts returns only non-superseded facts', async () => {
  const { upsertEntityFact, getActiveFacts, supersedeEntityFact, getEntityFacts } = await import('../../src/lib/db.js');
  await upsertEntityFact('u-active', 'keep this', 0.7, 'user', undefined);
  await upsertEntityFact('u-active', 'supersede this', 0.7, 'user', undefined);
  const all = await getEntityFacts('u-active');
  const toSupersede = all.find(f => f.content === 'supersede this')!;
  await supersedeEntityFact(toSupersede.id, 'u-active');
  const active = await getActiveFacts('u-active');
  expect(active.map(f => f.content)).toContain('keep this');
  expect(active.map(f => f.content)).not.toContain('supersede this');
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
