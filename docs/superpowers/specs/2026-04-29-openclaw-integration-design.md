# OpenClaw Integration Design

> Wire Being's persistent memory and dream cycle into OpenClaw's Telegram-based agent.

---

## Goal

OpenClaw handles the messaging interface (Telegram, session management, heartbeat). Being provides the mind: persistent semantic memory, dreaming, waking artifacts, and the epistemic/ethical framework. OpenClaw uses DeepSeek for its own LLM reasoning but gets Being's memory tools, waking artifacts, and ETHICS.md injected into its context.

OpenClaw's built-in dreaming remains disabled. Being's dream cycle is the one that runs, triggered by OpenClaw's heartbeat.

---

## Deployment

Both projects run as separate Docker Compose stacks on **shelob** (the always-on machine), connected via a shared external Docker network called `being-net`.

```
shelob
│
├─ being-stack   (docker-compose.yml in being/)
│  ├─ db             PostgreSQL + pgvector, port 5433
│  ├─ neo4j          Neo4j, ports 7474/7687
│  └─ being-server   HTTP API, port 3000  ← new
│
└─ openclaw-stack  (docker-compose.yml in automate_life/)
   └─ openclaw        Telegram bot, DeepSeek LLM
```

`being-server` is reachable from within OpenClaw's container at `http://being-server:3000`.

Being's CLI (`make run`) continues to work unchanged on shelob or any other machine — it calls `maybeDream()` at session start as before.

---

## Architecture

```
OpenClaw session lifecycle
│
├─ Session start
│   └─ GET /artifacts → inject selfModel, relationalPortrait, worldModel, residue, ethics
│       into OpenClaw system prompt alongside SEED_PROMPT framing
│
├─ Per message turn
│   ├─ POST /message { role, content, conversationId? }
│   │   → log to Being's PostgreSQL (same schema as CLI conversations)
│   └─ LLM tool calls (DeepSeek, via OpenClaw)
│       ├─ POST /memory/search
│       ├─ POST /memory/about
│       ├─ POST /memory/remember
│       └─ POST /memory/link
│
└─ Heartbeat (every 30 min, OpenClaw-managed)
    └─ POST /dream → triggers Being's dream cycle (async, no-op if already running)
```

---

## HTTP API — `src/server.ts`

Framework: Hono. Auth: `Authorization: Bearer <BEING_API_KEY>` on all endpoints.

### Conversation logging

```
POST /message
Body:    { role: "user" | "assistant", content: string, conversationId?: string }
Returns: { conversationId: string }
```

First call in a session omits `conversationId` — Being creates a new `conversations` row and returns the ID. Subsequent calls in the same session pass it back. Embeds content and saves to `messages` table, matching CLI behaviour exactly.

### Waking artifacts

```
GET /artifacts
Returns: {
  selfModel?:          string,
  relationalPortrait?: string,
  worldModel?:         string,
  residue?:            string,
  ethics?:             string   ← contents of ETHICS.md
}
```

Called once at OpenClaw session start. Fields are omitted if no dream has run yet or no artifact of that type exists.

### Dream trigger

```
POST /dream
Returns: { started: boolean }
```

Triggers `maybeDream()` in the background and returns immediately. If a dream is already running, returns `{ started: false }`. Uses an in-memory lock in `dream.ts` to prevent concurrent runs.

### Memory tools

```
POST /memory/search   { query: string }
POST /memory/about    { entity: string }
POST /memory/remember { entity: string, content: string, category?: "user"|"world"|"being" }
POST /memory/link     { from: string, type: string, to: string }
```

HTTP wrappers over the existing `memoryTool` command handlers. Return shapes are identical to what the CLI tool returns.

---

## Dream cycle change

`maybeDream()` gains an in-memory mutex:

```typescript
let dreamRunning = false;

export async function maybeDream(userId: string): Promise<void> {
  if (dreamRunning) return;
  dreamRunning = true;
  try {
    await runDream(userId);
  } finally {
    dreamRunning = false;
  }
}
```

No other changes to dream logic. The CLI path is unchanged.

---

## Docker changes

### `being/docker-compose.yml` — new service

```yaml
being-server:
  build: .
  command: npx tsx src/server.ts
  ports:
    - "3000:3000"
  environment:
    DATABASE_URL: postgres://being:being@db:5432/being
    NEO4J_URI: bolt://neo4j:7687
    ALCHEMIST_ROOT: /alchemist
    BEING_API_KEY: ${BEING_API_KEY}
    GOOGLE_GENERATIVE_AI_API_KEY: ${GOOGLE_GENERATIVE_AI_API_KEY}
    BRAVE_SEARCH_API_KEY: ${BRAVE_SEARCH_API_KEY}
  depends_on:
    db:
      condition: service_healthy
    neo4j:
      condition: service_healthy
  networks:
    - internal
    - being-net
  volumes:
    - ../alchemist:/alchemist

networks:
  internal:
  being-net:
    external: true
```

### `being/Makefile` — new target

```makefile
server: db neo4j
    docker compose up -d --wait being-server
```

### `automate_life/docker-compose.yml`

Add `being-net` as an external network and attach the `openclaw` service to it.

---

## OpenClaw configuration changes (`automate_life/`)

### System prompt injection

At session start, OpenClaw fetches `GET /artifacts` and prepends the response to its system prompt in the same structure Being uses:

```
### Who I Am
{selfModel}

### Who You Are
{relationalPortrait}

### The World
{worldModel}

### This Morning
{residue}

## Code of Ethics
{ethics}
```

If `/artifacts` is unreachable or returns empty (no dream has run yet), OpenClaw falls back to its existing system prompt unchanged.

### Memory tools

The four memory endpoints are registered as tools available to DeepSeek during conversation, with descriptions matching `memoryTool.ts`:

- `memory_search` — semantic search over what the Being knows
- `memory_about` — describe an entity and its relations
- `memory_remember` — write a new fact about an entity
- `memory_link` — assert a relation between two entities

### Heartbeat

The existing 30-minute heartbeat handler calls `POST /being-server:3000/dream`. If Being is unreachable, the call is silently skipped — OpenClaw's heartbeat continues normally.

---

## New files

| File | Purpose |
|------|---------|
| `being/src/server.ts` | Hono HTTP server — all six endpoint groups |
| `being/tests/server.test.ts` | Unit tests for each endpoint (mock graph/db/dream) |

## Modified files

| File | Change |
|------|--------|
| `being/src/lib/dream.ts` | Add in-memory mutex to `maybeDream()` |
| `being/docker-compose.yml` | Add `being-server` service and `being-net` network |
| `being/Makefile` | Add `server` target |
| `being/.env.example` | Add `BEING_API_KEY` |
| `automate_life/docker-compose.yml` | Join `being-net`; add `BEING_SERVER_URL` env var |
| `automate_life/config-batch.json` | Register memory tools; inject artifacts into system prompt |

---

## What's explicitly out of scope

- OpenClaw's built-in dreaming — remains disabled
- Multi-user support — all OpenClaw conversations use `userId: 'default'`
- Persistent conversation ID across OpenClaw restarts — each container restart starts a fresh conversation
- HTTPS / external exposure of the Being server — internal Docker network only
