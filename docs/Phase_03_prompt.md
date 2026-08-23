PASTE INTO CODEX (after Phase 2 is verified and committed).

---

Build Phase 3: Community Verification. Follow AGENTS.md. Continues the ticket state machine from `PENDING_VALIDATION` where Phase 2 left off.

**1. Eligible-validator selection & notification (Part III §9.3):**
- On ticket entering `PENDING_VALIDATION`, find the **15 nearest eligible citizens** (PostGIS distance query, ranked by proximity) and notify them
- Eligibility rules (§9.2), all must hold:
  1. Registered/last-known location within the ticket's verification radius (default 500m, per-ward override from `WardConfig`/`SystemConfig`, §9.1)
  2. Not the original reporter
  3. Not already validated this ticket
  4. Phone-verified account
  5. Under the daily validation cap (default 10/day, from config — not hardcoded)
- Response window: 72 hours. If the 3-validator threshold isn't met by then, notify a fresh batch of the next-nearest eligible citizens (excluding the stale/already-notified batch).

**2. Validation screens:**
- Mobile M-C12 Nearby Verification Request: issue photo, category, distance from user, three actions — "Confirm this exists" / "Not sure" / "Doesn't look right"
- Also build W-C6 on web (same interaction, larger image preview)
- Citizens must not see how others have already validated before submitting their own (no anchoring)

**3. Validation logic:**
- `Validation` record per (ticket_id, citizen_id) — unique constraint, enforces one vote per citizen per ticket
- Once 3 independent validations are received, ticket immediately transitions `PENDING_VALIDATION → VALIDATED` — this must trigger atomically so a race of near-simultaneous 3rd/4th validations doesn't double-fire
- Any validations arriving after the threshold is met are recorded but discarded from the count — no error shown to the late validator, their submission just doesn't move the needle
- On `VALIDATED`, immediately auto-transition to `ROUTED_TO_AGENCY` (table-driven routing lookup — routing table itself comes in Phase 4, so for now just transition the state and leave a TODO hook for the routing call)

**4. API endpoints (§16.2):**
`GET /citizens/me/pending-validations`, `POST /tickets/{id}/validate`

**5. Acceptance:**
- Newly-validation-eligible ticket triggers notifications to exactly the 15 nearest eligible citizens (verify via seed data with known coordinates)
- 3 independent validations flip the ticket state to `VALIDATED` in a single atomic operation
- A 4th, 5th, 6th... notified citizen who tries to validate after the threshold is met gets a graceful "already resolved" response, not an error
- A citizen within radius who is also the original reporter cannot see the ticket in their pending-validations list
- 72h timeout with <3 validations correctly triggers a fresh batch notification to the next-nearest citizens

Update AGENTS.md's build status checklist when done.
