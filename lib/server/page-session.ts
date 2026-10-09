import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DomainError } from '@/lib/domain/errors';
import { can, type Capability } from '@/lib/domain/permissions';
import type { Actor } from '@/lib/domain/orders';
import { actorFromToken, SESSION_COOKIE } from './session';

/** The signed-in person for this page render, looked up once per request. */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  return actorFromToken(store.get(SESSION_COOKIE)?.value);
});

/**
 * Guards a page. Hiding a page is a convenience for the user, not the security
 * boundary (the API and service layer enforce the same rules), but it means
 * nobody lands on a screen that would only fail when they press a button.
 */
export async function requirePageActor(capability?: Capability): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (capability && !can(actor.role, capability)) redirect('/forbidden');
  return actor;
}

/** Runs a service call for a page, showing the 404 or 403 page for those outcomes. */
export async function loadForPage<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    if (error instanceof DomainError && error.status === 403) redirect('/forbidden');
    throw error;
  }
}
