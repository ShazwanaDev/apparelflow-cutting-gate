import { jwtVerify, SignJWT } from 'jose';
import { ROLES } from '@/lib/domain/constants';
import type { Actor } from '@/lib/domain/orders';
import { DomainError } from '@/lib/domain/errors';
import { getDb } from './db';

export const SESSION_COOKIE = 'af_session';
/** One factory shift. Signing in again the next day is an acceptable cost. */
export const SESSION_TTL_SECONDS = 60 * 60 * 10;

const ISSUER = 'apparelflow';
const AUDIENCE = 'apparelflow-gate';

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/**
 * Turns a session token into the person acting. The token only carries the user
 * ID; the role is read fresh from the database on every request, so a role
 * cannot be forged in the cookie, and a changed role takes effect immediately.
 */
export async function actorFromToken(token: string | undefined | null): Promise<Actor | null> {
  if (!token) return null;
  let userId: number;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  } catch {
    return null;
  }
  const { rows } = await getDb().query<{ id: number; role: Actor['role']; full_name: string }>(
    'SELECT id, role, full_name FROM users WHERE id = $1',
    [userId],
  );
  const row = rows[0];
  if (!row || !(ROLES as readonly string[]).includes(row.role)) return null;
  return { id: row.id, role: row.role, fullName: row.full_name };
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export async function requireActor(request: Request): Promise<Actor> {
  const actor = await actorFromToken(readCookie(request.headers.get('cookie'), SESSION_COOKIE));
  if (!actor) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
  return actor;
}
