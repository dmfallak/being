# Re-Dream Design

## Goal

Enable the Being to revisit old conversations during dreams — not to re-extract the same facts, but to form new connections and update its understanding with new information (web search, accumulated graph context, evolved self-model). Mirrors how human dreaming returns to unresolved or significant material across time.

## Core Principle

Re-dreaming is not reprocessing. The Being already extracted what it could from old conversations at the time. Re-dreaming asks: *what would I understand differently now, given everything I've learned since and everything the world has published since?*

New hypotheses from re-dreaming go through a merge step: check for similar existing descriptors, and if found, produce a single updated descriptor that preserves what hasn't changed and integrates what's new. The old descriptor is superseded. Nothing is duplicated.

---

## Architecture

Three new units, one orchestration change:

| Unit | Purpose |
|------|---------|
| `selectReDreamCandidates` | Score and rank old conversations for re-dreaming |
| `mergeDescriptors` | Embed → similarity filter → LLM merge → supersede old |
| `008_redream_count.sql` | Track re-dream count per conversation |
| `runDream` (modified) | Orchestrate re-dream block after new-conversation loop |

---

## Section 1: Candidate Selection

**Function:** `selectReDreamCandidates(userId, limit, recentConversationIds): Promise<ConversationRow[]>`

Scores dreamed conversations by two signals:

- **Staleness**: `days_since_last_dreamed / 30` (capped at 1.0) — older = higher score
- **Relevance**: computed by (1) fetching all Entity names from Neo4j, (2) checking which of those names appear as substrings in the recent conversations' message text, (3) counting how many of those "recent entity names" appear in the candidate conversation's message text, normalised to [0, 1] by dividing by the total recent entity count

**Combined score:** `staleness × relevance`

**Fallback:** If `recentConversationIds` is empty or no recent entities exist in the graph, fall back to staleness-only scoring — select the `limit` most stale conversations regardless of relevance. Re-dreaming should always fire; an empty session should not block it.

**Exclusions:**
- Conversations with zero relevance score are excluded when recent context exists (pure staleness without any thematic connection is not enough)
- Conversations where `last_redream_at` is within the last 7 days are excluded (prevents the same conversation being re-dreamed every session)

**Limit:** 3 per dream session (fixed, tunable via constant `REDREAM_CANDIDATES_PER_DREAM = 3`).

---

## Section 2: Descriptor Merge Step

**Function:** `mergeDescriptors(userId, newHypotheses, generate): Promise<{ merged: number; created: number }>`

For each hypothesis in `newHypotheses`:

1. **Embed** the hypothesis content
2. **Vector search** `searchDescriptors` — top candidates above cosine similarity threshold `MERGE_SIMILARITY_THRESHOLD = 0.85`
3. **If no candidates**: write as a new descriptor directly (same as first-time reflection)
4. **If candidates found**: call LLM with the old descriptor + new hypothesis:

```
You have an existing descriptor and a new observation about the same subject.
Write a single updated descriptor that preserves everything still accurate from
the old one and integrates the new information. If they say the same thing,
return the old descriptor text unchanged.
Output only the descriptor text. No prose, no explanation.
```

5. **If LLM returns the old text unchanged**: no-op (nothing to update)
6. **If LLM returns updated text**: write new descriptor node, supersede the old one (`supersededAt = now`)

The function writes to the graph directly and returns counts of merged vs newly created descriptors.

**entityName handling:** Preserved from the original hypothesis — the merged descriptor inherits the same entity link.

---

## Section 3: Orchestration in `runDream`

Re-dream block runs **after** the new-conversation loop and self-reflection pass, **before** portrait synthesis:

```
// Re-dream block
recentConversationIds = conversations.map(c => c.id)
candidates = await selectReDreamCandidates(userId, REDREAM_CANDIDATES_PER_DREAM, recentConversationIds)

for each candidate:
  log: "dream: re-dreaming conversation from <created_at date>"
  messages = await getMessagesForConversation(candidate.id)
  reflection = await reflectOnConversation({ facts: activeDescriptors, messages, generate: dreamGenerate })
  if reflection === null: log parse failure, continue

  // graph_updates and reinforced/superseded handled identically to new conversations
  write entities + relations from graph_updates
  await mergeDescriptors(userId, reflection.newHypotheses, dreamGenerate)  // merge instead of direct write
  handle reinforced_ids and superseded_old_ids normally

  // increment redream_count, do NOT update last_dream_at
  await incrementReDreamCount(candidate.id)

log: "dream: re-dreamed N conversations, M descriptors merged, K new"
```

**`last_dream_at` is never updated on re-dream** — staleness scoring uses the original first-pass timestamp. A conversation re-dreamed 10 times is still scored by when it was first processed.

**Web search budget:** 20 total per dream session, shared across new conversations, self-reflection, and re-dreams. Same `dreamGenerate` function and counter used throughout.

---

## Section 4: Schema

**Migration `008_redream_count.sql`:**

```sql
ALTER TABLE conversations ADD COLUMN redream_count integer NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN last_redream_at timestamp with time zone;
```

No Neo4j schema changes. Merged descriptors use existing Descriptor nodes and `supersededAt` field.

**New DB function:** `incrementReDreamCount(conversationId)` — `UPDATE conversations SET redream_count = redream_count + 1, last_redream_at = now() WHERE id = $1`.

---

## Data Flow

```
runDream
├── new-conversation loop (existing)
│   └── reflectOnConversation → write descriptors directly
├── selfReflect pass (existing)
├── re-dream block (new)
│   ├── selectReDreamCandidates
│   └── for each candidate:
│       ├── reflectOnConversation
│       └── mergeDescriptors
│           ├── embed new hypothesis
│           ├── searchDescriptors (similarity filter)
│           ├── [if match] LLM merge call
│           └── [if changed] upsertDescriptor + supersedeDescriptor
└── portrait synthesis (existing)
```

---

## Constants

| Constant | Value | Notes |
|----------|-------|-------|
| `REDREAM_CANDIDATES_PER_DREAM` | 3 | Conversations re-dreamed per session |
| `MERGE_SIMILARITY_THRESHOLD` | 0.85 | Cosine similarity above which merge is attempted |
| `MIN_REDREAM_INTERVAL_DAYS` | 7 | Minimum days since last dream before re-dream eligible |
| `DREAM_WEB_SEARCHES_CAP` | 20 | Total web searches per dream (updated from 5) |

---

## Error Handling

- `selectReDreamCandidates` failure: log and skip re-dream block entirely, dream continues
- `mergeDescriptors` failure on individual hypothesis: log and skip that hypothesis, continue with others
- `reflectOnConversation` returning null for a re-dream: log parse failure, `incrementReDreamCount` still fires (it was attempted)
- LLM merge call failure: treat as no-op, write hypothesis as new descriptor instead

---

## Testing

- `selectReDreamCandidates`: unit test scoring logic, fallback to staleness-only, exclusion of recently-dreamed conversations
- `mergeDescriptors`: test no-match path (new descriptor created), match + changed path (supersede + new), match + unchanged path (no-op)
- `runDream` integration: verify re-dream block fires, `redream_count` incremented, `last_dream_at` not modified
