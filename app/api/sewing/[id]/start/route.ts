import { startSewing } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { handler, json, parseId } from '@/lib/server/http';

export const POST = handler<{ id: string }>(async ({ actor, params }) =>
  json({ order: await startSewing(getDb(), actor, parseId(params.id)) }),
);
