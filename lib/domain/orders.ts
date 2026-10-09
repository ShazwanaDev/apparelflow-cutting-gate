import type { z } from 'zod';
import type { Database, Queryable } from '@/lib/server/db';
import type { CountFlag, OrderStatus, Role } from './constants';
import { DomainError } from './errors';
import { can, type Capability } from './permissions';
import { expectedCount, expectedFabricYards, isOverWastageCap, summarizeCounts, varianceOf, wastagePct } from './rules';
import { canTransition, TRANSITIONS, type TransitionName } from './state-machine';
import {
  approveSchema,
  createOrderSchema,
  issuesOf,
  listOrdersSchema,
  rejectSchema,
  saveCountsSchema,
  submitOrderSchema,
} from '@/lib/validation';

/*
 * The cutting gate's business rules. Route handlers authenticate the caller and
 * pass the raw request body straight here; everything else (permission checks,
 * input validation, the state machine and the hard stop) happens in this file,
 * inside database transactions.
 *
 * The caller's identity always comes from the `actor` argument, which the route
 * builds from the signed session cookie. Nothing in a request body can choose
 * who is acting, when it happened, or what the expected counts are.
 */

export interface Actor {
  id: number;
  role: Role;
  fullName: string;
}

export interface OrderItem {
  componentId: number;
  componentName: string;
  piecesPerGarment: number;
  expectedQty: number;
  actualQty: number | null;
  status: CountFlag;
  variance: number | null;
}

export interface VerificationLog {
  id: number;
  decision: 'APPROVED' | 'REJECTED';
  verifierId: number;
  verifierName: string;
  rejectionNote: string | null;
  wastagePct: number;
  items: Array<{ componentId: number; componentName: string; expectedQty: number; actualQty: number | null; status: CountFlag; variance: number | null }>;
  createdAt: string;
}

export interface OrderEvent {
  id: number;
  eventType: string;
  actorName: string;
  actorRole: Role;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface OrderSummary {
  id: number;
  orderNo: string;
  status: OrderStatus;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number | null;
  recipeCode: string;
  recipeName: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  latestRejectionNote: string | null;
}

export interface OrderDetail extends OrderSummary {
  recipeId: number;
  recipeCategory: string;
  stdFabricYards: number;
  wastageCap: number;
  expectedFabricYds: number;
  wastagePct: number | null;
  overWastageCap: boolean;
  verifiedAt: string | null;
  sewingStartedAt: string | null;
  items: OrderItem[];
  logs: VerificationLog[];
  events: OrderEvent[];
}

// ---------------------------------------------------------------------------
// Guards

function assertCan(actor: Actor, capability: Capability) {
  if (!can(actor.role, capability)) {
    throw new DomainError('FORBIDDEN', 'Your role is not allowed to do this.');
  }
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new DomainError('VALIDATION_FAILED', result.error.issues[0]?.message ?? 'Invalid request', {
      issues: issuesOf(result.error),
    });
  }
  return result.data;
}

function assertTransition(order: { orderNo: string; status: OrderStatus }, action: TransitionName) {
  if (!canTransition(order.status, action)) {
    const allowed = TRANSITIONS[action].from.join(' or ');
    throw new DomainError(
      'INVALID_STATE',
      `${order.orderNo} is ${order.status}. This action needs it to be ${allowed}.`,
      { currentStatus: order.status },
    );
  }
}

/**
 * Moves an order to the transition's target status, but only if it is still in
 * one of the allowed starting statuses. The status check lives in the WHERE
 * clause, so even two requests racing each other cannot both succeed.
 */
async function applyTransition(tx: Queryable, orderId: number, action: TransitionName, extraSet = '') {
  const { from, to } = TRANSITIONS[action];
  const result = await tx.query(
    `UPDATE cutting_orders
        SET status = $2, updated_at = now() ${extraSet}
      WHERE id = $1 AND status = ANY(string_to_array($3, ',')::order_status[])`,
    [orderId, to, from.join(',')],
  );
  if (result.rowCount !== 1) {
    throw new DomainError('INVALID_STATE', 'This order changed while you were working on it. Reload and try again.');
  }
}

