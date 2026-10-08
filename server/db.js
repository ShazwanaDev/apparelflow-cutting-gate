import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ROLES } from './domain.js';

const defaultPath = resolve(process.env.DATABASE_PATH || './data/apparelflow.sqlite');

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function createDatabase(path = defaultPath) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('cutting_supervisor','cutting_verifier','sewing_supervisor')),
      full_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY, recipe_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category TEXT NOT NULL, std_fabric_yards REAL NOT NULL CHECK(std_fabric_yards > 0),
      wastage_cap REAL NOT NULL CHECK(wastage_cap >= 0)
    );
    CREATE TABLE IF NOT EXISTS recipe_components (
      id INTEGER PRIMARY KEY, recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      component_name TEXT NOT NULL, pieces_per_garment INTEGER NOT NULL CHECK(pieces_per_garment > 0),
      image_url TEXT, UNIQUE(recipe_id, component_name)
    );
    CREATE TABLE IF NOT EXISTS cutting_orders (
      id INTEGER PRIMARY KEY, order_no TEXT NOT NULL UNIQUE,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      target_qty INTEGER NOT NULL CHECK(target_qty > 0),
      fabric_roll_id TEXT NOT NULL, actual_fabric_yds REAL NOT NULL CHECK(actual_fabric_yds > 0),
      status TEXT NOT NULL CHECK(status IN ('PENDING_VERIFICATION','REJECTED','VERIFIED','IN_SEWING')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT, sewing_started_at TEXT
    );
    CREATE TABLE IF NOT EXISTS verification_items (
      id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES cutting_orders(id),
      component_id INTEGER NOT NULL REFERENCES recipe_components(id),
      expected_qty INTEGER NOT NULL CHECK(expected_qty > 0),
      actual_qty INTEGER CHECK(actual_qty >= 0),
      status TEXT NOT NULL CHECK(status IN ('UNCOUNTED','GREEN','YELLOW','RED')),
      UNIQUE(order_id, component_id)
    );
    CREATE TABLE IF NOT EXISTS verification_logs (
      id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES cutting_orders(id),
      verifier_id INTEGER NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
      rejection_note TEXT, wastage_pct REAL, items_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON cutting_orders(status);
    CREATE INDEX IF NOT EXISTS idx_items_order ON verification_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_logs_order ON verification_logs(order_id);
    CREATE TRIGGER IF NOT EXISTS immutable_verification_logs_update
      BEFORE UPDATE ON verification_logs BEGIN SELECT RAISE(ABORT, 'Audit logs are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_verification_logs_delete
      BEFORE DELETE ON verification_logs BEGIN SELECT RAISE(ABORT, 'Audit logs are immutable'); END;
  `);
  seedDatabase(db);
  return db;
}

function seedDatabase(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
    const insert = db.prepare('INSERT INTO users (email,password_hash,role,full_name) VALUES (?,?,?,?)');
    insert.run('supervisor@apparelflow.demo', hashPassword('Supervisor123!'), ROLES.SUPERVISOR, 'Maya Perera');
    insert.run('verifier@apparelflow.demo', hashPassword('Verifier123!'), ROLES.VERIFIER, 'Nilan Fernando');
    insert.run('sewing@apparelflow.demo', hashPassword('Sewing123!'), ROLES.SEWING, 'Asha Silva');
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM recipes').get().count === 0) {
    const recipe = db.prepare('INSERT INTO recipes (recipe_code,name,category,std_fabric_yards,wastage_cap) VALUES (?,?,?,?,?)');
    const component = db.prepare('INSERT INTO recipe_components (recipe_id,component_name,pieces_per_garment) VALUES (?,?,?)');
    const blouse = Number(recipe.run('REC-BL01', 'Casual Blouse', 'Blouse', 1.8, 5).lastInsertRowid);
    for (const [name, qty] of [['Front Body Panel',1],['Back Body Panel',1],['Sleeves (Left & Right)',2],['Collar & Stand',1],['Sleeve Cuffs',2]]) component.run(blouse, name, qty);
    const crop = Number(recipe.run('REC-CT02', 'Crop Top', 'Crop Top', 1.1, 8).lastInsertRowid);
    for (const [name, qty] of [['Front Chest Panel',1],['Back Support Panel',1],['Neck Binding Strip',1],['Hem Elastic Casing',1],['Side Strap Accents',2]]) component.run(crop, name, qty);
  }
}
