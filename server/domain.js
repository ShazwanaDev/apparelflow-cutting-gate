export const ROLES = Object.freeze({
  SUPERVISOR: 'cutting_supervisor',
  VERIFIER: 'cutting_verifier',
  SEWING: 'sewing_supervisor',
});

export const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING_VERIFICATION',
  REJECTED: 'REJECTED',
  VERIFIED: 'VERIFIED',
  SEWING: 'IN_SEWING',
});

export function positiveInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function nonNegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function positiveDecimal(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function componentFlag(actual, expected) {
  if (actual == null) return 'UNCOUNTED';
  if (actual < expected) return 'RED';
  if (actual > expected) return 'YELLOW';
  return 'GREEN';
}

export function wastagePercent(actualFabric, standardFabric, targetQuantity) {
  const expected = standardFabric * targetQuantity;
  return Math.round(((actualFabric - expected) / expected) * 10000) / 100;
}