async function recordEvent(
  tx: Queryable,
  orderId: number,
  actor: Actor,
  eventType: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  note: string | null = null,
) {
  await tx.query(
    `INSERT INTO order_events (order_id, actor_id, event_type, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, actor.id, eventType, fromStatus, toStatus, note],
  );
}

// ---------------------------------------------------------------------------
// Reading

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value == null ? null : String(value));

const SUMMARY_COLUMNS = `
  o.id, o.order_no, o.status, o.target_qty, o.fabric_roll_id, o.actual_fabric_yds,
  o.created_at, o.updated_at, o.submitted_at, o.verified_at, o.sewing_started_at,
  r.id AS recipe_id, r.recipe_code, r.name AS recipe_name, r.category AS recipe_category,
  r.std_fabric_yards, r.wastage_cap,
  u.full_name AS created_by_name,
  (SELECT l.rejection_note FROM verification_logs l
    WHERE l.order_id = o.id AND l.decision = 'REJECTED'
    ORDER BY l.created_at DESC, l.id DESC LIMIT 1) AS latest_rejection_note`;

const SUMMARY_FROM = `
  FROM cutting_orders o
  JOIN recipes r ON r.id = o.recipe_id
  JOIN users u ON u.id = o.created_by`;

const SUMMARY_SELECT = `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM}`;

type SummaryRow = {
  id: number;
  order_no: string;
  status: OrderStatus;
  target_qty: number;
  fabric_roll_id: string;
  actual_fabric_yds: number | null;
  created_at: Date;
  updated_at: Date;
  submitted_at: Date | null;
  verified_at: Date | null;
  sewing_started_at: Date | null;
  recipe_id: number;
  recipe_code: string;
  recipe_name: string;
  recipe_category: string;
  std_fabric_yards: number;
  wastage_cap: number;
  created_by_name: string;
  latest_rejection_note: string | null;
};

function toSummary(row: SummaryRow): OrderSummary {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    targetQty: row.target_qty,
    fabricRollId: row.fabric_roll_id,
    actualFabricYds: row.actual_fabric_yds,
    recipeCode: row.recipe_code,
    recipeName: row.recipe_name,
    createdByName: row.created_by_name,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    submittedAt: iso(row.submitted_at),
    latestRejectionNote: row.status === 'REJECTED' ? row.latest_rejection_note : null,
  };
}

/**
 * Loads one order with its counts and history. `allowedStatuses` narrows the
 * lookup inside the SQL itself, which is how the sewing floor is kept from ever
 * loading an unverified batch: the row simply is not found.
 */
async function loadDetail(q: Queryable, orderId: number, allowedStatuses?: readonly OrderStatus[], lock = false): Promise<OrderDetail> {
  const params: unknown[] = [orderId];
  let where = 'WHERE o.id = $1';
  if (allowedStatuses) {
    params.push(allowedStatuses.join(','));
    where += " AND o.status = ANY(string_to_array($2, ',')::order_status[])";
  }
  const { rows } = await q.query<SummaryRow>(`${SUMMARY_SELECT} ${where} ${lock ? 'FOR UPDATE OF o' : ''}`, params);
  const row = rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 'Order not found.');

  const [items, logs, events] = await Promise.all([
    q.query<{
      component_id: number;
      component_name: string;
      pieces_per_garment: number;
      expected_qty: number;
      actual_qty: number | null;
      status: CountFlag;
    }>(
      `SELECT vi.component_id, rc.component_name, rc.pieces_per_garment, vi.expected_qty, vi.actual_qty, vi.status
         FROM verification_items vi
         JOIN recipe_components rc ON rc.id = vi.component_id
        WHERE vi.order_id = $1
        ORDER BY rc.sort_order, rc.id`,
      [orderId],
    ),
    q.query<{
      id: number;
      decision: 'APPROVED' | 'REJECTED';
      verifier_id: number;
      verifier_name: string;
      rejection_note: string | null;
      wastage_pct: number;
      items: VerificationLog['items'];
      created_at: Date;
    }>(
      `SELECT l.id, l.decision, l.verifier_id, u.full_name AS verifier_name, l.rejection_note,
              l.wastage_pct, l.items, l.created_at
         FROM verification_logs l JOIN users u ON u.id = l.verifier_id
        WHERE l.order_id = $1
        ORDER BY l.created_at DESC, l.id DESC`,
      [orderId],
    ),
    q.query<{
      id: number;
      event_type: string;
      actor_name: string;
      actor_role: Role;
      from_status: OrderStatus | null;
      to_status: OrderStatus;
      note: string | null;
      created_at: Date;
    }>(
      `SELECT e.id, e.event_type, u.full_name AS actor_name, u.role AS actor_role,
              e.from_status, e.to_status, e.note, e.created_at
         FROM order_events e JOIN users u ON u.id = e.actor_id
        WHERE e.order_id = $1
        ORDER BY e.created_at, e.id`,
      [orderId],
    ),
  ]);

  const wastage = row.actual_fabric_yds == null ? null : wastagePct(row.actual_fabric_yds, row.std_fabric_yards, row.target_qty);

  return {
    ...toSummary(row),
    recipeId: row.recipe_id,
    recipeCategory: row.recipe_category,
    stdFabricYards: row.std_fabric_yards,
    wastageCap: row.wastage_cap,
    expectedFabricYds: expectedFabricYards(row.std_fabric_yards, row.target_qty),
    wastagePct: wastage,
    overWastageCap: wastage != null && isOverWastageCap(wastage, row.wastage_cap),
    verifiedAt: iso(row.verified_at),
    sewingStartedAt: iso(row.sewing_started_at),
    items: items.rows.map(item => ({
      componentId: item.component_id,
      componentName: item.component_name,
      piecesPerGarment: item.pieces_per_garment,
      expectedQty: item.expected_qty,
      actualQty: item.actual_qty,
      status: item.status,
      variance: varianceOf(item.actual_qty, item.expected_qty),
    })),
    logs: logs.rows.map(log => ({
      id: log.id,
      decision: log.decision,
      verifierId: log.verifier_id,
      verifierName: log.verifier_name,
      rejectionNote: log.rejection_note,
      wastagePct: log.wastage_pct,
      items: log.items,
      createdAt: iso(log.created_at)!,
    })),
    events: events.rows.map(event => ({
      id: event.id,
      eventType: event.event_type,
      actorName: event.actor_name,
      actorRole: event.actor_role,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      note: event.note,
      createdAt: iso(event.created_at)!,
    })),
  };
}

export async function listOrders(db: Database, actor: Actor, input: unknown = {}) {
  assertCan(actor, 'order:list');
  const filter = parse(listOrdersSchema, input);
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`o.status = $${params.length}`);
  }
  if (filter.q) {
    // Escape LIKE wildcards so a search for "50%" means the literal text.
    params.push(`%${filter.q.replace(/[\\%_]/g, char => `\\${char}`)}%`);
    conditions.push(`(o.order_no ILIKE $${params.length} OR o.fabric_roll_id ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // The verification queue is first in, first out: the oldest submission is the
  // bundle that has been waiting longest at the QC table.
  const order = filter.status === 'PENDING_VERIFICATION' ? 'o.submitted_at ASC, o.id ASC' : 'o.updated_at DESC, o.id DESC';
  const { rows } = await db.query<SummaryRow>(`${SUMMARY_SELECT} ${where} ORDER BY ${order} LIMIT 200`, params);

  const counts = await db.query<{ status: OrderStatus; count: number }>(
    'SELECT status, count(*)::int AS count FROM cutting_orders GROUP BY status',
  );
  return {
    orders: rows.map(toSummary),
    counts: Object.fromEntries(counts.rows.map(row => [row.status, row.count])) as Partial<Record<OrderStatus, number>>,
  };
}

export async function getOrder(db: Database, actor: Actor, orderId: number): Promise<OrderDetail> {
  assertCan(actor, 'order:read');
  return loadDetail(db, orderId);
}

export async function listRecipes(db: Database, actor: Actor) {
  assertCan(actor, 'recipe:read');
  const { rows } = await db.query<{
    id: number;
    recipe_code: string;
    name: string;
    category: string;
    std_fabric_yards: number;
    wastage_cap: number;
    components: Array<{ id: number; component_name: string; pieces_per_garment: number; image_url: string | null }>;
  }>(
    `SELECT r.id, r.recipe_code, r.name, r.category, r.std_fabric_yards, r.wastage_cap,
            coalesce(json_agg(json_build_object(
              'id', c.id, 'component_name', c.component_name,
              'pieces_per_garment', c.pieces_per_garment, 'image_url', c.image_url
            ) ORDER BY c.sort_order, c.id) FILTER (WHERE c.id IS NOT NULL), '[]') AS components
       FROM recipes r LEFT JOIN recipe_components c ON c.recipe_id = r.id
      GROUP BY r.id
      ORDER BY r.recipe_code`,
  );
  return rows.map(row => ({
    id: row.id,
    recipeCode: row.recipe_code,
    name: row.name,
    category: row.category,
    stdFabricYards: row.std_fabric_yards,
    wastageCap: row.wastage_cap,
    components: row.components.map(component => ({
      id: component.id,
      componentName: component.component_name,
      piecesPerGarment: component.pieces_per_garment,
      imageUrl: component.image_url,
    })),
  }));
}

export type Recipe = Awaited<ReturnType<typeof listRecipes>>[number];

// ---------------------------------------------------------------------------
// Cutting supervisor

export async function createOrder(db: Database, actor: Actor, input: unknown): Promise<OrderDetail> {
  assertCan(actor, 'order:create');
  const data = parse(createOrderSchema, input);

  return db.transaction(async tx => {
    const components = await tx.query<{ id: number; pieces_per_garment: number }>(
      'SELECT id, pieces_per_garment FROM recipe_components WHERE recipe_id = $1 ORDER BY sort_order, id',
      [data.recipe_id],
    );
    if (components.rows.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'That recipe does not exist or has no components.', {
        issues: [{ path: 'recipe_id', message: 'Choose a recipe from the list' }],
      });
    }

    const status: OrderStatus = data.submit ? 'PENDING_VERIFICATION' : 'CUTTING_IN_PROGRESS';
    const inserted = await tx.query<{ id: number }>(
      `INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, status, created_by, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5::order_status = 'PENDING_VERIFICATION' THEN now() END)
       RETURNING id`,
      [data.recipe_id, data.target_qty, data.fabric_roll_id, data.actual_fabric_yds ?? null, status, actor.id],
    );
    const orderId = inserted.rows[0]!.id;

    // The multiplier runs here, on the server, from the recipe in the database.
    // Whatever preview the browser showed is never used.
    for (const component of components.rows) {
      await tx.query('INSERT INTO verification_items (order_id, component_id, expected_qty) VALUES ($1, $2, $3)', [
        orderId,
        component.id,
        expectedCount(data.target_qty, component.pieces_per_garment),
      ]);
    }

    await recordEvent(tx, orderId, actor, 'CREATED', null, 'CUTTING_IN_PROGRESS');
    if (data.submit) await recordEvent(tx, orderId, actor, 'SUBMITTED', 'CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION');
    return loadDetail(tx, orderId);
  });
}

