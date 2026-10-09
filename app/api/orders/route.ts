import { createOrder, listOrders } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { handler, json, readJson } from '@/lib/server/http';

export const GET = handler(async ({ request, actor }) => {
  const url = new URL(request.url);
  const filter: Record<string, string> = {};
  for (const key of ['status', 'q']) {
    const value = url.searchParams.get(key);
    if (value) filter[key] = value;
  }
  return json(await listOrders(getDb(), actor, filter));
});

export const POST = handler(async ({ request, actor }) => {
  const order = await createOrder(getDb(), actor, await readJson(request));
  return json({ order }, 201);
});
