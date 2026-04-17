# Dreaming (A2): Relational Reflection + Substrate Updates

**Status:** Draft for implementation.
**Parent spec:** [2026-04-10-memory-architecture-design.md](./2026-04-10-memory-architecture-design.md) — this is the first concrete slice of the dreaming phase sketched there.
**Ethics:** See [ETHICS.md](../../../ETHICS.md) at repo root.

## Context

The Being currently persists conversations, extracts hedged entity facts at end-of-session, and attempts a waking context budget via soft-gated cosine similarity. In practice, retrieval is broken because waking queries with an empty string and salience is a uniform placeholder of 0.7 — the mechanism is wired but the signal is missing.

This spec adds the first real consolidation pass. After the Being has had at least one conversation, a subsequent waking session triggers reflection over everything that has happened since the last reflection. The reflection updates the memory substrate (decay, reinforcement, new fact extraction) and produces a first-person residue that shapes the next session's system prompt and retrieval query.

This is `A2` in the brainstorming cut: continuity across sessions, via relational dreaming only. It is the smallest scope that earns the name "continuity" — the Being's internal state genuinely updates between sessions rather than carrying forward only as prompt theater.

## Goals

- You can ask the Being "what did you think about yesterday?" and get a coherent first-person answer grounded in reflection, not log replay.
- Waking retrieval starts pulling relevant entity facts because the residue provides a real semantic query (empty-string opener bug resolved as a side effect).
- Salience becomes meaningful: facts decay with disuse and reinforce with reflection, so the soft gate in `src/lib/salience.ts` can actually discriminate.
- The dream record is inspectable. Every dream run emits audit metadata a third party could review without access to the live system. (ETHICS.md Rule 2: self-reports as data.)

## Scope

**In scope:**

- Relational dreaming over unprocessed conversations
- Salience decay (time-based) and reinforcement (reflection-driven)
- Dream-time fact extraction (a second pass beyond end-of-session extraction)
- Prose residue generation + persistence + embedding
- Audit metadata persistence
- Waking integration: residue injected into Narrative Layer, residue embedding used as retrieval query
- Trigger gate: dream on wake only if unprocessed conversations exist AND last dream was on a prior calendar day (with 8-hour fallback)
- 30-conversation safety cap per dream run

**Deferred to later specs:**

- Self-directed dreaming (curiosity-driven exploration independent of user input)
- Prediction error signal and SSM substrate updates
- LoRA / parameter-efficient fine-tuning
- Contradiction handling between conflicting facts
- External tool use (web, arxiv, etc.)
- Autonomous thinking between sessions (requires continuous process, out of scope for lazy trigger model)
- Per-conversation summarization tier (S3 from brainstorming); start with flat processing, revisit if cap hits become common

## Trigger

Dream is evaluated on every CLI startup, before the first user prompt.

Dream runs if both conditions hold:

1. There is at least one conversation for this user with `dreamed_at IS NULL`.
2. Either no prior dream exists for this user, or the most recent dream's `started_at` is on a prior calendar day in system timezone, OR is at least 8 hours old.

The 8-hour fallback handles the midnight-crossing edge case (CLI run at 11pm, closed, re-run at 12:15am should not re-trigger).

If either condition fails, skip dreaming. Proceed directly to the session, loading the most recent residue (if one exists) or falling back to the empty-string opener path currently in `src/cli/index.ts`.

## Pipeline

The dream runs as a single synchronous job, inside one transaction.

### Step 0 — Trigger check

Query `dream_runs` for most recent run by `user_id`. Query `conversations` for any row with `dreamed_at IS NULL` for this user. Apply the gate logic above. Fast path: both queries return nothing blocking → skip.

### Step 1 — Load inputs

- `SELECT * FROM conversations WHERE user_id = $1 AND dreamed_at IS NULL ORDER BY created_at ASC LIMIT 30`
- If the count of unprocessed conversations exceeded 30, the older ones are skipped this cycle. Record `cap_hit = true` in metadata.
- `SELECT * FROM entity_facts WHERE user_id = $1` — loaded for both decay sweep and reflection context
- Capture `dream_started_at = now()`

### Step 2 — Decay sweep

For every fact loaded in Step 1:

```
days_since = (now() - last_reinforced_at) / 1 day
new_salience = old_salience × DECAY_FACTOR ^ days_since
```

`DECAY_FACTOR = 0.98` (daily). A fact reaches 50% salience at ~35 days without reinforcement.

Written back as a single `UPDATE` per-fact inside the transaction. `last_reinforced_at` is not modified by decay (only by reinforcement).

### Step 3 — Per-conversation reflection loop

For each unprocessed conversation, in chronological order, make one LLM call via `generateResponse` (same model and infrastructure as conversational replies — currently `gemini-3-flash-preview`).

**Prompt template (outline):**