/**
 * Sends a batch to the QC table: either a fresh one that has finished cutting,
 * or a rejected one that has been re-cut. A resubmitted batch starts its count
 * from scratch; the counts that failed stay visible in the rejection log.
 */
export async function submitOrder(db: Database, actor: Actor, orderId: number, input: unknown): Promise<OrderDetail> {
  assertCan(actor, 'order:submit');
  const data = parse(submitOrderSchema, input);

  return db.transaction(async tx => {
    const order = await loadDetail(tx, orderId, undefined, true);
    assertTransition(order, 'submit');
    const resubmission = order.status === 'REJECTED';

    await tx.query(
      `UPDATE cutting_orders SET actual_fabric_yds = $2, fabric_roll_id = coalesce($3, fabric_roll_id) WHERE id = $1`,
      [orderId, data.actual_fabric_yds, data.fabric_roll_id ?? null],
    );
    if (resubmission) {
      await tx.query('UPDATE verification_items SET actual_qty = NULL, counted_at = NULL WHERE order_id = $1', [orderId]);
    }
    await applyTransition(tx, orderId, 'submit', ', submitted_at = now()');
    await recordEvent(
      tx,
      orderId,
      actor,
      resubmission ? 'RESUBMITTED' : 'SUBMITTED',
      order.status,
      'PENDING_VERIFICATION',
      data.note || null,
    );
    return loadDetail(tx, orderId);
  });
}

