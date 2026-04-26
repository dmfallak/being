// src/scripts/migrate-facts-to-graph.ts
import 'dotenv/config';
import pg from 'pg';
import { upsertDescriptor } from '../lib/graph.js';
import { initGraph } from '../db/init-graph.js';

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await initGraph();

  const result = await db.query<{
    id: string; user_id: string; content: string;
    category: string; salience: number; embedding: number[] | null;
  }>('SELECT id, user_id, content, category, salience, embedding FROM entity_facts WHERE superseded_at IS NULL');

  console.log(`Migrating ${result.rows.length} active entity_facts to Neo4j...`);

  for (const row of result.rows) {
    const category = ['user', 'world', 'being'].includes(row.category)
      ? (row.category as 'user' | 'world' | 'being')
      : 'user';
    const embedding = row.embedding ? Array.from(row.embedding) : undefined;
    await upsertDescriptor(row.user_id, row.content, category, row.salience, embedding);
  }

  console.log('Migration complete.');
  await db.end();
}

migrate().catch(console.error);
