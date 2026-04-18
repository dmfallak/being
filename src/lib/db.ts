// src/lib/db.ts
import pg from 'pg';
import { config } from './config.js';
import type {
  ConversationRow,
  MessageRow,
  EntityFactRow,
  DreamRunRow,
  DreamResidueRow,
} from '../types/db.js';

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
  client: pg.PoolClient | pg.Pool = db,
): Promise<void> {
  const vectorParam = embedding ? `[${embedding.join(',')}]` : null;
  await client.query(
    `INSERT INTO entity_facts (user_id, content, salience, embedding)
     VALUES ($1, $2, $3, $4::vector)
     ON CONFLICT (user_id, content) DO UPDATE SET updated_at = now()`,
    [userId, content, salience, vectorParam],
  );
}

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

export async function getLatestResidue(
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<DreamResidueRow | null> {
  const result = await client.query<DreamResidueRow>(
    `SELECT * FROM dream_residues
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 1`,
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

export async function getAllEntityFacts(
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<EntityFactRow[]> {
  const result = await client.query<EntityFactRow>(
    `SELECT * FROM entity_facts WHERE user_id = $1`,
    [userId],
  );
  return result.rows;
}

export async function updateFactSalience(
  factId: string,
  userId: string,
  newSalience: number,
  client: pg.PoolClient | pg.Pool = db,
): Promise<void> {
  await client.query(
    `UPDATE entity_facts SET salience = $3
     WHERE id = $1 AND user_id = $2`,
    [factId, userId, newSalience],
  );
}

export async function reinforceFact(
  factId: string,
  userId: string,
  client: pg.PoolClient | pg.Pool = db,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE entity_facts
     SET salience = LEAST(salience + 0.1, 1.0),
         last_reinforced_at = now()
     WHERE id = $1 AND user_id = $2`,
    [factId, userId],
  );
  return (result.rowCount ?? 0) > 0;
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
         error = $6
     WHERE id = $1`,
    [
      dreamRunId,
      counts.conversations_processed,
      counts.facts_created,
      counts.facts_reinforced,
      counts.cap_hit,
      counts.error ?? null,
    ],
  );
}

export async function insertDreamResidue(
  dreamRunId: string,
  userId: string,
  prose: string,
  embedding: number[] | null,
  client: pg.PoolClient | pg.Pool = db,
): Promise<DreamResidueRow> {
  const vectorParam = embedding ? `[${embedding.join(',')}]` : null;
  const result = await client.query<DreamResidueRow>(
    `INSERT INTO dream_residues (dream_run_id, user_id, prose, embedding)
     VALUES ($1, $2, $3, $4::vector)
     RETURNING *`,
    [dreamRunId, userId, prose, vectorParam],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Failed to insert dream_residue');
  return row;
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