// ---------------------------------------------------------------------------
// Cutting verifier

async function writeCounts(tx: Queryable, order: OrderDetail, counts: Array<{ component_id: number; actual_qty: number }>) {
  const known = new Set(order.items.map(item => item.componentId));
  const unknown = counts.filter(count => !known.has(count.component_id));
  if (unknown.length > 0) {
    throw new DomainError('VALIDATION_FAILED', 'One or more counts are for components that are not in this batch.', {
      issues: unknown.map(count => ({ path: `counts.${count.component_id}`, message: 'Not part of this recipe' })),
    });
  }
  for (const count of counts) {
    await tx.query(
      `UPDATE verification_items SET actual_qty = $3, counted_at = now()
        WHERE order_id = $1 AND component_id = $2`,
      [order.id, count.component_id, count.actual_qty],
    );
  }
}

/** Saves counts as the verifier works, so a reload or a dropped tablet loses nothing. */
export async function saveCounts(db: Database, actor: Actor, orderId: number, input: unknown): Promise<OrderDetail> {
  assertCan(actor, 'order:count');
  const data = parse(saveCountsSchema, input);
  return db.transaction(async tx => {
    const order = await loadDetail(tx, orderId, undefined, true);
    if (order.status !== 'PENDING_VERIFICATION') {
      throw new DomainError('INVALID_STATE', `${order.orderNo} is ${order.status}. Counts can only change while it is pending verification.`, {
        currentStatus: order.status,
      });
    }
    await writeCounts(tx, order, data.counts);
    await tx.query('UPDATE cutting_orders SET updated_at = now() WHERE id = $1', [orderId]);
    return loadDetail(tx, orderId);
  });
}

