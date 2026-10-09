import { getSewingBatch } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { handler, json, parseId } from '@/lib/server/http';

export const GET = handler<{ id: string }>(async ({ actor, params }) =>
  json({ order: await getSewingBatch(getDb(), actor, parseId(params.id)) }),
);
