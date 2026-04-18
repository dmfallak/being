// tests/lib/dream.test.ts
import { expect, test, vi } from 'vitest';
import { shouldDream, computeDecayedSalience } from '../../src/lib/dream.js';

test('shouldDream: true when unprocessed exist and no prior dream', () => {
  const now = new Date('2026-04-17T09:00:00Z');
  expect(shouldDream({ hasUnprocessed: true, lastDreamStartedAt: null, now })).toBe(true);
});

test('shouldDream: false when no unprocessed conversations', () => {
  const now = new Date('2026-04-17T09:00:00Z');
  expect(
    shouldDream({
      hasUnprocessed: false,
      lastDreamStartedAt: new Date('2026-04-16T00:00:00Z'),
      now,
    }),
  ).toBe(false);
});

test('shouldDream: true when last dream was on a prior calendar day AND >=8h ago', () => {
  const now = new Date('2026-04-17T00:30:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-16T14:00:00Z'),
      now,
    }),
  ).toBe(true);
});

test('shouldDream: false when last dream was earlier today and <8h ago', () => {
  const now = new Date('2026-04-17T14:00:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-17T09:00:00Z'),
      now,
    }),
  ).toBe(false);
});

test('shouldDream: true when >=8h elapsed even within same calendar day', () => {
  const now = new Date('2026-04-17T22:00:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-17T13:00:00Z'),
      now,
    }),
  ).toBe(true);
});

test('shouldDream: false across midnight when <8h gap (prevents re-trigger)', () => {
  // 11pm yesterday → 12:15am today: prior calendar day but only 1h15m elapsed.
  // We must NOT re-trigger on the midnight edge.
  const now = new Date('2026-04-17T00:15:00Z');
  expect(
    shouldDream({
      hasUnprocessed: true,
      lastDreamStartedAt: new Date('2026-04-16T23:00:00Z'),
      now,
    }),
  ).toBe(false);
});

test('computeDecayedSalience: identity at zero days', () => {
  expect(computeDecayedSalience(0.8, 0)).toBeCloseTo(0.8);
});

test('computeDecayedSalience: ~50% at ~34 days with DECAY_FACTOR 0.98', () => {
  // 0.98^34 ≈ 0.5047
  expect(computeDecayedSalience(1.0, 34)).toBeCloseTo(0.98 ** 34, 6);
});

test('computeDecayedSalience: clamps to [0, 1]', () => {
  expect(computeDecayedSalience(1.5, 0)).toBeLessThanOrEqual(1.0);
  expect(computeDecayedSalience(-0.2, 0)).toBeGreaterThanOrEqual(0.0);
  expect(computeDecayedSalience(0.5, 1e6)).toBeGreaterThanOrEqual(0.0);
});

import type { Message } from '../../src/lib/llm.js';
import type { EntityFactRow } from '../../src/types/db.js';

function factFixture(partial: Partial<EntityFactRow>): EntityFactRow {
  return {
    id: 'fact-1',
    user_id: 'u1',
    content: 'seems to value directness',
    salience: 0.7,
    created_at: new Date(),
    updated_at: new Date(),
    last_reinforced_at: new Date(),
    ...partial,
  };
}

test('reflectOnConversation: parses valid JSON output', async () => {
  const { reflectOnConversation } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue(
    JSON.stringify({
      new_hypotheses: ['seems to prefer short answers'],
      reinforced_ids: ['fact-1'],
      note: 'Felt calmer in this one.',
    }),
  );
  const messages: Message[] = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ];
  const result = await reflectOnConversation({
    facts: [factFixture({ id: 'fact-1' })],
    messages,
    generate,
  });
  expect(result).toEqual({
    newHypotheses: ['seems to prefer short answers'],
    reinforcedIds: ['fact-1'],
    note: 'Felt calmer in this one.',
  });
  expect(generate).toHaveBeenCalledTimes(1);
  const [, , options] = generate.mock.calls[0]!;
  expect(options).toEqual({ temperature: 0.4 });
});

