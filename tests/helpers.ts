import { createMemoryDatabase } from '@/db/pglite';
import { migrate } from '@/db/migrate';
import { seed } from '@/db/seed';
import { setDatabaseForTests } from '@/lib/server/db';
import { SESSION_COOKIE, signSession } from '@/lib/server/session';
import type { Actor } from '@/lib/domain/orders';
import type { Role } from '@/lib/domain/constants';

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/**
 * A fresh, migrated and seeded Postgres for one test file. It runs in memory
 * through PGlite, which is real Postgres compiled to WebAssembly, so the
 * triggers, constraints and generated columns behave exactly as in production.
 */
export async function createTestApp(options: { sampleOrders?: boolean } = {}) {
  const db = await createMemoryDatabase();
  await migrate(db);
  await seed(db, { sampleOrders: options.sampleOrders ?? false, bcryptRounds: 4 });
  setDatabaseForTests(db);

  const { rows } = await db.query<{ id: number; role: Role; full_name: string }>('SELECT id, role, full_name FROM users');
  const actors = Object.fromEntries(rows.map(row => [row.role, { id: row.id, role: row.role, fullName: row.full_name }])) as Record<Role, Actor>;
  const recipes = await db.query<{ id: number; recipe_code: string }>('SELECT id, recipe_code FROM recipes');
  const recipeId = (code: string) => recipes.rows.find(row => row.recipe_code === code)!.id;

  return {
    db,
    actors,
    recipeId,
    async cookie(role: Role) {
      return `${SESSION_COOKIE}=${await signSession(actors[role].id)}`;
    },
    async close() {
      setDatabaseForTests(undefined);
      await db.close();
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each route types its own params
type RouteHandler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;

/** Calls a Next.js route handler the way the framework would, without a server. */
export async function call(
  route: RouteHandler,
  options: { method?: string; path?: string; body?: unknown; rawBody?: string; cookie?: string; params?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  const { method = 'GET', path = '/api/test', body, rawBody, cookie, params = {}, headers = {} } = options;
  const request = new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      host: 'localhost:3000',
      ...(body !== undefined || rawBody !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const response = await route(request, { params: Promise.resolve(params) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}
