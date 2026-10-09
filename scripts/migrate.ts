import { Pool } from 'pg';
import { migrate } from '../db/migrate';
import { fromPool } from '../lib/server/db';
import { loadEnv } from './env';

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local first.');

const pool = new Pool({ connectionString: url, max: 1 });
try {
  const applied = await migrate(fromPool(pool), message => console.log(message));
  console.log(applied.length ? `Done: ${applied.length} migration(s) applied.` : 'Database is already up to date.');
} finally {
  await pool.end();
}
