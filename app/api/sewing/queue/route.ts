import { sewingQueue } from '@/lib/domain/orders';
import { getDb } from '@/lib/server/db';
import { handler, json } from '@/lib/server/http';
import { sewingTabSchema } from '@/lib/validation';

// ?tab=in_sewing switches to batches already on the line. Any other value,
// including ?status=PENDING_VERIFICATION, falls back to the verified tab.
export const GET = handler(async ({ request, actor }) => {
  const tab = sewingTabSchema.parse(new URL(request.url).searchParams.get('tab'));
  return json({ tab, orders: await sewingQueue(getDb(), actor, tab) });
});
