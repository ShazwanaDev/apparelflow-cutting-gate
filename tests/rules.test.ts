import { describe, expect, it } from 'vitest';
import {
  expectedCount,
  expectedFabricYards,
  flagFor,
  formatSigned,
  isOverWastageCap,
  summarizeCounts,
  wastagePct,
} from '@/lib/domain/rules';
import { canTransition, TRANSITIONS } from '@/lib/domain/state-machine';
import { can } from '@/lib/domain/permissions';
import { ORDER_STATUSES } from '@/lib/domain/constants';

describe('component multiplier', () => {
  it('multiplies batch quantity by pieces per garment', () => {
    expect(expectedCount(50, 2)).toBe(100);
    expect(expectedCount(50, 1)).toBe(50);
    expect(expectedCount(1, 2)).toBe(2);
  });

  it('refuses results that are not positive whole numbers', () => {
    expect(() => expectedCount(0, 2)).toThrow(RangeError);
    expect(() => expectedCount(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });
});

describe('traffic-light flags', () => {
  it('is GREEN on an exact match, YELLOW on surplus, RED on shortage', () => {
    expect(flagFor(100, 100)).toBe('GREEN');
    expect(flagFor(103, 100)).toBe('YELLOW');
    expect(flagFor(96, 100)).toBe('RED');
    expect(flagFor(0, 100)).toBe('RED');
  });

  it('treats a missing count as UNCOUNTED, not as zero', () => {
    expect(flagFor(null, 100)).toBe('UNCOUNTED');
    expect(flagFor(undefined, 100)).toBe('UNCOUNTED');
  });
});

describe('fabric wastage', () => {
  it('matches the worked example: 92 yards against 50 x 1.8 is 2.22%', () => {
    expect(expectedFabricYards(1.8, 50)).toBe(90);
    expect(wastagePct(92, 1.8, 50)).toBe(2.22);
  });

  it('is exact for values that drift in floating point', () => {
    // 1.1 x 120 is 132.00000000000003 in plain floating point.
    expect(expectedFabricYards(1.1, 120)).toBe(132);
    expect(wastagePct(132, 1.1, 120)).toBe(0);
    expect(wastagePct(140.5, 1.1, 120)).toBe(6.44);
  });

  it('is negative when less fabric was used than the standard', () => {
    expect(wastagePct(85.5, 1.8, 50)).toBe(-5);
  });

  it('rounds to two decimals, with halves going away from zero', () => {
    // 3.01 yards against 3 is 0.333...%, which rounds to 0.33 either side of zero.
    expect(wastagePct(3.01, 1, 3)).toBe(0.33);
    expect(wastagePct(2.99, 1, 3)).toBe(-0.33);
    // 200.01 yards against 200 is exactly 0.005%, a half: it rounds up to 0.01,
    // and the matching shortfall rounds down to -0.01 rather than to zero.
    expect(wastagePct(200.01, 1, 200)).toBe(0.01);
    expect(wastagePct(199.99, 1, 200)).toBe(-0.01);
  });

  it('flags only values strictly over the recipe cap', () => {
    expect(isOverWastageCap(5, 5)).toBe(false);
    expect(isOverWastageCap(5.01, 5)).toBe(true);
  });
});

describe('approval summary', () => {
  const line = (name: string, expected: number, actual: number | null) => ({ name, expected, actual });

  it('allows approval when every component matches', () => {
    const summary = summarizeCounts([line('Front', 50, 50), line('Cuffs', 100, 100)]);
    expect(summary).toMatchObject({ match: 2, canApprove: true, blockReason: null });
  });

  it('allows approval with surplus (YELLOW) pieces', () => {
    const summary = summarizeCounts([line('Front', 50, 50), line('Cuffs', 100, 104)]);
    expect(summary).toMatchObject({ match: 1, excess: 1, canApprove: true });
  });

  it('blocks approval and names each shortage with its variance', () => {
    const summary = summarizeCounts([line('Sleeve Cuffs', 100, 96), line('Collar', 50, 49), line('Front', 50, 50)]);
    expect(summary.canApprove).toBe(false);
    expect(summary.shortage).toBe(2);
    expect(summary.blockReason).toBe('2 components short: Sleeve Cuffs −4, Collar −1');
  });

  it('blocks approval while any component is uncounted', () => {
    const summary = summarizeCounts([line('Front', 50, 50), line('Back', 50, null)]);
    expect(summary).toMatchObject({ uncounted: 1, canApprove: false });
    expect(summary.blockReason).toContain('not counted yet: Back');
  });

  it('blocks approval of a batch with no components at all', () => {
    expect(summarizeCounts([]).canApprove).toBe(false);
  });

  it('formats signed variances for display', () => {
    expect(formatSigned(3)).toBe('+3');
    expect(formatSigned(-4)).toBe('−4');
    expect(formatSigned(0)).toBe('0');
  });
});

describe('state machine', () => {
  it('allows only the documented transitions', () => {
    const allowed = ORDER_STATUSES.flatMap(status =>
      (Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>)
        .filter(action => canTransition(status, action))
        .map(action => `${status} -${action}-> ${TRANSITIONS[action].to}`),
    );
    expect(allowed.sort()).toEqual(
      [
        'CUTTING_IN_PROGRESS -submit-> PENDING_VERIFICATION',
        'PENDING_VERIFICATION -approve-> VERIFIED',
        'PENDING_VERIFICATION -reject-> REJECTED',
        'REJECTED -submit-> PENDING_VERIFICATION',
        'VERIFIED -startSewing-> IN_SEWING',
      ].sort(),
    );
  });

  it('never lets an order leave IN_SEWING or skip verification', () => {
    expect(canTransition('IN_SEWING', 'approve')).toBe(false);
    expect(canTransition('REJECTED', 'startSewing')).toBe(false);
    expect(canTransition('PENDING_VERIFICATION', 'startSewing')).toBe(false);
    expect(canTransition('VERIFIED', 'approve')).toBe(false);
  });

  it('keeps cutting and verification duties separate', () => {
    expect(can('cutting_supervisor', 'order:approve')).toBe(false);
    expect(can('cutting_verifier', 'order:create')).toBe(false);
    expect(can('cutting_verifier', 'sewing:read')).toBe(false);
    expect(can('cutting_supervisor', 'sewing:read')).toBe(false);
    expect(can('sewing_supervisor', 'order:list')).toBe(false);
    expect(can('sewing_supervisor', 'order:read')).toBe(false);
  });
});
