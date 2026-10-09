'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Modal dialog or side sheet. Radix handles the accessibility contract (focus
 * trap, Escape to close, focus returned to the trigger, aria-modal, labelling);
 * this wrapper adds the styling and a short fade-and-rise.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  variant = 'modal',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  variant?: 'modal' | 'sheet';
}) {
  const reduce = useReducedMotion();
  const sheet = variant === 'sheet';
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-ink/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </RadixDialog.Overlay>
            <div className={sheet ? 'contents' : 'pointer-events-none fixed inset-0 z-50 grid place-items-center p-4'}>
            <RadixDialog.Content asChild forceMount>
              <motion.div
                className={
                  sheet
                    ? 'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-hidden bg-surface shadow-[var(--shadow-floating)] sm:rounded-l-[20px]'
                    : 'pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-floating)]'
                }
                initial={reduce ? { opacity: 0 } : sheet ? { opacity: 0, x: 24 } : { opacity: 0, y: 12 }}
                animate={reduce ? { opacity: 1 } : sheet ? { opacity: 1, x: 0 } : { opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : sheet ? { opacity: 0, x: 24 } : { opacity: 0, y: 8 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                <header className="flex items-start justify-between gap-4 border-b border-line px-6 pt-6 pb-4">
                  <div>
                    <RadixDialog.Title className="font-display text-3xl leading-tight text-ink">{title}</RadixDialog.Title>
                    {description ? (
                      <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
                    ) : (
                      <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
                    )}
                  </div>
                  <RadixDialog.Close
                    className="-mt-1 -mr-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink hover:bg-blush-tint"
                    aria-label="Close"
                  >
                    <X aria-hidden className="size-5" />
                  </RadixDialog.Close>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
              </motion.div>
            </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
