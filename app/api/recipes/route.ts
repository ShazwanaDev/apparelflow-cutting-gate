import { listRecipes } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { handler, json } from '@/lib/server/http';

export const GET = handler(async ({ actor }) => json({ recipes: await listRecipes(getDb(), actor) }));
