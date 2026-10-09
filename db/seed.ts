import bcrypt from 'bcryptjs';
import type { Database } from '@/lib/server/db';
import type { Role } from '@/lib/domain/constants';
import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';
import { approveOrder, createOrder, rejectOrder, saveCounts, startSewing, submitOrder, type Actor } from '@/lib/domain/orders';

const RECIPES = [
  {
    code: 'REC-BL01',
    name: 'Casual Blouse',
    category: 'Blouse',
    stdFabricYards: 1.8,
    wastageCap: 5.0,
    components: [
      ['Front Body Panel', 1],
      ['Back Body Panel', 1],
      ['Sleeves (Left & Right)', 2],
      ['Collar & Stand', 1],
      ['Sleeve Cuffs', 2],
    ],
  },
  {
    code: 'REC-CT02',
    name: 'Crop Top',
    category: 'Crop Top',
    stdFabricYards: 1.1,
    wastageCap: 8.0,
    components: [
      ['Front Chest Panel', 1],
      ['Back Support Panel', 1],
      ['Neck Binding Strip', 1],
      ['Hem Elastic Casing', 1],
      ['Side Strap Accents', 2],
    ],
  },
] as const;

/**
 * Seeds users, recipes and a handful of orders spread across every status, so
 * each screen has something on it at first visit. Orders are created through
 * the same service functions the API uses, which means the sample data obeys
 * every rule real data does (expected counts, audit rows, timestamps).
 *
 * Safe to run more than once: it does nothing if users already exist.
 */
export async function seed(db: Database, options: { sampleOrders?: boolean; bcryptRounds?: number } = {}) {
  const { sampleOrders = true, bcryptRounds = 10 } = options;
  const existing = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM users');
  if ((existing.rows[0]?.count ?? 0) > 0) return { seeded: false };

  const actors = {} as Record<Role, Actor>;
  for (const user of DEMO_ACCOUNTS) {
    const hash = await bcrypt.hash(user.password, bcryptRounds);
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
      [user.email, hash, user.role, user.fullName],
    );
    actors[user.role] = { id: rows[0]!.id, role: user.role, fullName: user.fullName };
  }

  const recipeIds: Record<string, number> = {};
  for (const recipe of RECIPES) {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO recipes (recipe_code, name, category, std_fabric_yards, wastage_cap)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [recipe.code, recipe.name, recipe.category, recipe.stdFabricYards, recipe.wastageCap],
    );
    recipeIds[recipe.code] = rows[0]!.id;
    for (const [index, [name, pieces]] of recipe.components.entries()) {
      await db.query(
        'INSERT INTO recipe_components (recipe_id, component_name, pieces_per_garment, sort_order) VALUES ($1, $2, $3, $4)',
        [rows[0]!.id, name, pieces, index],
      );
    }
  }

  if (sampleOrders) await seedOrders(db, actors, recipeIds);
  return { seeded: true };
}

async function seedOrders(db: Database, actors: Record<Role, Actor>, recipeIds: Record<string, number>) {
  const supervisor = actors.cutting_supervisor;
  const verifier = actors.cutting_verifier;
  const sewing = actors.sewing_supervisor;
  const blouse = recipeIds['REC-BL01']!;
  const cropTop = recipeIds['REC-CT02']!;

  const exact = (order: { items: Array<{ componentId: number; expectedQty: number }> }, adjust: Record<number, number> = {}) =>
    order.items.map((item, index) => ({ component_id: item.componentId, actual_qty: item.expectedQty + (adjust[index] ?? 0) }));

  // Already on the sewing line.
  const sewn = await createOrder(db, supervisor, { recipe_id: blouse, target_qty: 50, fabric_roll_id: 'FAB-ROLL-882', actual_fabric_yds: 92 });
  await approveOrder(db, verifier, sewn.id, { counts: exact(sewn) });
  await startSewing(db, sewing, sewn.id);

  // Verified with two spare side straps, waiting for the sewing floor.
  const ready = await createOrder(db, supervisor, { recipe_id: cropTop, target_qty: 120, fabric_roll_id: 'FAB-ROLL-910', actual_fabric_yds: 140.5 });
  await approveOrder(db, verifier, ready.id, { counts: exact(ready, { 4: 2 }) });

  // Rejected for short cuffs and a missing collar; back with the supervisor.
  const rejected = await createOrder(db, supervisor, { recipe_id: blouse, target_qty: 40, fabric_roll_id: 'FAB-ROLL-915', actual_fabric_yds: 79.2 });
  await rejectOrder(db, verifier, rejected.id, {
    reason: 'Sleeve cuffs bundle is 4 pieces short and one collar is missing. Re-cut from the same roll before resubmitting.',
    counts: exact(rejected, { 3: -1, 4: -4 }),
  });

  // Rejected once, re-cut, and now back in the queue with a clean count to do.
  const recut = await createOrder(db, supervisor, { recipe_id: cropTop, target_qty: 80, fabric_roll_id: 'FAB-ROLL-921', actual_fabric_yds: 92 });
  await rejectOrder(db, verifier, recut.id, {
    reason: 'Neck binding strips cut on the wrong grain. Whole bundle needs re-cutting.',
    counts: exact(recut, { 2: -80 }),
  });
  await submitOrder(db, supervisor, recut.id, { actual_fabric_yds: 94.5, note: 'Neck binding re-cut on the straight grain.' });

  // Pending, partly counted, with a shortage already showing.
  const partial = await createOrder(db, supervisor, { recipe_id: blouse, target_qty: 60, fabric_roll_id: 'FAB-ROLL-930', actual_fabric_yds: 110 });
  await saveCounts(db, verifier, partial.id, {
    counts: [
      { component_id: partial.items[0]!.componentId, actual_qty: 60 },
      { component_id: partial.items[1]!.componentId, actual_qty: 60 },
      { component_id: partial.items[2]!.componentId, actual_qty: 116 },
    ],
  });

  // Still on the cutting table; fabric used is not known yet.
  await createOrder(db, supervisor, { recipe_id: cropTop, target_qty: 30, fabric_roll_id: 'FAB-ROLL-934', submit: false });
}
