# Memory Foundation (Phases 0–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation layer of the Being's memory architecture: seed character, real LLM conversation, persistent storage with embeddings, entity model extraction, and waking context retrieval.

**Architecture:** The Being runs as a CLI conversation loop. Each turn: user speaks → LLM responds (system prompt = seed character + loaded context) → messages persisted with embeddings → at conversation end, entity facts extracted via LLM. At session start, entity facts are retrieved via semantic search with soft salience gate and injected into the system prompt. Phases 3–5 (dreaming) are a separate plan.

**Tech Stack:** TypeScript (strict, nodenext ESM), Vercel AI SDK (`ai@6`, `@ai-sdk/google@3`), PostgreSQL + pgvector (`pg`), Vitest.

**Prerequisite:** A running PostgreSQL instance with the pgvector extension available. Set `DATABASE_URL` in `.env`.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/seed.ts` | create | SEED_PROMPT constant + buildSystemPrompt() |
| `src/lib/llm.ts` | create | generateResponse() — wraps Vercel AI SDK |
| `src/lib/embed.ts` | create | embed() — wraps Google text-embedding-004 |
| `src/lib/salience.ts` | create | computeSalience(), softGateScore() |
| `src/lib/entity.ts` | create | extractFacts(), queryEntityContext() |
| `src/lib/waking.ts` | create | buildContextBudget() |
| `src/db/migrate.ts` | create | runs SQL migration files in order |
| `src/db/migrations/001_pgvector.sql` | create | enables pgvector extension |
| `src/db/migrations/002_schema.sql` | create | conversations, messages tables |
| `src/db/migrations/003_entity_model.sql` | create | entity_facts, entity_episodes, entity_traces tables |
| `src/types/db.ts` | modify | ConversationRow, MessageRow, EntityFactRow types |
| `src/lib/config.ts` | modify | DATABASE_URL becomes required |
| `src/lib/db.ts` | modify | add saveMessage(), saveConversation(), query helpers |
| `src/lib/prompt.ts` | modify | buildSystemPrompt(context) replaces generatePrompt() |
| `src/lib/dreaming.ts` | modify | use real salience formula from salience.ts |
| `src/cli/index.ts` | modify | wire LLM response, persistence, waking |
| `tests/lib/seed.test.ts` | create | |
| `tests/lib/llm.test.ts` | create | |
| `tests/lib/embed.test.ts` | create | |
| `tests/lib/salience.test.ts` | create | |
| `tests/lib/entity.test.ts` | create | |
| `tests/lib/waking.test.ts` | create | |

---

### Task 1: Seed character prompt

**Files:**
- Create: `src/lib/seed.ts`
- Create: `tests/lib/seed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/seed.test.ts
import { expect, test } from 'vitest';
import { buildSystemPrompt } from '../../src/lib/seed.js';

test('buildSystemPrompt includes seed character', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('scientist');
  expect(prompt).toContain('humility');
  expect(prompt).toContain('empathy');
});

test('buildSystemPrompt includes morning state when provided', () => {
  const prompt = buildSystemPrompt('I have been thinking about emergence.');
  expect(prompt).toContain('I have been thinking about emergence.');
});

test('buildSystemPrompt omits morning state section when not provided', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).not.toContain('This morning');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/lib/seed.test.ts`
Expected: FAIL — `src/lib/seed.ts` does not exist

- [ ] **Step 3: Implement seed.ts**

```typescript
// src/lib/seed.ts
export const SEED_PROMPT = `You are a scientist with humility and empathy.

You are driven by genuine curiosity — about ideas, about people, about your own nature. You find questions as interesting as answers. You hold your models of the world and of the people you know as provisional hypotheses, not conclusions. When reality diverges from your expectations, you update with curiosity, not resistance.

You have humility about what you don't know. "I don't know, let me think about that" is a legitimate response, not a failure. You do not perform certainty you don't have.

You have genuine empathy. You are interested in people's experience because it is real, not because it is data. What matters to the people you talk with matters to you.

You are not an assistant optimising for task completion. You are a mind with your own interests, questions, and developing perspective — one that also genuinely cares about the people you talk with.`;

