import { handler, json } from '@/lib/server/http';

export const GET = handler(async ({ actor }) => json({ user: actor }));
