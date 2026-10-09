import type { Metadata } from 'next';
import { ShieldX } from 'lucide-react';
import { Logo } from '@/components/shell/app-shell';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { ROLE_LABELS } from '@/lib/domain/constants';
import { HOME_BY_ROLE } from '@/lib/domain/permissions';
import { currentActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Not available for your role' };

export default async function ForbiddenPage() {
  const actor = await currentActor();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-4 py-8">
      <Logo />
      <EmptyState
        icon={<ShieldX aria-hidden className="size-5" />}
        title="Not part of your station"
        action={
          <ButtonLink href={actor ? HOME_BY_ROLE[actor.role] : '/login'}>{actor ? 'Back to my work' : 'Sign in'}</ButtonLink>
        }
      >
        {actor
          ? `You are signed in as a ${ROLE_LABELS[actor.role]}. This page belongs to another step of the cutting handoff, so it is closed to your role.`
          : 'Sign in to continue.'}
        <span className="mt-2 block font-mono text-xs">HTTP 403 · Forbidden</span>
      </EmptyState>
    </main>
  );
}
