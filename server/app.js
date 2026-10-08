import express from 'express';
import { createHash, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { componentFlag, nonNegativeInteger, ORDER_STATUS, positiveDecimal, positiveInteger, ROLES, wastagePercent } from './domain.js';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function publicUser(row) {
  return { id: row.id, full_name: row.full_name, email: row.email, role: row.role };
}

function orderDetails(db, id) {
  if (!positiveInteger(id)) fail(404, 'Order not found');
  const order = db.prepare(`
    SELECT o.*, r.name AS recipe_name, r.recipe_code, r.std_fabric_yards, r.wastage_cap,
      u.full_name AS creator_name
    FROM cutting_orders o JOIN recipes r ON r.id = o.recipe_id
    JOIN users u ON u.id = o.created_by WHERE o.id = ?
  `).get(id);
  if (!order) fail(404, 'Order not found');
  const items = db.prepare(`
    SELECT vi.id, vi.component_id, rc.component_name, rc.pieces_per_garment,
      vi.expected_qty, vi.actual_qty, vi.status
    FROM verification_items vi JOIN recipe_components rc ON rc.id = vi.component_id
    WHERE vi.order_id = ? ORDER BY vi.id
  `).all(id);
  const logs = db.prepare(`
    SELECT l.id, l.decision, l.rejection_note, l.wastage_pct, l.items_json,
      l.created_at, u.full_name AS verifier_name
    FROM verification_logs l JOIN users u ON u.id = l.verifier_id
    WHERE l.order_id = ? ORDER BY l.id DESC
  `).all(id).map(({ items_json, ...log }) => ({ ...log, items: JSON.parse(items_json) }));
  return { ...order, items, logs };
}

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', express.json({ limit: '32kb' }));
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) fail(403, 'Invalid request origin');
      } catch (error) {
        return next(error.status ? error : Object.assign(new Error('Invalid request origin'), { status: 403 }));
      }
    }
    next();
  });

  function requireUser(req, _res, next) {
    const token = /(?:^|;\s*)apparelflow_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return next(Object.assign(new Error('Sign in required'), { status: 401 }));
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = db.prepare(`
      SELECT u.id, u.email, u.role, u.full_name FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash, new Date().toISOString());
    if (!user) return next(Object.assign(new Error('Session expired'), { status: 401 }));
    req.user = user;
    req.tokenHash = tokenHash;
    next();
  }

  function requireRole(role) {
    return (req, _res, next) => req.user.role === role ? next() : next(Object.assign(new Error('Forbidden for this role'), { status: 403 }));
  }

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') fail(400, 'Email and password are required');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user) fail(401, 'Invalid email or password');
    const [salt, expectedHex] = user.password_hash.split(':');
    const supplied = scryptSync(password, salt, 64);
    if (!timingSafeEqual(supplied, Buffer.from(expectedHex, 'hex'))) fail(401, 'Invalid email or password');
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)')
      .run(createHash('sha256').update(token).digest('hex'), user.id, new Date(Date.now() + SESSION_MS).toISOString());
    res.cookie('apparelflow_session', token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
      path: '/', maxAge: SESSION_MS,
    });
    res.json({ user: publicUser(user) });
  });

  app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/logout', requireUser, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.tokenHash);
    res.clearCookie('apparelflow_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/recipes', requireUser, (_req, res) => {
    const recipes = db.prepare('SELECT * FROM recipes ORDER BY id').all().map(recipe => ({
      ...recipe,
      components: db.prepare('SELECT * FROM recipe_components WHERE recipe_id = ? ORDER BY id').all(recipe.id),
    }));
    res.json({ recipes });
  });

  app.get('/api/orders', requireUser, (req, res) => {
    const where = req.user.role === ROLES.SEWING ? "WHERE o.status = 'VERIFIED'" : '';
    const rows = db.prepare(`
      SELECT o.id, o.order_no, o.target_qty, o.fabric_roll_id, o.actual_fabric_yds,
        o.status, o.created_at, o.updated_at, r.name AS recipe_name, r.recipe_code
      FROM cutting_orders o JOIN recipes r ON r.id = o.recipe_id
      ${where} ORDER BY o.id DESC
    `).all();
    res.json({ orders: rows });
  });

  app.post('/api/orders', requireUser, requireRole(ROLES.SUPERVISOR), (req, res) => {
    const { recipe_id, target_qty, fabric_roll_id, actual_fabric_yds } = req.body || {};
    if (!positiveInteger(recipe_id) || !positiveInteger(target_qty) ||
      typeof fabric_roll_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/.test(fabric_roll_id.trim()) ||
      !positiveDecimal(actual_fabric_yds)) fail(400, 'Enter a recipe, whole batch quantity, valid fabric roll ID, and positive fabric yards');
    const recipe = db.prepare('SELECT id FROM recipes WHERE id = ?').get(recipe_id);
    if (!recipe) fail(400, 'Recipe not found');
    const orderId = transaction(db, () => {
      const orderNo = `CUT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
      const result = db.prepare(`
        INSERT INTO cutting_orders (order_no,recipe_id,target_qty,fabric_roll_id,actual_fabric_yds,status,created_by)
        VALUES (?,?,?,?,?,?,?)
      `).run(orderNo, recipe_id, target_qty, fabric_roll_id.trim().toUpperCase(), actual_fabric_yds, ORDER_STATUS.PENDING, req.user.id);
      const insert = db.prepare('INSERT INTO verification_items (order_id,component_id,expected_qty,status) VALUES (?,?,?,?)');
      for (const component of db.prepare('SELECT id,pieces_per_garment FROM recipe_components WHERE recipe_id = ?').all(recipe_id)) {
        const expected = target_qty * component.pieces_per_garment;
        if (!Number.isSafeInteger(expected)) fail(400, 'Batch quantity is too large');
        insert.run(result.lastInsertRowid, component.id, expected, 'UNCOUNTED');
      }
      return Number(result.lastInsertRowid);
    });
    res.status(201).json({ order: orderDetails(db, orderId) });
  });

  app.get('/api/orders/:id', requireUser, (req, res) => {
    const order = orderDetails(db, Number(req.params.id));
    if (req.user.role === ROLES.SEWING && order.status !== ORDER_STATUS.VERIFIED) fail(404, 'Order not found');
    res.json({ order });
  });

  app.put('/api/orders/:id/counts', requireUser, requireRole(ROLES.VERIFIER), (req, res) => {
    const id = Number(req.params.id);
    const order = orderDetails(db, id);
    if (order.status !== ORDER_STATUS.PENDING) fail(409, 'Only pending orders can be counted');
    const counts = req.body?.counts;
    if (!Array.isArray(counts) || counts.length === 0 || counts.length > order.items.length) fail(400, 'Provide component counts');
    const known = new Set(order.items.map(item => item.id));
    const seen = new Set();
    for (const count of counts) {
      if (!positiveInteger(count?.item_id) || !known.has(count.item_id) || seen.has(count.item_id) || !nonNegativeInteger(count.actual_qty)) {
        fail(400, 'Each component needs a unique, non-negative whole count');
      }
      seen.add(count.item_id);
    }
    transaction(db, () => {
      const update = db.prepare('UPDATE verification_items SET actual_qty = ?, status = ? WHERE id = ? AND order_id = ?');
      for (const count of counts) {
        const item = order.items.find(value => value.id === count.item_id);
        update.run(count.actual_qty, componentFlag(count.actual_qty, item.expected_qty), item.id, id);
      }
      db.prepare('UPDATE cutting_orders SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    });
    res.json({ order: orderDetails(db, id) });
  });

  app.post('/api/orders/:id/approve', requireUser, requireRole(ROLES.VERIFIER), (req, res) => {
    const id = Number(req.params.id);
    transaction(db, () => {
      const order = orderDetails(db, id);
      if (order.status !== ORDER_STATUS.PENDING) fail(409, 'Only pending orders can be approved');
      if (order.items.length === 0 || order.items.some(item => item.actual_qty === null || item.actual_qty < item.expected_qty)) {
        fail(422, 'Every component must be counted with no shortage');
      }
      const wastage = wastagePercent(order.actual_fabric_yds, order.std_fabric_yards, order.target_qty);
      db.prepare(`INSERT INTO verification_logs (order_id,verifier_id,decision,wastage_pct,items_json)
        VALUES (?,?,?,?,?)`).run(id, req.user.id, 'APPROVED', wastage, JSON.stringify(order.items));
      db.prepare(`UPDATE cutting_orders SET status = ?, verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(ORDER_STATUS.VERIFIED, id);
    });
    res.json({ order: orderDetails(db, id) });
  });

  app.post('/api/orders/:id/reject', requireUser, requireRole(ROLES.VERIFIER), (req, res) => {
    const id = Number(req.params.id);
    const reason = req.body?.reason;
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 1000) fail(400, 'Provide a reason of 5 to 1000 characters');
    transaction(db, () => {
      const order = orderDetails(db, id);
      if (order.status !== ORDER_STATUS.PENDING) fail(409, 'Only pending orders can be rejected');
      db.prepare(`INSERT INTO verification_logs (order_id,verifier_id,decision,rejection_note,items_json)
        VALUES (?,?,?,?,?)`).run(id, req.user.id, 'REJECTED', reason.trim(), JSON.stringify(order.items));
      db.prepare('UPDATE cutting_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(ORDER_STATUS.REJECTED, id);
    });
    res.json({ order: orderDetails(db, id) });
  });

  app.post('/api/orders/:id/resubmit', requireUser, requireRole(ROLES.SUPERVISOR), (req, res) => {
    const id = Number(req.params.id);
    transaction(db, () => {
      const order = orderDetails(db, id);
      if (order.status !== ORDER_STATUS.REJECTED) fail(409, 'Only rejected orders can be resubmitted');
      const fabric = req.body?.actual_fabric_yds ?? order.actual_fabric_yds;
      if (!positiveDecimal(fabric)) fail(400, 'Fabric yards must be positive');
      db.prepare(`UPDATE cutting_orders SET status = ?, actual_fabric_yds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(ORDER_STATUS.PENDING, fabric, id);
      db.prepare("UPDATE verification_items SET actual_qty = NULL, status = 'UNCOUNTED' WHERE order_id = ?").run(id);
    });
    res.json({ order: orderDetails(db, id) });
  });

  app.get('/api/sewing/queue', requireUser, requireRole(ROLES.SEWING), (_req, res) => {
    const ids = db.prepare("SELECT id FROM cutting_orders WHERE status = 'VERIFIED' ORDER BY verified_at, id").all();
    res.json({ orders: ids.map(row => orderDetails(db, row.id)) });
  });

  app.post('/api/sewing/:id/start', requireUser, requireRole(ROLES.SEWING), (req, res) => {
    const id = Number(req.params.id);
    if (!positiveInteger(id)) fail(404, 'Order not found');
    const result = db.prepare(`UPDATE cutting_orders SET status = ?, sewing_started_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`)
      .run(ORDER_STATUS.SEWING, id, ORDER_STATUS.VERIFIED);
    if (!result.changes) fail(409, 'Only verified orders can start sewing');
    res.json({ ok: true });
  });

  app.use('/api', (_req, _res, next) => next(Object.assign(new Error('API route not found'), { status: 404 })));
  const dist = resolve('dist');
  if (existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Invalid JSON' });
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
