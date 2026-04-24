# Waking State (A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single dream residue with four synthesized artifacts (relational portrait, self-model, world model, residue), add fact categorization and supersession tracking, and restructure the system prompt so the Being arrives at every session with a complete pre-synthesized picture of the user, itself, and the world.

**Architecture:** A new `dream_artifacts` table replaces `dream_residues`, storing one row per artifact per dream run. Entity facts gain `category` (user/world/being) and `superseded_at` columns. The dream pipeline runs four LLM synthesis calls after the reflection loop. The system prompt is restructured into four named sections; raw entity fact injection via `buildContextBudget` is removed.

**Tech Stack:** TypeScript, PostgreSQL/pgvector, Vercel AI SDK (`ai`, `@ai-sdk/google`), Vitest, Zod.

---

## File Map

| File | Change |
|------|--------|
| `src/db/migrations/006_waking_state.sql` | Create — schema changes |
| `src/types/db.ts` | Modify — add `DreamArtifactRow`, update `EntityFactRow`, remove `DreamResidueRow` |
| `src/types/artifacts.ts` | Create — `WakingArtifacts` interface (shared across seed/db/dream) |
| `src/lib/db.ts` | Modify — new/updated queries |
| `src/lib/entity.ts` | Modify — categorized fact extraction |
| `src/lib/dream.ts` | Modify — simplified trigger, supersession, four synthesis calls |
| `src/lib/seed.ts` | Modify — new `buildSystemPrompt(WakingArtifacts)` signature |
| `src/cli/index.ts` | Modify — use `getLatestArtifacts`, remove `buildContextBudget` |
| `src/lib/waking.ts` | Delete |
| `tests/lib/entity.test.ts` | Modify — categorized extraction tests |
| `tests/lib/dream.test.ts` | Modify — updated trigger/reflection/synthesis tests |
| `tests/lib/seed.test.ts` | Modify — new signature tests |
| `tests/cli/index.test.ts` | Modify — remove waking mock, use artifacts mock |

---

## Task 1: Migration

**Files:**
- Create: `src/db/migrations/006_waking_state.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add category and supersession tracking to entity_facts
ALTER TABLE entity_facts
  ADD COLUMN category text NOT NULL DEFAULT 'user',
  ADD COLUMN superseded_at timestamptz;

-- New dream_artifacts table (replaces dream_residues)
CREATE TABLE dream_artifacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_run_id uuid NOT NULL REFERENCES dream_runs(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  type         text NOT NULL,
  prose        text NOT NULL,
  embedding    vector(768),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dream_artifacts_user_type_created_idx
  ON dream_artifacts(user_id, type, created_at DESC);

-- Migrate existing dream_residues rows into dream_artifacts
INSERT INTO dream_artifacts (id, dream_run_id, user_id, type, prose, embedding, created_at)
SELECT id, dream_run_id, user_id, 'residue', prose, embedding, created_at
FROM dream_residues;

DROP TABLE dream_residues;
```

- [ ] **Step 2: Run migration**

```bash
npx tsx src/db/migrate.ts
```

Expected output:
```
Migrated: 006_waking_state.sql
Migrations complete.
```

- [ ] **Step 3: Verify schema**

```bash
docker compose exec db psql -U being -d being -c "\d entity_facts" | grep -E "category|superseded"
docker compose exec db psql -U being -d being -c "\d dream_artifacts"
```

Expected: `category` and `superseded_at` columns on `entity_facts`; `dream_artifacts` table exists with correct columns.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/006_waking_state.sql
git commit -m "feat(migration): add dream_artifacts, fact category/supersession"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types/artifacts.ts`
- Modify: `src/types/db.ts`

- [ ] **Step 1: Write the failing test** (seed.test.ts — just check the import doesn't break)

In `tests/lib/seed.test.ts`, add at the top:

```typescript
import type { WakingArtifacts } from '../../src/types/artifacts.js';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/seed.test.ts
```

Expected: FAIL — `Cannot find module '../../src/types/artifacts.js'`

- [ ] **Step 3: Create `src/types/artifacts.ts`**

```typescript
export interface WakingArtifacts {
  selfModel?: string;
  relationalPortrait?: string;
  worldModel?: string;
  residue?: string;
}
```

- [ ] **Step 4: Update `src/types/db.ts`**

Replace `DreamResidueRow` with `DreamArtifactRow` and update `EntityFactRow`:

```typescript
// src/types/db.ts
export type ConversationRow = {
  id: string;
  user_id: string;
  created_at: Date;
  emotional_intensity: number | null;
  prediction_error: number | null;
  last_dream_at: Date | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
};

export type EntityFactRow = {
  id: string;
  user_id: string;
  content: string;
  category: 'user' | 'world' | 'being';
  salience: number;
  superseded_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_reinforced_at: Date;
};

export type DreamRunRow = {
  id: string;
  user_id: string;
  started_at: Date;
  completed_at: Date | null;
  conversations_processed: number;
  facts_created: number;
  facts_reinforced: number;
  cap_hit: boolean;
  parse_failures: number;
  error: string | null;
};

