import { migrate } from '../db/migrate';
import { createPool, fromPool } from '../lib/server/db';
import { loadEnv } from './env';

loadEnv();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local first.');

const pool = createPool(1);
try {
  const applied = await migrate(fromPool(pool), message => console.log(message));
  console.log(applied.length ? `Done: ${applied.length} migration(s) applied.` : 'Database is already up to date.');
} finally {
  await pool.end();
}
