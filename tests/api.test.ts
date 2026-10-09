import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, type TestApp } from './helpers';
import * as login from '@/app/api/auth/login/route';
import * as me from '@/app/api/auth/me/route';
import * as orders from '@/app/api/orders/route';
import * as orderDetail from '@/app/api/orders/[id]/route';
import * as submit from '@/app/api/orders/[id]/submit/route';
import * as counts from '@/app/api/orders/[id]/counts/route';
import * as approve from '@/app/api/orders/[id]/approve/route';
import * as reject from '@/app/api/orders/[id]/reject/route';
import * as sewingQueue from '@/app/api/sewing/queue/route';
import * as sewingDetail from '@/app/api/sewing/[id]/route';
import * as sewingStart from '@/app/api/sewing/[id]/start/route';
import type { OrderDetail } from '@/lib/domain/orders';

/*
 * These tests drive the real route handlers with real signed session cookies
 * against a real (in-memory) Postgres. They are the same requests an evaluator
 * would send with cURL or Postman.
 */

let app: TestApp;
let supervisor: string;
let verifier: string;
let sewing: string;

beforeAll(async () => {
  app = await createTestApp();
  [supervisor, verifier, sewing] = await Promise.all([
    app.cookie('cutting_supervisor'),
    app.cookie('cutting_verifier'),
    app.cookie('sewing_supervisor'),
  ]);
});

afterAll(async () => {
  await app.close();
});

async function newPendingOrder(targetQty = 50): Promise<OrderDetail> {
  const result = await call(orders.POST, {
    method: 'POST',
    cookie: supervisor,
    body: { recipe_id: app.recipeId('REC-BL01'), target_qty: targetQty, fabric_roll_id: 'FAB-ROLL-882', actual_fabric_yds: 92 },
  });
  expect(result.status).toBe(201);
  return result.body.order;
}

const exactCounts = (order: OrderDetail, adjust: Record<string, number> = {}) =>
  order.items.map(item => ({ component_id: item.componentId, actual_qty: item.expectedQty + (adjust[item.componentName] ?? 0) }));

const params = (order: { id: number }) => ({ id: String(order.id) });

async function sewingQueueIds(tab?: string) {
  const path = tab ? `/api/sewing/queue?tab=${tab}` : '/api/sewing/queue';
  const result = await call(sewingQueue.GET, { path, cookie: sewing });
  expect(result.status).toBe(200);
  return (result.body.orders as Array<{ id: number }>).map(order => order.id);
}

describe('required test 1: an all-GREEN order can be approved by a verifier', () => {
  it('approves, records the audit trail from the session, and releases the batch to sewing', async () => {
    const order = await newPendingOrder();
    const result = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body: { counts: exactCounts(order) } });

    expect(result.status).toBe(200);
    const approved: OrderDetail = result.body.order;
    expect(approved.status).toBe('VERIFIED');
    expect(approved.verifiedAt).toBeTruthy();

    const [log] = approved.logs;
    expect(log).toMatchObject({ decision: 'APPROVED', verifierId: app.actors.cutting_verifier.id, verifierName: 'Nilan Fernando', wastagePct: 2.22 });
    expect(log!.items).toHaveLength(5);
    expect(log!.items.every(item => item.variance === 0 && item.status === 'GREEN')).toBe(true);

    expect(await sewingQueueIds()).toContain(order.id);
    const queue = await call(sewingQueue.GET, { cookie: sewing });
    const batch = queue.body.orders.find((entry: { id: number }) => entry.id === order.id);
    expect(batch).toMatchObject({ status: 'VERIFIED', verifierName: 'Nilan Fernando', wastagePct: 2.22, wastageCap: 5, overWastageCap: false });
  });
});

