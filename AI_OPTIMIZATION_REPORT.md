# AI Optimization Report

> TODO(Shaana): read every section, check it against what you saw, and rewrite the
> parts marked below in your own words before submitting. Delete this note after.

## 1. Tools and prompting

Two AI coding tools were used, in two phases.

**Phase 1, the first prototype (commits `3ee81a6` to `5f6a82c`).** OpenAI Codex
scaffolded a React + Express + SQLite version from the assessment brief. It worked
locally but was never deployed, and SQLite needs a persistent disk, which most
serverless hosts do not provide.

**Phase 2, the current application (commits from `203a269` onwards).** Claude Code
(Anthropic, running the Claude Opus 5.5 model) rebuilt the app on Next.js and
Postgres from a long written brief. The brief fixed the priorities (server-side
rules first, then the schema and audit trail, then tests, then UI) and the
non-negotiables: role and identity only from the session, a `422` hard stop, query
isolation for the sewing queue, insert-only audit rows, and no low-contrast input
text.

| Task | How AI was used |
| --- | --- |
| Architecture and schema | Proposed the service-layer design, transition map and SQL schema, including the generated flag column and append-only triggers. |
| Scaffolding and API | Wrote the route handlers, session handling and validation schemas. |
| Tests | Wrote the Vitest suites against an in-memory Postgres (PGlite). |
| UI and styling | Wrote the screens, design tokens and motion. Contrast ratios were calculated with a script, not estimated. |
| QA | Ran the cURL security checks against a production build, and drove a real browser with Playwright at 375, 430, 768, 1280 and 1440 px to review screenshots and test keyboard-only flows. |
| Design guidance | The UI/UX Pro Max skill was consulted for the design-system direction. |

The 21st.dev component MCP named in the brief was not configured, so no 21st.dev
components were used. Dialogs are built on Radix primitives instead.

> TODO(Shaana): add what *you* decided or changed in the prompts, and how you
> reviewed the output (e.g. which files you read line by line).

## 2. Flawed or broken AI code

Every item below happened during this build and is visible in the commit history.

### 2.1 The sewing floor silently lost the verifier's name
The sewing queue query joined the approval record with a `LATERAL` subquery but
reused a shared `SELECT` constant with a fixed column list, so the verifier name,
approval time and recorded wastage were never selected. Every batch reached the
sewing floor with `verifierName: undefined`. TypeScript did not catch it, because
the row type was asserted rather than inferred.

- **Caught by** an automated test asserting that each batch carries attribution.
- **Fix:** the select was split into `SUMMARY_COLUMNS` and `SUMMARY_FROM`, and the
  sewing query names the columns it adds. A second assertion now checks the API
  response itself. The fix is in `203a269`; the regression tests are in `79d8c41`.

```ts
// Before: the joined columns were never in the select list
`${SUMMARY_SELECT} JOIN LATERAL (SELECT v.full_name AS verifier_name, ...) approval ON true`
// After
`SELECT ${SUMMARY_COLUMNS}, approval.verifier_name, approval.approved_at, approval.approved_wastage ...
 ${SUMMARY_FROM} JOIN LATERAL (...) approval ON true`
```

### 2.2 An invented password hash that defeated its own purpose
To stop sign-in timing from revealing which emails exist, the login route compares
the password against a dummy hash when the email is unknown. The generated code
used a made-up string shaped like a bcrypt hash. If that string is not a valid
hash, `bcrypt.compare` can return early, so unknown emails would answer faster than
wrong passwords: the exact leak the comment said it prevented.

- **Caught in review** before the code was committed.
- **Fix:** `bcrypt.hashSync('no-account-has-this-password', 10)` at startup, so it
  is a real hash with the real cost factor. A test checks that both failures return
  identical bodies.

### 2.3 A server component read `undefined` from a client module
The pipeline stepper (CUTTING · VERIFICATION · SEWING) never highlighted the current
stage, on any page, for any role. The stage-per-role lookup object was exported
from a file marked `'use client'` and imported by the server-rendered header. In
React Server Components, a client module's exports reach the server as references,
not values, so the lookup returned `undefined`. There was no type error and no
runtime error.

- **Caught by** screenshot review in the browser, then confirmed by finding no
  element with `aria-current="step"` in the page.
- **Fix:** the constants moved to a plain module, `lib/stages.ts` (`d1922b4`).

### 2.4 Hydration mismatch under reduced motion
Entrance animations were written as `initial={reduce ? false : { opacity: 0, y: 8 }}`.
The server cannot know the visitor's motion preference, so the HTML it sends and
what a reduced-motion browser renders differed, and React logged a hydration
mismatch and left the server's hidden styles in place.

