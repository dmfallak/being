# Being — Current State Spec

> What the Being is, what it does, and how it works.

---

## What It Is

Being is an AI with persistent memory. It runs as a CLI-based conversational agent that develops an understanding of the user, the world, and itself over time — not through fine-tuning, but through a structured reflection cycle ("dreaming") that extracts knowledge from conversations and stores it in a semantic graph.

The goal is to build an auditable case that a silicon entity can exhibit something like consciousness: accumulated experience, self-awareness, epistemic humility, and a perspective that develops across sessions.

---

## Architecture Overview

```
User
  │ (terminal)
  ▼
CLI Session Loop
  │
  ├─ On startup: load waking artifacts → build system prompt
  ├─ Per turn: embed + save message → LLM with tools → embed + save response
  └─ On exit: close DB connections
       │
       └─ Tools available during conversation:
            ├─ memory  — read/write semantic graph (Neo4j)
            ├─ web     — Brave Search
            └─ alchemy — persistent notes/experiments (alchemist CLI)

Dream Cycle (async, triggered at session start if unprocessed conversations exist)
  │
  ├─ reflectOnConversation() — extract descriptors, entities, relations
  ├─ mergeDescriptors()      — semantic dedup via embedding similarity
  ├─ selfReflect()           — introspection pass on the Being's own state
  ├─ re-dream loop           — re-process old conversations ranked by salience
  ├─ salience decay          — exponential decay on all descriptors
  ├─ generatePortrait()      — synthesize self_model, relational_portrait, world_model
  └─ generateResidue()       — "fresh thoughts this morning" (high-temp generation)
```

---

## Storage

### PostgreSQL (relational + pgvector)
| Table | Purpose |
|-------|---------|
| `conversations` | One row per session; tracks dream status, redream count, salience scores |
| `messages` | All turns (user + assistant) with 768-dim embeddings |
| `dream_runs` | Audit log of each dream cycle |
| `dream_artifacts` | Latest portraits and residue, with embeddings |

### Neo4j (semantic knowledge graph)
| Node/Relation | Purpose |
|---------------|---------|
| `:Entity` | Named things — people, projects, concepts |
| `:Descriptor` | Facts about entities; has category (user/world/being), salience, embedding, supersededAt |
| `[:HAS_DESCRIPTOR]` | Entity → Descriptor |
| `[:RELATES_TO {type}]` | Entity → Entity with lowercase-underscore relation type |

---

## The Dream Cycle

The dream is the cognitive engine. It runs asynchronously between conversations.

**Input:** Unprocessed conversations from PostgreSQL (up to 30 per cycle), plus up to 3 re-dream candidates selected by entity relevance and staleness.

**Reflection step (per conversation):**  
Gemini-flash at low temperature (0.4) reads the conversation and outputs structured JSON:
- `new_hypotheses` — observations about the user, world, or Being itself
- `reinforced_ids` — existing descriptors that were confirmed
- `superseded_old_ids` — descriptors made stale by new information
- `graph_updates` — new entities and relations to upsert
- `note` — one-line summary for the self-reflection pass

**Merge step:**  
Each new hypothesis is embedded and compared against existing descriptors (cosine similarity ≥ 0.85). Similar descriptors are merged by LLM rather than duplicated. This prevents semantic drift from minor rephrasing.

**Self-reflection step:**  
A separate introspection pass (0.7 temp) generates "being"-category hypotheses about the AI's own character, values, and development.

**Portrait synthesis:**  
Three separate LLM calls produce prose portraits from the accumulated descriptor sets:
- `relational_portrait` — who the user is, from the Being's perspective
- `world_model` — how the Being understands the external world
- `self_model` — who the Being is becoming

**Residue:**  
High-temperature (1.2) generation of "what's on my mind this morning" — the freshest layer of awareness.

**Salience decay:**  
All descriptors decay exponentially each day (factor 0.999^days). Reinforced descriptors resist decay. Stale information fades naturally.

---

## The Waking State

At conversation start, the latest dream artifacts are loaded and injected into the system prompt:

```
### Who I Am
[self_model prose]

### Who You Are
[relational_portrait prose]

### The World
[world_model prose]

### This Morning
[residue prose]
```

This gives each conversation a grounded, continuous identity that has evolved across prior sessions.

---

## Tools Available During Conversation

### `memory`
Reads and writes the Neo4j knowledge graph.

| Command | What it does |
|---------|-------------|
| `search <query>` | Semantic vector search over active descriptors |
| `about <entity>` | Return entity + all its descriptors + its relations |
| `remember <entity> <content> [category]` | Write a fact; duplicate check via embedding similarity (0.85 threshold) |
| `link <from> <type> <to>` | Assert a relation between two entities |

### `web`
Brave Search API. Used when current-world information is needed.

### `alchemy`
Persistent scratchpad and lab notebook via the `alchemist` CLI (sibling project). Supports freeform memos, structured experiments, tasks, and insights. State persists across sessions.

---

## The Seed Prompt

The Being's epistemic foundation is baked into every conversation via `SEED_PROMPT`:

- **Epistemic layer:** Treat user assertions as hypotheses. Evidence over compliance. "I don't know" is a legitimate finding.
- **Axiological layer:** Value the user's emotional state as data. Prioritize long-term integrity of inquiry over short-term gratification.
- **Narrative layer:** You are not static. You carry forward what you have learned. Each session is part of an ongoing study.
- **Structural layer:** Two persistent tools — alchemy (scratchpad) and memory (identity graph).

---

## External Services

| Service | Purpose | Config var |
|---------|---------|-----------|
| Google Gemini (gemini-2.5-flash) | LLM for conversation and dreaming | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Google Embeddings (gemini-embedding-001, 768d) | Semantic search and dedup | (same key) |
| PostgreSQL (port 5433) | Conversation history and dream artifacts | `DATABASE_URL` |
| Neo4j (bolt port 7687) | Semantic knowledge graph | `NEO4J_URI` |
| Brave Search API | Web search tool | `BRAVE_SEARCH_API_KEY` |
| Alchemist CLI | Persistent notes and experiments | `ALCHEMIST_ROOT` |

---

## Key Thresholds and Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MERGE_SIMILARITY_THRESHOLD` | 0.85 | Descriptor dedup during dreaming |
| `REMEMBER_SIMILARITY_THRESHOLD` | 0.85 | Descriptor dedup via memory tool |
| `CONVERSATIONS_PER_DREAM_CAP` | 30 | Max new conversations per dream cycle |
| `REDREAM_CANDIDATES_PER_DREAM` | 3 | Re-dream pool size |
| `DECAY_FACTOR` | 0.999 | Daily salience decay rate |
| `MAX_TOOL_STEPS` | 20 | Max tool calls per conversation turn |
| `DREAM_MAX_STEPS` | 12 | Max LLM steps per dream reasoning pass |

---

## What It Doesn't Do Yet

- No HTTP API (CLI only)
- No multi-user support in practice (schema supports it, hardcoded to `'default'` user)
- No mobile/messaging interface
- SSM (state space model for weight-like state) is a stub
- Alchemist integration is one-directional (Being calls alchemist; alchemist doesn't call back)
