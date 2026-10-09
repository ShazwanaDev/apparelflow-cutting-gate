import { z } from 'zod';
import { LIMITS } from './domain/constants';

/*
 * Request shapes, shared by the forms (for inline errors) and the API (as the
 * real gate). Objects are strict: a request carrying fields the server never
 * accepts from a client, such as `status`, `verifier_id` or `expected_qty`, is
 * refused rather than silently ignored, so tampering fails loudly.
 *
 * Numbers must arrive as JSON numbers. A string like "12" is refused instead of
 * coerced, because coercion is how "1e3", " 12 " and "0x1F" end up as counts.
 */

const id = z.number({ error: 'Must be a number' }).int('Must be a whole number').positive('Must be positive');

export const wholeCount = z
  .number({ error: 'Enter a number' })
  .int('Whole pieces only, no decimals')
  .min(0, 'Count cannot be negative')
  .max(LIMITS.maxCount, `Count cannot exceed ${LIMITS.maxCount.toLocaleString('en-US')}`);

export const targetQty = z
  .number({ error: 'Enter a batch quantity' })
  .int('Whole garments only, no decimals')
  .min(1, 'Batch quantity must be at least 1')
  .max(LIMITS.maxTargetQty, `Batch quantity cannot exceed ${LIMITS.maxTargetQty.toLocaleString('en-US')}`);

export const fabricYards = z
  .number({ error: 'Enter the fabric used in yards' })
  .positive('Fabric used must be more than 0')
  .max(LIMITS.maxFabricYards, `Fabric used cannot exceed ${LIMITS.maxFabricYards.toLocaleString('en-US')} yards`)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Use at most two decimal places');

export const fabricRollId = z
  .string({ error: 'Enter a fabric roll ID' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/, 'Use 3 to 40 letters, digits or dashes, e.g. FAB-ROLL-882');

export const createOrderSchema = z
  .strictObject({
    recipe_id: id,
    target_qty: targetQty,
    fabric_roll_id: fabricRollId,
    actual_fabric_yds: fabricYards.nullable().optional(),
    // false keeps the order in "cutting in progress" so yards can be logged later.
    submit: z.boolean().optional().default(true),
  })
  .refine(value => !value.submit || value.actual_fabric_yds != null, {
    path: ['actual_fabric_yds'],
    message: 'Log the fabric used before sending the batch for verification',
  });

export const submitOrderSchema = z.strictObject({
  actual_fabric_yds: fabricYards,
  fabric_roll_id: fabricRollId.optional(),
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
});

export const countsSchema = z
  .array(z.strictObject({ component_id: id, actual_qty: wholeCount }), { error: 'Provide the component counts' })
  .min(1, 'Provide at least one component count')
  .max(50, 'Too many components')
  .refine(rows => new Set(rows.map(row => row.component_id)).size === rows.length, 'Each component can be counted once');

export const saveCountsSchema = z.strictObject({ counts: countsSchema });

export const approveSchema = z.strictObject({ counts: countsSchema.optional() });

export const rejectReason = z
  .string({ error: 'A rejection reason is required' })
  .trim()
  .min(LIMITS.minRejectReason, `Explain the rejection in at least ${LIMITS.minRejectReason} characters`)
  .max(LIMITS.maxRejectReason, `Keep the reason under ${LIMITS.maxRejectReason} characters`);

export const rejectSchema = z.strictObject({
  reason: rejectReason,
  counts: countsSchema.optional(),
});

export const loginSchema = z.strictObject({
  email: z.string({ error: 'Enter your email' }).trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password').max(200),
});

export const listOrdersSchema = z.strictObject({
  status: z
    .enum(['CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION', 'REJECTED', 'VERIFIED', 'IN_SEWING'])
    .optional(),
  q: z.string().trim().max(60).optional(),
});

export const sewingTabSchema = z.enum(['ready', 'in_sewing']).catch('ready');

export interface FieldIssue {
  path: string;
  message: string;
}

export function issuesOf(error: z.ZodError): FieldIssue[] {
  return error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
}

/**
 * Turns a text field into a whole number, or explains why it is not one. Used
 * by the count inputs, which must never guess what a typo was meant to be.
 */
export function parseWholeNumberInput(raw: string, max: number = LIMITS.maxCount): { value: number | null; error: string | null } {
  const text = raw.trim();
  if (text === '') return { value: null, error: null };
  if (text.startsWith('-')) return { value: null, error: 'Cannot be negative' };
  if (/[.,]/.test(text)) return { value: null, error: 'Whole numbers only' };
  if (!/^\d+$/.test(text)) return { value: null, error: 'Numbers only' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > max) return { value: null, error: `Must be ${max.toLocaleString('en-US')} or less` };
  return { value, error: null };
}

/** Same idea for yards, which allow up to two decimals. */
export function parseYardsInput(raw: string): { value: number | null; error: string | null } {
  const text = raw.trim();
  if (text === '') return { value: null, error: null };
  if (text.startsWith('-')) return { value: null, error: 'Cannot be negative' };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { value: null, error: 'Use a number with up to two decimals' };
  const result = fabricYards.safeParse(Number(text));
  return result.success ? { value: result.data, error: null } : { value: null, error: result.error.issues[0]?.message ?? 'Invalid' };
}
