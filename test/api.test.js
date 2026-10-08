import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

async function fixture(t) {
  const db = createDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(role) {
    const creds = {
      supervisor: ['supervisor@apparelflow.demo', 'Supervisor123!'],
      verifier: ['verifier@apparelflow.demo', 'Verifier123!'],
      sewing: ['sewing@apparelflow.demo', 'Sewing123!'],
    };
    const [email, password] = creds[role];
    const response = await call('/api/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(response.status, 200);
    return response.cookie;
  }
  async function order(cookie) {
    const result = await call('/api/orders', {
      method: 'POST', cookie,
      body: { recipe_id: 1, target_qty: 50, fabric_roll_id: 'FAB-ROLL-882', actual_fabric_yds: 92 },
    });
    assert.equal(result.status, 201);
    return result.body.order;
  }
  return { db, call, login, order };
}

test('a verifier approves complete counts and the batch enters the sewing queue', async t => {
  const f = await fixture(t);
  const supervisor = await f.login('supervisor');
  const verifier = await f.login('verifier');
  const sewing = await f.login('sewing');
  const batch = await f.order(supervisor);
  const counts = batch.items.map(item => ({ item_id: item.id, actual_qty: item.expected_qty }));
  assert.equal((await f.call(`/api/orders/${batch.id}/counts`, { method: 'PUT', cookie: verifier, body: { counts } })).status, 200);
  const approved = await f.call(`/api/orders/${batch.id}/approve`, { method: 'POST', cookie: verifier });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.order.status, 'VERIFIED');
  assert.equal(approved.body.order.logs[0].verifier_name, 'Nilan Fernando');
  assert.equal(approved.body.order.logs[0].wastage_pct, 2.22);
  const queue = await f.call('/api/sewing/queue', { cookie: sewing });
  assert.deepEqual(queue.body.orders.map(item => item.id), [batch.id]);
  assert.throws(() => f.db.prepare("DELETE FROM verification_logs WHERE order_id = ?").run(batch.id), /immutable/);
});

test('a shortage blocks approval on the server', async t => {
  const f = await fixture(t);
  const batch = await f.order(await f.login('supervisor'));
  const verifier = await f.login('verifier');
  const counts = batch.items.map((item, index) => ({ item_id: item.id, actual_qty: item.expected_qty - (index === 0 ? 1 : 0) }));
  await f.call(`/api/orders/${batch.id}/counts`, { method: 'PUT', cookie: verifier, body: { counts } });
  const result = await f.call(`/api/orders/${batch.id}/approve`, { method: 'POST', cookie: verifier });
  assert.equal(result.status, 422);
  assert.equal(f.db.prepare('SELECT status FROM cutting_orders WHERE id = ?').get(batch.id).status, 'PENDING_VERIFICATION');
});

test('missing counts block approval even if counted pieces match', async t => {
  const f = await fixture(t);
  const batch = await f.order(await f.login('supervisor'));
  const verifier = await f.login('verifier');
  await f.call(`/api/orders/${batch.id}/counts`, { method: 'PUT', cookie: verifier,
    body: { counts: [{ item_id: batch.items[0].id, actual_qty: batch.items[0].expected_qty }] } });
  assert.equal((await f.call(`/api/orders/${batch.id}/approve`, { method: 'POST', cookie: verifier })).status, 422);
});

test('rejection needs a reason and remains auditable after resubmission', async t => {
  const f = await fixture(t);
  const supervisor = await f.login('supervisor');
  const verifier = await f.login('verifier');
  const batch = await f.order(supervisor);
  assert.equal((await f.call(`/api/orders/${batch.id}/reject`, { method: 'POST', cookie: verifier, body: { reason: '' } })).status, 400);
  assert.equal((await f.call(`/api/orders/${batch.id}/reject`, { method: 'POST', cookie: verifier, body: { reason: 'Damaged sleeve pieces' } })).status, 200);
  const resumed = await f.call(`/api/orders/${batch.id}/resubmit`, { method: 'POST', cookie: supervisor });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.order.status, 'PENDING_VERIFICATION');
  assert.equal(resumed.body.order.logs[0].rejection_note, 'Damaged sleeve pieces');
  assert.ok(resumed.body.order.items.every(item => item.actual_qty === null));
});

test('other roles cannot approve and unapproved orders are absent from sewing queries', async t => {
  const f = await fixture(t);
  const supervisor = await f.login('supervisor');
  const sewing = await f.login('sewing');
  const batch = await f.order(supervisor);
  assert.equal((await f.call(`/api/orders/${batch.id}/approve`, { method: 'POST', cookie: supervisor })).status, 403);
  assert.equal((await f.call(`/api/orders/${batch.id}/approve`, { method: 'POST', cookie: sewing })).status, 403);
  assert.deepEqual((await f.call('/api/sewing/queue', { cookie: sewing })).body.orders, []);
  assert.deepEqual((await f.call('/api/orders', { cookie: sewing })).body.orders, []);
  assert.equal((await f.call(`/api/orders/${batch.id}`, { cookie: sewing })).status, 404);
});

test('invalid quantities and component counts are rejected', async t => {
  const f = await fixture(t);
  const supervisor = await f.login('supervisor');
  for (const invalid of [-1, 0, 1.5, '10', null]) {
    const result = await f.call('/api/orders', { method: 'POST', cookie: supervisor,
      body: { recipe_id: 1, target_qty: invalid, fabric_roll_id: 'ROLL-1', actual_fabric_yds: 10 } });
    assert.equal(result.status, 400);
  }
  const batch = await f.order(supervisor);
  const verifier = await f.login('verifier');
  for (const invalid of [-1, 1.2, '5', null]) {
    const result = await f.call(`/api/orders/${batch.id}/counts`, { method: 'PUT', cookie: verifier,
      body: { counts: [{ item_id: batch.items[0].id, actual_qty: invalid }] } });
    assert.equal(result.status, 400);
  }
});

test('orders persist when the database is closed and reopened', t => {
  const path = join(tmpdir(), `apparelflow-${randomUUID()}.sqlite`);
  t.after(() => { for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix); });
  const first = createDatabase(path);
  first.prepare(`INSERT INTO cutting_orders
    (order_no,recipe_id,target_qty,fabric_roll_id,actual_fabric_yds,status,created_by)
    VALUES (?,?,?,?,?,?,?)`).run('CUT-PERSISTENCE-TEST', 1, 10, 'ROLL-TEST', 18, 'PENDING_VERIFICATION', 1);
  first.close();
  const reopened = createDatabase(path);
  assert.equal(reopened.prepare('SELECT target_qty FROM cutting_orders WHERE order_no = ?').get('CUT-PERSISTENCE-TEST').target_qty, 10);
  reopened.close();
});
