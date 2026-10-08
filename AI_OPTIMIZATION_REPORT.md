# AI Optimization Report

## 1. Tools and prompting

OpenAI Codex was used to interpret the supplied brief, scaffold the React/Express/SQLite app, implement the API and UI, and write tests and documentation. The implementation was guided by the assessment's state transitions, role boundaries, and five required tests. Package installation used locally cached npm packages because the documentation sites timed out in this environment.

## 2. Flawed or suboptimal AI code found

1. The first responsive CSS pass hid the sidebar below 430px, including the role switcher and sign-out control. That made the demo flow unusable on narrow phones. A mobile role selector and sign-out action were added to the top bar.
2. The first UI selection logic retained an order after the verifier approved it, even though the order had left the pending list. The list could show another pending batch while the detail panel appeared empty. The loader now chooses a selection from the currently available orders for that role.
3. The first count input parsing accepted digit strings large enough to exceed JavaScript's safe integer range for its visual status calculation. Input parsing now treats those values as invalid, while the API independently validates all stored counts.

## 3. Engineering review and refactoring

Codex reviewed the UI workflow against the physical factory handoff: count every piece, block shortages, keep the rejection reason, and show only released work to sewing. It moved critical validation into the API and database transaction, with UI feedback mirroring those rules. The SQLite log triggers add a second guard against accidental audit edits. The candidate should personally review and amend this section before submission; no independent human code review has been claimed here.

## 4. Defensive architecture

The application exposes specific transition endpoints instead of a general status setter. Each endpoint checks the authenticated role and the current order state. Approval re-reads saved component counts inside an immediate transaction and returns HTTP 422 if any count is missing or below expected. The sewing query has a literal `WHERE status = 'VERIFIED'` condition. Session data supplies the verifier identity and the database supplies timestamps. Component snapshots and wastage percentages are inserted into immutable audit logs during the transition.

The automated tests exercise valid approval, shortages, missing counts, rejection notes, forbidden roles, sewing query isolation, invalid quantities, audit immutability, and database persistence. Browser visual inspection could not run in this environment because no browser surface was available.
