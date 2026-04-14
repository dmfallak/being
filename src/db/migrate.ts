import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

export async function migrate(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      run_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = await db.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  const appliedSet = new Set(applied.rows.map(r => r.filename));

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');

    if (file === '001_pgvector.sql') {
      // CREATE EXTENSION cannot run inside a transaction in some Postgres versions
      const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
      for (const statement of statements) {
        await db.query(statement);
      }
      await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    } else {
      await db.query('BEGIN');
      try {
        const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
        for (const statement of statements) {
          await db.query(statement);
        }
        await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
    }

    console.log(`Migrated: ${file}`);
  }
}

if (process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1])) {
  migrate()
    .then(() => { console.log('Migrations complete.'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
