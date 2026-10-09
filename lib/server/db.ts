import { Pool, types } from 'pg';

/**
 * The slice of a Postgres client the application needs. Both node-postgres (in
 * production) and PGlite (an in-process Postgres used by the tests) fit it, so
 * the same SQL and the same transactions run in both places.
 */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }>;
  /** Runs one or more statements without parameters, e.g. a migration file. */
  exec(text: string): Promise<void>;
}

export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
}

// Postgres returns `numeric` columns as strings to avoid losing precision. Every
// numeric column here has at most two decimals and modest magnitudes, so plain
// JavaScript numbers are safe and much easier to work with.
types.setTypeParser(types.builtins.NUMERIC, value => Number.parseFloat(value));

export function fromPool(pool: Pool): Database {
  return {
    async query(text, params) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
    async exec(text) {
      await pool.query(text);
    },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          async query(text, params) {
            const result = await client.query(text, params as unknown[]);
            return { rows: result.rows, rowCount: result.rowCount ?? 0 };
          },
          async exec(text) {
            await client.query(text);
          },
        };
        const value = await work(tx);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

const globalForDb = globalThis as unknown as { apparelflowDb?: Database; apparelflowDbOverride?: Database };

/** Lets the test suite swap in an in-process database. */
export function setDatabaseForTests(db: Database | undefined) {
  globalForDb.apparelflowDbOverride = db;
}

export function getDb(): Database {
  if (globalForDb.apparelflowDbOverride) return globalForDb.apparelflowDbOverride;
  if (!globalForDb.apparelflowDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    const pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      // Hosted Postgres (Neon, Supabase) requires TLS; the local dev server does not.
      ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: true } : undefined,
    });
    pool.on('error', error => console.error('Postgres pool error', error.message));
    // Cached on globalThis so hot reloads in development do not open a new pool each time.
    globalForDb.apparelflowDb = fromPool(pool);
  }
  return globalForDb.apparelflowDb;
}
