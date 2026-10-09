import { seed } from '../db/seed';
import { createPool, fromPool } from '../lib/server/db';
import { loadEnv } from './env';

loadEnv();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local first.');

const pool = createPool(1);
try {
  const result = await seed(fromPool(pool));
  console.log(result.seeded ? 'Seeded demo users, recipes and sample orders.' : 'Users already exist; nothing seeded.');
} finally {
  await pool.end();
}