function snapshot(order: OrderDetail): VerificationLog['items'] {
  return order.items.map(item => ({
    componentId: item.componentId,
    componentName: item.componentName,
    expectedQty: item.expectedQty,
    actualQty: item.actualQty,
    status: item.status,
    variance: item.variance,
  }));
}

/**
 * The hard stop. Approval succeeds only if every component has been counted and
 * none is short. The decision is made from the counts stored in the database
 * after this request's counts are written, never from flags a client sent, and
 * if it fails the whole transaction is rolled back so nothing changes.
 */
export async function approveOrder(db: Database, actor: Actor, orderId: number, input: unknown): Promise<OrderDetail> {
  assertCan(actor, 'order:approve');
  const data = parse(approveSchema, input);

  return db.transaction(async tx => {
    let order = await loadDetail(tx, orderId, undefined, true);
    assertTransition(order, 'approve');

    if (data.counts) {
      await writeCounts(tx, order, data.counts);
      order = await loadDetail(tx, orderId);
    }

    const summary = summarizeCounts(
      order.items.map(item => ({ name: item.componentName, expected: item.expectedQty, actual: item.actualQty })),
    );
    if (!summary.canApprove) {
      throw new DomainError('HARD_STOP', `Approval blocked. ${summary.blockReason}.`, {
        shortages: order.items.filter(item => item.status === 'RED').map(item => ({ componentId: item.componentId, componentName: item.componentName, variance: item.variance })),
        uncounted: order.items.filter(item => item.status === 'UNCOUNTED').map(item => ({ componentId: item.componentId, componentName: item.componentName })),
      });
    }

    await tx.query(
      `INSERT INTO verification_logs (order_id, verifier_id, decision, wastage_pct, items)
       VALUES ($1, $2, 'APPROVED', $3, $4::jsonb)`,
      [orderId, actor.id, order.wastagePct, JSON.stringify(snapshot(order))],
    );
    await applyTransition(tx, orderId, 'approve', ', verified_at = now()');
    await recordEvent(tx, orderId, actor, 'APPROVED', order.status, 'VERIFIED');
    return loadDetail(tx, orderId);
  });
}

