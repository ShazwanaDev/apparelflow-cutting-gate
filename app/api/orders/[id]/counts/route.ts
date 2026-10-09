import { saveCounts } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { handler, json, parseId, readJson } from '@/lib/server/http';

export const PUT = handler<{ id: string }>(async ({ request, actor, params }) =>
  json({ order: await saveCounts(getDb(), actor, parseId(params.id), await readJson(request)) }),
);