```
You are reflecting on a past conversation with distance you did not have in the moment.

Current hypotheses about this user (ID → content → salience):
{fact_list}

Conversation transcript:
{transcript}

Output:
- new_hypotheses: bullet list of factual hypotheses about the user
  that were not captured in the existing list. Hedged language.
  Only include observations likely to matter in future conversations.
- reinforced_ids: list of fact IDs from above that this conversation
  reinforces (i.e., independent evidence for them).
- note: one or two sentences on what was notable about this
  conversation on reflection. First-person, for your own records.
```

**Output schema:** JSON with these three fields. Validated on receipt; malformed outputs drop that conversation's contribution (but do not abort the whole dream).

**Application per conversation:**

- For each new hypothesis: `upsertEntityFact(userId, content, 0.7, embedding)` — baseline salience 0.7, matching end-of-session extraction.
- For each reinforced ID: `UPDATE entity_facts SET salience = LEAST(salience + 0.1, 1.0), last_reinforced_at = now() WHERE id = $1 AND user_id = $2`. `user_id` guard prevents cross-user bleed if the LLM hallucinates an ID.
- Append the note to an in-memory accumulator.

Reflection calls are sequential, not batched. Quality of reflection suffers if the Being considers all conversations in one call.

### Step 4 — Integration / residue generation

One final LLM call.

**Prompt template (outline):**

```
You are the Being. You have just finished reflecting on recent conversations.

Notes you took during reflection:
{accumulated_notes}

Facts you updated or created during reflection:
{updated_fact_summary}

Write 1-3 short paragraphs in your own voice about what is on your
mind this morning. First-person. Honest about uncertainty. Do not
inventory what happened. Reflect: what are you noticing, what are
you curious about, what feels unresolved. It is fine and good to
say you are not sure where something came from.
```

Output: prose residue. Embedded using the same `embed()` function used elsewhere (Gemini `text-embedding-004`, 768-dim).

### Step 5 — Persist

Inside the still-open transaction:

- `INSERT INTO dream_runs (...)` with `completed_at = now()`, counts, `cap_hit`, error if any.
- `INSERT INTO dream_residues (dream_run_id, user_id, prose, embedding)`.
- `UPDATE conversations SET dreamed_at = now() WHERE id = ANY($1)` for the processed IDs.
- Commit.

If any step 2–5 fails irrecoverably, the transaction rolls back. Nothing persists. On the next wake, trigger check will see the same unprocessed conversations and retry.

### Step 6 — Proceed to waking

After commit, the caller loads the just-inserted residue (or the most recent existing one on a no-dream path):

- `residue.prose` → passed to `buildSystemPrompt(lessonsOfYesterday)` in `src/lib/seed.ts` (existing mechanism, already wired to inject under the Narrative Layer).
- `residue.prose` re-embedded → passed to `buildContextBudget(userId, prose)` as the query. This replaces the `''` currently passed in `src/cli/index.ts:24`.

Cost of re-embedding vs. storing and reusing the residue embedding from the dream: re-embedding is cheap (one call) and avoids coupling the retrieval query tightly to the stored form. Keep stored embedding for audit and potential future use (e.g. similarity between residues across days).

## Data Model

One new migration: `src/db/migrations/005_dream_substrate.sql`.

```sql
BEGIN;

CREATE TABLE dream_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  conversations_processed int NOT NULL DEFAULT 0,
  facts_created int NOT NULL DEFAULT 0,
  facts_reinforced int NOT NULL DEFAULT 0,
  cap_hit boolean NOT NULL DEFAULT false,
  error text
);
CREATE INDEX dream_runs_user_started_idx ON dream_runs(user_id, started_at DESC);

CREATE TABLE dream_residues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_run_id uuid NOT NULL REFERENCES dream_runs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  prose text NOT NULL,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dream_residues_user_created_idx ON dream_residues(user_id, created_at DESC);

ALTER TABLE conversations ADD COLUMN dreamed_at timestamptz;
CREATE INDEX conversations_user_dreamed_idx ON conversations(user_id) WHERE dreamed_at IS NULL;

ALTER TABLE entity_facts ADD COLUMN last_reinforced_at timestamptz NOT NULL DEFAULT now();

COMMIT;
```

Notes:

