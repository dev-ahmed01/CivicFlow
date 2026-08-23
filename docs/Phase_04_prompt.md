PASTE INTO CODEX (after Phase 3 is verified and committed).

---

Build Phase 4: Agency Routing + Project Head Core Workflows. Follow AGENTS.md.

**1. Table-driven agency routing (Part III §7):**
- Wire the routing hook left as a TODO at the end of Phase 3: on `VALIDATED → ROUTED_TO_AGENCY`, look up `Category.primary_agency_id` and assign the ticket to that agency's Project Head queue
- Also surface `RoutingRule` (commonly-associated dependency agencies) as *pre-suggestions* only, never auto-created dependencies — this list is used later in Phase 5's dependency assessment screen
- Both the category→agency mapping and the dependency-agency associations must be editable via admin endpoints (stub the endpoints now if Phase 10's full admin UI isn't built yet — the DB-driven lookup itself must work today, not be hardcoded in application code)

**2. Project Head web app (`apps/web`) — Part II §4.2:**
- W-P1 Login (agency-scoped)
- W-P2 Dashboard — summary tiles: new validated tickets, inspections due, dependency requests pending, active projects count (real counts from the DB, not placeholders)
- W-P3 Validated Tickets Queue — table: Ticket ID, category, ward, validated date, inspection-due indicator, scoped to the logged-in Project Head's agency only (enforce server-side per AGENTS.md rule 1)
- W-P4 Ticket Detail — Inspection: upload inspection report (file/photo), notes field, "Inspection Complete" action → advances ticket `INSPECTION_DUE → INSPECTION_COMPLETE`
- W-P6 Create Project: assign Executive Engineer from agency roster dropdown, review + create → advances ticket `INSPECTION_COMPLETE → PROJECT_CREATED → ENGINEER_ASSIGNED`, creates `Project` row in `CREATED` state
- W-P9 Agency-Originated Ticket Creation: category, description, evidence upload, ward — skips citizen validation entirely (`Ticket.reporter_id` is null, ticket enters directly at `ROUTED_TO_AGENCY` since there's no citizen validation step to run). **Build this reusably — Phase 8 extends this exact form, don't hardcode assumptions that would block adding a RoadSegment picker later.**

**3. API endpoints (§16.3 partial):**
`POST /tickets/agency-originated`, `GET /tickets?status=&category=&ward=`, `POST /tickets/{id}/inspection-report`, `POST /projects`, `GET /projects/{id}`, `GET /projects?status=&agency=&ward=`

**4. Acceptance:**
- A ticket reaching `VALIDATED` auto-routes to the correct agency purely from the DB routing table — changing a `Category.primary_agency_id` row and creating a new ticket routes it differently, no code change needed
- A Project Head logged into Agency A cannot see or act on tickets/projects belonging to Agency B (verify with two seeded Project Heads)
- W-P9 creates a valid ticket with no reporter, correctly skips straight past the validation states
- Creating a project via W-P6 assigns an engineer and creates the `Project` row in `CREATED` state, ticket moves to `ENGINEER_ASSIGNED`

Update AGENTS.md's build status checklist when done.
