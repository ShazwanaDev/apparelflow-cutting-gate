import { json, publicHandler } from '@/lib/server/http';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/server/session';

// Public so that signing out always works, even with an expired session.
export const POST = publicHandler(async () => {
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
});