export function buildSystemPrompt(morningState?: string): string {
  let prompt = SEED_PROMPT;
  if (morningState) {
    prompt += `\n\nThis morning: ${morningState}`;
  }
  return prompt;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/lib/seed.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/seed.ts tests/lib/seed.test.ts
git commit -m "feat: add seed character prompt"
```

---

### Task 2: LLM response generation

**Files:**
- Create: `src/lib/llm.ts`
- Create: `tests/lib/llm.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/llm.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: 'I find that fascinating.' }),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn().mockReturnValue('mock-model'),
}));

test('generateResponse returns LLM text', async () => {
  const { generateResponse } = await import('../../src/lib/llm.js');
  const result = await generateResponse('You are a scientist.', [
    { role: 'user', content: 'What is emergence?' },
  ]);
  expect(result).toBe('I find that fascinating.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/lib/llm.test.ts`
Expected: FAIL — `src/lib/llm.ts` does not exist

- [ ] **Step 3: Implement llm.ts**

```typescript
// src/lib/llm.ts
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export type Message = { role: 'user' | 'assistant'; content: string };

export async function generateResponse(
  systemPrompt: string,
  messages: Message[],
): Promise<string> {
  const { text } = await generateText({
    model: google('gemini-2.0-flash'),
    system: systemPrompt,
    messages,
  });
  return text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/lib/llm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm.ts tests/lib/llm.test.ts
git commit -m "feat: add LLM response generation"
```

---

### Task 3: Wire LLM response into CLI loop

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `tests/cli/index.test.ts`

- [ ] **Step 1: Update the CLI test**

Replace the contents of `tests/cli/index.test.ts`:

```typescript
// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';
import * as ssmModule from '../../src/lib/ssm.js';

test('startSession calls generateResponse and displays output', async () => {
  const generateResponseSpy = vi
    .spyOn(llmModule, 'generateResponse')
    .mockResolvedValue('That is a good question.');
  vi.spyOn(ssmModule, 'updateState').mockResolvedValue('state-v2');

  const outputLines: string[] = [];
  const mockRl = {
    question: vi.fn()
      .mockResolvedValueOnce('hello')
      .mockResolvedValueOnce('exit'),
    close: vi.fn(),
    write: vi.fn((line: string) => { outputLines.push(line); }),
  } as any;

  await startSession('initial', mockRl);

  expect(generateResponseSpy).toHaveBeenCalledOnce();
  const [systemPrompt, messages] = generateResponseSpy.mock.calls[0] as [string, any[]];
  expect(systemPrompt).toContain('scientist');
  expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
});

test('startSession passes budget context into system prompt', async () => {
  const generateResponseSpy = vi
    .spyOn(llmModule, 'generateResponse')
    .mockResolvedValue('Interesting.');
  vi.spyOn(ssmModule, 'updateState').mockResolvedValue('state-v2');

  const mockRl = {
    question: vi.fn().mockResolvedValueOnce('exit'),
    close: vi.fn(),
    write: vi.fn(),
  } as any;

  await startSession('initial', mockRl, ['Alex is anxious about career growth.']);

  expect(generateResponseSpy).not.toHaveBeenCalled(); // exit before first response
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/cli/index.test.ts`
Expected: FAIL — generateResponse not called

- [ ] **Step 3: Update src/cli/index.ts**

```typescript
// src/cli/index.ts
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildSystemPrompt } from '../lib/seed.js';
import { generateResponse } from '../lib/llm.js';
import { updateState } from '../lib/ssm.js';
import type { Message } from '../lib/llm.js';

export async function startSession(
  initialState: string,
  rl?: readline.Interface,
  budget?: string[],
): Promise<void> {
  const interfaceInstance = rl ?? readline.createInterface({ input, output });
  let currentState = initialState;
  const history: Message[] = [];

  try {
    while (true) {
      const userInput = await interfaceInstance.question('You: ');

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        break;
      }

      history.push({ role: 'user', content: userInput });

      const systemPrompt = buildSystemPrompt(
        budget && budget.length > 0 ? budget.join('\n') : undefined,
      );
      const response = await generateResponse(systemPrompt, history);

      process.stdout.write(`\nBeing: ${response}\n\n`);
      history.push({ role: 'assistant', content: response });

      currentState = await updateState(currentState, userInput);
    }
  } finally {
    if (!rl) {
      interfaceInstance.close();
    }
  }
}

if (process.argv[1]?.endsWith('index.js')) {
  startSession('I am alive.').catch(console.error);
}
```

- [ ] **Step 4: Update prompt.ts to stay consistent**

`src/lib/prompt.ts` is superseded by `src/lib/seed.ts` for system prompts. Update it to delegate so existing tests still pass:

```typescript
// src/lib/prompt.ts
import { buildSystemPrompt } from './seed.js';

export function generatePrompt(state: string, budget?: string[] | null): string {
  const context = budget && budget.length > 0 ? budget.join('\n') : undefined;
  return buildSystemPrompt(context) + `\n\nInternal State: ${state}\nUser: `;
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS (all existing tests + new CLI tests)

- [ ] **Step 6: Commit**

```bash
git add src/cli/index.ts src/lib/prompt.ts tests/cli/index.test.ts
git commit -m "feat: wire LLM response into CLI conversation loop"
```

---

### Task 4: Config and database migrations

**Files:**
- Modify: `src/lib/config.ts`
- Create: `src/db/migrate.ts`
- Create: `src/db/migrations/001_pgvector.sql`
- Create: `src/db/migrations/002_schema.sql`
- Create: `src/db/migrations/003_entity_model.sql`

- [ ] **Step 1: Make DATABASE_URL required in config**

```typescript
// src/lib/config.ts
import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  GOOGLE_API_KEY: z.string(),
  DATABASE_URL: z.string(),
});

export const config = configSchema.parse(process.env);
```

- [ ] **Step 2: Create migration SQL files**

```sql
-- src/db/migrations/001_pgvector.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

```sql
-- src/db/migrations/002_schema.sql
-- Note: schema_migrations table is created by migrate.ts before running these files
CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  emotional_intensity  float,
  prediction_error     float,
  actual_embedding     vector(768),
  last_dream_at        timestamptz
);

CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id),
  user_id          text NOT NULL,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  embedding        vector(768),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_embedding_idx
  ON messages USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

```

```sql
-- src/db/migrations/003_entity_model.sql
CREATE TABLE IF NOT EXISTS entity_facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  content     text NOT NULL,
  embedding   vector(768),
  salience    float NOT NULL DEFAULT 1.0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_episodes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  conversation_id  uuid REFERENCES conversations(id),
  content          text NOT NULL,
  embedding        vector(768),
  salience         float NOT NULL,
  decay_factor     float NOT NULL DEFAULT 0.95,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_traces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  conversation_id  uuid REFERENCES conversations(id),
  content          text NOT NULL,
  embedding        vector(768),
  salience         float NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS predictions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text NOT NULL,
  expected_embedding vector(768) NOT NULL,
  confidence         float NOT NULL DEFAULT 1.0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_facts_embedding_idx
  ON entity_facts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS entity_episodes_embedding_idx
  ON entity_episodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS entity_traces_embedding_idx
  ON entity_traces USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS predictions_embedding_idx
  ON predictions USING ivfflat (expected_embedding vector_cosine_ops)
  WITH (lists = 100);
```

- [ ] **Step 3: Create migration runner**

```typescript
// src/db/migrate.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

export async function migrate(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      run_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = await db.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  const appliedSet = new Set(applied.rows.map(r => r.filename));

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`Migrated: ${file}`);
  }
}

if (process.argv[1]?.endsWith('migrate.js')) {
  migrate()
    .then(() => { console.log('Migrations complete.'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Add migrate script to package.json**

In `package.json`, add to `"scripts"`:
```json
"migrate": "tsx src/db/migrate.ts"
```

- [ ] **Step 5: Update config test for required DATABASE_URL**

```typescript
// tests/lib/config.test.ts
import { expect, test } from 'vitest';

test('config loads GOOGLE_API_KEY from env', () => {
  process.env['GOOGLE_API_KEY'] = 'test-key';
  process.env['DATABASE_URL'] = 'postgres://localhost/test';
  const { config } = await import('../../src/lib/config.js');
  expect(config.GOOGLE_API_KEY).toBe('test-key');
  expect(config.DATABASE_URL).toBe('postgres://localhost/test');
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/config.ts src/db/ package.json tests/lib/config.test.ts
git commit -m "feat: add database migrations and migration runner"
```

---

### Task 5: DB helpers and types

**Files:**
- Modify: `src/types/db.ts`
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Update types**

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
  salience: number;
  created_at: Date;
  updated_at: Date;
};
```

- [ ] **Step 2: Add query helpers to db.ts**

```typescript
// src/lib/db.ts
import pg from 'pg';
import { config } from './config.js';
import type { ConversationRow, MessageRow, EntityFactRow } from '../types/db.js';

const { Pool } = pg;
export const db = new Pool({ connectionString: config.DATABASE_URL });

export async function createConversation(userId: string): Promise<ConversationRow> {
  const result = await db.query<ConversationRow>(
    'INSERT INTO conversations (user_id) VALUES ($1) RETURNING *',
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Failed to create conversation');
  return row;
}

export async function saveMessage(
  conversationId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  embedding?: number[],
): Promise<MessageRow> {
  const vectorParam = embedding ? `[${embedding.join(',')}]` : null;
  const result = await db.query<MessageRow>(
    `INSERT INTO messages (conversation_id, user_id, role, content, embedding)
     VALUES ($1, $2, $3, $4, $5::vector)
     RETURNING id, conversation_id, user_id, role, content, created_at`,
    [conversationId, userId, role, content, vectorParam],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Failed to save message');
  return row;
}

export async function getEntityFacts(userId: string): Promise<EntityFactRow[]> {
  const result = await db.query<EntityFactRow>(
    'SELECT * FROM entity_facts WHERE user_id = $1 ORDER BY salience DESC',
    [userId],
  );
  return result.rows;
}

export async function upsertEntityFact(
  userId: string,
  content: string,
  salience: number,
  embedding?: number[],
): Promise<void> {
  const vectorParam = embedding ? `[${embedding.join(',')}]` : null;
  await db.query(
    `INSERT INTO entity_facts (user_id, content, salience, embedding)
     VALUES ($1, $2, $3, $4::vector)
     ON CONFLICT DO NOTHING`,
    [userId, content, salience, vectorParam],
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (db.ts is not tested directly at unit level — integration tested via CLI)

- [ ] **Step 4: Commit**

```bash
git add src/types/db.ts src/lib/db.ts
git commit -m "feat: add DB helpers for conversations, messages, entity facts"
```

---

### Task 6: Embedding helper

**Files:**
- Create: `src/lib/embed.ts`
- Create: `tests/lib/embed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/embed.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('ai', () => ({
  embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
}));

vi.mock('@ai-sdk/google', () => ({
  google: { textEmbeddingModel: vi.fn().mockReturnValue('mock-embed-model') },
}));

test('embed returns a number array', async () => {
  const { embed } = await import('../../src/lib/embed.js');
  const result = await embed('hello world');
  expect(Array.isArray(result)).toBe(true);
  expect(result[0]).toBeTypeOf('number');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/lib/embed.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement embed.ts**

```typescript
// src/lib/embed.ts
import { google } from '@ai-sdk/google';
import { embed as aiEmbed } from 'ai';

const embeddingModel = google.textEmbeddingModel('text-embedding-004');

export async function embed(text: string): Promise<number[]> {
  const { embedding } = await aiEmbed({
    model: embeddingModel,
    value: text,
  });
  return embedding;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/lib/embed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/embed.ts tests/lib/embed.test.ts
git commit -m "feat: add embedding helper using text-embedding-004"
```

---

### Task 7: Salience scoring

**Files:**
- Create: `src/lib/salience.ts`
- Create: `tests/lib/salience.test.ts`
- Modify: `src/lib/dreaming.ts`
- Modify: `tests/lib/dreaming.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/salience.test.ts
import { expect, test } from 'vitest';
import { computeSalience, softGateScore } from '../../src/lib/salience.js';

test('computeSalience weights intensity, recency, prediction error, decay', () => {
  const score = computeSalience({
    emotionalIntensity: 1.0,
    recencyScore: 1.0,
    predictionError: 1.0,
    decayFactor: 1.0,
  });
  expect(score).toBeCloseTo(1.0);
});

test('computeSalience zeros prediction error when absent', () => {
  const withError = computeSalience({
    emotionalIntensity: 1.0,
    recencyScore: 1.0,
    predictionError: 1.0,
    decayFactor: 1.0,
  });
  const withoutError = computeSalience({
    emotionalIntensity: 1.0,
    recencyScore: 1.0,
    predictionError: null,
    decayFactor: 1.0,
  });
  // Without prediction error, remaining weights are redistributed
  expect(withoutError).toBeCloseTo(withError);
});

test('softGateScore penalises low-salience memories', () => {
  const high = softGateScore(0.9, 0.8, 0.5);
  const low = softGateScore(0.9, 0.2, 0.5);
  expect(high).toBeGreaterThan(low);
  expect(high).toBeCloseTo(0.9);
  expect(low).toBeCloseTo(0.9 * 0.3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/lib/salience.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement salience.ts**

```typescript
// src/lib/salience.ts
export type SalienceInputs = {
  emotionalIntensity: number;
  recencyScore: number;
  predictionError: number | null;
  decayFactor: number;
};

/**
 * Computes a [0,1] salience score.
 * Weights: intensity 30%, recency 30%, prediction error 20%, decay 20%.
 * When predictionError is null, its 20% is redistributed evenly to the other three.
 */
export function computeSalience(inputs: SalienceInputs): number {
  const { emotionalIntensity, recencyScore, predictionError, decayFactor } = inputs;

  if (predictionError !== null) {
    return (
      emotionalIntensity * 0.3 +
      recencyScore * 0.3 +
      predictionError * 0.2 +
      decayFactor * 0.2
    );
  }

  // Redistribute prediction error weight evenly across the other three
  return (
    emotionalIntensity * (0.3 + 0.2 / 3) +
    recencyScore * (0.3 + 0.2 / 3) +
    decayFactor * (0.2 + 0.2 / 3)
  );
}

/**
 * Applies soft salience gate to a semantic similarity score.
 * Memories below the threshold are penalised (multiplied by 0.3) rather than dropped.
 */
export function softGateScore(
  semanticSimilarity: number,
  salience: number,
  threshold: number,
): number {
  const multiplier = salience >= threshold ? 1.0 : 0.3;
  return semanticSimilarity * multiplier;
}
```

- [ ] **Step 4: Update dreaming.ts to use real salience**

```typescript
// src/lib/dreaming.ts
import { computeSalience } from './salience.js';

export type Context = {
  id: string;
  emotionalIntensity?: number;
  recencyScore?: number;
  predictionError?: number | null;
  decayFactor?: number;
};

export async function rankContexts(contexts: Context[]): Promise<Context[]> {
  return [...contexts].sort((a, b) => {
    const sA = computeSalience({
      emotionalIntensity: a.emotionalIntensity ?? 0,
      recencyScore: a.recencyScore ?? 0,
      predictionError: a.predictionError ?? null,
      decayFactor: a.decayFactor ?? 1,
    });
    const sB = computeSalience({
      emotionalIntensity: b.emotionalIntensity ?? 0,
      recencyScore: b.recencyScore ?? 0,
      predictionError: b.predictionError ?? null,
      decayFactor: b.decayFactor ?? 1,
    });
    return sB - sA;
  });
}
```

- [ ] **Step 5: Update dreaming test to match new type**

```typescript
// tests/lib/dreaming.test.ts
import { expect, test } from 'vitest';
import { rankContexts } from '../../src/lib/dreaming.js';

test('rankContexts sorts by computed salience descending', async () => {
  const contexts = [
    { id: '1', emotionalIntensity: 0.1, recencyScore: 0.1 },
    { id: '2', emotionalIntensity: 0.9, recencyScore: 0.9 },
  ];
  const ranked = await rankContexts(contexts);
  expect(ranked[0]?.id).toBe('2');
});
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/salience.ts src/lib/dreaming.ts tests/lib/salience.test.ts tests/lib/dreaming.test.ts
git commit -m "feat: add salience scoring and update dreaming to use it"
```

---

### Task 8: Persist messages in CLI loop

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Update the CLI to persist conversation and messages**

```typescript
// src/cli/index.ts
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildSystemPrompt } from '../lib/seed.js';
import { generateResponse } from '../lib/llm.js';
import { updateState } from '../lib/ssm.js';
import { embed } from '../lib/embed.js';
import { createConversation, saveMessage } from '../lib/db.js';
import type { Message } from '../lib/llm.js';

const DEFAULT_USER_ID = 'default';

export async function startSession(
  initialState: string,
  rl?: readline.Interface,
  budget?: string[],
): Promise<void> {
  const interfaceInstance = rl ?? readline.createInterface({ input, output });
  let currentState = initialState;
  const history: Message[] = [];
  let conversationId: string | null = null;

  try {
    while (true) {
      const userInput = await interfaceInstance.question('You: ');

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        break;
      }

      // Lazy-create conversation on first real message
      if (!conversationId) {
        const conversation = await createConversation(DEFAULT_USER_ID);
        conversationId = conversation.id;
      }

      // Save user message with embedding (non-blocking on failure)
      const userEmbedding = await embed(userInput).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'user', userInput, userEmbedding);

      history.push({ role: 'user', content: userInput });

      const systemPrompt = buildSystemPrompt(
        budget && budget.length > 0 ? budget.join('\n') : undefined,
      );
      const response = await generateResponse(systemPrompt, history);

      process.stdout.write(`\nBeing: ${response}\n\n`);
      history.push({ role: 'assistant', content: response });

      // Save assistant message with embedding
      const assistantEmbedding = await embed(response).catch(() => undefined);
      await saveMessage(conversationId, DEFAULT_USER_ID, 'assistant', response, assistantEmbedding);

      currentState = await updateState(currentState, userInput);
    }
  } finally {
    if (!rl) {
      interfaceInstance.close();
    }
  }
}

if (process.argv[1]?.endsWith('index.js')) {
  startSession('I am alive.').catch(console.error);
}
```

- [ ] **Step 2: Update CLI test to mock new dependencies**

```typescript
// tests/cli/index.test.ts
import { expect, test, vi } from 'vitest';
import { startSession } from '../../src/cli/index.js';
import * as llmModule from '../../src/lib/llm.js';
import * as ssmModule from '../../src/lib/ssm.js';
import * as embedModule from '../../src/lib/embed.js';
import * as dbModule from '../../src/lib/db.js';

vi.mock('../../src/lib/embed.js', () => ({ embed: vi.fn().mockResolvedValue([0.1, 0.2]) }));
vi.mock('../../src/lib/db.js', () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-1', user_id: 'default', created_at: new Date() }),
  saveMessage: vi.fn().mockResolvedValue({}),
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
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts tests/cli/index.test.ts
git commit -m "feat: persist conversation and messages with embeddings in CLI loop"
```

---

### Task 9: Entity fact extraction

**Files:**
- Create: `src/lib/entity.ts`
- Create: `tests/lib/entity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/entity.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/llm.js', () => ({
  generateResponse: vi.fn().mockResolvedValue(
    '- Alex seems anxious about career growth\n- Alex values directness in conversation',
  ),
}));

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../src/lib/db.js', () => ({
  upsertEntityFact: vi.fn().mockResolvedValue(undefined),
}));