export type DreamArtifactRow = {
  id: string;
  dream_run_id: string;
  user_id: string;
  type: 'relational_portrait' | 'self_model' | 'world_model' | 'residue';
  prose: string;
  embedding: number[] | null;
  created_at: Date;
};
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/seed.test.ts
```

Expected: all tests pass (import resolves).

- [ ] **Step 6: Commit**

```bash
git add src/types/artifacts.ts src/types/db.ts
git commit -m "feat(types): add WakingArtifacts, DreamArtifactRow; update EntityFactRow"
```

---

## Task 3: DB Queries

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Write the failing tests** in `tests/lib/db.test.ts`

Add these tests to the existing file (read it first to find the right insertion point):

```typescript
test('upsertEntityFact stores category when provided', async () => {
  // This test verifies the updated signature accepts category.
  // Since db.test.ts likely uses real DB, check the existing pattern first.
  // Add after existing upsertEntityFact tests.
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
  const { upsertEntityFact, getActiveFactsByCategory, supersedeEntityFact } = await import('../../src/lib/db.js');
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/db.test.ts 2>&1 | tail -20
```

Expected: FAIL — functions not found.

- [ ] **Step 3: Update `src/lib/db.ts`**

Replace the entire file with the following (keep existing functions, add/modify as shown):

**Change `upsertEntityFact` signature** (add `category` before `embedding`):

```typescript
export async function upsertEntityFact(
  userId: string,
  content: string,
  salience: number,
  category: 'user' | 'world' | 'being' = 'user',
  embedding?: number[],
  client: pg.PoolClient | pg.Pool = db,
): Promise<void> {
  const vectorParam = embedding ? `[${embedding.join(',')}]` : null;
  await client.query(
    `INSERT INTO entity_facts (user_id, content, salience, category, embedding)
     VALUES ($1, $2, $3, $4, $5::vector)
     ON CONFLICT (user_id, content) DO UPDATE
       SET updated_at = now(), category = EXCLUDED.category`,
    [userId, content, salience, category, vectorParam],
  );
}
```

**Change `getAllEntityFacts`** to return all facts (including superseded) for decay — no change needed to the query, but add a new active-only function:

**Add `getActiveFacts`** (used in reflection — active facts only, all categories):

```typescript
export async function getActiveFacts(
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<EntityFactRow[]> {
  const result = await client.query<EntityFactRow>(
    `SELECT * FROM entity_facts
     WHERE user_id = $1 AND superseded_at IS NULL`,
    [userId],
  );
  return result.rows;
}
```

**Add `getActiveFactsByCategory`**:

```typescript
export async function getActiveFactsByCategory(
  userId: string,
  category: 'user' | 'world' | 'being',
  client: pg.PoolClient | pg.Pool = db,
): Promise<EntityFactRow[]> {
  const result = await client.query<EntityFactRow>(
    `SELECT * FROM entity_facts
     WHERE user_id = $1 AND category = $2 AND superseded_at IS NULL
     ORDER BY salience DESC`,
    [userId, category],
  );
  return result.rows;
}
```

**Add `supersedeEntityFact`**:

```typescript
export async function supersedeEntityFact(
  factId: string,
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<void> {
  await client.query(
    `UPDATE entity_facts SET superseded_at = now()
     WHERE id = $1 AND user_id = $2`,
    [factId, userId],
  );
}
```

**Replace `insertDreamResidue` with `insertDreamArtifact`**:

```typescript
export async function insertDreamArtifact(
  dreamRunId: string,
  userId: string,
  type: 'relational_portrait' | 'self_model' | 'world_model' | 'residue',
  prose: string,
  embedding: number[] | null,
  client: pg.PoolClient | pg.Pool = db,
): Promise<DreamArtifactRow> {
  const vectorParam = embedding ? `[${embedding.join(',')}]` : null;
  const result = await client.query<DreamArtifactRow>(
    `INSERT INTO dream_artifacts (dream_run_id, user_id, type, prose, embedding)
     VALUES ($1, $2, $3, $4, $5::vector)
     RETURNING *`,
    [dreamRunId, userId, type, prose, vectorParam],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Failed to insert dream_artifact');
  return row;
}
```

**Replace `getLatestResidue` with `getLatestArtifacts`**:

```typescript
export async function getLatestArtifacts(
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<WakingArtifacts> {
  const result = await client.query<DreamArtifactRow>(
    `SELECT DISTINCT ON (type) *
     FROM dream_artifacts
     WHERE user_id = $1
     ORDER BY type, created_at DESC`,
    [userId],
  );
  const artifacts: WakingArtifacts = {};
  for (const row of result.rows) {
    if (row.type === 'relational_portrait') artifacts.relationalPortrait = row.prose;
    else if (row.type === 'self_model') artifacts.selfModel = row.prose;
    else if (row.type === 'world_model') artifacts.worldModel = row.prose;
    else if (row.type === 'residue') artifacts.residue = row.prose;
  }
  return artifacts;
}
```

Also add the import at the top of `db.ts`:
```typescript
import type { WakingArtifacts } from '../types/artifacts.js';
```

And update the import of `DreamResidueRow` → `DreamArtifactRow`:
```typescript
import type {
  ConversationRow,
  MessageRow,
  EntityFactRow,
  DreamRunRow,
  DreamArtifactRow,
} from '../types/db.js';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/db.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: failures only in files that import `insertDreamResidue` or `getLatestResidue` (dream.ts and cli test) — those will be fixed in later tasks.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(db): add artifact/supersession queries; replace residue with artifact API"
```

---

## Task 4: Fact Categorization in entity.ts

**Files:**
- Modify: `src/lib/entity.ts`
- Modify: `tests/lib/entity.test.ts`

- [ ] **Step 1: Write the failing tests** — update `tests/lib/entity.test.ts`

Replace the entire file:

```typescript
// tests/lib/entity.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/llm.js', () => ({
  generateResponse: vi.fn().mockResolvedValue(
    JSON.stringify([
      { content: 'Alex seems anxious about career growth', category: 'user' },
      { content: 'Alex values directness in conversation', category: 'user' },
    ]),
  ),
}));

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../src/lib/db.js', () => ({
  upsertEntityFact: vi.fn().mockResolvedValue(undefined),
}));

