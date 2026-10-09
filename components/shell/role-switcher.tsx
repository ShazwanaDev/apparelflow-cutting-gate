'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { api } from '@/lib/client/api';

/**
 * Switching demo role is a real sign-out followed by a real sign-in as that
 * demo account. Nothing on the client decides what a role may see: the new
 * session cookie does, and the server reads the role from the database.
 */
export async function signInAs(email: string, password: string) {
  await api('/api/auth/logout', { method: 'POST' });
  return api<{ redirectTo: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
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
