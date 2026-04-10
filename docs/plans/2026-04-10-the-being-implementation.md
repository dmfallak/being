# The Being Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a persistent "Being" entity with a State-Space Memory (SSM) and a nightly "Dreaming" phase for memory consolidation.

**Architecture:** Use an LLM as the cortex and a persistent PostgreSQL database for message logs and SSM state. The SSM hidden state is injected into the prompt, and memory contexts are pre-loaded during the nightly sleep phase based on weighted relevance.

**Tech Stack:** Node.js, TypeScript, PostgreSQL (via `pg`), Vercel AI SDK (with Gemini Flash 3), Vitest.

---

### Task 1: Environment and Configuration

**Files:**
- Create: `src/lib/config.ts`
- Create: `.env` (updated from `.env.example`)
- Test: `tests/lib/config.test.ts`

**Step 1: Write failing test**
```typescript
import { expect, test } from 'vitest';
import { config } from '../../src/lib/config.js';

test('config should load from env', () => {
  expect(config.GOOGLE_API_KEY).toBeDefined();
});
```

**Step 2: Run test to verify it fails**
Run: `npm test tests/lib/config.test.ts`
Expected: FAIL (file doesn't exist)

**Step 3: Implement minimal code**
```typescript
import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  GOOGLE_API_KEY: z.string(),
  DATABASE_URL: z.string().optional(),
});

export const config = configSchema.parse(process.env);
```

**Step 4: Run test to verify it passes**
Run: `npm test tests/lib/config.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/lib/config.ts tests/lib/config.test.ts
git commit -m "feat: add config loader"
```

---

### Task 2: Database Schema and Migration

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/types/db.ts`
- Test: `tests/lib/db.test.ts`

**Step 1: Write failing test**
```typescript
import { expect, test } from 'vitest';
import { db } from '../../src/lib/db.js';

test('db should be able to query', async () => {
  const result = await db.query('SELECT 1');
  expect(result.rowCount).toBe(1);
});
```

**Step 2: Run test to verify it fails**
Run: `npm test tests/lib/db.test.ts`
Expected: FAIL (db not initialized)

**Step 3: Implement minimal code (using a simple pool or mock if DB not ready)**
```typescript
import pg from 'pg';
import { config } from './config.js';

export const db = new pg.Pool({
  connectionString: config.DATABASE_URL
});
```

**Step 4: Run test to verify it passes**
Run: `npm test tests/lib/db.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/lib/db.ts src/types/db.ts tests/lib/db.test.ts
git commit -m "feat: add database client"
```

---

### Task 3: The SSM State and Representation

**Files:**
- Create: `src/lib/ssm.ts`
- Create: `src/types/ssm.ts`
- Test: `tests/lib/ssm.test.ts`

**Step 1: Write failing test for state update**
```typescript
import { expect, test } from 'vitest';
import { updateState, getContextForUser } from '../../src/lib/ssm.js';

test('SSM should update hidden state from interaction', async () => {
  const newState = await updateState('old_state', 'user message');
  expect(newState).not.toBe('old_state');
});
```

**Step 2: Run test to verify it fails**
Run: `npm test tests/lib/ssm.test.ts`
Expected: FAIL

**Step 3: Implement minimal code (mock for now)**
```typescript
export async function updateState(oldState: string, input: string): Promise<string> {
  // Mock logic: combine strings or use a simple hash
  return `${oldState}-${input.slice(0, 10)}`;
}
```

**Step 4: Run test to verify it passes**
Run: `npm test tests/lib/ssm.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/lib/ssm.ts src/types/ssm.ts tests/lib/ssm.test.ts
git commit -m "feat: add SSM state logic"
```

---

### Task 4: The Dreaming Phase - Ranking Heuristic

**Files:**
- Create: `src/lib/dreaming.ts`
- Test: `tests/lib/dreaming.test.ts`

**Step 1: Write failing test for ranking**
```typescript
import { expect, test } from 'vitest';
import { rankContexts } from '../../src/lib/dreaming.js';

test('dreaming should rank contexts by emotional intensity', async () => {
  const contexts = [{ id: '1', intensity: 0.1 }, { id: '2', intensity: 0.9 }];
  const ranked = await rankContexts(contexts);
  expect(ranked[0].id).toBe('2');
});
```

**Step 2: Run test to verify it fails**
Run: `npm test tests/lib/dreaming.test.ts`
Expected: FAIL

**Step 3: Implement minimal code**
```typescript
export async function rankContexts(contexts: any[]) {
  return contexts.sort((a, b) => (b.intensity || 0) - (a.intensity || 0));
}
```

**Step 4: Run test to verify it passes**
Run: `npm test tests/lib/dreaming.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/lib/dreaming.ts tests/lib/dreaming.test.ts
git commit -m "feat: add dreaming ranking logic"
```

---

### Task 5: The Waking Phase - Session Loop with Budget

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/lib/prompt.ts`
- Test: `tests/cli/index.test.ts`

**Step 1: Write failing test for prompt generation**
```typescript
import { expect, test } from 'vitest';
import { generatePrompt } from '../../src/lib/prompt.js';

test('prompt should include being-state and budget', () => {
  const prompt = generatePrompt('I am calm', ['Memories: yesterday was good']);
  expect(prompt).toContain('I am calm');
  expect(prompt).toContain('yesterday was good');
});
```

**Step 2: Run test to verify it fails**
Run: `npm test tests/lib/prompt.test.ts`
Expected: FAIL

**Step 3: Implement minimal code**
```typescript
export function generatePrompt(state: string, budget: string[]) {
  return `Internal State: ${state}\nHistorical Context: ${budget.join('\n')}\nUser: `;
}
```

**Step 4: Run test to verify it passes**
Run: `npm test tests/lib/prompt.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/cli/index.ts src/lib/prompt.ts tests/lib/prompt.test.ts
git commit -m "feat: add waking phase prompt logic"
```
