import type { OrderStatus } from './constants';
import type { Capability } from './permissions';

/**
 * Every status change the system allows. Anything not listed here is refused,
 * which is what stops a request from moving a rejected batch straight to sewing,
 * or approving the same batch twice.
 *
 *   CUTTING_IN_PROGRESS -> PENDING_VERIFICATION -> VERIFIED -> IN_SEWING
 *                               |       ^
 *                               v       |
 *                             REJECTED -+   (re-cut, then resubmit)
 */
export const TRANSITIONS = {
  submit: {
    from: ['CUTTING_IN_PROGRESS', 'REJECTED'],
    to: 'PENDING_VERIFICATION',
    capability: 'order:submit',
  },
  approve: {
    from: ['PENDING_VERIFICATION'],
    to: 'VERIFIED',
    capability: 'order:approve',
  },
  reject: {
    from: ['PENDING_VERIFICATION'],
    to: 'REJECTED',
    capability: 'order:reject',
  },
  startSewing: {
    from: ['VERIFIED'],
    to: 'IN_SEWING',
    capability: 'sewing:start',
  },
} as const satisfies Record<string, { from: readonly OrderStatus[]; to: OrderStatus; capability: Capability }>;

export type TransitionName = keyof typeof TRANSITIONS;

export function canTransition(from: OrderStatus, action: TransitionName): boolean {
  return (TRANSITIONS[action].from as readonly OrderStatus[]).includes(from);
}
