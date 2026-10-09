import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/shell/app-shell';
import { LoginForm } from '@/components/login/login-form';
import { SilkPanel } from '@/components/login/silk-panel';
import { HOME_BY_ROLE } from '@/lib/domain/permissions';
import { currentActor } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const actor = await currentActor();
  if (actor) redirect(HOME_BY_ROLE[actor.role]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-ink lg:sticky lg:top-0 lg:block lg:h-dvh" aria-label="About the cutting gate">
        <SilkPanel />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="label-caps text-white">Cutting · Verification · Sewing</span>
          <div className="max-w-md rounded-[20px] bg-ink/70 p-6 backdrop-blur-sm">
            <p className="font-display text-4xl leading-tight">
              Every bundle is counted against its recipe before it reaches the sewing floor.
            </p>
            <p className="mt-4 text-sm text-white/85">
              One short component stops the batch. The verifier signs off, the server records who and when, and only
              then does the sewing line see it.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-10 lg:px-16">
        <Logo />
        <div className="flex flex-1 flex-col justify-center py-10">
          <p className="label-caps text-muted">Cutting gatekeeper terminal</p>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-tight text-ink sm:text-6xl">
            Sign in to the <em className="italic">cutting gate</em>
          </h1>
          <p className="mt-4 max-w-md text-base text-muted">
            Use your work account, or pick one of the demo roles below to see what each person on the floor can do.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
