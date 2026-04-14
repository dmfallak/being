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