export async function rejectOrder(db: Database, actor: Actor, orderId: number, input: unknown): Promise<OrderDetail> {
  assertCan(actor, 'order:reject');
  const data = parse(rejectSchema, input);

  return db.transaction(async tx => {
    let order = await loadDetail(tx, orderId, undefined, true);
    assertTransition(order, 'reject');
    if (data.counts) {
      await writeCounts(tx, order, data.counts);
      order = await loadDetail(tx, orderId);
    }

    await tx.query(
      `INSERT INTO verification_logs (order_id, verifier_id, decision, rejection_note, wastage_pct, items)
       VALUES ($1, $2, 'REJECTED', $3, $4, $5::jsonb)`,
      [orderId, actor.id, data.reason, order.wastagePct, JSON.stringify(snapshot(order))],
    );
    await applyTransition(tx, orderId, 'reject');
    await recordEvent(tx, orderId, actor, 'REJECTED', order.status, 'REJECTED', data.reason);
    return loadDetail(tx, orderId);
  });
}

// ---------------------------------------------------------------------------
// Sewing supervisor

/**
 * The only statuses the sewing floor can ever load. Written into each query as
 * a literal, rather than passed in, so no request parameter can widen it.
 */
const SEWING_VISIBLE = ['VERIFIED', 'IN_SEWING'] as const;

export interface SewingBatch extends OrderSummary {
  verifierName: string;
  verifiedAt: string;
  wastagePct: number;
  wastageCap: number;
  overWastageCap: boolean;
  sewingStartedAt: string | null;
  excessComponents: number;
}

export async function sewingQueue(db: Database, actor: Actor, tab: 'ready' | 'in_sewing'): Promise<SewingBatch[]> {
  assertCan(actor, 'sewing:read');
  const tabStatus = tab === 'in_sewing' ? 'IN_SEWING' : 'VERIFIED';
  const { rows } = await db.query<
    SummaryRow & { verifier_name: string; approved_at: Date; approved_wastage: number; excess_components: number }
  >(
    `SELECT ${SUMMARY_COLUMNS}, approval.verifier_name, approval.approved_at, approval.approved_wastage, excess.excess_components
     ${SUMMARY_FROM}
     JOIN LATERAL (
       SELECT v.full_name AS verifier_name, l.created_at AS approved_at, l.wastage_pct AS approved_wastage
         FROM verification_logs l JOIN users v ON v.id = l.verifier_id
        WHERE l.order_id = o.id AND l.decision = 'APPROVED'
        ORDER BY l.created_at DESC, l.id DESC LIMIT 1
     ) approval ON true
     CROSS JOIN LATERAL (
       SELECT count(*)::int AS excess_components FROM verification_items vi
        WHERE vi.order_id = o.id AND vi.status = 'YELLOW'
     ) excess
     WHERE o.status IN ('VERIFIED', 'IN_SEWING')
       AND o.status = $1
     ORDER BY o.verified_at ASC, o.id ASC
     LIMIT 200`,
    [tabStatus],
  );
  return rows.map(row => ({
    ...toSummary(row),
    verifierName: row.verifier_name,
    verifiedAt: iso(row.approved_at)!,
    wastagePct: row.approved_wastage,
    wastageCap: row.wastage_cap,
    overWastageCap: isOverWastageCap(row.approved_wastage, row.wastage_cap),
    sewingStartedAt: iso(row.sewing_started_at),
    excessComponents: row.excess_components,
  }));
}

/**
 * One batch for the sewing floor. An order that is not yet verified answers
 * exactly like one that does not exist, so guessing IDs reveals nothing.
 */
export async function getSewingBatch(db: Database, actor: Actor, orderId: number): Promise<OrderDetail> {
  assertCan(actor, 'sewing:read');
  return loadDetail(db, orderId, SEWING_VISIBLE);
}

export async function startSewing(db: Database, actor: Actor, orderId: number): Promise<OrderDetail> {
  assertCan(actor, 'sewing:start');
  return db.transaction(async tx => {
    const order = await loadDetail(tx, orderId, SEWING_VISIBLE, true);
    assertTransition(order, 'startSewing');
    await applyTransition(tx, orderId, 'startSewing', ', sewing_started_at = now()');
    await recordEvent(tx, orderId, actor, 'SEWING_STARTED', order.status, 'IN_SEWING');
    return loadDetail(tx, orderId, SEWING_VISIBLE);
  });
}
