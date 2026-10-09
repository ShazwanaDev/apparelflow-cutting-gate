import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';
import { approveOrder, createOrder, getSewingBatch, rejectOrder, sewingQueue } from '@/lib/domain/orders';
import { DomainError } from '@/lib/domain/errors';

/*
 * The database's own guarantees, tested without going through the application.
 * These are what still hold if someone writes SQL by hand or a future route
 * forgets a check.
 */

let app: TestApp;
let orderId: number;

beforeAll(async () => {
  app = await createTestApp({ sampleOrders: true });
  const order = await createOrder(app.db, app.actors.cutting_supervisor, {
    recipe_id: app.recipeId('REC-CT02'),
    target_qty: 20,
    fabric_roll_id: 'FAB-DB-1',
    actual_fabric_yds: 22,
  });
  const verified = await approveOrder(app.db, app.actors.cutting_verifier, order.id, {
    counts: order.items.map(item => ({ component_id: item.componentId, actual_qty: item.expectedQty })),
  });
  orderId = verified.id;
});

afterAll(async () => {
  await app.close();
});

describe('immutable audit trail', () => {
  it('refuses to update a verification log', async () => {
    await expect(app.db.query("UPDATE verification_logs SET wastage_pct = 0, decision = 'APPROVED' WHERE order_id = $1", [orderId])).rejects.toThrow(
      /append-only/,
    );
  });

  it('refuses to delete or truncate verification logs', async () => {
    await expect(app.db.query('DELETE FROM verification_logs WHERE order_id = $1', [orderId])).rejects.toThrow(/append-only/);
    await expect(app.db.exec('TRUNCATE verification_logs CASCADE')).rejects.toThrow(/append-only/);
  });

  it('refuses to rewrite the order event timeline', async () => {
    await expect(app.db.query('UPDATE order_events SET actor_id = actor_id WHERE order_id = $1', [orderId])).rejects.toThrow(/append-only/);
    await expect(app.db.query('DELETE FROM order_events WHERE order_id = $1', [orderId])).rejects.toThrow(/append-only/);
  });

  it('still has the original approval after all those attempts', async () => {
    const { rows } = await app.db.query<{ decision: string; verifier_id: number; wastage_pct: number }>(
      'SELECT decision, verifier_id, wastage_pct FROM verification_logs WHERE order_id = $1',
      [orderId],
    );
    expect(rows).toEqual([{ decision: 'APPROVED', verifier_id: app.actors.cutting_verifier.id, wastage_pct: 0 }]);
  });

  it('refuses a rejection log without a meaningful note', async () => {
    await expect(
      app.db.query(
        `INSERT INTO verification_logs (order_id, verifier_id, decision, rejection_note, wastage_pct, items)
         VALUES ($1, $2, 'REJECTED', '  ', 0, '[]')`,
        [orderId, app.actors.cutting_verifier.id],
      ),
    ).rejects.toThrow();
  });
});

describe('derived traffic-light flags', () => {
  it('computes the flag from the counts and refuses a hand-written one', async () => {
    const { rows } = await app.db.query<{ id: number; expected_qty: number }>(
      'SELECT vi.id, vi.expected_qty FROM verification_items vi WHERE vi.order_id = $1 LIMIT 1',
      [orderId],
    );
    const item = rows[0]!;
    await expect(app.db.query("UPDATE verification_items SET status = 'GREEN' WHERE id = $1", [item.id])).rejects.toThrow();

    const statusAfterCounting = async (actual: number | null) => {
      await app.db.query('UPDATE verification_items SET actual_qty = $1 WHERE id = $2', [actual, item.id]);
      const result = await app.db.query<{ status: string }>('SELECT status FROM verification_items WHERE id = $1', [item.id]);
      return result.rows[0]!.status;
    };
    // Inside a transaction that is rolled back, so the verified order stays untouched.
    await app.db.exec('BEGIN');
    try {
      expect(await statusAfterCounting(item.expected_qty - 1)).toBe('RED');
      expect(await statusAfterCounting(item.expected_qty + 1)).toBe('YELLOW');
      expect(await statusAfterCounting(item.expected_qty)).toBe('GREEN');
      expect(await statusAfterCounting(null)).toBe('UNCOUNTED');
    } finally {
      await app.db.exec('ROLLBACK');
    }
  });
});

describe('check constraints', () => {
  it('refuses a zero or negative batch quantity', async () => {
    for (const qty of [0, -5]) {
      await expect(
        app.db.query(
          `INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, created_by) VALUES ($1, $2, 'FAB-X-1', $3)`,
          [app.recipeId('REC-BL01'), qty, app.actors.cutting_supervisor.id],
        ),
      ).rejects.toThrow(/check constraint/i);
    }
  });

  it('refuses a negative component count', async () => {
    await expect(app.db.query('UPDATE verification_items SET actual_qty = -1 WHERE order_id = $1', [orderId])).rejects.toThrow(/check constraint/i);
  });

  it('refuses a verified order without a verification time', async () => {
    await expect(
      app.db.query(
        `INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, status, created_by)
         VALUES ($1, 5, 'FAB-X-2', 9, 'VERIFIED', $2)`,
        [app.recipeId('REC-BL01'), app.actors.cutting_supervisor.id],
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('refuses an unknown role or status', async () => {
    await expect(app.db.query("INSERT INTO users (email, password_hash, role, full_name) VALUES ('x@y.z', 'h', 'admin', 'X')")).rejects.toThrow();
    await expect(app.db.query("UPDATE cutting_orders SET status = 'SHIPPED' WHERE id = $1", [orderId])).rejects.toThrow();
  });
});

describe('sewing queue query isolation', () => {
  it('returns only VERIFIED orders from the seeded data, and IN_SEWING ones on the other tab', async () => {
    const ready = await sewingQueue(app.db, app.actors.sewing_supervisor, 'ready');
    const inSewing = await sewingQueue(app.db, app.actors.sewing_supervisor, 'in_sewing');
    expect(ready.length).toBeGreaterThan(0);
    expect(inSewing.length).toBeGreaterThan(0);
    expect(new Set(ready.map(order => order.status))).toEqual(new Set(['VERIFIED']));
    expect(new Set(inSewing.map(order => order.status))).toEqual(new Set(['IN_SEWING']));

    const { rows } = await app.db.query<{ id: number }>(
      "SELECT id FROM cutting_orders WHERE status NOT IN ('VERIFIED', 'IN_SEWING')",
    );
    expect(rows.length).toBeGreaterThan(0);
    const visible = new Set([...ready, ...inSewing].map(order => order.id));
    for (const row of rows) {
      expect(visible.has(row.id)).toBe(false);
      await expect(getSewingBatch(app.db, app.actors.sewing_supervisor, row.id)).rejects.toMatchObject({ status: 404 });
    }
  });

  it('carries verifier attribution and wastage with each batch', async () => {
    const [batch] = await sewingQueue(app.db, app.actors.sewing_supervisor, 'ready');
    expect(batch).toMatchObject({ verifierName: 'Nilan Fernando' });
    expect(typeof batch!.wastagePct).toBe('number');
    expect(batch!.verifiedAt).toBeTruthy();
  });

  it('refuses the sewing role on the domain function itself, not only on the route', async () => {
    await expect(sewingQueue(app.db, app.actors.cutting_verifier, 'ready')).rejects.toBeInstanceOf(DomainError);
    await expect(rejectOrder(app.db, app.actors.sewing_supervisor, orderId, { reason: 'Not allowed to do this' })).rejects.toMatchObject({
      status: 403,
    });
  });
});