test('reflectOnConversation: returns null on malformed JSON', async () => {
  const { reflectOnConversation } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue('not json at all');
  const result = await reflectOnConversation({
    facts: [],
    messages: [{ role: 'user', content: 'x' }],
    generate,
  });
  expect(result).toBeNull();
});

test('reflectOnConversation: returns null on schema mismatch', async () => {
  const { reflectOnConversation } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue(
    JSON.stringify({ new_hypotheses: 'should be an array', reinforced_ids: [], note: '' }),
  );
  const result = await reflectOnConversation({
    facts: [],
    messages: [{ role: 'user', content: 'x' }],
    generate,
  });
  expect(result).toBeNull();
});

test('reflectOnConversation: tolerates JSON wrapped in markdown code fences', async () => {
  const { reflectOnConversation } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue(
    '```json\n{"new_hypotheses":["a"],"reinforced_ids":[],"note":"n"}\n```',
  );
  const result = await reflectOnConversation({
    facts: [],
    messages: [{ role: 'user', content: 'x' }],
    generate,
  });
  expect(result?.newHypotheses).toEqual(['a']);
});

test('generateResidue: produces prose with temp 1.0 and includes notes + fact summary', async () => {
  const { generateResidue } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue('I keep returning to the question of...');
  const prose = await generateResidue({
    notes: ['Felt calmer.', 'Curious about the user\'s migration story.'],
    factsCreatedCount: 2,
    factsReinforcedCount: 1,
    generate,
  });
  expect(prose).toBe('I keep returning to the question of...');
  expect(generate).toHaveBeenCalledTimes(1);
  const [, userMessages, options] = generate.mock.calls[0]!;
  expect(options).toEqual({ temperature: 1.0 });
  const userContent = (userMessages as Message[])[0]!.content;
  expect(userContent).toContain('Felt calmer.');
  expect(userContent).toContain('2 new');
  expect(userContent).toContain('1 reinforced');
});

vi.mock('../../src/lib/db.js', () => ({
  withTransaction: vi.fn(),
  getLatestDreamRun: vi.fn(),
  getUnprocessedConversations: vi.fn(),
  countUnprocessedConversations: vi.fn(),
  getMessagesForConversation: vi.fn(),
  getAllEntityFacts: vi.fn(),
  updateFactSalience: vi.fn(),
  reinforceFact: vi.fn(),
  insertDreamRun: vi.fn(),
  finalizeDreamRun: vi.fn(),
  insertDreamResidue: vi.fn(),
  markConversationsDreamed: vi.fn(),
  upsertEntityFact: vi.fn(),
}));

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../src/lib/llm.js', () => ({
  generateResponse: vi.fn(),
}));

test('maybeDream: skips when no unprocessed conversations', async () => {
  const db = await import('../../src/lib/db.js');
  (db.countUnprocessedConversations as any).mockResolvedValue(0);
  (db.getLatestDreamRun as any).mockResolvedValue(null);

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result).toEqual({ dreamed: false, reason: 'no-unprocessed' });
  expect(db.withTransaction).not.toHaveBeenCalled();
});

test('maybeDream: skips when last dream was <8h ago and same day', async () => {
  vi.clearAllMocks();
  const db = await import('../../src/lib/db.js');
  (db.countUnprocessedConversations as any).mockResolvedValue(3);
  const recent = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
  (db.getLatestDreamRun as any).mockResolvedValue({
    id: 'dr-1',
    user_id: 'u1',
    started_at: recent,
    completed_at: recent,
    conversations_processed: 1,
    facts_created: 0,
    facts_reinforced: 0,
    cap_hit: false,
    error: null,
  });

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result).toEqual({ dreamed: false, reason: 'rate-limited' });
  expect(db.withTransaction).not.toHaveBeenCalled();
});
