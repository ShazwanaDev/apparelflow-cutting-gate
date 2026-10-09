import Link from 'next/link';
import { ROLE_LABELS } from '@/lib/domain/constants';
import { HOME_BY_ROLE, can } from '@/lib/domain/permissions';
import type { Actor } from '@/lib/domain/orders';
import { PipelineStepper, STAGE_BY_ROLE } from './pipeline';
import { RoleSwitcher, SignOutButton } from './role-switcher';
import { NavLinks } from './nav-links';

export function Logo() {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-ink">
      <span aria-hidden className="inline-block size-3 translate-y-[1px] rounded-full bg-coral ring-2 ring-ink" />
      <span className="font-display text-2xl leading-none">ApparelFlow</span>
    </span>
  );
}

export function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const home = HOME_BY_ROLE[actor.role];
  const links = [
    { href: home, label: actor.role === 'cutting_supervisor' ? 'Orders' : actor.role === 'cutting_verifier' ? 'Queue' : 'Sewing queue' },
    ...(can(actor.role, 'recipe:read') ? [{ href: '/recipes', label: 'Recipes' }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-10">
          <Link href={home} className="rounded-md" aria-label="ApparelFlow home">
            <Logo />
          </Link>
          <NavLinks links={links} />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right leading-tight md:block">
              <p className="text-sm font-semibold text-ink">{actor.fullName}</p>
              <p className="text-xs text-muted">{ROLE_LABELS[actor.role]}</p>
            </div>
            <SignOutButton />
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-line pt-2 lg:order-none lg:w-auto lg:border-0 lg:pt-0">
            <PipelineStepper active={STAGE_BY_ROLE[actor.role]} />
            <div className="lg:hidden">
              <RoleSwitcher currentRole={actor.role} />
            </div>
          </div>
          <div className="hidden lg:block">
            <RoleSwitcher currentRole={actor.role} />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-24 outline-none sm:px-6 lg:px-10">
        {children}
      </main>
    </div>
  );
}
