import { describe, expect, it } from 'vitest';
import {
  approveSchema,
  createOrderSchema,
  parseWholeNumberInput,
  parseYardsInput,
  rejectSchema,
  saveCountsSchema,
} from '@/lib/validation';

const validOrder = { recipe_id: 1, target_qty: 50, fabric_roll_id: 'fab-roll-882', actual_fabric_yds: 92 };

describe('order input guards', () => {
  it('accepts a valid order and normalises the roll ID', () => {
    const result = createOrderSchema.parse(validOrder);
    expect(result.fabric_roll_id).toBe('FAB-ROLL-882');
    expect(result.submit).toBe(true);
  });

  it.each([
    ['negative quantity', { target_qty: -5 }],
    ['zero quantity', { target_qty: 0 }],
    ['decimal quantity', { target_qty: 12.5 }],
    ['quantity as a string', { target_qty: '50' }],
    ['oversized quantity', { target_qty: 1e9 }],
    ['NaN-like string', { target_qty: 'abc' }],
    ['negative yards', { actual_fabric_yds: -1 }],
    ['three-decimal yards', { actual_fabric_yds: 1.005 }],
    ['blank roll ID', { fabric_roll_id: '   ' }],
    ['roll ID with spaces inside', { fabric_roll_id: 'FAB ROLL 882' }],
  ])('rejects %s', (_label, change) => {
    expect(createOrderSchema.safeParse({ ...validOrder, ...change }).success).toBe(false);
  });

  it('rejects an empty payload', () => {
    expect(createOrderSchema.safeParse({}).success).toBe(false);
  });

  it('refuses fields the client is never allowed to set', () => {
    expect(createOrderSchema.safeParse({ ...validOrder, status: 'VERIFIED' }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...validOrder, created_by: 2 }).success).toBe(false);
  });

  it('requires fabric yards before an order is submitted for verification', () => {
    expect(createOrderSchema.safeParse({ ...validOrder, actual_fabric_yds: undefined }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...validOrder, actual_fabric_yds: undefined, submit: false }).success).toBe(true);
  });
});

describe('count input guards', () => {
  const counts = (actual_qty: unknown) => ({ counts: [{ component_id: 1, actual_qty }] });

  it('accepts zero and positive whole counts', () => {
    expect(saveCountsSchema.safeParse(counts(0)).success).toBe(true);
    expect(saveCountsSchema.safeParse(counts(100)).success).toBe(true);
  });

  it.each([[-1], [2.5], ['12'], [null], [1e12], [Number.NaN]])('rejects %s as a count', value => {
    expect(saveCountsSchema.safeParse(counts(value)).success).toBe(false);
  });

  it('rejects duplicate components and an empty list', () => {
    expect(saveCountsSchema.safeParse({ counts: [] }).success).toBe(false);
    expect(
      saveCountsSchema.safeParse({ counts: [{ component_id: 1, actual_qty: 1 }, { component_id: 1, actual_qty: 2 }] }).success,
    ).toBe(false);
  });

  it('refuses client-supplied flags, expected counts or verifier IDs', () => {
    expect(saveCountsSchema.safeParse({ counts: [{ component_id: 1, actual_qty: 5, status: 'GREEN' }] }).success).toBe(false);
    expect(saveCountsSchema.safeParse({ counts: [{ component_id: 1, actual_qty: 5, expected_qty: 5 }] }).success).toBe(false);
    expect(approveSchema.safeParse({ verifier_id: 1 }).success).toBe(false);
  });
});

describe('rejection reason', () => {
  it.each([[''], ['   '], ['too short'], [undefined]])('rejects %j', reason => {
    expect(rejectSchema.safeParse({ reason }).success).toBe(false);
  });

  it('trims before measuring length', () => {
    expect(rejectSchema.safeParse({ reason: '   short    ' }).success).toBe(false);
    expect(rejectSchema.parse({ reason: '  Cuffs are four pieces short  ' }).reason).toBe('Cuffs are four pieces short');
  });
});

describe('text field parsing used by the count and yard inputs', () => {
  it('parses whole numbers and explains anything else', () => {
    expect(parseWholeNumberInput('42')).toEqual({ value: 42, error: null });
    expect(parseWholeNumberInput('')).toEqual({ value: null, error: null });
    expect(parseWholeNumberInput('-3').error).toBe('Cannot be negative');
    expect(parseWholeNumberInput('4.5').error).toBe('Whole numbers only');
    expect(parseWholeNumberInput('1e3').error).toBe('Numbers only');
    expect(parseWholeNumberInput('99999999999999999999').error).toMatch(/or less/);
  });

  it('parses yards with up to two decimals', () => {
    expect(parseYardsInput('92.5')).toEqual({ value: 92.5, error: null });
    expect(parseYardsInput('92.555').error).toBeTruthy();
    expect(parseYardsInput('0').error).toBeTruthy();
    expect(parseYardsInput('abc').error).toBeTruthy();
  });
});
