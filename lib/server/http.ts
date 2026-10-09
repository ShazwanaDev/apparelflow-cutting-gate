import { NextResponse } from 'next/server';
import { DomainError } from '@/lib/domain/errors';
import type { Actor } from '@/lib/domain/orders';
import { requireActor } from './session';

const MAX_BODY_BYTES = 32 * 1024;

export function errorResponse(error: DomainError) {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
    { status: error.status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Browsers attach the Origin header to cross-site POSTs. The session cookie is
 * already SameSite=Lax, which stops most cross-site requests from carrying it;
 * this check refuses the rest. Requests without an Origin (cURL, Postman, the
 * tests) still need a valid session cookie to do anything.
 */
function assertSameOrigin(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new DomainError('FORBIDDEN', 'Cross-site request refused.');
  }
  if (originHost !== host) throw new DomainError('FORBIDDEN', 'Cross-site request refused.');
}

/** Reads a small JSON body. An empty body counts as an empty object. */
export async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new DomainError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new DomainError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  if (text.trim() === '') return {};
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new DomainError('UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError('BAD_REQUEST', 'The request body is not valid JSON.');
  }
}

/** Route IDs are positive integers; anything else is simply not found. */
export function parseId(raw: string): number {
  if (!/^[1-9]\d{0,8}$/.test(raw)) throw new DomainError('NOT_FOUND', 'Order not found.');
  return Number(raw);
}

type Context<P> = { params: Promise<P> };

async function respond(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) return errorResponse(error);
    console.error('Unhandled API error', error);
    return json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } }, 500);
  }
}

/**
 * Wraps a route handler so every endpoint behaves the same way: the origin is
 * checked, a valid session is required, expected failures become their status
 * code, and anything unexpected becomes a bare 500 with the details kept in
 * the server log.
 */
export function handler<P = Record<string, never>>(
  fn: (args: { request: Request; actor: Actor; params: P }) => Promise<Response>,
) {
  return (request: Request, context: Context<P>) =>
    respond(async () => {
      assertSameOrigin(request);
      const actor = await requireActor(request);
      const params = context?.params ? await context.params : ({} as P);
      return fn({ request, actor, params });
    });
}

/** The same, for the few routes that work without a session (sign in, sign out). */
export function publicHandler(fn: (args: { request: Request }) => Promise<Response>) {
  return (request: Request) =>
    respond(async () => {
      assertSameOrigin(request);
      return fn({ request });
    });
}
