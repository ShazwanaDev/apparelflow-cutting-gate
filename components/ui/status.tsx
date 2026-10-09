'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleCheck, CircleDashed, CircleX, Clock3, Scissors, Shirt, TriangleAlert, Undo2 } from 'lucide-react';
import { FLAG_LABELS, STATUS_LABELS, type CountFlag, type OrderStatus } from '@/lib/domain/constants';
import { formatSigned } from '@/lib/domain/rules';

const STATUS_STYLE: Record<OrderStatus, { className: string; Icon: typeof Clock3 }> = {
  CUTTING_IN_PROGRESS: { className: 'bg-sunken text-ink border-line-strong', Icon: Scissors },
  PENDING_VERIFICATION: { className: 'bg-aqua text-ink border-transparent', Icon: Clock3 },
  REJECTED: { className: 'bg-shortage-tint text-shortage border-shortage-line', Icon: Undo2 },
  VERIFIED: { className: 'bg-match-tint text-match border-match-line', Icon: CircleCheck },
  IN_SEWING: { className: 'bg-mint text-ink border-transparent', Icon: Shirt },
};

export function StatusBadge({ status, className = '' }: { status: OrderStatus; className?: string }) {
  const { className: tone, Icon } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${tone} ${className}`}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export const FLAG_STYLE: Record<CountFlag, { chip: string; dot: string; Icon: typeof Clock3 }> = {
  GREEN: { chip: 'bg-match-tint text-match border-match-line', dot: 'bg-match', Icon: CircleCheck },
  YELLOW: { chip: 'bg-excess-tint text-excess border-excess-line', dot: 'bg-excess', Icon: TriangleAlert },
  RED: { chip: 'bg-shortage-tint text-shortage border-shortage-line', dot: 'bg-shortage', Icon: CircleX },
  UNCOUNTED: { chip: 'bg-surface text-muted border-line-strong border-dashed', dot: 'bg-surface border border-line-strong', Icon: CircleDashed },
};

/**
 * The traffic light for one component: colour, icon, word and signed variance
 * together, so the status is readable without seeing colour at all.
 */
export function FlagChip({ flag, variance, compact = false }: { flag: CountFlag; variance?: number | null; compact?: boolean }) {
  const reduce = useReducedMotion();
  const { chip, Icon } = FLAG_STYLE[flag];
  return (
    <span className="relative inline-grid">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={flag}
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${chip}`}
        >
          <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
          <span>{FLAG_LABELS[flag].toUpperCase()}</span>
          {!compact && variance != null && variance !== 0 && <span className="tabular font-mono">{formatSigned(variance)}</span>}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function FlagDot({ flag }: { flag: CountFlag }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${FLAG_STYLE[flag].dot}`} />;
}
