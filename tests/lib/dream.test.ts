// tests/lib/dream.test.ts
import { expect, test, vi } from 'vitest';
import { shouldDream, computeDecayedSalience } from '../../src/lib/dream.js';

test('shouldDream: true when unprocessed conversations exist', () => {
  expect(shouldDream({ hasUnprocessed: true })).toBe(true);
});

test('shouldDream: false when no unprocessed conversations', () => {
  expect(shouldDream({ hasUnprocessed: false })).toBe(false);
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
    category: 'user',
    salience: 0.7,
    superseded_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    last_reinforced_at: new Date(),
    ...partial,
  };
}

test('reflectOnConversation: parses valid JSON with categories and supersessions', async () => {
  const { reflectOnConversation } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue(
    JSON.stringify({
      new_hypotheses: [
        { content: 'seems to prefer short answers', category: 'user' },
        { content: 'heard about a new conflict', category: 'world' },
      ],
      reinforced_ids: ['fact-1'],
      superseded_old_ids: ['fact-2'],
      note: 'Felt calmer in this one.',
    }),
  );
  const messages: Message[] = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ];
  const result = await reflectOnConversation({
    facts: [factFixture({ id: 'fact-1' }), factFixture({ id: 'fact-2' })],
    messages,
    generate,
  });
  expect(result).toEqual({
    newHypotheses: [
      { content: 'seems to prefer short answers', category: 'user' },
      { content: 'heard about a new conflict', category: 'world' },
    ],
    reinforcedIds: ['fact-1'],
    supersededOldIds: ['fact-2'],
    note: 'Felt calmer in this one.',
  });
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
    JSON.stringify({ new_hypotheses: 'should be an array', reinforced_ids: [], superseded_old_ids: [], note: '' }),
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
    '```json\n{"new_hypotheses":[{"content":"a","category":"user"}],"reinforced_ids":[],"superseded_old_ids":[],"note":"n"}\n```',
  );
  const result = await reflectOnConversation({
    facts: [],
    messages: [{ role: 'user', content: 'x' }],
    generate,
  });
  expect(result?.newHypotheses[0]?.content).toBe('a');
  expect(result?.newHypotheses[0]?.category).toBe('user');
});

test('generateResidue: produces prose with temp 1.2 and includes notes + fact summary', async () => {
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
  expect(options).toEqual({ temperature: 1.2 });
  const userContent = (userMessages as Message[])[0]!.content;
  expect(userContent).toContain('Felt calmer.');
  expect(userContent).toContain('2 new');
  expect(userContent).toContain('1 reinforced');
});

test('generateResidue: uses temperature 1.2', async () => {
  const { generateResidue } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue('I keep returning to the question of...');
  await generateResidue({
    notes: ['Felt calmer.'],
    factsCreatedCount: 1,
    factsReinforcedCount: 0,
    generate,
  });
  const [, , options] = generate.mock.calls[0]!;
  expect(options).toEqual({ temperature: 1.2 });
});

test('generatePortrait: calls generate with facts and temperature 0.6', async () => {
  const { generatePortrait } = await import('../../src/lib/dream.js');
  const generate = vi.fn().mockResolvedValue('Devin is an engineer by trade.');
  const prose = await generatePortrait(
    'relational_portrait',
    ['seems to prefer scrappy approaches', 'has a Pi 3B'],
    generate,
  );
  expect(prose).toBe('Devin is an engineer by trade.');
  const [, , options] = generate.mock.calls[0]!;
  expect(options).toEqual({ temperature: 0.6 });
  const [, userMessages] = generate.mock.calls[0]!;
  const content = (userMessages as Message[])[0]!.content;
  expect(content).toContain('seems to prefer scrappy approaches');
});

test('generatePortrait: returns null when facts array is empty', async () => {
  const { generatePortrait } = await import('../../src/lib/dream.js');
  const generate = vi.fn();
  const prose = await generatePortrait('world_model', [], generate);
  expect(prose).toBeNull();
  expect(generate).not.toHaveBeenCalled();
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
  markConversationsDreamed: vi.fn(),
  upsertEntityFact: vi.fn(),
  getActiveFacts: vi.fn(),
  getActiveFactsByCategory: vi.fn(),
  supersedeEntityFact: vi.fn(),
  insertDreamArtifact: vi.fn(),
}));

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../src/lib/llm.js', () => ({
  generateResponse: vi.fn(),
}));

test('maybeDream: skips when no unprocessed conversations', async () => {
  vi.clearAllMocks();
  const db = await import('../../src/lib/db.js');
  (db.countUnprocessedConversations as any).mockResolvedValue(0);

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result).toEqual({ dreamed: false, reason: 'no-unprocessed' });
  expect(db.withTransaction).not.toHaveBeenCalled();
});