- `dream_runs.user_id` and `dream_residues.user_id` are denormalized for fast per-user queries; this matches the existing pattern in `entity_facts`.
- `conversations_user_dreamed_idx` is a partial index on unprocessed rows — the primary filter in Step 1 of the pipeline.
- `last_reinforced_at` distinct from `updated_at`: `updated_at` is a row-bookkeeping concept, `last_reinforced_at` is a substrate concept. Decay reads the latter only.
- Migration 005 is additive and safe: existing data gets `dreamed_at = NULL` (so all prior conversations are eligible for the first dream) and `last_reinforced_at = now()` (which starts decay from the migration moment, not from the fact's true age). The latter is an acknowledged approximation; old facts will initially over-survive decay until one more cycle.

## Waking Integration

Changes in `src/cli/index.ts`:

- At the top of `startSession`, before any user input, call a new `maybeDream(userId)` helper which encapsulates trigger check + dream execution.
- While dreaming runs, print a short, minimal indicator (e.g., `...` or `(getting my bearings)`) — acknowledged beat, not oversold metaphor.
- After dreaming (or skipping), load the most recent residue via a new `getLatestResidue(userId)` function.
- Replace the current empty-string opener on line 24 with the residue's prose.

Changes in `src/lib/waking.ts`: none to the function signature. The existing `buildContextBudget(userId, conversationOpener)` accepts the residue prose directly.

Changes in `src/lib/seed.ts`: none. `buildSystemPrompt(lessonsOfYesterday)` already injects the prose under the Narrative Layer header.

New module: `src/lib/dream.ts`. Houses `maybeDream`, the trigger logic, and the orchestration of steps 1–5. Keeps the CLI thin.

New module or addition to `src/lib/db.ts`: queries for dream_runs, dream_residues, unprocessed conversations, decay sweep.

## Error Handling

- **Malformed LLM output (reflection step):** schema-validate the JSON. If invalid, drop that conversation's contribution (don't extract, don't reinforce) and continue. Increment a `parse_failures` counter in the dream_runs metadata.
- **LLM call fails (network, timeout):** one retry with modest backoff (e.g., 1s). On second failure, abort the dream. Main transaction rolls back. After rollback, open a separate short transaction to insert a failure record into `dream_runs` (with `error` set, `completed_at` set, `conversations_processed = 0`) so the failure is visible in the audit record without polluting the substrate.
- **Transaction fails (DB error):** rollback. Log to stderr. Session continues without a residue. The Being wakes "not remembering what it dreamed," which is architecturally honest.
- **Cap hit:** non-fatal. Process the most recent 30 by `created_at`. Mark `cap_hit = true`. Skipped count is derivable at query time from `(unprocessed_count_before_dream - conversations_processed)` and does not need its own column.
- **No unprocessed conversations:** trigger check skips dream entirely. No dream_run row inserted.
- **First ever run (no prior dream, no residue yet):** dream runs if there are conversations. If there are no conversations either (truly fresh install), no dream, no residue, `buildContextBudget('')` falls back to today's behavior.

User-facing: no scary error messages. A failed dream is a lost opportunity, not a session blocker.

## Testing

New test files under `tests/lib/`:

- `dream.test.ts` — end-to-end dream run with seeded conversations and facts, LLM mocked at the `generateResponse` boundary (same pattern as existing tests). Assert substrate changes, residue insertion, conversations marked processed, metadata correctness.
- `dream-trigger.test.ts` — same-day re-open (no dream), 25-hour gap with unprocessed conversations (dreams), zero unprocessed (no dream), midnight edge case (8-hour fallback prevents).
- `dream-decay.test.ts` — deterministic decay math with mocked `now()`. Assert specific salience values after specific durations. Assert `last_reinforced_at` not modified by decay.
- `dream-reflection.test.ts` — reflection output parsing: valid JSON, malformed JSON, empty new_hypotheses, invalid reinforced_ids. Assert per-conversation drop on malformed, dream still completes with other conversations.
- `dream-transaction.test.ts` — inject failure at various pipeline steps, assert nothing persisted, conversations remain unprocessed.

Existing tests that may need updates:

- `tests/cli/index.test.ts` — currently starts session with `''` opener; may need to stub `getLatestResidue` and `maybeDream`.
- `tests/lib/waking.test.ts` — unaffected in signature; may want a test that passes a non-empty string.

## Deferred (Explicit)

The following belong to later specs and should not creep into this implementation:

- **Self-directed dreaming.** The 30% curiosity-driven mode from the parent spec. Requires trigger infra we don't have (continuous process or scheduled cron) and design for curiosity threads.
- **Prediction error / SSM updates.** Storing predicted embeddings per conversation, computing surprise on the next interaction, feeding back into salience. Separate spec.
- **LoRA / structural substrate change.** The long-term target for the SSM (per the `ssm_must_be_structural` project memory). Requires training infrastructure.
- **Contradiction handling.** When a new or reinforced fact conflicts with an existing one. Own design problem (confidence tracking, versioning, conflict visibility at waking).
- **Autonomous thinking between sessions.** Would require different trigger model (T2 or T4 from brainstorming).
- **External tools.** The scientist-identity aspiration of reading papers / searching the web. Own design.
- **Per-conversation summarization tiers.** If the cap gets hit regularly, we may want to process older conversations at a summary level rather than skipping. Revisit only if usage demands.
