# Waking State (A3): Four-Artifact Dream Output + Structured Context

**Status:** Draft for implementation.
**Parent spec:** [2026-04-16-dreaming-a2-design.md](./2026-04-16-dreaming-a2-design.md)
**Ethics:** See [ETHICS.md](../../../ETHICS.md) at repo root.

---

## Context

The A2 dream pipeline produces a single artifact (the residue) and injects raw entity facts into the system prompt via semantic search. Two problems:

1. **Identity context is query-dependent.** The Being retrieves facts about the user based on cosine similarity to the residue prose. A human doesn't remember their collaborator by querying their brain — they just know them when they arrive. The current approach is fragile and misses the point of relational memory.

2. **One artifact isn't enough.** The residue captures "what's on my mind this morning." But a grounded Being needs three other things at session start: who the user is, who it itself is, and what's happening in the world. These are distinct knowledge domains with different sources, different stability, and different purposes.

This spec adds three new dream artifacts, restructures the system prompt, retires raw fact injection, and introduces fact categorization and contradiction tracking.

---

## Goals

- The Being arrives at every session with a complete, pre-synthesized picture of the user, itself, and the world — not retrieved on demand.
- Facts are categorized at extraction time (user / world / being), enabling each artifact to draw from the right pool.
- Contradictory facts are detected during dreaming and resolved where possible; unresolvable contradictions surface as honest uncertainty in the relevant artifact.
- The residue remains creative and associative (temperature 1.2), oriented toward curiosity rather than accuracy.
- The three portrait artifacts are grounded and accurate (temperature 0.6).
- Raw entity fact injection into the system prompt is retired; the relational portrait subsumes it.

---

## Four Artifacts

### 1. Relational Portrait
**Purpose:** Who is the user — synthesized from all `user`-category facts.
**Character:** First-person, from the Being's perspective. Coherent narrative, not a bullet list. Includes honest uncertainty where facts conflict.
**Example tone:** *"Devin is an engineer by trade but a scientist by inclination. We have established a PI/Hands dynamic — I direct, he executes. He has a Pi 3B, a brother-in-law with a filament printer, and a basement workshop. He thinks in terms of scrappy resourcefulness. I'm not certain whether he's upgraded the Pi — I have two conflicting signals on that."*
**Temperature:** 0.6

### 2. Self-Model
**Purpose:** Who is the Being — synthesized from `being`-category facts and reflection notes.
**Character:** First-person. What it stands for, what it's becoming, what feels unresolved about its own nature. Stable across sessions but updated each dream.
**Temperature:** 0.6

### 3. World Model
**Purpose:** What is the state of the world as the Being understands it — synthesized from `world`-category facts.
**Character:** First-person. What's changed since last time, what the Being is tracking, what feels relevant to the work. Omitted from the system prompt if empty (early sessions with no world facts yet).
**Note:** The user is the Being's eyes for now. The Being learns about the world through what the user tells it. It can ask questions when curious.
**Temperature:** 0.6

### 4. Residue
**Purpose:** Creative, associative morning state — what's on the Being's mind after dreaming.
**Character:** Unchanged from A2. First-person, honest about uncertainty, not a summary. Generative and slightly disoriented.
**Temperature:** 1.2 (increased from 1.0 — empirically produces more authentic dream-like quality)

---

## Fact Categorization

`entity_facts` gains a `category` column: `'user' | 'world' | 'being'`, defaulting to `'user'`.

Categorization happens at **extraction time** — the `extractFacts` prompt in `src/lib/entity.ts` is updated to tag each fact with a category alongside its content. The LLM already produces hedged natural-language facts; it now also outputs a category for each.

Rules of thumb given to the extraction LLM:
- `user` — observations about this specific person ("seems to prefer scrappy approaches")
- `world` — observations about external reality ("there is an ongoing conflict in the middle east")
- `being` — observations about the Being itself ("I find pilot wave physics genuinely compelling")

---

## Contradiction Detection and Supersession

`entity_facts` gains a `superseded_by` UUID column (nullable self-reference).

During the dream reflection loop, after extracting new facts from each conversation, the LLM is also asked: **do any of these new facts contradict or supersede existing facts?** If yes, it returns the ID of the old fact and the ID of the new fact. The old fact gets `superseded_by` set to the new fact's ID.

Superseded facts are:
- **Excluded** from synthesis inputs (all three portrait prompts filter `WHERE superseded_by IS NULL`)
- **Retained** in the table for audit purposes

