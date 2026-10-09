import { Pool } from 'pg';
import { seed } from '../db/seed';
import { fromPool } from '../lib/server/db';
import { loadEnv } from './env';

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local first.');

const pool = new Pool({ connectionString: url, max: 1 });
try {
  const result = await seed(fromPool(pool));
  console.log(result.seeded ? 'Seeded demo users, recipes and sample orders.' : 'Users already exist; nothing seeded.');
} finally {
  await pool.end();
}
