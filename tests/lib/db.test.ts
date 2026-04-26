import { expect, test, vi } from 'vitest';
import type { ConversationRow } from '../../src/types/db.js';

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

test('getReDreamCandidatePool returns dreamed conversations excluding recent re-dreams and excluded IDs', async () => {
  // never-dreamed conversation (should be excluded — no last_dream_at)
  const neverDreamed = await db.query<ConversationRow>(
    `INSERT INTO conversations (user_id) VALUES ($1) RETURNING *`,
    ['u-redream-test'],
  ).then(r => r.rows[0]!);

  // dreamed long ago (should be included)
  const dreamedLongAgo = await db.query<ConversationRow>(
    `INSERT INTO conversations (user_id, last_dream_at, redream_count)
     VALUES ($1, now() - interval '30 days', 0) RETURNING *`,
    ['u-redream-test'],
  ).then(r => r.rows[0]!);

  // re-dreamed recently (should be excluded — within 7-day block)
  const recentlyReDreamed = await db.query<ConversationRow>(
    `INSERT INTO conversations (user_id, last_dream_at, last_redream_at, redream_count)
     VALUES ($1, now() - interval '30 days', now() - interval '2 days', 1) RETURNING *`,
    ['u-redream-test'],
  ).then(r => r.rows[0]!);

  const { getReDreamCandidatePool } = await import('../../src/lib/db.js');
  const candidates = await getReDreamCandidatePool('u-redream-test', [neverDreamed.id]);

  const ids = candidates.map(c => c.id);
  expect(ids).toContain(dreamedLongAgo.id);
  expect(ids).not.toContain(neverDreamed.id);
  expect(ids).not.toContain(recentlyReDreamed.id);

  await db.query(`DELETE FROM conversations WHERE user_id = 'u-redream-test'`);
});

test('incrementReDreamCount increments count and sets last_redream_at', async () => {
  const conv = await db.query<ConversationRow>(
    `INSERT INTO conversations (user_id) VALUES ($1) RETURNING *`,
    ['u-redream-inc'],
  ).then(r => r.rows[0]!);

  const { incrementReDreamCount } = await import('../../src/lib/db.js');
  await incrementReDreamCount(conv.id);

  const updated = await db.query<ConversationRow>(
    `SELECT * FROM conversations WHERE id = $1`,
    [conv.id],
  ).then(r => r.rows[0]!);

  expect(updated.redream_count).toBe(1);
  expect(updated.last_redream_at).not.toBeNull();

  await db.query(`DELETE FROM conversations WHERE user_id = 'u-redream-inc'`);
});