describe('required test 2: a RED (shortage) component blocks approval', () => {
  it('returns 422, names the shortage, and leaves the order and its counts unchanged', async () => {
    const order = await newPendingOrder();
    const result = await call(approve.POST, {
      method: 'POST',
      cookie: verifier,
      params: params(order),
      body: { counts: exactCounts(order, { 'Sleeve Cuffs': -4 }) },
    });

    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('HARD_STOP');
    expect(result.body.error.message).toContain('Sleeve Cuffs −4');
    expect(result.body.error.details.shortages).toEqual([expect.objectContaining({ componentName: 'Sleeve Cuffs', variance: -4 })]);

    const after = await call(orderDetail.GET, { cookie: verifier, params: params(order) });
    expect(after.body.order.status).toBe('PENDING_VERIFICATION');
    expect(after.body.order.logs).toHaveLength(0);
    // The failed request was rolled back as a whole, counts included.
    expect(after.body.order.items.every((item: { actualQty: number | null }) => item.actualQty === null)).toBe(true);
    expect(await sewingQueueIds()).not.toContain(order.id);
  });

  it('also blocks approval when stored counts are short and the request sends none', async () => {
    const order = await newPendingOrder();
    const saved = await call(counts.PUT, {
      method: 'PUT',
      cookie: verifier,
      params: params(order),
      body: { counts: exactCounts(order, { 'Collar & Stand': -1 }) },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.order.items.find((item: { componentName: string }) => item.componentName === 'Collar & Stand').status).toBe('RED');

    const result = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order) });
    expect(result.status).toBe(422);
  });

  it('blocks approval when any component is uncounted', async () => {
    const order = await newPendingOrder();
    const partial = exactCounts(order).slice(0, 3);
    const result = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body: { counts: partial } });
    expect(result.status).toBe(422);
    expect(result.body.error.details.uncounted).toHaveLength(2);

    const empty = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order) });
    expect(empty.status).toBe(422);
  });

  it('allows approval with surplus (YELLOW) pieces and records the positive variance', async () => {
    const order = await newPendingOrder();
    const result = await call(approve.POST, {
      method: 'POST',
      cookie: verifier,
      params: params(order),
      body: { counts: exactCounts(order, { 'Sleeve Cuffs': 3 }) },
    });
    expect(result.status).toBe(200);
    const cuffs = result.body.order.logs[0].items.find((item: { componentName: string }) => item.componentName === 'Sleeve Cuffs');
    expect(cuffs).toMatchObject({ status: 'YELLOW', variance: 3, expectedQty: 100, actualQty: 103 });
  });
});

describe('required test 3: rejection needs a reason', () => {
  it.each([
    ['no body at all', undefined],
    ['no reason field', {}],
    ['an empty reason', { reason: '' }],
    ['a whitespace reason', { reason: '           ' }],
    ['a reason under 10 characters', { reason: 'short' }],
    ['a reason that is not a string', { reason: 12345678901 }],
  ])('returns 422 for %s', async (_label, body) => {
    const order = await newPendingOrder();
    const result = await call(reject.POST, { method: 'POST', cookie: verifier, params: params(order), body });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    const after = await call(orderDetail.GET, { cookie: verifier, params: params(order) });
    expect(after.body.order.status).toBe('PENDING_VERIFICATION');
  });

  it('rejects with a valid reason, stores it trimmed, and returns the batch to the supervisor', async () => {
    const order = await newPendingOrder();
    const result = await call(reject.POST, {
      method: 'POST',
      cookie: verifier,
      params: params(order),
      body: { reason: '   Sleeve cuffs are 4 pieces short.  ', counts: exactCounts(order, { 'Sleeve Cuffs': -4 }) },
    });
    expect(result.status).toBe(200);
    expect(result.body.order.status).toBe('REJECTED');
    expect(result.body.order.latestRejectionNote).toBe('Sleeve cuffs are 4 pieces short.');
    expect(result.body.order.logs[0]).toMatchObject({ decision: 'REJECTED', verifierId: app.actors.cutting_verifier.id });
  });
});

