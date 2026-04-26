// src/lib/db.ts
import pg from 'pg';
import { config } from './config.js';
import type {
  ConversationRow,
  MessageRow,
  DreamRunRow,
  DreamArtifactRow,
} from '../types/db.js';
import type { WakingArtifacts } from '../types/artifacts.js';

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

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getLatestDreamRun(
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<DreamRunRow | null> {
  const result = await client.query<DreamRunRow>(
    `SELECT * FROM dream_runs
     WHERE user_id = $1 AND completed_at IS NOT NULL
     ORDER BY started_at DESC LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function getUnprocessedConversations(
  userId: string,
  limit: number,
  client: pg.PoolClient | pg.Pool = db,
): Promise<ConversationRow[]> {
  const result = await client.query<ConversationRow>(
    `SELECT * FROM conversations
     WHERE user_id = $1 AND last_dream_at IS NULL
     ORDER BY created_at ASC LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

export async function countUnprocessedConversations(
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM conversations
     WHERE user_id = $1 AND last_dream_at IS NULL`,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getMessagesForConversation(
  conversationId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<MessageRow[]> {
  const result = await client.query<MessageRow>(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId],
  );
  return result.rows;
}

export async function insertDreamRun(
  userId: string,
  startedAt: Date,
  client: pg.PoolClient | pg.Pool = db,
): Promise<DreamRunRow> {
  const result = await client.query<DreamRunRow>(
    `INSERT INTO dream_runs (user_id, started_at) VALUES ($1, $2) RETURNING *`,
    [userId, startedAt],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Failed to insert dream_run');
  return row;
}

export async function finalizeDreamRun(
  dreamRunId: string,
  counts: {
    conversations_processed: number;
    facts_created: number;
    facts_reinforced: number;
    cap_hit: boolean;
    parse_failures: number;
    error?: string | null;
  },
  client: pg.PoolClient | pg.Pool = db,
): Promise<void> {
  await client.query(
    `UPDATE dream_runs
     SET completed_at = now(),
         conversations_processed = $2,
         facts_created = $3,
         facts_reinforced = $4,
         cap_hit = $5,
         parse_failures = $6,
         error = $7
     WHERE id = $1`,
    [
      dreamRunId,
      counts.conversations_processed,
      counts.facts_created,
      counts.facts_reinforced,
      counts.cap_hit,
      counts.parse_failures,
      counts.error ?? null,
    ],
  );
}

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

export async function getReDreamCandidatePool(
  userId: string,
  excludeConversationIds: string[],
  client: pg.PoolClient | pg.Pool = db,
): Promise<ConversationRow[]> {
  const result = await client.query<ConversationRow>(
    `SELECT * FROM conversations
     WHERE user_id = $1
       AND last_dream_at IS NOT NULL
       AND (last_redream_at IS NULL OR last_redream_at < now() - interval '7 days')
       AND id != ALL($2::uuid[])
     ORDER BY last_dream_at ASC`,
    [userId, excludeConversationIds.length > 0 ? excludeConversationIds : ['00000000-0000-0000-0000-000000000000']],
  );
  return result.rows;
}

export async function incrementReDreamCount(
  conversationId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<void> {
  await client.query(
    `UPDATE conversations
     SET redream_count = redream_count + 1, last_redream_at = now()
     WHERE id = $1`,
    [conversationId],
  );
}

export async function markConversationsDreamed(
  conversationIds: string[],
  client: pg.PoolClient | pg.Pool = db,
): Promise<void> {
  if (conversationIds.length === 0) return;
  await client.query(
    `UPDATE conversations SET last_dream_at = now() WHERE id = ANY($1::uuid[])`,
    [conversationIds],
  );
}