- **Caught by** emulating `prefers-reduced-motion: reduce` in Playwright and reading
  the console.
- **Fix:** the starting styles are now the same everywhere, and Motion's
  `reducedMotion="user"` setting disables movement at animation time (`d1922b4`).

### 2.5 Smaller defects
- **Concurrent queries on one transaction.** `Promise.all` ran three queries at
  once on a single transaction client. node-postgres flagged it as deprecated (an
  error in its next major version). The in-memory test database did not, and it
  only appeared when seeding a real Postgres server. Fixed in `83690cc`.
- **Driver portability.** Array parameters (`ANY($1::order_status[])`) worked on
  node-postgres but failed on PGlite, turning every transition into a `500`. The
  first test run caught all ten failures.
- **Misaligned order rows.** Each row sized its status column to its own badge, so
  columns shifted between "Pending verification" and "Verified" rows. Fixed in `ee531c6`.

> TODO(Shaana): 2.5's misaligned rows and the role-switcher placement were spotted by
> you during review. Say so in your own words. If you found anything else yourself,
> add it here; first-hand findings carry the most weight.

## 3. Human refactoring

> TODO(Shaana): this section must be yours. Describe what you questioned, changed or
> rejected, and why. Points you raised during the build that you can expand on:
>
> - You asked whether letting people switch roles inside a signed-in session was a
>   security issue. The answer: it is a full sign-out and sign-in as a different
>   account, and the role is read from the database on every request. But shipping
>   demo passwords in the browser bundle is a real risk, so a
>   `NEXT_PUBLIC_DEMO_MODE=false` switch now removes the switcher and credential cards.
> - You moved the role switcher out of the header into a side dock so the header
>   could stay in one row.
> - You spotted the misaligned order-list columns.

Engineering changes made during review, which you can confirm and explain:

- Validation was made **strict**: unknown fields such as `verifier_id`, `status` or
  `expected_qty` are refused with `422` instead of silently dropped, so tampering
  fails visibly.
- Numbers must arrive as JSON numbers. Strings like `"12"` are not coerced, because
  coercion is how `"1e3"` or `" 12 "` become counts.
- Traffic-light flags became a **generated database column**, so a stored flag can
  never disagree with its counts, whatever writes to the table.
- Wastage arithmetic was moved to whole hundredths of a yard to avoid
  floating-point drift (1.1 × 120 is 132.00000000000003 in plain JavaScript).

## 4. Defensive architecture

**One place for the rules.** Route handlers only read the session and pass the raw
request body to `lib/domain/orders.ts`. Each service function checks the role
against a permission map, then validates the input, so the order of failures is
always `401 → 403 → 422 → 404 → 409 → 422 (hard stop)`. Server-rendered pages call
the same functions, so there is no second path with weaker checks.

**An explicit state machine.** The allowed transitions are listed in
`lib/domain/state-machine.ts`, and anything else is `409`. There is no generic
"update status" endpoint at all. Each transition:

1. opens a transaction and locks the order row (`SELECT … FOR UPDATE`);
2. checks the current status against the map;
3. for approval, re-reads the stored counts and runs the same `summarizeCounts`
   function the browser uses, refusing with `422` if anything is short or uncounted
   (and rolling back any counts sent with the request);
4. writes the audit row and the timeline event;
5. runs `UPDATE … WHERE id = $1 AND status = ANY(allowed)` and fails if no row
   changed, so a race between two approvals cannot produce two.

**Identity from the session only.** The session is an HS256-signed JWT in an
httpOnly, SameSite=Lax cookie that carries only the user ID. The role is read from
the database on every request, verifier IDs come from that lookup, and all
timestamps come from `now()` in Postgres.

**Query isolation.** The sewing queries contain the literal
`WHERE o.status IN ('VERIFIED', 'IN_SEWING')`, and the tab only narrows within that
set. A single-batch lookup applies the same filter in SQL, so an unverified ID
returns the same `404` as a missing one.

**The database as the last line.** Enums and CHECK constraints reject impossible
values (`target_qty > 0`, `actual_qty >= 0`, a verified order must have
`verified_at`, a rejection must have a 10-character note). Triggers refuse UPDATE,
DELETE and TRUNCATE on `verification_logs` and `order_events`, and the tests try all
three directly in SQL.

**Verification.** `npm test` runs 100 tests against a real (in-memory) Postgres.
The cURL contract was also run against a production build: `401` without a session,
`403` for a supervisor or sewing approval, `422` for a shortage, an empty count, an
empty reason or a smuggled `verifier_id`, `404` for sewing reading a pending order,
`409` for a second approval, and `403` for a cross-site request.
