# ApparelFlow · Cutting Gate

The Cutting Operations and Gatekeeper Verification Terminal for the ApparelFlow ERP.
Cut bundles are counted against their recipe before anything reaches the sewing
floor. A batch with a single short component cannot be approved, and the sewing
floor never sees a batch that has not been signed off.

- **Live URL:** not deployed yet (see [Deployment](#deployment))
- **Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL · Tailwind CSS 4 · Vitest

## Demo accounts

These accounts are public on purpose so each role can be tried. The sign-in page
has one-click cards for them, and inside the app a **Demo roles** tab on the right
edge switches between them. Switching is a real sign-out and sign-in; it never
changes the role of an existing session.

| Role | Email | Password | Lands on |
| --- | --- | --- | --- |
| Cutting Supervisor | `supervisor@apparelflow.demo` | `Supervisor123!` | `/orders` |
| Cutting Verifier | `verifier@apparelflow.demo` | `Verifier123!` | `/verify` |
| Sewing Supervisor | `sewing@apparelflow.demo` | `Sewing123!` | `/sewing` |

The seed also creates two recipes (REC-BL01 Casual Blouse, REC-CT02 Crop Top) and
six orders spread across every status, so each screen has data on first visit.

## How it works

1. **The supervisor creates a cutting order** from a recipe: batch quantity, fabric
   roll and the yards used. The server multiplies the batch quantity by each
   component's pieces per garment (50 blouses × 2 cuffs = 100 cuffs) and stores
   those expected counts. The browser shows the same numbers as a live preview,
   but the server never uses them. An order can be saved as *cutting in progress*
   and sent for verification later.
2. **The verifier counts every component.** Each count gets a traffic light:
   *match* when it equals the expected count, *excess* when it is higher (allowed,
   recorded), *shortage* when it is lower. Counts save automatically.
3. **Approve is the hard stop.** It only works when every component is counted and
   none is short. The button is disabled and explains why, but that is only for
   the person at the screen: the server checks the stored counts again inside a
   transaction and answers `422` if anything is short or missing.
4. **Approval writes the audit record** in the same transaction: the verifier's ID
   from the session, the database's timestamp, each component's expected and
   actual count and variance, and the fabric wastage percentage. The database
   refuses any later UPDATE or DELETE of that row.
5. **Reject needs a reason** of at least 10 characters. The batch returns to the
   supervisor with the reason and the counts that failed. After re-cutting, the
   supervisor resubmits it and the verifier counts it again from zero.
6. **The sewing supervisor only ever sees verified batches.** The query itself
   selects `WHERE o.status IN ('VERIFIED', 'IN_SEWING')`, so no URL parameter can
   widen it, and opening an unverified order by ID gives the same 404 as an ID
   that does not exist. "Start sewing assembly" moves the batch to `IN_SEWING`.

## State machine

```
CUTTING_IN_PROGRESS ──submit──▶ PENDING_VERIFICATION ──approve──▶ VERIFIED ──startSewing──▶ IN_SEWING
                                    │          ▲
                                 reject     submit (re-cut)
                                    ▼          │
                                   REJECTED ───┘
```

The transitions live in one map, [lib/domain/state-machine.ts](lib/domain/state-machine.ts).
Anything not in the map is refused with `409`. Each transition runs in a
transaction that locks the order row (`SELECT … FOR UPDATE`), and the `UPDATE`
repeats the status check in its `WHERE` clause, so two simultaneous approvals
cannot both succeed.

## Architecture

```
Browser (React client components)
   │  fetch, JSON, httpOnly session cookie
   ▼
app/api/**/route.ts          authenticate → pass raw body to the service layer
   │
lib/domain/orders.ts         permission check → zod validation → state machine
   │                         → hard stop → SQL in a transaction
   ▼
PostgreSQL                   enums, CHECK constraints, generated flag column,
                             append-only triggers on audit tables
```

Server-rendered pages call the same service functions directly, with the same
permission checks.

| Path | What it holds |
| --- | --- |
| [lib/domain/rules.ts](lib/domain/rules.ts) | Multiplier, traffic-light flags, wastage formula, approval summary. Pure functions shared by browser and server. |
| [lib/domain/permissions.ts](lib/domain/permissions.ts) | Which role may do what. |
| [lib/domain/state-machine.ts](lib/domain/state-machine.ts) | The allowed status transitions. |
| [lib/domain/orders.ts](lib/domain/orders.ts) | Every read and write, with the checks above. |
| [lib/validation.ts](lib/validation.ts) | zod schemas used by the forms and by the server. |
| [lib/server/](lib/server) | Database pool, JWT sessions, the shared route wrapper. |
| [db/migrations/001_init.sql](db/migrations/001_init.sql) | The schema. |
| [db/seed.ts](db/seed.ts) | Demo users, recipes and sample orders, created through the service layer. |
| [tests/](tests) | Vitest suites. |

## Database schema

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | id, email, password_hash (bcrypt), role, full_name, created_at | `role` is an enum of the three roles. |
| `recipes` | id, recipe_code, name, category, std_fabric_yards, wastage_cap | Positive standard yards, non-negative cap. |
| `recipe_components` | id, recipe_id → recipes, component_name, pieces_per_garment, image_url | Unique per recipe; pieces > 0. |
| `cutting_orders` | id, order_no, recipe_id → recipes, target_qty, fabric_roll_id, actual_fabric_yds, status, created_by → users, created_at, updated_at, submitted_at, verified_at, sewing_started_at | `target_qty` between 1 and 10,000; roll ID format checked; a verified order must have `verified_at`. |
| `verification_items` | id, order_id → cutting_orders, component_id → recipe_components, expected_qty, actual_qty, status, counted_at | `actual_qty >= 0` or NULL (uncounted). `status` is a **generated column** computed from the two counts, so a stored flag can never disagree with them. |
| `verification_logs` | id, order_id, verifier_id → users, decision, rejection_note, wastage_pct, items (jsonb), created_at | One row per approve or reject, with a frozen copy of every count and variance. A rejection must carry a note of 10+ characters. **Append-only:** triggers refuse UPDATE, DELETE and TRUNCATE. |
| `order_events` | id, order_id, actor_id → users, event_type, from_status, to_status, note, created_at | The per-order timeline shown on every detail page. Also append-only. |

Wastage is `((actual fabric − standard yards × quantity) ÷ (standard yards × quantity)) × 100`,
rounded to two decimals. The arithmetic is done in whole hundredths of a yard, so
values like 1.1 × 120 do not drift in floating point.

## Security contract

Every rule is enforced on the server. Disabled buttons and hidden links are only
there for the person at the screen.

| Situation | Response |
| --- | --- |
| No session or a forged cookie | `401` |
| Wrong role (e.g. a supervisor approving, sewing listing orders) | `403` |
| Approve with any component short, uncounted or missing | `422` (`HARD_STOP`, names the components) |
| Reject without a reason of 10+ characters | `422` |
| Negative, decimal, non-numeric or oversized numbers; unknown fields such as `verifier_id` or `status` | `422` |
| Approve or reject an order that is not pending; start sewing twice | `409` |
| Sewing supervisor opening an unverified order by ID | `404` |
| Mutating request from another origin | `403` |
| Malformed JSON / wrong content type / body over 32 KB | `400` / `415` / `413` |

The verifier's identity always comes from the signed session, and every
timestamp comes from the database clock. Request objects are strict, so a
smuggled `verifier_id`, `status` or `expected_qty` is refused rather than ignored.

### Trying it with cURL

```bash
BASE=http://localhost:3000

# Sign in and keep the session cookie
curl -s -c sup.txt -H 'content-type: application/json' \
  -d '{"email":"supervisor@apparelflow.demo","password":"Supervisor123!"}' $BASE/api/auth/login
curl -s -c ver.txt -H 'content-type: application/json' \
  -d '{"email":"verifier@apparelflow.demo","password":"Verifier123!"}' $BASE/api/auth/login
curl -s -c sew.txt -H 'content-type: application/json' \
  -d '{"email":"sewing@apparelflow.demo","password":"Sewing123!"}' $BASE/api/auth/login

# A supervisor trying to approve order 5            -> 403
curl -s -o /dev/null -w '%{http_code}\n' -b sup.txt -X POST $BASE/api/orders/5/approve

# A verifier approving with nothing counted         -> 422
curl -s -w '\n%{http_code}\n' -b ver.txt -X POST $BASE/api/orders/5/approve

# Rejecting with an empty reason                    -> 422
curl -s -o /dev/null -w '%{http_code}\n' -b ver.txt -H 'content-type: application/json' \
  -d '{"reason":"   "}' $BASE/api/orders/5/reject

# The sewing queue, with a tampered query string    -> only VERIFIED batches
curl -s -b sew.txt "$BASE/api/sewing/queue?status=PENDING_VERIFICATION"

# A pending order requested directly by sewing      -> 404
curl -s -o /dev/null -w '%{http_code}\n' -b sew.txt $BASE/api/sewing/5

# No session at all                                 -> 401
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/orders
```

Order IDs depend on the seed. `GET /api/orders?status=PENDING_VERIFICATION` as the
verifier lists the pending ones.

### API

| Method and path | Role | Purpose |
| --- | --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | any | Session |
| `GET /api/recipes` | any signed in | Recipes and components |
| `GET /api/orders?status=&q=` | supervisor, verifier | List with counts per status |
| `POST /api/orders` | supervisor | Create (`submit: false` keeps it in progress) |
| `GET /api/orders/:id` | supervisor, verifier | Detail with counts, logs and timeline |
| `POST /api/orders/:id/submit` | supervisor | Send for verification, or resubmit after a re-cut |
| `PUT /api/orders/:id/counts` | verifier | Save counts while pending |
| `POST /api/orders/:id/approve` | verifier | Approve (optional `counts` in the body) |
| `POST /api/orders/:id/reject` | verifier | Reject with `reason` (and optional `counts`) |
| `GET /api/sewing/queue?tab=ready\|in_sewing` | sewing | Verified batches only |
| `GET /api/sewing/:id` | sewing | One verified batch |
| `POST /api/sewing/:id/start` | sewing | Start assembly |

## Running locally

Requires Node.js 20.9 or later. No Postgres installation is needed for local work:
`npm run db:local` starts PGlite, a real Postgres compiled to WebAssembly, on
port 5433.

```powershell
npm install
Copy-Item .env.example .env.local
# Edit .env.local and set SESSION_SECRET to a long random value:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

In one terminal:

```powershell
npm run db:local
```

In a second terminal:

```powershell
npm run db:setup   # creates the tables and seeds demo data (safe to re-run)
npm run dev
```

Open http://localhost:3000. Data is kept in `./.pglite`; delete that folder to start
fresh. To use any other Postgres instead, point `DATABASE_URL` at it.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Add `?sslmode=require` for hosted databases. |
| `SESSION_SECRET` | Signs session cookies. At least 32 characters. |
| `DATABASE_POOL_MAX` | Optional pool size (default 5). Use 1 with the local PGlite server. |
| `NEXT_PUBLIC_DEMO_MODE` | `false` hides the demo role switcher and credential cards. |

## Tests

```powershell
npm test            # Vitest: 100 tests
npm run check       # type-check, lint, tests and a production build
```

The tests need no database setup. Each file starts its own in-memory PGlite,
applies the real migration and seeds it, then calls the actual route handlers
with signed session cookies. The five required cases are in
[tests/api.test.ts](tests/api.test.ts), under headings that name them:

1. An all-match order is approved by a verifier, and the audit row holds the verifier and wastage.
2. A shortage blocks approval with `422`, and nothing is written.
3. Rejecting without a valid reason fails with `422`.
4. Supervisor and sewing roles get `403` on approval.
5. Pending, rejected and in-progress orders never appear in the sewing queue, whatever the query string.

The suites also cover the multiplier, the wastage formula and its rounding,
excess counts being allowed, uncounted components, illegal and simultaneous
transitions, the full reject and re-cut loop, forged cookies, smuggled fields,
input guards, and direct SQL attempts to edit the audit trail.

## Assumptions

- **Wastage over the recipe cap is a warning, not a block.** The brief requires it
  to be calculated and stored but never says it stops a batch. It is highlighted
  wherever wastage appears and is stored with the approval.
- **Excess pieces do not block approval.** The variance is recorded so surplus can
  be returned or kept as spares.
- **A resubmitted batch is counted again from zero.** The failed counts stay in the
  rejection's audit record.
- **The supervisor can view all orders; the verifier can view all orders read-only**
  but can only change counts while an order is pending. The sewing supervisor can
  only ever load verified or in-sewing batches.
- **Sessions last 10 hours** (one shift). A JWT cannot be revoked before it expires;
  signing out clears the cookie, and the role is re-read from the database on every
  request, so removing a user takes effect immediately.
- Times are stored in UTC and displayed in Sri Lanka time.

## Known limitations

- No rate limiting on sign-in. A real deployment should add it at the edge or with a shared store.
- Lists return the 200 most recent rows without pagination.
- The concurrency test runs on PGlite, which serialises transactions; on a real
  Postgres the guarantee comes from the row lock plus the status check in the `UPDATE`.
- One light theme only; every state was checked for contrast in it, and the page
  declares `color-scheme: light` so a dark OS theme does not repaint form controls.

## Deployment

The app is ready to deploy to Vercel with a managed Postgres (Neon or Supabase):

1. Create the database and copy its connection string (with `sslmode=require`).
2. Set `DATABASE_URL`, `SESSION_SECRET` and `NEXT_PUBLIC_DEMO_MODE` in the project's environment variables.
3. From a machine with that `DATABASE_URL`, run `npm run db:setup` once to create the schema and seed data.
4. Deploy. The build command is `npm run build`.

## Design notes

The interface uses a serif display face (Instrument Serif) for stage titles and
empty states, Geist for interface text and Geist Mono with tabular figures for
every count, yard and percentage, so columns line up. The brand pastels are only
ever used as fills with dark text on them; status colours are separate from the
brand palette, and every status pairs its colour with an icon, a word and the
signed variance. Measured contrast: body text 17.4:1, secondary text 7.1:1,
shortage text 6.1:1, excess 5.2:1, match 5.4:1, input borders 3.9:1.
