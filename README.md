# ApparelFlow Cutting Gate

A small full-stack ERP checkpoint for moving garment cutting batches to the sewing floor. It implements the challenge in the attached assessment brief: a batch can reach sewing only after an authorized verifier has counted every recipe component and found no shortage.

## Run locally

Requires Node.js 24 or later. The database uses Node's built-in `node:sqlite` module.

```powershell
npm install
npm run dev:api
```

In a second PowerShell window:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. The API runs on port 3000 and Vite forwards `/api` requests to it.

For a single-process production build:

```powershell
npm run build
npm start
```

Then open `http://localhost:3000`.

`npm test` runs the API and domain tests. `npm run check` runs tests and the production build.

## Demo accounts

These are intentionally public test accounts. Do not use these credentials for real factory data.

| Role | Email | Password |
| --- | --- | --- |
| Cutting Supervisor | `supervisor@apparelflow.demo` | `Supervisor123!` |
| Cutting Verifier | `verifier@apparelflow.demo` | `Verifier123!` |
| Sewing Supervisor | `sewing@apparelflow.demo` | `Sewing123!` |

The login page and sidebar provide a role switcher. Each switch signs into the corresponding account; the backend still checks the actual session role.

## Workflow

1. The Cutting Supervisor creates an order from a seeded recipe. Expected component counts are stored as `target_qty × pieces_per_garment`.
2. The Cutting Verifier enters actual counts. Equal counts are green, surplus counts yellow, and shortages red.
3. Approval requires every component to be counted and no shortages. The server rejects incomplete approval with HTTP 422 even if a client bypasses the disabled button.
4. Rejection requires a reason. The supervisor can resubmit after recutting; this clears counts for a new inspection while preserving the old audit log.
5. Only verified orders are returned by the Sewing Queue query. Starting sewing moves the order to `IN_SEWING`.

## Architecture and data

- `src/`: React screens and responsive styling.
- `server/app.js`: Express routes, authentication, authorization, and state transitions.
- `server/db.js`: SQLite schema and seed data.
- `server/domain.js`: shared server-side count and wastage rules.
- `test/`: API and persistence tests using Node's test runner.

SQLite is stored at `./data/apparelflow.sqlite` by default. The `data/` directory is ignored by Git. Set `DATABASE_PATH` to an **absolute path on a persistent volume** when deploying; an ephemeral cloud filesystem would lose orders after a restart. `PORT` changes the HTTP port. `COOKIE_SECURE=true` forces HTTPS-only cookies; production mode also enables secure cookies automatically. See `.env.example`.

The relational schema includes `users`, `recipes`, `recipe_components`, `cutting_orders`, `verification_items`, `verification_logs`, and `sessions`. Foreign keys enforce relationships. Verification logs store a snapshot of component counts, verifier ID, decision, timestamp, and (on approval) fabric wastage percentage. Database triggers forbid updates or deletes to these logs.

## API boundaries

All protected endpoints use an HTTP-only session cookie. The server derives verifier identity from that session. There is no generic order-status update endpoint.

| Route | Role | Purpose |
| --- | --- | --- |
| `POST /api/orders` | Cutting Supervisor | Create a batch |
| `PUT /api/orders/:id/counts` | Cutting Verifier | Save component counts |
| `POST /api/orders/:id/approve` | Cutting Verifier | Verify and release a complete batch |
| `POST /api/orders/:id/reject` | Cutting Verifier | Reject with a reason |
| `POST /api/orders/:id/resubmit` | Cutting Supervisor | Send corrected batch for recount |
| `GET /api/sewing/queue` | Sewing Supervisor | Read verified batches only |
| `POST /api/sewing/:id/start` | Sewing Supervisor | Begin assembly |

## Deployment note

The app is ready to run as one Node process after `npm run build`. It has **not been deployed** in this workspace. A public deployment needs a hosting account and persistent storage. The repository and public URL also have to be created in the owner's accounts.
