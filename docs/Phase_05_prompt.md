PASTE INTO CODEX (after Phase 4 is verified and committed).

---

Build Phase 5: Dependency System. Follow AGENTS.md.

**1. Dependency state machine (Part III §12) — implement the full enum:**
`REQUESTED → PENDING_RESPONSE → (ASSIGNED / DECLINED_UNAVAILABLE / DECLINED_NOT_CONCERNED / ESCALATED)`, with:
- `DECLINED_UNAVAILABLE → REQUESTED` (requesting side can re-send)
- `DECLINED_NOT_CONCERNED` is terminal — system never auto-re-routes, human must manually pick a different agency
- `ESCALATED` after 48h no-response — surfaces contact info to requester, a Project Head can manually mark `ASSIGNED` if resolved out-of-band, but **system never auto-approves/auto-rejects**
- `ASSIGNED → FULFILLED` when the assigned engineer marks their portion complete

**2. Dependency Assessment screen (W-P5):**
- Multi-select target agencies, requirement/statement-of-need text field per agency, deadline auto-set to created_at + 48h
- Uses the `RoutingRule` pre-suggestions from Phase 4 as suggested (not auto-selected) target agencies
- Accessible from the project creation flow (W-P6, extends Phase 4) — dependency requests can be attached during project creation

**3. Dependency Inbox/Outbox screens:**
- W-P7 Dependency Inbox (received): table with response-required flag, countdown timer to 48h, response menu with exactly three choices — Assign Engineer / Unavailable / Not Our Scope
- W-P8 Dependency Outbox (sent): status per request (Pending / Responded / Escalated), target agency, deadline
- Mirror both on mobile as M-E9 (Engineer's Dependency Inbox/Outbox) and on Engineer web as W-E7

**4. Escalation job:**
- Background job (cron or queue-based, your choice) that scans `PENDING_RESPONSE` dependencies past 48h and transitions them to `ESCALATED`, firing the appropriate notification (Phase 9 will wire actual delivery, for now just create the `Notification` row)

**5. API endpoints (§16.4):**
`POST /projects/{id}/dependencies`, `GET /dependencies?direction=sent|received&status=`, `POST /dependencies/{id}/respond`

**6. Acceptance:**
- Creating a dependency request from Agency A targeting Agency B appears in Agency B's W-P7 inbox with a live countdown
- Each of the three response menu choices produces the correct state transition
- A dependency left unanswered for 48h (simulate by backdating `created_at` in a test) auto-transitions to `ESCALATED`
- `DECLINED_NOT_CONCERNED` never auto-reassigns — verify no background process moves it off terminal state

Update AGENTS.md's build status checklist when done.