describe('required test 4: non-verifier roles get 403 on approval', () => {
  it.each([
    ['cutting supervisor', () => supervisor],
    ['sewing supervisor', () => sewing],
  ])('refuses approval from the %s even with perfect counts', async (_label, cookieOf) => {
    const order = await newPendingOrder();
    const result = await call(approve.POST, { method: 'POST', cookie: cookieOf(), params: params(order), body: { counts: exactCounts(order) } });
    expect(result.status).toBe(403);
    const after = await call(orderDetail.GET, { cookie: verifier, params: params(order) });
    expect(after.body.order.status).toBe('PENDING_VERIFICATION');
  });

  it('refuses rejection and count changes from non-verifiers too', async () => {
    const order = await newPendingOrder();
    const rejection = await call(reject.POST, { method: 'POST', cookie: supervisor, params: params(order), body: { reason: 'I want to reject my own batch' } });
    expect(rejection.status).toBe(403);
    const countChange = await call(counts.PUT, { method: 'PUT', cookie: sewing, params: params(order), body: { counts: exactCounts(order) } });
    expect(countChange.status).toBe(403);
  });

  it('checks the role before looking at the payload, so a bad payload still gets 403', async () => {
    const result = await call(approve.POST, { method: 'POST', cookie: supervisor, params: { id: '999999' }, body: { nonsense: true } });
    expect(result.status).toBe(403);
  });

  it('refuses order creation by the verifier and the sewing supervisor', async () => {
    for (const cookie of [verifier, sewing]) {
      const result = await call(orders.POST, {
        method: 'POST',
        cookie,
        body: { recipe_id: app.recipeId('REC-BL01'), target_qty: 5, fabric_roll_id: 'FAB-1', actual_fabric_yds: 9 },
      });
      expect(result.status).toBe(403);
    }
  });
});