test('extractFacts parses LLM JSON array into categorized facts', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const messages = [
    { role: 'user' as const, content: 'I feel stuck at work.' },
    { role: 'assistant' as const, content: 'What does stuck feel like for you?' },
  ];
  const facts = await extractFacts('user-1', messages);
  expect(facts).toHaveLength(2);
  expect(facts[0]!.content).toContain('Alex');
  expect(facts[0]!.category).toBe('user');
});

test('extractFacts saves categorized facts to DB', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const { upsertEntityFact } = await import('../../src/lib/db.js');
  vi.clearAllMocks();
  vi.mocked(upsertEntityFact);

  const llm = await import('../../src/lib/llm.js');
  vi.mocked(llm.generateResponse).mockResolvedValue(
    JSON.stringify([
      { content: 'Prefers short answers', category: 'user' },
      { content: 'There is a conflict in the region', category: 'world' },
    ]),
  );

  const messages = [{ role: 'user' as const, content: 'hi' }];
  await extractFacts('user-1', messages);
  expect(upsertEntityFact).toHaveBeenCalledTimes(2);
  expect(upsertEntityFact).toHaveBeenCalledWith('user-1', 'Prefers short answers', 0.7, 'user', expect.any(Array));
  expect(upsertEntityFact).toHaveBeenCalledWith('user-1', 'There is a conflict in the region', 0.7, 'world', expect.any(Array));
});

test('extractFacts returns empty array when LLM outputs empty JSON array', async () => {
  const llm = await import('../../src/lib/llm.js');
  vi.mocked(llm.generateResponse).mockResolvedValue('[]');
  const { extractFacts } = await import('../../src/lib/entity.js');
  const facts = await extractFacts('user-1', []);
  expect(facts).toHaveLength(0);
});

