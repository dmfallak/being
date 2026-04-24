// One-time backfill: compute and store embeddings for all entity facts that have none.
import { db } from '../lib/db.js';
import { embed } from '../lib/embed.js';

async function backfill() {
  const { rows } = await db.query<{ id: string; content: string }>(
    `SELECT id, content FROM entity_facts WHERE embedding IS NULL ORDER BY created_at`,
  );

  if (rows.length === 0) {
    console.log('Nothing to backfill.');
    process.exit(0);
  }

  console.log(`Backfilling ${rows.length} facts...`);

  for (const row of rows) {
    const vector = await embed(row.content);
    const vectorParam = `[${vector.join(',')}]`;
    await db.query(
      `UPDATE entity_facts SET embedding = $1::vector WHERE id = $2`,
      [vectorParam, row.id],
    );
    console.log(`  ✓ ${row.id}: ${row.content.slice(0, 60)}…`);
  }

  console.log('Done.');
  process.exit(0);
}

backfill().catch(err => { console.error(err); process.exit(1); });
