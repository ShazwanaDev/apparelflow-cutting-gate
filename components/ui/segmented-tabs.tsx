'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Filter tabs that are plain links, so each filter has its own URL that can be
 * bookmarked, shared or opened with the back button. The active marker slides
 * between tabs with a shared layout animation.
 */
export function SegmentedTabs({
  id,
  label,
  tabs,
}: {
  id: string;
  label: string;
  tabs: Array<{ href: string; label: string; count?: number; active: boolean }>;
}) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="inline-flex min-w-max gap-1 rounded-full border border-line bg-surface p-1">
        {tabs.map(tab => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              scroll={false}
              aria-current={tab.active ? 'page' : undefined}
              className={`relative isolate inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-150 ${
                tab.active ? 'text-white' : 'text-ink hover:bg-blush-tint'
              }`}
            >
              {tab.active && (
                <motion.span
                  layoutId={`${id}-tab`}
                  className="absolute inset-0 -z-10 rounded-full bg-ink"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 40 }}
                />
              )}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`tabular min-w-6 rounded-full px-1.5 py-0.5 text-center font-mono text-xs ${
                    tab.active ? 'bg-white/20 text-white' : 'bg-sunken text-ink'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