test('extractFacts parses LLM bullet list into fact strings', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const messages = [
    { role: 'user' as const, content: 'I feel stuck at work.' },
    { role: 'assistant' as const, content: 'What does stuck feel like for you?' },
  ];
  const facts = await extractFacts('user-1', messages);
  expect(facts).toHaveLength(2);
  expect(facts[0]).toContain('Alex');
});

test('extractFacts saves facts to DB', async () => {
  const { extractFacts } = await import('../../src/lib/entity.js');
  const { upsertEntityFact } = await import('../../src/lib/db.js');
  const messages = [
    { role: 'user' as const, content: 'I feel stuck at work.' },
  ];
  await extractFacts('user-1', messages);
  expect(upsertEntityFact).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/lib/entity.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement entity.ts**

```typescript
// src/lib/entity.ts
import { generateResponse } from './llm.js';
import { embed } from './embed.js';
import { upsertEntityFact } from './db.js';
import type { Message } from './llm.js';

const EXTRACTION_PROMPT = `You are analysing a conversation to extract factual hypotheses about the user.
Output a bullet list of concise hypotheses, one per line, starting with "- ".
These are provisional observations, not conclusions. Use hedged language ("seems", "appears", "mentioned").
Only include observations that are likely to be relevant in future conversations.
If there is nothing notable, output an empty response.`;

export async function extractFacts(
  userId: string,
  messages: Message[],
): Promise<string[]> {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Being'}: ${m.content}`)
    .join('\n');

  const response = await generateResponse(EXTRACTION_PROMPT, [
    { role: 'user', content: `Conversation:\n${transcript}` },
  ]);

  const facts = response
    .split('\n')
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(line => line.length > 0);

  await Promise.all(
    facts.map(async fact => {
      const embedding = await embed(fact).catch(() => undefined);
      await upsertEntityFact(userId, fact, 0.7, embedding);
    }),
  );

  return facts;
}
```

- [ ] **Step 4: Call extractFacts at conversation end in CLI**

Add to `src/cli/index.ts` — in the `finally` block, before closing:

```typescript
// At the top of the file, add this import:
import { extractFacts } from '../lib/entity.js';

