import { PGlite, types, type Transaction } from '@electric-sql/pglite';
import type { Database, Queryable } from '@/lib/server/db';

// Match the production driver: numeric columns come back as numbers.
const parsers = { [types.NUMERIC]: (value: string) => Number.parseFloat(value) };

function wrap(client: PGlite | Transaction): Queryable {
  return {
    async query(text, params) {
      const result = await client.query(text, params as unknown[], { parsers });
      return { rows: result.rows as never[], rowCount: result.affectedRows ?? result.rows.length };
    },
    async exec(text) {
      await client.exec(text);
    },
  };
}

/** A throwaway Postgres that lives in memory, for tests. */
export async function createMemoryDatabase(): Promise<Database & { close(): Promise<void> }> {
  const pg = await PGlite.create();
  return {
    ...wrap(pg),
    transaction: work => pg.transaction(tx => work(wrap(tx))),
    close: () => pg.close(),
  };
}
