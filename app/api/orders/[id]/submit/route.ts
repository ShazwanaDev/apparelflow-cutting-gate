import { submitOrder } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { handler, json, parseId, readJson } from '@/lib/server/http';

export const POST = handler<{ id: string }>(async ({ request, actor, params }) =>
  json({ order: await submitOrder(getDb(), actor, parseId(params.id), await readJson(request)) }),
);
