# Memory Architecture: Semantic + Salience

**Date:** 2026-04-10
**Goal:** Combine semantic similarity with emotional/salience weighting across the Being's memory pipeline, in service of bridging the gap between what LLMs are today and what society judges as being a person.

---

## Context

The Being's existing dreaming phase ranks memories by emotional intensity (30%), recency (30%), prediction error (20%), and decay (20%). This produces salient memories, not relevant ones. The gap: a highly relevant but emotionally flat memory never surfaces; a meaningful but off-topic memory might crowd out what the moment actually calls for.

The solution is not to replace salience with semantic similarity, but to combine them across three pipeline stages at different fidelities.

---

## Design Goals

- **A (consistency of self):** stable personality, values, and voice across conversations
- **B (relational depth):** the Being genuinely knows users over time, remembers what matters
- **C (emotional reinforcement):** emotional state is the *signal* that drives A and B, not a goal in itself

Cross-user retrieval is in scope. The Being's own judgment acts as the privacy boundary — no hard isolation at the code level for now.

---

## Approach: Sequential Gate with Soft Penalty

Salience filters the candidate pool; semantic re-ranks within it. Rather than a hard top-N cut, memories below a salience threshold receive a score penalty (not elimination). A highly relevant but emotionally neutral memory can still surface — it needs stronger semantic signal to do so.

```
final_score = semantic_similarity × (salience > threshold ? 1.0 : 0.3)
```

This preserves the primacy of "what mattered" while avoiding the main failure mode of hard gating.

The long-term direction is **Approach C** (emergent integration): semantic divergence between expected and actual conversation becomes the emotional signal itself. This is bootstrapped naturally from the current design — see the Bootstrapping Path to C section below.

---

## Pipeline

### Dreaming (nightly, coarse)

Processes conversations in descending salience order. High-salience conversations receive more simulation rounds and produce richer output. Each conversation is processed atomically — a crash mid-cycle resumes from the last committed conversation the following night.

**Per-conversation loop:**

1. **Load** — retrieve all messages from this conversation plus the current entity model for this user
2. **Simulate** — LLM imagines how the relationship would continue: "If we talked again, what would this person likely bring up? How would they respond to X?" Produces synthetic conversation turns as training signal
3. **Refine entity model** — extract updated facts, beliefs, and emotional patterns; write to tiered tables:
   - `entity_facts` — permanent or very slow decay ("Alex is anxious about career growth")
   - `entity_episodes` — medium decay, compressed narrative of a specific conversation
   - `entity_traces` — fast decay, minimal marker that a conversation happened
4. **Store predictions** — embed the simulated responses as expected conversation vectors; write to `predictions` table; these prime the Being at waking and seed the prediction error signal
5. **SSM update** — if prior predictions exist, compute cosine distance between `predictions.expected_embedding` and `conversations.actual_embedding`; this surprise signal updates the hidden state and feeds back into the salience formula next cycle. On the first cycle, no error is computed — the prediction error weight (20%) is zeroed and redistributed.

### Waking (conversation start, medium)

1. Identify user → load their entity model (facts, episodes, traces) and most recent prediction
2. Semantic search across all tiers using soft salience gate:
   ```
   final_score = semantic_sim(query, memory) × (salience > threshold ? 1.0 : 0.3)
   ```
3. Fill context budget: entity facts first, then episodes, then traces
4. Inject stored prediction into system prompt to prime the Being ("I expect Alex to be anxious about his job today")

### Conversation (mid-session, fine-grained)

1. As topic shifts, re-rank already-loaded memories by semantic similarity — no new DB queries
2. Emotional intensity of the conversation accumulates in session state
3. At conversation end: mean-pool all message embeddings → store as `conversations.actual_embedding`; store accumulated emotional intensity; this feeds the next dream cycle

---

## Data Model

### New columns on existing tables

All embeddings use 768 dimensions, matching `text-embedding-004`. Switching models requires a migration.

```sql
ALTER TABLE messages ADD COLUMN embedding vector(768);
ALTER TABLE conversations ADD COLUMN emotional_intensity float;
ALTER TABLE conversations ADD COLUMN prediction_error float;
ALTER TABLE conversations ADD COLUMN actual_embedding vector(768);
ALTER TABLE conversations ADD COLUMN last_dream_at timestamptz;
```

### New tables

```sql
CREATE TABLE entity_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  content text NOT NULL,
  embedding vector(768),      -- embedded at write time for waking search
  salience float NOT NULL DEFAULT 1.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE entity_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  conversation_id uuid REFERENCES conversations(id),
  content text NOT NULL,
  embedding vector(768),      -- embedded at write time for waking search
  salience float NOT NULL,
  decay_factor float NOT NULL DEFAULT 0.95,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE entity_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  conversation_id uuid REFERENCES conversations(id),
  content text NOT NULL,
  embedding vector(768),      -- embedded at write time for waking search
  salience float NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  expected_embedding vector(768) NOT NULL,
  confidence float NOT NULL DEFAULT 1.0,
  created_at timestamptz DEFAULT now()
);
```

### Hidden state

The existing `HiddenState` string is upgraded to a vector when SSM goes real. The `facet` column starts with just `'core'` but allows expansion to named facets (e.g. `emotional_state`, `worldview`) without a breaking schema change:

```sql
CREATE TABLE hidden_state (
  being_id text NOT NULL,
  facet text NOT NULL DEFAULT 'core',
  state_vector vector(512),
  state_text text, -- retained during transition from mock
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (being_id, facet)
);
```

### Vector store

pgvector extension on the existing PostgreSQL instance — no separate vector DB needed at prototype scale.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX ON messages USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON entity_facts USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON entity_episodes USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON entity_traces USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON predictions USING ivfflat (expected_embedding vector_cosine_ops);
```

### Embedding model

`text-embedding-004` via the existing `@ai-sdk/google` integration (768-dim).

---

## Bootstrapping Path to C

The prediction error slot (currently 20% of salience, zeroed on first cycle) is the natural hook for Approach C to emerge:

```
Cycle 1:  dream → simulate → store predictions          (no error yet)
Cycle 2:  real convo → measure divergence → salience += surprise
Cycle 3:  dream uses richer salience → better simulations → better predictions
Cycle N:  prediction error becomes dominant signal; manual weights fade
```

No structural change is needed. C emerges from A as history accumulates.

---

## Hidden State

One global vector represents the Being's current disposition — what it has become through all its interactions. This is not the Being's memory (that lives in the entity model) or its expectations (that live in predictions). It is its *character* as it stands right now: a latent that biases interpretation and response.

Per-user nuance lives in the entity model, not the hidden state. If the single vector becomes too coarse, the upgrade path is a small fixed set of named facets, not per-user vectors.

---

## Error Handling

**Embedding failures** — messages missing embeddings are flagged. A background job re-embeds them before the next dream cycle. The dreaming phase skips a conversation if more than 10% of its messages lack embeddings, and logs a warning.

**Dream cycle crashes** — `last_dream_at` is written per conversation after each atomic commit. A crashed cycle resumes from unconsolidated conversations the following night.

**Missing predictions** — prediction error weight is zeroed and redistributed to other salience factors until predictions exist. No special casing in the scoring logic.

---

## Testing

- **Unit:** soft gate formula, salience scoring, entity tier assignment — pure functions
- **Integration:** dreaming loop with injected mock LLM — verify entity model updates and prediction storage shape
- **Multi-cycle:** two-cycle test — cycle 1 stores predictions, cycle 2 measures divergence — verifies prediction error accumulates correctly

Follows the existing vitest + dependency injection pattern in the codebase.
