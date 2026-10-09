'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';
import { ROLE_LABELS, type Role } from '@/lib/domain/constants';
import { signInAs } from './role-switcher';

/**
 * The demo role switcher, docked to the side of the screen so it stays out of
 * the working header. Choosing a role signs the current person out and signs in
 * as that demo account; it never changes the role of the current session.
 */
export function DemoDock({ currentRole }: { currentRole: Role }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Role | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !toggleRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  async function switchTo(role: Role) {
    const account = DEMO_ACCOUNTS.find(entry => entry.role === role)!;
    setPending(role);
    const result = await signInAs(account.email, account.password);
    setPending(null);
    if (!result.ok) {
      toast.error('Could not switch role', { description: result.error.message });
      return;
    }
    setOpen(false);
    toast.success(`Signed in as ${account.fullName}`, { description: ROLE_LABELS[role] });
    router.push(result.data.redirectTo);
    router.refresh();
  }

  return (
    <div className="fixed right-0 bottom-28 z-40 flex items-center sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="region"
            aria-label="Demo roles"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mr-2 w-[min(18rem,calc(100vw-4rem))] rounded-[20px] border border-line bg-surface p-4 shadow-[var(--shadow-floating)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="label-caps text-ink">Demo roles</p>
                <p className="mt-1 text-xs text-muted">Signs you out, then in as another demo person. For evaluation only.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toggleRef.current?.focus();
                }}
                aria-label="Close demo roles"
                className="-mt-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink hover:bg-blush-tint"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {DEMO_ACCOUNTS.map(account => {
                const active = account.role === currentRole;
                return (
                  <li key={account.role}>
                    <button
                      type="button"
                      onClick={() => !active && switchTo(account.role)}
                      aria-pressed={active}
                      disabled={pending !== null}
                      className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition-colors duration-150 disabled:cursor-wait ${
                        active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:border-ink hover:bg-blush-tint'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{account.fullName}</span>
                        <span className={`block text-xs ${active ? 'text-white/85' : 'text-muted'}`}>{ROLE_LABELS[account.role]}</span>
                      </span>
                      {active ? (
                        <Check aria-hidden className="size-4" />
                      ) : pending === account.role ? (
                        <span className="text-xs">Switching…</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-28 w-10 cursor-pointer flex-col items-center justify-center gap-2 rounded-l-[12px] border border-r-0 border-line-strong bg-ink py-3 text-white shadow-[var(--shadow-floating)] hover:bg-[#3a2f32]"
      >
        <ArrowLeftRight aria-hidden className="size-4" />
        <span className="label-caps [writing-mode:vertical-rl]">Demo roles</span>
      </button>
    </div>
  );
}