test('maybeDream: full happy path — decays, reflects, reinforces, extracts, persists 4 artifacts', async () => {
  vi.clearAllMocks();
  const db = await import('../../src/lib/db.js');
  const llm = await import('../../src/lib/llm.js');

  const mockClient = { query: vi.fn() };
  (db.withTransaction as any).mockImplementation(async (fn: any) => fn(mockClient));

  (db.countUnprocessedConversations as any)
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(2);

  const dreamRun = {
    id: 'dr-1', user_id: 'u1', started_at: new Date(), completed_at: null,
    conversations_processed: 0, facts_created: 0, facts_reinforced: 0,
    cap_hit: false, error: null,
  };
  (db.insertDreamRun as any).mockResolvedValue(dreamRun);

  (db.getUnprocessedConversations as any).mockResolvedValue([
    { id: 'c-1', user_id: 'u1', created_at: new Date(), emotional_intensity: null, prediction_error: null, last_dream_at: null },
    { id: 'c-2', user_id: 'u1', created_at: new Date(), emotional_intensity: null, prediction_error: null, last_dream_at: null },
  ]);

  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  (db.getAllEntityFacts as any).mockResolvedValue([
    { id: 'fact-existing', user_id: 'u1', content: 'seems analytical', category: 'user',
      salience: 0.8, superseded_at: null, created_at: tenDaysAgo, updated_at: tenDaysAgo, last_reinforced_at: tenDaysAgo },
  ]);

  (db.getActiveFacts as any).mockResolvedValue([
    { id: 'fact-existing', content: 'seems analytical', category: 'user', salience: 0.78 },
  ]);

  (db.getActiveFactsByCategory as any).mockResolvedValue([
    { content: 'seems analytical', category: 'user', salience: 0.78 },
  ]);

  (db.getMessagesForConversation as any).mockResolvedValue([
    { id: 'm1', conversation_id: 'c-1', user_id: 'u1', role: 'user', content: 'hi', created_at: new Date() },
  ]);

  (db.reinforceFact as any).mockResolvedValue(true);

  const artifactRow = { id: 'art-1', dream_run_id: 'dr-1', user_id: 'u1', type: 'residue', prose: 'p', embedding: null, created_at: new Date() };
  (db.insertDreamArtifact as any).mockResolvedValue(artifactRow);

  (llm.generateResponse as any)
    .mockResolvedValueOnce(JSON.stringify({
      new_hypotheses: [{ content: 'enjoys morning conversations', category: 'user' }],
      reinforced_ids: ['fact-existing'],
      superseded_old_ids: [],
      note: 'Warmer tone.',
    }))
    .mockResolvedValueOnce(JSON.stringify({
      new_hypotheses: [],
      reinforced_ids: ['fact-existing'],
      superseded_old_ids: [],
      note: 'Quieter.',
    }))
    .mockResolvedValue('generated prose');

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result.dreamed).toBe(true);
  if (result.dreamed) expect(result.capHit).toBe(false);

  expect(db.insertDreamArtifact).toHaveBeenCalled();
  expect(db.markConversationsDreamed).toHaveBeenCalledWith(['c-1', 'c-2'], mockClient);
});

test('maybeDream: sets cap_hit when unprocessed count exceeds cap', async () => {
  const db = await import('../../src/lib/db.js');
  const llm = await import('../../src/lib/llm.js');
  vi.clearAllMocks();

  const mockClient = { query: vi.fn() };
  (db.withTransaction as any).mockImplementation(async (fn: any) => fn(mockClient));
  (db.countUnprocessedConversations as any).mockResolvedValue(35);
  (db.insertDreamRun as any).mockResolvedValue({
    id: 'dr-2', user_id: 'u1', started_at: new Date(), completed_at: null,
    conversations_processed: 0, facts_created: 0, facts_reinforced: 0, cap_hit: false, error: null,
  });
  (db.getUnprocessedConversations as any).mockResolvedValue(
    Array.from({ length: 30 }, (_, i) => ({
      id: `c-${i}`, user_id: 'u1', created_at: new Date(),
      emotional_intensity: null, prediction_error: null, last_dream_at: null,
    })),
  );
  (db.getAllEntityFacts as any).mockResolvedValue([]);
  (db.getActiveFacts as any).mockResolvedValue([]);
  (db.getActiveFactsByCategory as any).mockResolvedValue([]);
  (db.getMessagesForConversation as any).mockResolvedValue([]);
  (db.insertDreamArtifact as any).mockResolvedValue({
    id: 'art-2', dream_run_id: 'dr-2', user_id: 'u1',
    type: 'residue', prose: 'p', embedding: null, created_at: new Date(),
  });

  // All 30 reflections return the same valid JSON; portrait + residue calls return prose.
  (llm.generateResponse as any).mockImplementation(async (_sys: string, _msgs: any, opts: any) => {
    if (opts?.temperature === 1.2 || opts?.temperature === 0.6) return 'p';
    return JSON.stringify({ new_hypotheses: [], reinforced_ids: [], superseded_old_ids: [], note: 'ok' });
  });

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result.dreamed).toBe(true);
  if (result.dreamed) expect(result.capHit).toBe(true);
  expect(db.finalizeDreamRun).toHaveBeenCalledWith(
    'dr-2',
    expect.objectContaining({ cap_hit: true, conversations_processed: 30 }),
    mockClient,
  );
});

