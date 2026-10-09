'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRight, Check, LogOut } from 'lucide-react';
import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';
import { ROLE_LABELS, type Role } from '@/lib/domain/constants';
import { api } from '@/lib/client/api';

/**
 * Switching role is a real sign-out followed by a real sign-in as that demo
 * account. Nothing on the client decides what a role may see: the new session
 * cookie does, and the server reads the role from the database.
 */
export async function signInAs(email: string, password: string) {
  await api('/api/auth/logout', { method: 'POST' });
  return api<{ redirectTo: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
}

export function RoleSwitcher({ currentRole }: { currentRole: Role }) {
  const router = useRouter();
  const [pending, setPending] = useState<Role | null>(null);
  const [, startTransition] = useTransition();

  async function switchTo(role: Role) {
    const account = DEMO_ACCOUNTS.find(entry => entry.role === role)!;
    setPending(role);
    const result = await signInAs(account.email, account.password);
    if (!result.ok) {
      setPending(null);
      toast.error('Could not switch role', { description: result.error.message });
      return;
    }
    toast.success(`Signed in as ${account.fullName}`, { description: ROLE_LABELS[role] });
    startTransition(() => {
      router.push(result.data.redirectTo);
      router.refresh();
    });
    setPending(null);
  }

  return (
    <fieldset className="flex items-center gap-1 rounded-full border border-line bg-surface p-1" aria-label="Switch demo role">
      <legend className="sr-only">Switch demo role</legend>
      <ArrowLeftRight aria-hidden className="mx-2 hidden size-4 text-muted xl:block" />
      {DEMO_ACCOUNTS.map(account => {
        const active = account.role === currentRole;
        return (
          <button
            key={account.role}
            type="button"
            onClick={() => !active && switchTo(account.role)}
            aria-pressed={active}
            disabled={pending !== null}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors duration-150 disabled:cursor-wait ${
              active ? 'bg-ink text-white' : 'text-ink hover:bg-blush-tint'
            }`}
          >
            {active && <Check aria-hidden className="size-3.5" />}
            {pending === account.role ? 'Switching…' : ROLE_LABELS[account.role].replace(' Supervisor', '').replace('Cutting ', '')}
            <span className="sr-only"> ({ROLE_LABELS[account.role]})</span>
          </button>
        );
      })}
    </fieldset>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
      }}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium text-ink hover:bg-blush-tint disabled:cursor-wait"
    >
      <LogOut aria-hidden className="size-4" />
      <span className="hidden sm:inline">Sign out</span>
      <span className="sr-only sm:hidden">Sign out</span>
    </button>
  );
}
