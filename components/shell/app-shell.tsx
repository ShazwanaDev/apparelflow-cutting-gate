import Link from 'next/link';
import { DEMO_MODE } from '@/lib/demo-accounts';
import { ROLE_LABELS } from '@/lib/domain/constants';
import { HOME_BY_ROLE, can } from '@/lib/domain/permissions';
import type { Actor } from '@/lib/domain/orders';
import { STAGE_BY_ROLE } from '@/lib/stages';
import { DemoDock } from './demo-dock';
import { NavLinks } from './nav-links';
import { PipelineStepper } from './pipeline';
import { SignOutButton } from './role-switcher';

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
    { href: home, label: actor.role === 'cutting_supervisor' ? 'Orders' : 'Queue' },
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
      <header className="z-30 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:sticky sm:top-0">
        {/* One row on wide screens: brand and navigation, the production
            pipeline in the middle, the signed-in person on the right. On
            narrow screens the pipeline drops to a second row. */}
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-10">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link href={home} className="shrink-0 rounded-md" aria-label="ApparelFlow home">
              <Logo />
            </Link>
            <NavLinks links={links} />
          </div>
          <div className="col-span-2 row-start-2 border-t border-line pt-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:border-0 lg:pt-0">
            <PipelineStepper active={STAGE_BY_ROLE[actor.role]} />
          </div>
          <div className="flex items-center justify-end gap-1 sm:gap-2 lg:col-start-3">
            <div className="hidden text-right leading-tight md:block">
              <p className="text-sm font-semibold text-ink">{actor.fullName}</p>
              <p className="text-xs text-muted">{ROLE_LABELS[actor.role]}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-24 outline-none sm:px-6 lg:px-10">
        {children}
      </main>
      {DEMO_MODE && <DemoDock currentRole={actor.role} />}
    </div>
  );
}