describe('required test 5: unapproved orders never reach the sewing queue', () => {
  it('lists only VERIFIED batches, whatever the query string says', async () => {
    const pending = await newPendingOrder();
    const rejected = await newPendingOrder();
    await call(reject.POST, { method: 'POST', cookie: verifier, params: params(rejected), body: { reason: 'Whole bundle is mis-cut and must be redone.' } });
    const inProgress = await call(orders.POST, {
      method: 'POST',
      cookie: supervisor,
      body: { recipe_id: app.recipeId('REC-CT02'), target_qty: 10, fabric_roll_id: 'FAB-ROLL-1', submit: false },
    });
    const approved = await newPendingOrder();
    await call(approve.POST, { method: 'POST', cookie: verifier, params: params(approved), body: { counts: exactCounts(approved) } });

    const hidden = [pending.id, rejected.id, inProgress.body.order.id];
    for (const tab of [undefined, 'ready', 'in_sewing', 'PENDING_VERIFICATION', 'all', "' OR 1=1 --"]) {
      const ids = await sewingQueueIds(tab);
      for (const id of hidden) expect(ids).not.toContain(id);
    }
    expect(await sewingQueueIds()).toContain(approved.id);

    const { rows } = await app.db.query<{ status: string }>(
      `SELECT DISTINCT o.status FROM cutting_orders o WHERE o.id = ANY(string_to_array($1, ',')::int[])`,
      [(await sewingQueueIds()).join(',')],
    );
    expect(rows.map(row => row.status)).toEqual(['VERIFIED']);
  });

  it('answers 404 for an unverified order requested by ID, the same as for a missing one', async () => {
    const pending = await newPendingOrder();
    const unverified = await call(sewingDetail.GET, { cookie: sewing, params: params(pending) });
    const missing = await call(sewingDetail.GET, { cookie: sewing, params: { id: '987654' } });
    expect(unverified.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(unverified.body).toEqual(missing.body);

    const start = await call(sewingStart.POST, { method: 'POST', cookie: sewing, params: params(pending) });
    expect(start.status).toBe(404);
  });

  it('keeps the sewing supervisor out of the general order endpoints', async () => {
    const pending = await newPendingOrder();
    expect((await call(orders.GET, { cookie: sewing })).status).toBe(403);
    expect((await call(orders.GET, { cookie: sewing, path: '/api/orders?status=PENDING_VERIFICATION' })).status).toBe(403);
    expect((await call(orderDetail.GET, { cookie: sewing, params: params(pending) })).status).toBe(403);
  });

  it('keeps cutting roles out of the sewing queue', async () => {
    expect((await call(sewingQueue.GET, { cookie: supervisor })).status).toBe(403);
    expect((await call(sewingQueue.GET, { cookie: verifier })).status).toBe(403);
  });
});

describe('authentication', () => {
  it('returns 401 without a session on every protected endpoint', async () => {
    const order = await newPendingOrder();
    const checks = [
      call(orders.GET),
      call(orders.POST, { method: 'POST', body: {} }),
      call(approve.POST, { method: 'POST', params: params(order), body: { counts: exactCounts(order) } }),
      call(reject.POST, { method: 'POST', params: params(order), body: { reason: 'A perfectly long reason' } }),
      call(sewingQueue.GET),
      call(me.GET),
    ];
    for (const result of await Promise.all(checks)) expect(result.status).toBe(401);
  });

  it('returns 401 for a forged or tampered session cookie', async () => {
    const [header, payload] = verifier.split('=')[1]!.split('.');
    const forged = `af_session=${header}.${payload}.invalidsignature`;
    expect((await call(me.GET, { cookie: forged })).status).toBe(401);
    expect((await call(me.GET, { cookie: 'af_session=not-a-token' })).status).toBe(401);
  });

  it('signs in with the demo credentials and sets an httpOnly cookie', async () => {
    const result = await call(login.POST, {
      method: 'POST',
      body: { email: 'Verifier@ApparelFlow.demo', password: 'Verifier123!' },
    });
    expect(result.status).toBe(200);
    expect(result.body.redirectTo).toBe('/verify');
    const cookie = result.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/af_session=/);
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
  });

  it('refuses a wrong password with the same message as an unknown email', async () => {
    const wrong = await call(login.POST, { method: 'POST', body: { email: 'verifier@apparelflow.demo', password: 'nope' } });
    const unknown = await call(login.POST, { method: 'POST', body: { email: 'ghost@apparelflow.demo', password: 'nope' } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('refuses cross-site requests that carry a session', async () => {
    const order = await newPendingOrder();
    const result = await call(approve.POST, {
      method: 'POST',
      cookie: verifier,
      params: params(order),
      body: { counts: exactCounts(order) },
      headers: { origin: 'https://evil.example' },
    });
    expect(result.status).toBe(403);
  });
});

describe('state machine over HTTP', () => {
  it('returns 409 when approving an order that is already VERIFIED', async () => {
    const order = await newPendingOrder();
    expect((await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body: { counts: exactCounts(order) } })).status).toBe(200);
    const again = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body: { counts: exactCounts(order) } });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATE');

    const { rows } = await app.db.query<{ count: number }>('SELECT count(*)::int AS count FROM verification_logs WHERE order_id = $1', [order.id]);
    expect(rows[0]!.count).toBe(1);
  });

  it('returns 409 when approving or rejecting a REJECTED order', async () => {
    const order = await newPendingOrder();
    await call(reject.POST, { method: 'POST', cookie: verifier, params: params(order), body: { reason: 'Collar pieces are the wrong size.' } });
    expect((await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body: { counts: exactCounts(order) } })).status).toBe(409);
    expect((await call(reject.POST, { method: 'POST', cookie: verifier, params: params(order), body: { reason: 'Rejecting this a second time.' } })).status).toBe(409);
  });

  it('only lets one of two simultaneous approvals through', async () => {
    const order = await newPendingOrder();
    const body = { counts: exactCounts(order) };
    const results = await Promise.all([
      call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body }),
      call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  });

  it('runs the full re-cut loop: reject, resubmit with fresh counts, then approve', async () => {
    const order = await newPendingOrder();
    await call(reject.POST, {
      method: 'POST',
      cookie: verifier,
      params: params(order),
      body: { reason: 'Sleeve cuffs are four pieces short.', counts: exactCounts(order, { 'Sleeve Cuffs': -4 }) },
    });
    // The verifier cannot resubmit on the supervisor's behalf.
    expect((await call(submit.POST, { method: 'POST', cookie: verifier, params: params(order), body: { actual_fabric_yds: 93 } })).status).toBe(403);

    const resubmitted = await call(submit.POST, {
      method: 'POST',
      cookie: supervisor,
      params: params(order),
      body: { actual_fabric_yds: 93.5, note: 'Re-cut four cuffs from the same roll.' },
    });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.order.status).toBe('PENDING_VERIFICATION');
    expect(resubmitted.body.order.items.every((item: { status: string }) => item.status === 'UNCOUNTED')).toBe(true);

    const approved = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body: { counts: exactCounts(order) } });
    expect(approved.status).toBe(200);
    expect(approved.body.order.logs.map((log: { decision: string }) => log.decision)).toEqual(['APPROVED', 'REJECTED']);
    expect(approved.body.order.events.map((event: { eventType: string }) => event.eventType)).toEqual([
      'CREATED',
      'SUBMITTED',
      'REJECTED',
      'RESUBMITTED',
      'APPROVED',
    ]);
    expect(approved.body.order.logs[0].wastagePct).toBe(3.89);
  });

  it('moves a verified batch into sewing once, then refuses a second start', async () => {
    const order = await newPendingOrder();
    await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), body: { counts: exactCounts(order) } });
    const started = await call(sewingStart.POST, { method: 'POST', cookie: sewing, params: params(order) });
    expect(started.status).toBe(200);
    expect(started.body.order.status).toBe('IN_SEWING');
    expect(await sewingQueueIds('in_sewing')).toContain(order.id);
    expect(await sewingQueueIds('ready')).not.toContain(order.id);
    expect((await call(sewingStart.POST, { method: 'POST', cookie: sewing, params: params(order) })).status).toBe(409);
  });
});

