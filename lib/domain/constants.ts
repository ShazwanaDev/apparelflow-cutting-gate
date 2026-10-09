export const ROLES = ['cutting_supervisor', 'cutting_verifier', 'sewing_supervisor'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  'CUTTING_IN_PROGRESS',
  'PENDING_VERIFICATION',
  'REJECTED',
  'VERIFIED',
  'IN_SEWING',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type CountFlag = 'GREEN' | 'YELLOW' | 'RED' | 'UNCOUNTED';

export const ROLE_LABELS: Record<Role, string> = {
  cutting_supervisor: 'Cutting Supervisor',
  cutting_verifier: 'Cutting Verifier',
  sewing_supervisor: 'Sewing Supervisor',
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  CUTTING_IN_PROGRESS: 'Cutting in progress',
  PENDING_VERIFICATION: 'Pending verification',
  REJECTED: 'Rejected',
  VERIFIED: 'Verified',
  IN_SEWING: 'In sewing',
};

export const FLAG_LABELS: Record<CountFlag, string> = {
  GREEN: 'Match',
  YELLOW: 'Excess',
  RED: 'Shortage',
  UNCOUNTED: 'Uncounted',
};

// Shared limits so the browser and the server reject the same inputs.
export const LIMITS = {
  maxTargetQty: 10_000,
  maxCount: 1_000_000,
  maxFabricYards: 100_000,
  minRejectReason: 10,
  maxRejectReason: 1_000,
} as const;
