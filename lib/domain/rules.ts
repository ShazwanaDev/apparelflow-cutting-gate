import type { CountFlag } from './constants';

/**
 * How many pieces of one component the cutting table should produce.
 * Fifty blouses with two cuffs each means a hundred cuffs.
 */
export function expectedCount(targetQty: number, piecesPerGarment: number): number {
  const expected = targetQty * piecesPerGarment;
  if (!Number.isSafeInteger(expected) || expected <= 0) {
    throw new RangeError('Expected count must be a positive whole number');
  }
  return expected;
}

/**
 * The traffic light for one component. Anything short of the expected count is
 * a shortage, because a single missing sleeve means a garment that cannot be
 * finished on the sewing line. Extra pieces are recorded but do not block.
 */
export function flagFor(actual: number | null | undefined, expected: number): CountFlag {
  if (actual === null || actual === undefined) return 'UNCOUNTED';
  if (actual === expected) return 'GREEN';
  return actual > expected ? 'YELLOW' : 'RED';
}

export function varianceOf(actual: number | null | undefined, expected: number): number | null {
  return actual === null || actual === undefined ? null : actual - expected;
}

// Yard values carry at most two decimals, so the arithmetic below is done in
// whole hundredths of a yard. That keeps results like 1.8 x 50 exact instead of
// drifting to 89.99999 through binary floating point.
function toHundredths(yards: number): number {
  return Math.round(yards * 100);
}

export function expectedFabricYards(stdFabricYards: number, targetQty: number): number {
  return (toHundredths(stdFabricYards) * targetQty) / 100;
}

/**
 * Fabric used beyond the recipe standard, as a percentage of the standard,
 * rounded to two decimals. A negative value means the cutters used less than
 * the standard allowed.
 *
 * Example: 50 Casual Blouses at 1.8 yards each should use 90 yards. Using 92
 * yards is 2 yards over, which is 2.22% of 90.
 */
export function wastagePct(actualFabricYards: number, stdFabricYards: number, targetQty: number): number {
  const expected = toHundredths(stdFabricYards) * targetQty;
  if (expected <= 0) throw new RangeError('Expected fabric must be positive');
  const difference = toHundredths(actualFabricYards) - expected;
  // The percentage times 100, so rounding to a whole number keeps two decimals.
  const scaled = (difference * 10_000) / expected;
  // Round halves away from zero so that +2.225 and -2.225 round the same way.
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  // Adding zero turns a negative zero into a plain zero.
  return rounded / 100 + 0;
}

export function isOverWastageCap(wastage: number, cap: number): boolean {
  return wastage > cap;
}

export interface CountLine {
  name: string;
  expected: number;
  actual: number | null | undefined;
}

export interface CountSummary {
  match: number;
  excess: number;
  shortage: number;
  uncounted: number;
  canApprove: boolean;
  /** Plain-language reason approval is blocked, or null when it is allowed. */
  blockReason: string | null;
}

/**
 * Decides whether a batch may be approved. The browser uses this to grey out the
 * button and explain why; the server runs the same function on the stored counts
 * and refuses the approval if it says no.
 */
export function summarizeCounts(lines: CountLine[]): CountSummary {
  const summary = { match: 0, excess: 0, shortage: 0, uncounted: 0 };
  const short: string[] = [];
  const missing: string[] = [];

  for (const line of lines) {
    const flag = flagFor(line.actual, line.expected);
    if (flag === 'GREEN') summary.match += 1;
    else if (flag === 'YELLOW') summary.excess += 1;
    else if (flag === 'UNCOUNTED') {
      summary.uncounted += 1;
      missing.push(line.name);
    } else {
      summary.shortage += 1;
      short.push(`${line.name} ${formatSigned(varianceOf(line.actual, line.expected) ?? 0)}`);
    }
  }

  const reasons: string[] = [];
  if (lines.length === 0) reasons.push('This batch has no components to verify');
  if (short.length > 0) {
    reasons.push(`${short.length} ${short.length === 1 ? 'component' : 'components'} short: ${short.join(', ')}`);
  }
  if (missing.length > 0) {
    reasons.push(`${missing.length} not counted yet: ${missing.join(', ')}`);
  }

  return {
    ...summary,
    canApprove: reasons.length === 0,
    blockReason: reasons.length === 0 ? null : reasons.join('. '),
  };
}

/** "+3", "−4" or "0", using a real minus sign so it reads cleanly in tables. */
export function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}