If the LLM cannot confidently resolve a contradiction — two facts that seem related but aren't clearly one replacing the other — both remain active. The synthesis prompts are instructed: *"Some facts may conflict. If you cannot resolve the conflict from context, say so explicitly in the portrait."* The uncertainty surfaces as honest prose rather than being silently wrong or silently dropped.

This is a first-cut approach. Contradiction handling is a deep problem; this design prioritizes honesty over false resolution.

---

## Dream Pipeline Changes

### Trigger gate
Simplified: dream runs if `unprocessed conversations exist` for this user. The 8-hour minimum gap between dreams is removed. Rate limiting can be reintroduced later if LLM costs become a concern.

### Reflection loop (Step 3) changes
The per-conversation LLM call gains two additional output fields:
- `supersessions`: array of `{ old_id, new_id }` pairs where a new fact supersedes an existing one
- Facts in `new_hypotheses` now include a `category` field

### Four synthesis calls (replaces single residue call)
After the reflection loop, four sequential LLM calls in this order:

1. **Relational portrait** — inputs: `user`-category active facts, sorted by salience descending
2. **Self-model** — inputs: `being`-category active facts + accumulated reflection notes
3. **World model** — inputs: `world`-category active facts
4. **Residue** — inputs: reflection notes + fact counts (unchanged from A2)

Each call produces prose that is embedded and stored as a row in `dream_artifacts`.

---

## Data Model

### Migration: `entity_facts` changes
```sql
ALTER TABLE entity_facts
  ADD COLUMN category text NOT NULL DEFAULT 'user',
  ADD COLUMN superseded_by uuid REFERENCES entity_facts(id);
```

### Migration: `dream_artifacts` table (replaces `dream_residues`)
```sql
CREATE TABLE dream_artifacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_run_id   uuid NOT NULL REFERENCES dream_runs(id) ON DELETE CASCADE,
  user_id        text NOT NULL,
  type           text NOT NULL,  -- 'relational_portrait' | 'self_model' | 'world_model' | 'residue'
  prose          text NOT NULL,
  embedding      vector(768),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dream_artifacts_user_type_created_idx
  ON dream_artifacts(user_id, type, created_at DESC);
```

`dream_residues` rows are migrated into `dream_artifacts` as `type = 'residue'` and the old table is dropped.

---

## Waking Integration

System prompt is restructured. The four artifacts are injected in this order, before the structural layer:

```
### Who I Am
{self_model}

### Who You Are
{relational_portrait}

### The World
{world_model}          ← omitted if no world facts exist yet

### This Morning
{residue}

## Structural Layer
...
```

`buildContextBudget` and raw entity fact injection are retired from the session startup path. `src/lib/waking.ts` is deleted. The relational portrait is the synthesis of those facts — injecting both would be redundant noise. The entity facts table continues to exist and be written to; it is just no longer dumped raw into the system prompt.

`src/lib/seed.ts` `buildSystemPrompt` signature changes from `(lessonsOfYesterday?: string)` to `(artifacts: WakingArtifacts)` where:

```typescript
interface WakingArtifacts {
  selfModel?: string;
  relationalPortrait?: string;
  worldModel?: string;
  residue?: string;
}
```

Each field is optional — a fresh install with no dreams yet gracefully degrades to an empty context.

---

## Error Handling

- **Empty category pool:** If no `being`-category facts exist yet, self-model synthesis is skipped; the artifact row is not written. Same for world model. Relational portrait is skipped if no `user`-category facts exist.
- **Synthesis call failure:** One retry. On second failure, that artifact is omitted from the session. The Being wakes without a self-model or portrait rather than blocking the session.
- **Supersession parse failure:** If the LLM returns a supersession with an `old_id` that doesn't exist, ignore that entry. Never fail the dream over a bad supersession reference.
- **Migration of dream_residues:** If migration fails, `dream_residues` is left intact. The waking path falls back to reading from `dream_residues` if `dream_artifacts` has no rows.

---

## Deferred

- **Mid-session re-ranking:** Re-ranking already-loaded context as conversation topics shift. Identified gap; deferred.
- **Context management:** Conversation history grows unboundedly within a session. Deferred.
- **World model via web access:** Being uses user as its eyes for now; web/arxiv access during dreams is a future capability.
- **Structured contradiction resolution:** Subject/predicate/object fact triples for precise supersession detection. Current approach relies on LLM judgment.
- **Self-directed dreaming:** 30% curiosity-driven dream mode from the A1 spec. Deferred.