describe('tamper resistance', () => {
  it('computes expected counts on the server and refuses client-supplied ones', async () => {
    const result = await call(orders.POST, {
      method: 'POST',
      cookie: supervisor,
      body: { recipe_id: app.recipeId('REC-BL01'), target_qty: 50, fabric_roll_id: 'FAB-ROLL-882', actual_fabric_yds: 92, expected_counts: [1, 1, 1, 1, 1] },
    });
    expect(result.status).toBe(422);

    const order = await newPendingOrder(50);
    expect(order.items.map(item => [item.componentName, item.expectedQty])).toEqual([
      ['Front Body Panel', 50],
      ['Back Body Panel', 50],
      ['Sleeves (Left & Right)', 100],
      ['Collar & Stand', 50],
      ['Sleeve Cuffs', 100],
    ]);
  });

  it('refuses a verifier ID or status smuggled into an approval', async () => {
    const order = await newPendingOrder();
    const result = await call(approve.POST, {
      method: 'POST',
      cookie: verifier,
      params: params(order),
      body: { counts: exactCounts(order), verifier_id: app.actors.cutting_supervisor.id, status: 'VERIFIED' },
    });
    expect(result.status).toBe(422);
  });

  it('refuses counts for components that belong to a different recipe', async () => {
    const order = await newPendingOrder();
    const { rows } = await app.db.query<{ id: number }>(
      'SELECT c.id FROM recipe_components c JOIN recipes r ON r.id = c.recipe_id WHERE r.recipe_code = $1 LIMIT 1',
      ['REC-CT02'],
    );
    const result = await call(counts.PUT, {
      method: 'PUT',
      cookie: verifier,
      params: params(order),
      body: { counts: [{ component_id: rows[0]!.id, actual_qty: 10 }] },
    });
    expect(result.status).toBe(422);
  });

  it.each([
    ['a negative count', -1],
    ['a decimal count', 4.5],
    ['a numeric string', '100'],
    ['an oversized count', 1e15],
  ])('returns 422 for %s', async (_label, actual) => {
    const order = await newPendingOrder();
    const body = { counts: [{ component_id: order.items[0]!.componentId, actual_qty: actual }] };
    expect((await call(counts.PUT, { method: 'PUT', cookie: verifier, params: params(order), body })).status).toBe(422);
  });

  it('answers malformed requests with clean 4xx errors, not 500s', async () => {
    const order = await newPendingOrder();
    const badJson = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), rawBody: '{"counts": [' });
    expect(badJson.status).toBe(400);
    const notJson = await call(approve.POST, {
      method: 'POST',
      cookie: verifier,
      params: params(order),
      rawBody: 'counts=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(notJson.status).toBe(415);
    const tooBig = await call(approve.POST, { method: 'POST', cookie: verifier, params: params(order), rawBody: JSON.stringify({ x: 'a'.repeat(40_000) }) });
    expect(tooBig.status).toBe(413);
    for (const id of ['abc', '-1', '0', '1.5', '99999999999']) {
      expect((await call(approve.POST, { method: 'POST', cookie: verifier, params: { id }, body: {} })).status).toBe(404);
    }
  });
});
