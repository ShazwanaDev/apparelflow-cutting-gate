'use client';

import { motion, useReducedMotion } from 'motion/react';
import { STAGES, type Stage } from '@/lib/stages';

/**
 * CUTTING · VERIFICATION · SEWING. Shows where the signed-in role sits in the
 * handoff. It is orientation, not navigation: each role only works in its own
 * stage, so the other stages are not links.
 */
export function PipelineStepper({ active }: { active: Stage }) {
  const reduce = useReducedMotion();
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label="Production stages">
      {STAGES.map((stage, index) => {
        const isActive = stage === active;
        return (
          <li key={stage} className="flex items-center gap-1 sm:gap-2">
            {index > 0 && <span aria-hidden className="h-px w-3 bg-line-strong sm:w-6" />}
            <span
              aria-current={isActive ? 'step' : undefined}
              className={`relative isolate inline-flex min-h-8 items-center rounded-full px-2.5 label-caps sm:px-3 ${isActive ? 'text-ink' : 'text-muted'}`}
            >
              {isActive && (
                <motion.span
                  layoutId="pipeline-active"
                  className="absolute inset-0 -z-10 rounded-full bg-coral"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 }}
                />
              )}
              <span className="tabular mr-1.5 hidden font-mono text-[10px] sm:inline">0{index + 1}</span>
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The oversized stage title, with the neighbouring stages ghosted above and
 * below it, so the page always says which part of the handoff you are in.
 */
export function StageHeader({ stage, title, children }: { stage: Stage; title?: string; children?: React.ReactNode }) {
  const index = STAGES.indexOf(stage);
  const before = STAGES[index - 1];
  const after = STAGES[index + 1];
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div aria-hidden className="h-7 sm:h-9">
          {before && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
              className="font-display text-2xl leading-none text-ink/20 select-none sm:text-3xl"
            >
              {before}
            </motion.p>
          )}
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="font-display text-5xl leading-[0.95] tracking-tight text-ink sm:text-7xl"
        >
          {title ?? stage}
        </motion.h1>
        <div aria-hidden className="h-7 pt-1.5 sm:h-9">
          {after && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05, ease }}
              className="font-display text-2xl leading-none text-ink/20 select-none sm:text-3xl"
            >
              {after}
            </motion.p>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3 md:pb-8">{children}</div>}
    </header>
  );
}