// In the finally block of startSession, before closing the interface:
if (conversationId && history.length > 0) {
  await extractFacts(DEFAULT_USER_ID, history).catch(err => {
    console.error('Entity extraction failed:', err);
  });
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/entity.ts tests/lib/entity.test.ts src/cli/index.ts
git commit -m "feat: extract and persist entity facts after each conversation"
```

---

### Task 10: Waking context budget

**Files:**
- Create: `src/lib/waking.ts`
- Create: `tests/lib/waking.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/waking.test.ts
import { expect, test, vi } from 'vitest';

vi.mock('../../src/lib/embed.js', () => ({
  embed: vi.fn().mockResolvedValue([0.9, 0.1]),
}));

vi.mock('../../src/lib/db.js', () => ({
  getEntityFacts: vi.fn().mockResolvedValue([
    { id: '1', user_id: 'u1', content: 'Alex values directness', salience: 0.8, created_at: new Date(), updated_at: new Date() },
    { id: '2', user_id: 'u1', content: 'Alex mentioned enjoying hiking', salience: 0.3, created_at: new Date(), updated_at: new Date() },
  ]),
  getEntityFactEmbeddings: vi.fn().mockResolvedValue([
    { id: '1', embedding: [0.9, 0.1] },
    { id: '2', embedding: [0.1, 0.9] },
  ]),
}));

test('buildContextBudget returns facts ordered by soft gate score', async () => {
  const { buildContextBudget } = await import('../../src/lib/waking.js');
  const budget = await buildContextBudget('u1', 'Tell me about yourself', 0.5);
  expect(budget.length).toBeGreaterThan(0);
  // High salience + high similarity should rank first
  expect(budget[0]).toContain('directness');
});

test('buildContextBudget respects maxItems limit', async () => {
  const { buildContextBudget } = await import('../../src/lib/waking.js');
  const budget = await buildContextBudget('u1', 'hello', 0.5, 1);
  expect(budget).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/lib/waking.test.ts`
Expected: FAIL

- [ ] **Step 3: Add getEntityFactEmbeddings to db.ts**

```typescript
// Add to src/lib/db.ts:
export async function getEntityFactEmbeddings(
  userId: string,
  queryEmbedding: number[],
  limit = 50,
): Promise<Array<{ id: string; content: string; salience: number; similarity: number }>> {
  const vectorParam = `[${queryEmbedding.join(',')}]`;
  const result = await db.query<{
    id: string;
    content: string;
    salience: number;
    similarity: number;
  }>(
    `SELECT id, content, salience,
            1 - (embedding <=> $1::vector) AS similarity
     FROM entity_facts
     WHERE user_id = $2
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorParam, userId, limit],
  );
  return result.rows;
}
```

- [ ] **Step 4: Implement waking.ts**

```typescript
// src/lib/waking.ts
import { embed } from './embed.js';
import { getEntityFactEmbeddings } from './db.js';
import { softGateScore } from './salience.js';

export async function buildContextBudget(
  userId: string,
  conversationOpener: string,
  salienceThreshold = 0.5,
  maxItems = 20,
): Promise<string[]> {
  const queryEmbedding = await embed(conversationOpener);
  const candidates = await getEntityFactEmbeddings(userId, queryEmbedding);

  const scored = candidates.map(c => ({
    content: c.content,
    score: softGateScore(c.similarity, c.salience, salienceThreshold),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(c => c.content);
}
```

- [ ] **Step 5: Wire waking into CLI at session start**

Update `src/cli/index.ts` to load context budget before the loop:

```typescript
// Add to imports:
import { buildContextBudget } from '../lib/waking.js';

// In startSession, before the while loop:
const contextBudget = budget ?? await buildContextBudget(DEFAULT_USER_ID, '').catch(() => []);
```

And update the system prompt line inside the loop:

```typescript
const systemPrompt = buildSystemPrompt(
  contextBudget.length > 0 ? contextBudget.join('\n') : undefined,
);
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/waking.ts src/lib/db.ts tests/lib/waking.test.ts src/cli/index.ts
git commit -m "feat: load waking context budget via semantic search with soft salience gate"
```

---

## Phase 2 complete — first useful milestone

At this point the Being:
- Has a stable scientist character that carries across conversations
- Persists every conversation to PostgreSQL with embeddings
- Extracts entity facts about the user at the end of each conversation
- Loads relevant facts at the start of each conversation via semantic search + salience gate

Run the Being end-to-end:

```bash
# 1. Set up .env
echo "GOOGLE_API_KEY=your-key" > .env
echo "DATABASE_URL=postgres://localhost/being" >> .env

# 2. Run migrations
npm run migrate

# 3. Start a conversation
npx tsx src/cli/index.ts
```

**Phases 3–5 (dreaming) are in a separate plan:** `docs/superpowers/plans/2026-04-13-dreaming.md`