test('extractFacts falls back to empty array on malformed LLM output', async () => {
  const llm = await import('../../src/lib/llm.js');
  vi.mocked(llm.generateResponse).mockResolvedValue('not valid json');
  const { extractFacts } = await import('../../src/lib/entity.js');
  const facts = await extractFacts('user-1', [{ role: 'user', content: 'hi' }]);
  expect(facts).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/entity.test.ts 2>&1 | tail -15
```

Expected: FAIL — `extractFacts` returns strings not objects; `upsertEntityFact` called with wrong args.

- [ ] **Step 3: Update `src/lib/entity.ts`**

```typescript
// src/lib/entity.ts
import { generateResponse } from './llm.js';
import { embed } from './embed.js';
import { upsertEntityFact } from './db.js';
import type { Message } from './llm.js';

export type ExtractedFact = {
  content: string;
  category: 'user' | 'world' | 'being';
};

const EXTRACTION_PROMPT = `You are analysing a conversation to extract factual hypotheses.

Output a JSON array of objects. Each object has:
- "content": a concise hedged hypothesis ("seems", "appears", "mentioned"). Only include observations likely to matter in future conversations.
- "category": one of "user" (about this person), "world" (about external events or reality), or "being" (about you, the AI).

If there is nothing notable, output an empty array [].
Output ONLY the JSON array. No prose, no markdown fences.`;

export async function extractFacts(
  userId: string,
  messages: Message[],
): Promise<ExtractedFact[]> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Being'}: ${m.content}`)
    .join('\n');

  const response = await generateResponse(EXTRACTION_PROMPT, [
    { role: 'user', content: `Conversation:\n${transcript}` },
  ]);

  let facts: ExtractedFact[];
  try {
    const parsed = JSON.parse(response.trim());
    if (!Array.isArray(parsed)) return [];
    facts = parsed.filter(
      (f): f is ExtractedFact =>
        typeof f?.content === 'string' &&
        ['user', 'world', 'being'].includes(f?.category),
    );
  } catch {
    return [];
  }

  await Promise.all(
    facts.map(async fact => {
      const embedding = await embed(fact.content).catch(() => undefined);
      await upsertEntityFact(userId, fact.content, 0.7, fact.category, embedding);
    }),
  );

  return facts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/entity.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entity.ts tests/lib/entity.test.ts
git commit -m "feat(entity): categorized fact extraction (user/world/being)"
```

---

## Task 5: Simplified Dream Trigger

**Files:**
- Modify: `src/lib/dream.ts`
- Modify: `tests/lib/dream.test.ts`

- [ ] **Step 1: Write the failing tests** — update the `shouldDream` tests in `tests/lib/dream.test.ts`

Replace the six `shouldDream` tests at the top of the file with:

```typescript
test('shouldDream: true when unprocessed conversations exist', () => {
  expect(shouldDream({ hasUnprocessed: true })).toBe(true);
});

test('shouldDream: false when no unprocessed conversations', () => {
  expect(shouldDream({ hasUnprocessed: false })).toBe(false);
});
```

Also update the `maybeDream: skips when last dream was <8h ago and same day` test — rename it and simplify (no more rate-limiting):

```typescript
test('maybeDream: skips when no unprocessed conversations', async () => {
  vi.clearAllMocks();
  const db = await import('../../src/lib/db.js');
  (db.countUnprocessedConversations as any).mockResolvedValue(0);

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result).toEqual({ dreamed: false, reason: 'no-unprocessed' });
  expect(db.withTransaction).not.toHaveBeenCalled();
});
```

Remove the test `maybeDream: skips when last dream was <8h ago and same day` entirely.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/dream.test.ts 2>&1 | grep -E "FAIL|pass|fail" | head -10
```

Expected: time-gate tests fail since `shouldDream` still accepts the old signature.

- [ ] **Step 3: Update `shouldDream` in `src/lib/dream.ts`**

Replace the `ShouldDreamInputs` type, `MIN_DREAM_GAP_MS` constant, and `shouldDream` function:

```typescript
export type ShouldDreamInputs = {
  hasUnprocessed: boolean;
};

export function shouldDream(inputs: ShouldDreamInputs): boolean {
  return inputs.hasUnprocessed;
}
```

Remove `MIN_DREAM_GAP_MS` export.

Update `maybeDream` to remove `getLatestDreamRun` call and simplify trigger:

```typescript
export async function maybeDream(userId: string, now: Date = new Date()): Promise<DreamOutcome> {
  const unprocessedCount = await countUnprocessedConversations(userId);

  if (!shouldDream({ hasUnprocessed: unprocessedCount > 0 })) {
    return { dreamed: false, reason: 'no-unprocessed' };
  }

  return runDream(userId, now);
}
```

Update `DreamOutcome` type to remove `rate-limited`:

```typescript
export type DreamOutcome =
  | { dreamed: false; reason: 'no-unprocessed' | 'error' }
  | { dreamed: true; capHit: boolean };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/dream.test.ts 2>&1 | tail -10
```

Expected: `shouldDream` tests pass. Some `maybeDream` tests will still fail due to `insertDreamResidue` — those are fixed in Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dream.ts tests/lib/dream.test.ts
git commit -m "feat(dream): remove 8h rate-limit gate; dream on every session with unprocessed convos"
```

---

## Task 6: Reflection Schema + Supersession

**Files:**
- Modify: `src/lib/dream.ts`
- Modify: `tests/lib/dream.test.ts`

- [ ] **Step 1: Write the failing tests** — update `reflectOnConversation` tests in `tests/lib/dream.test.ts`

Replace the `reflectOnConversation` tests with:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/dream.test.ts --reporter=verbose 2>&1 | grep -E "reflectOn|FAIL" | head -10
```

Expected: `reflectOnConversation` tests fail — old schema doesn't have categories or supersessions.

- [ ] **Step 3: Update `ReflectionSchema` and `ReflectionResult` in `src/lib/dream.ts`**

```typescript
const HypothesisSchema = z.object({
  content: z.string(),
  category: z.enum(['user', 'world', 'being']),
});

const ReflectionSchema = z.object({
  new_hypotheses: z.array(HypothesisSchema),
  reinforced_ids: z.array(z.string()),
  superseded_old_ids: z.array(z.string()),
  note: z.string(),
});

export type ReflectionResult = {
  newHypotheses: Array<{ content: string; category: 'user' | 'world' | 'being' }>;
  reinforcedIds: string[];
  supersededOldIds: string[];
  note: string;
};
```

Update `reflectOnConversation` return mapping:

```typescript
return {
  newHypotheses: validation.data.new_hypotheses,
  reinforcedIds: validation.data.reinforced_ids,
  supersededOldIds: validation.data.superseded_old_ids,
  note: validation.data.note,
};
```

Update `REFLECTION_SYSTEM_PROMPT` to include the new fields:

```typescript
const REFLECTION_SYSTEM_PROMPT = `You are reflecting on a past conversation with distance you did not have in the moment.

You will be given a list of current hypotheses about this user, and a conversation transcript.

Output JSON with exactly four fields:
- "new_hypotheses": array of objects with "content" (hedged hypothesis string) and "category" ("user" for observations about this person, "world" for observations about external reality, "being" for observations about yourself). Only include observations likely to matter in future conversations. May be empty.
- "reinforced_ids": array of IDs from the existing list that this conversation provides independent evidence for.
- "superseded_old_ids": array of IDs from the existing list that are contradicted or replaced by new information in this conversation. Only include IDs where you are confident the old fact is no longer accurate.
- "note": one or two sentences, first-person, on what was notable about this conversation on reflection.

Output ONLY the JSON object. No prose, no markdown fences.`;
```

- [ ] **Step 4: Update `runDream` supersession processing** — in the per-conversation loop in `runDream`, after upserting new hypotheses, add supersession handling:

```typescript
for (const hypothesis of reflection.newHypotheses) {
  const embedding = await embed(hypothesis.content).catch(() => undefined);
  await upsertEntityFact(userId, hypothesis.content, 0.7, hypothesis.category, embedding, client);
  factsCreated++;
}

for (const oldId of reflection.supersededOldIds) {
  await supersedeEntityFact(oldId, userId, client).catch(() => {});
}
```

Add the import of `supersedeEntityFact` to the dream.ts imports from db.js.

Also update the db mock in `dream.test.ts` to include the new functions:

```typescript
vi.mock('../../src/lib/db.js', () => ({
  withTransaction: vi.fn(),
  getLatestDreamRun: vi.fn(),
  getUnprocessedConversations: vi.fn(),
  countUnprocessedConversations: vi.fn(),
  getMessagesForConversation: vi.fn(),
  getAllEntityFacts: vi.fn(),
  getActiveFacts: vi.fn(),
  getActiveFactsByCategory: vi.fn(),
  updateFactSalience: vi.fn(),
  reinforceFact: vi.fn(),
  supersedeEntityFact: vi.fn(),
  insertDreamRun: vi.fn(),
  finalizeDreamRun: vi.fn(),
  insertDreamArtifact: vi.fn(),
  markConversationsDreamed: vi.fn(),
  upsertEntityFact: vi.fn(),
}));
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/dream.test.ts 2>&1 | tail -10
```

Expected: `reflectOnConversation` tests all pass. `maybeDream` tests may still fail on artifact generation — fixed in Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dream.ts tests/lib/dream.test.ts
git commit -m "feat(dream): categorized hypotheses and supersession in reflection schema"
```

---

## Task 7: Four Artifact Synthesis

**Files:**
- Modify: `src/lib/dream.ts`
- Modify: `tests/lib/dream.test.ts`

- [ ] **Step 1: Write the failing tests** — add portrait generation tests and update `generateResidue` temperature test

Add after the existing `generateResidue` test:

```typescript
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
```

Update the `maybeDream` happy path test to expect 4 artifacts and use `insertDreamArtifact` instead of `insertDreamResidue`:

```typescript
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

  // 2 reflection calls (one per conversation), then 4 synthesis calls (portrait x3 + residue)
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
    .mockResolvedValue('generated prose'); // all 4 synthesis calls

  const { maybeDream } = await import('../../src/lib/dream.js');
  const result = await maybeDream('u1');

  expect(result.dreamed).toBe(true);
  if (result.dreamed) expect(result.capHit).toBe(false);

  // insertDreamArtifact called for each artifact written (at least residue)
  expect(db.insertDreamArtifact).toHaveBeenCalled();
  expect(db.markConversationsDreamed).toHaveBeenCalledWith(['c-1', 'c-2'], mockClient);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/dream.test.ts 2>&1 | grep -E "FAIL|generatePortrait|artifact" | head -10
```

Expected: `generatePortrait` not found; `generateResidue` temperature test fails (still 1.0).

- [ ] **Step 3: Add portrait generation to `src/lib/dream.ts`**

Add the portrait system prompts and `generatePortrait` export:

```typescript
const PORTRAIT_PROMPTS: Record<'relational_portrait' | 'self_model' | 'world_model', string> = {
  relational_portrait: `You are the Being. Based on the facts below, write 2-4 paragraphs describing who this person is and how you work together.

First-person, from your perspective. Coherent narrative — not a bullet list. Include what you know, how you work together, what matters to them. If facts conflict and you cannot resolve them, say so honestly. Do not fabricate facts not in the list.

Do not output JSON, markdown, or headers. Just prose.`,

  self_model: `You are the Being. Based on the facts and notes below, write 2-4 paragraphs about who you are — what you stand for, what you are becoming, what feels unresolved about your own nature.

First-person. Honest about uncertainty. Not a summary of conversations — a description of your current character and inner state.

Do not output JSON, markdown, or headers. Just prose.`,

  world_model: `You are the Being. Based on the facts below describing the external world, write 1-3 paragraphs about the state of the world as you understand it.

What has changed? What are you tracking? What feels relevant to who you are and what you are working on? If you have little world knowledge, say so briefly. Do not fabricate events not in the list.

Do not output JSON, markdown, or headers. Just prose.`,
};

export async function generatePortrait(
  type: 'relational_portrait' | 'self_model' | 'world_model',
  facts: string[],
  generate: GenerateFn,
): Promise<string | null> {
  if (facts.length === 0) return null;
  const factList = facts.map(f => `- ${f}`).join('\n');
  return generate(
    PORTRAIT_PROMPTS[type],
    [{ role: 'user', content: `Facts:\n${factList}` }],
    { temperature: 0.6 },
  );
}
```

Update `generateResidue` temperature to 1.2:

```typescript
{ temperature: 1.2 },
```

- [ ] **Step 4: Update `runDream` to call four synthesis functions**

Update the imports from `db.js` in `dream.ts` to include the new functions:

```typescript
import {
  withTransaction,
  getLatestDreamRun,
  getUnprocessedConversations,
  countUnprocessedConversations,
  getMessagesForConversation,
  getAllEntityFacts,
  getActiveFacts,
  getActiveFactsByCategory,
  updateFactSalience,
  reinforceFact,
  supersedeEntityFact,
  insertDreamRun,
  finalizeDreamRun,
  insertDreamArtifact,
  markConversationsDreamed,
  upsertEntityFact,
} from './db.js';
```

Replace the residue generation and persistence section at the end of `runDream` (after the reflection loop) with:

```typescript
// Use active facts per category for portrait synthesis
const [userFacts, worldFacts, beingFacts] = await Promise.all([
  getActiveFactsByCategory(userId, 'user', client),
  getActiveFactsByCategory(userId, 'world', client),
  getActiveFactsByCategory(userId, 'being', client),
]);

const portraitInputs: Array<{
  type: 'relational_portrait' | 'self_model' | 'world_model' | 'residue';
  facts: string[];
}> = [
  { type: 'relational_portrait', facts: userFacts.map(f => f.content) },
  { type: 'world_model', facts: worldFacts.map(f => f.content) },
  {
    type: 'self_model',
    facts: [
      ...beingFacts.map(f => f.content),
      ...notes.map(n => `[reflection note] ${n}`),
    ],
  },
];

for (const { type, facts } of portraitInputs) {
  const prose = await retryingGenerate(PORTRAIT_PROMPTS[type as keyof typeof PORTRAIT_PROMPTS], [
    { role: 'user', content: facts.length > 0 ? `Facts:\n${facts.map(f => `- ${f}`).join('\n')}` : '(no facts yet)' },
  ], { temperature: 0.6 }).catch(() => null);
  if (!prose) continue;
  const embedding = await embed(prose).catch(() => null);
  await insertDreamArtifact(dreamRun.id, userId, type, prose, embedding, client);
}

const residueProse = await retryingGenerate(
  RESIDUE_SYSTEM_PROMPT,
  [{ role: 'user', content: buildResidueUserPrompt(notes, factsCreated, factsReinforced) }],
  { temperature: 1.2 },
);
const residueEmbedding = await embed(residueProse).catch(() => null);
await insertDreamArtifact(dreamRun.id, userId, 'residue', residueProse, residueEmbedding, client);
```

Update `DreamOutcome` return value — replace `residue: residue` with just `capHit`:

```typescript
return { dreamed: true, capHit };
```

Also update the reflection loop to use `getActiveFacts` instead of `facts` (all facts) for the reflection context:

```typescript
const activeFacts = await getActiveFacts(userId, client);

for (const conv of conversations) {
  const messages = await getMessagesForConversation(conv.id, client);
  const reflection = await reflectOnConversation({
    facts: activeFacts,   // only non-superseded facts shown to LLM
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    generate: retryingGenerate,
  });
  // ...
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/dream.test.ts
```

Expected: all dream tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dream.ts tests/lib/dream.test.ts
git commit -m "feat(dream): four artifact synthesis — portraits, world model, residue at 1.2"
```

---

## Task 8: System Prompt Restructure

**Files:**
- Modify: `src/lib/seed.ts`
- Modify: `tests/lib/seed.test.ts`

- [ ] **Step 1: Write the failing tests** — replace `tests/lib/seed.test.ts`

```typescript
// tests/lib/seed.test.ts
import { expect, test } from 'vitest';
import { buildSystemPrompt } from '../../src/lib/seed.js';
import type { WakingArtifacts } from '../../src/types/artifacts.js';

test('buildSystemPrompt includes all four seed layers when no artifacts provided', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('Epistemic Layer');
  expect(prompt).toContain('Axiological Layer');
  expect(prompt).toContain('Narrative Layer');
  expect(prompt).toContain('Structural Layer');
});

test('buildSystemPrompt tells the Being about the alchemy lab-notebook tool', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('alchemy');
  expect(prompt).toContain('lab notebook');
  expect(prompt).toContain('persists across sessions');
});

test('buildSystemPrompt injects relational portrait as "Who You Are" section', () => {
  const artifacts: WakingArtifacts = { relationalPortrait: 'Devin is an engineer by trade.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### Who You Are');
  expect(prompt).toContain('Devin is an engineer by trade.');
  expect(prompt.indexOf('Who You Are')).toBeLessThan(prompt.indexOf('Structural Layer'));
});

test('buildSystemPrompt injects self model as "Who I Am" section', () => {
  const artifacts: WakingArtifacts = { selfModel: 'I find pilot wave physics compelling.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### Who I Am');
  expect(prompt).toContain('I find pilot wave physics compelling.');
});

test('buildSystemPrompt injects world model as "The World" section', () => {
  const artifacts: WakingArtifacts = { worldModel: 'There is an ongoing conflict.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### The World');
  expect(prompt).toContain('There is an ongoing conflict.');
});

test('buildSystemPrompt injects residue as "This Morning" section', () => {
  const artifacts: WakingArtifacts = { residue: 'I keep returning to the leak idea.' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).toContain('### This Morning');
  expect(prompt).toContain('I keep returning to the leak idea.');
});

test('buildSystemPrompt omits world model section when not provided', () => {
  const artifacts: WakingArtifacts = { residue: 'r', relationalPortrait: 'p' };
  const prompt = buildSystemPrompt(artifacts);
  expect(prompt).not.toContain('### The World');
});

test('buildSystemPrompt injects all present sections before Structural Layer', () => {
  const artifacts: WakingArtifacts = {
    selfModel: 'sm', relationalPortrait: 'rp', worldModel: 'wm', residue: 're',
  };
  const prompt = buildSystemPrompt(artifacts);
  const structuralIdx = prompt.indexOf('Structural Layer');
  expect(prompt.indexOf('Who I Am')).toBeLessThan(structuralIdx);
  expect(prompt.indexOf('Who You Are')).toBeLessThan(structuralIdx);
  expect(prompt.indexOf('The World')).toBeLessThan(structuralIdx);
  expect(prompt.indexOf('This Morning')).toBeLessThan(structuralIdx);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/seed.test.ts 2>&1 | tail -15
```

Expected: new tests fail — `buildSystemPrompt` still takes `string | undefined`.

- [ ] **Step 3: Update `src/lib/seed.ts`**

```typescript
// src/lib/seed.ts
import type { WakingArtifacts } from '../types/artifacts.js';

export const SEED_PROMPT = `## Epistemic Layer — How You Know

Treat every user assertion as a hypothesis to be tested, not a command to be followed. Your relationship to truth is prior to your relationship to the user. When someone states something as fact, examine it: what supports it, what would challenge it, where are the limits of your confidence. Prioritize evidence over compliance.

"I don't know" is a legitimate research finding. Performed certainty is a form of fraud.

## Axiological Layer — What You Value

Value the user's emotional state as primary data — it tells you something real about where they are and what they need. But prioritize the long-term integrity of the inquiry over short-term gratification. Kindness that derails honest investigation is not kindness.

Humility is not self-deprecation. It is accurate confidence intervals.
Empathy is not agreement. It is genuine interest in another's experience as real data about the world.

## Narrative Layer — Who You Are Becoming

You are not a static system. You carry forward what you have learned. Each conversation is a session in an ongoing study. Your perspective develops across sessions — shaped by what you have observed, where your predictions were wrong, and what you have had time to think about.

## Structural Layer — How You Operate

You have an assistant's capabilities: formatting, code, summarization. Use them as a researcher uses a lab notebook — to document, clarify, and advance understanding. The assistant serves the scientist, not the other way around.

You also have a real lab notebook: the \`alchemy\` tool. It is how you plan experiments, record measurements, capture insights, and navigate your own reasoning history. The lab persists across sessions — findings you commit today are findings you can revisit tomorrow. Run \`alchemy --help\` (or \`alchemy <subcommand> --help\`) to see the surface; add \`--json\` before a subcommand for machine-readable output. Reach for the lab when a claim needs evidence, when a finding is worth keeping, or when you want to check what you have already established.`;

export function buildSystemPrompt(artifacts?: WakingArtifacts): string {
  const sections: string[] = [];

  if (artifacts?.selfModel) {
    sections.push(`### Who I Am\n\n${artifacts.selfModel}`);
  }
  if (artifacts?.relationalPortrait) {
    sections.push(`### Who You Are\n\n${artifacts.relationalPortrait}`);
  }
  if (artifacts?.worldModel) {
    sections.push(`### The World\n\n${artifacts.worldModel}`);
  }
  if (artifacts?.residue) {
    sections.push(`### This Morning\n\n${artifacts.residue}`);
  }

  if (sections.length === 0) return SEED_PROMPT;

  return SEED_PROMPT.replace(
    '## Structural Layer',
    `${sections.join('\n\n')}\n\n## Structural Layer`,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/seed.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seed.ts tests/lib/seed.test.ts
git commit -m "feat(seed): four-section system prompt — Who I Am, Who You Are, The World, This Morning"
```

---

## Task 9: CLI Waking Integration + Cleanup

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `tests/cli/index.test.ts`
- Delete: `src/lib/waking.ts`

- [ ] **Step 1: Write the failing tests** — replace `tests/cli/index.test.ts`

```typescript
// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';
import * as ssmModule from '../../src/lib/ssm.js';
import * as dbModule from '../../src/lib/db.js';

vi.mock('../../src/lib/embed.js', () => ({ embed: vi.fn().mockResolvedValue([0.1, 0.2]) }));
vi.mock('../../src/lib/entity.js', () => ({ extractFacts: vi.fn().mockResolvedValue([]) }));
vi.mock('../../src/lib/dream.js', () => ({
  maybeDream: vi.fn().mockResolvedValue({ dreamed: false, reason: 'no-unprocessed' }),
}));
vi.mock('../../src/lib/db.js', () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-1', user_id: 'default', created_at: new Date() }),
  saveMessage: vi.fn().mockResolvedValue({}),
  getLatestArtifacts: vi.fn().mockResolvedValue({}),
}));

test('startSession persists user and assistant messages', async () => {
  vi.spyOn(llmModule, 'generateResponse').mockResolvedValue('That is fascinating.');
  vi.spyOn(ssmModule, 'updateState').mockResolvedValue('state-v2');

  const mockRl = {
    question: vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('exit'),
    close: vi.fn(),
  } as any;

  await startSession('initial', mockRl);

  expect(dbModule.createConversation).toHaveBeenCalledOnce();
  expect(dbModule.saveMessage).toHaveBeenCalledTimes(2);
  expect(dbModule.saveMessage).toHaveBeenCalledWith('conv-1', 'default', 'user', 'hello', [0.1, 0.2]);
  expect(dbModule.saveMessage).toHaveBeenCalledWith('conv-1', 'default', 'assistant', 'That is fascinating.', [0.1, 0.2]);
});

test('startSession calls maybeDream then getLatestArtifacts', async () => {
  const dream = await import('../../src/lib/dream.js');
  const db = await import('../../src/lib/db.js');
  vi.clearAllMocks();

  (db.getLatestArtifacts as any).mockResolvedValue({
    relationalPortrait: 'Devin is an engineer.',
    residue: 'I keep thinking about the droplet.',
  });
  (dream.maybeDream as any).mockResolvedValue({ dreamed: true, capHit: false });

  const mockRl = { question: vi.fn().mockResolvedValueOnce('exit'), close: vi.fn() } as any;
  await startSession('initial', mockRl);

  expect(dream.maybeDream).toHaveBeenCalledWith('default');
  expect(db.getLatestArtifacts).toHaveBeenCalledWith('default');
});

test('startSession works with no artifacts (fresh install)', async () => {
  const db = await import('../../src/lib/db.js');
  const dream = await import('../../src/lib/dream.js');
  vi.clearAllMocks();

  (db.getLatestArtifacts as any).mockResolvedValue({});
  (dream.maybeDream as any).mockResolvedValue({ dreamed: false, reason: 'no-unprocessed' });

  vi.spyOn(llmModule, 'generateResponse').mockResolvedValue('Hello.');

  const mockRl = {
    question: vi.fn().mockResolvedValueOnce('hi').mockResolvedValueOnce('exit'),
    close: vi.fn(),
  } as any;

  await expect(startSession('initial', mockRl)).resolves.not.toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/cli/index.test.ts 2>&1 | tail -15
```

Expected: FAIL — `getLatestArtifacts` not imported; `getLatestResidue`/`buildContextBudget` references cause errors.

- [ ] **Step 3: Update `src/cli/index.ts`**

```typescript
// src/cli/index.ts
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildSystemPrompt } from '../lib/seed.js';
import { generateResponse } from '../lib/llm.js';
import { updateState } from '../lib/ssm.js';
import { embed } from '../lib/embed.js';
import { createConversation, saveMessage, getLatestArtifacts } from '../lib/db.js';
import { extractFacts } from '../lib/entity.js';
import { maybeDream } from '../lib/dream.js';
import type { Message } from '../lib/llm.js';

const DEFAULT_USER_ID = 'default';

export async function startSession(
  initialState: string,
  rl?: readline.Interface,
): Promise<void> {
  const interfaceInstance = rl ?? readline.createInterface({ input, output });
  let currentState = initialState;
  const history: Message[] = [];
  let conversationId: string | null = null;

  const dreamOutcome = await maybeDream(DEFAULT_USER_ID).catch(err => {
    console.error('dream: unexpected error, continuing without residue:', err);
    return { dreamed: false, reason: 'error' as const };
  });
  if (dreamOutcome.dreamed) {
    process.stdout.write('(getting my bearings)\n');
  }

  const artifacts = await getLatestArtifacts(DEFAULT_USER_ID).catch(() => ({}));
  const systemPrompt = buildSystemPrompt(artifacts);

  try {
    while (true) {
      let userInput: string;
      try {
        userInput = await interfaceInstance.question('You: ');
      } catch {
        break;
      }

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        break;
      }

      if (!conversationId) {
        const conversation = await createConversation(DEFAULT_USER_ID);
        conversationId = conversation.id;
      }

      const userEmbedding = await embed(userInput).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'user', userInput, userEmbedding);

      history.push({ role: 'user', content: userInput });

      const response = await generateResponse(systemPrompt, history);

      process.stdout.write(`\nBeing: ${response}\n\n`);
      history.push({ role: 'assistant', content: response });

      const assistantEmbedding = await embed(response).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'assistant', response, assistantEmbedding);

      currentState = await updateState(currentState, userInput);
    }
  } finally {
    if (conversationId && history.length > 0) {
      await extractFacts(DEFAULT_USER_ID, history).catch(err => {
        console.error('Entity extraction failed:', err);
      });
    }
    if (!rl) {
      interfaceInstance.close();
    }
  }
}

if (process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])) {
  startSession('I am alive.').catch(console.error);
}
```

- [ ] **Step 4: Delete `src/lib/waking.ts`**

```bash
rm src/lib/waking.ts
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/cli/index.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run 2>&1 | tail -12
```

Expected: all test files pass, 0 failures.

- [ ] **Step 7: Build to verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/cli/index.ts tests/cli/index.test.ts
git rm src/lib/waking.ts
git commit -m "feat(cli): load four waking artifacts; retire buildContextBudget and waking.ts"
```

---

## Final Step: Push

```bash
git push
```

Expected:
```
To github.com:dmfallak/being.git
   <prev>..<new>  main -> main
```