test('maybeDream: malformed reflection drops that conversation but dream still completes', async () => {
  const db = await import('../../src/lib/db.js');
  const llm = await import('../../src/lib/llm.js');
  vi.clearAllMocks();

  const mockClient = { query: vi.fn() };
  (db.withTransaction as any).mockImplementation(async (fn: any) => fn(mockClient));
  (db.countUnprocessedConversations as any).mockResolvedValue(2);
  (db.insertDreamRun as any).mockResolvedValue({
    id: 'dr-3', user_id: 'u1', started_at: new Date(), completed_at: null,
    conversations_processed: 0, facts_created: 0, facts_reinforced: 0, cap_hit: false, error: null,
  });
  (db.getUnprocessedConversations as any).mockResolvedValue([
    { id: 'c-good', user_id: 'u1', created_at: new Date(), emotional_intensity: null, prediction_error: null, last_dream_at: null },
    { id: 'c-bad',  user_id: 'u1', created_at: new Date(), emotional_intensity: null, prediction_error: null, last_dream_at: null },
  ]);
  (db.getAllEntityFacts as any).mockResolvedValue([]);
  (db.getActiveFacts as any).mockResolvedValue([]);
  (db.getActiveFactsByCategory as any).mockResolvedValue([]);
  (db.getMessagesForConversation as any).mockResolvedValue([]);
  (db.insertDreamArtifact as any).mockResolvedValue({
    id: 'art-3', dream_run_id: 'dr-3', user_id: 'u1',
    type: 'residue', prose: 'p', embedding: null, created_at: new Date(),
  });

  (llm.generateResponse as any)
    .mockResolvedValueOnce(JSON.stringify({ new_hypotheses: [], reinforced_ids: [], superseded_old_ids: [], note: 'n' }))
    .mockResolvedValueOnce('totally not json')
    .mockResolvedValue('p');

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result.dreamed).toBe(true);
  // Both conversations still marked dreamed — malformed reflection does not block mark.
  expect(db.markConversationsDreamed).toHaveBeenCalledWith(['c-good', 'c-bad'], mockClient);
  // The malformed reflection is counted in the audit metadata.
  expect(db.finalizeDreamRun).toHaveBeenCalledWith(
    'dr-3',
    expect.objectContaining({ parse_failures: 1, conversations_processed: 2 }),
    mockClient,
  );
});

test('maybeDream: on pipeline error, records failure and returns non-dreamed outcome', async () => {
  const db = await import('../../src/lib/db.js');
  const llm = await import('../../src/lib/llm.js');
  vi.clearAllMocks();

  const mockClient = { query: vi.fn() };
  (db.withTransaction as any).mockImplementation(async (fn: any) => fn(mockClient));
  (db.countUnprocessedConversations as any).mockResolvedValue(1);
  (db.insertDreamRun as any)
    .mockResolvedValueOnce({
      id: 'dr-err', user_id: 'u1', started_at: new Date(), completed_at: null,
      conversations_processed: 0, facts_created: 0, facts_reinforced: 0, cap_hit: false, error: null,
    })
    // Second invocation is for the audit row outside the rolled-back transaction.
    .mockResolvedValueOnce({
      id: 'dr-audit', user_id: 'u1', started_at: new Date(), completed_at: null,
      conversations_processed: 0, facts_created: 0, facts_reinforced: 0, cap_hit: false, error: null,
    });
  (db.getUnprocessedConversations as any).mockResolvedValue([
    { id: 'c-x', user_id: 'u1', created_at: new Date(), emotional_intensity: null, prediction_error: null, last_dream_at: null },
  ]);
  (db.getAllEntityFacts as any).mockResolvedValue([]);
  (db.getActiveFacts as any).mockResolvedValue([]);
  (db.getMessagesForConversation as any).mockResolvedValue([]);
  // Reflection call fails twice (one retry per spec, then abort).
  (llm.generateResponse as any)
    .mockRejectedValueOnce(new Error('boom'))
    .mockRejectedValueOnce(new Error('boom-retry'));

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result).toEqual({ dreamed: false, reason: 'error' });
  // Audit row written outside the failed transaction: insertDreamRun called once
  // inside the tx (for dr-err, rolled back) and once outside (for the audit row).
  expect(db.insertDreamRun).toHaveBeenCalledTimes(2);
  expect(db.finalizeDreamRun).toHaveBeenCalledWith(
    'dr-audit',
    expect.objectContaining({ error: expect.stringContaining('boom') }),
  );
});
