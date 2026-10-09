import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from '@/lib/server/db';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

/**
 * Applies any migration files that have not run yet, in filename order. Each
 * file runs inside its own transaction, so a failing migration leaves the
 * database as it was.
 */
export async function migrate(db: Database, log: (message: string) => void = () => undefined): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map(row => row.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter(name => name.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const name of files) {
    if (done.has(name)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8');
    await db.transaction(async tx => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
    log(`applied ${name}`);
    applied.push(name);
  }
  return applied;
}
