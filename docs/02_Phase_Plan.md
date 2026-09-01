# CivicOS — Phase Plan

12 phases. Each references exact spec sections so Codex implements what's specified, not a guess. Road-Cutting (Phase 8) is deliberately isolated so the flagship demo path can be built and rehearsed without waiting on every category to be "done."

---

### Phase 1 — Foundation: Monorepo, Data Model, Auth
**Spec refs:** Part III §15 (entities), §17 (auth/RBAC), delta doc §4.1–4.2 (RoadSegment/Intervention schema, built now even though not wired until Phase 8)
**Builds:** Turborepo skeleton (`apps/api`, `apps/web`, `apps/mobile`, `packages/db`, `packages/shared`) · Prisma schema for all core entities (User, Role, Ticket, Project, Dependency, Ward, Category, RoutingRule, RoadSegment, Intervention, Observation, Notification, SystemConfig) · Postgres+PostGIS provisioned · Phone-OTP auth (citizen) + email/password+JWT (internal roles) · RBAC middleware · seed script with Bengaluru wards + BWSSB/BESCOM/PWD agencies.
**Acceptance:** Can register/login as each of the 4 roles; JWT-protected route returns 403 for wrong role; `pnpm prisma studio` shows all entities correctly related.

---

### Phase 2 — Citizen Reporting Flow + AI Relevance + Duplicate Detection
**Spec refs:** Part I §6 (complaint workflow), Part III §14.1 (CLIP relevance check), §8 (duplicate/shared-ticket logic), Part II §3.1/§4.1 (citizen mobile+web screens)
**Builds:** Mobile screens: category select → photo upload → geotag → submit · presigned image upload to storage · CLIP relevance check on submit (reject/warn if image doesn't match category) · duplicate detection service (Haversine ≤75m + ≤60 day + optional visual similarity, per §8.1 decision matrix) · ticket creation API.
**Acceptance:** Submitting a photo of a pothole under "Streetlight" gets flagged by relevance check. Submitting a second report of the same pothole within 75m/60 days silently merges into the same ticket ID (citizen sees no "duplicate" language).

---

### Phase 3 — Community Verification
**Spec refs:** Part I §8, Part III §9 (radius, eligibility, quorum), §10.2–10.3 (state machine's validation path)
**Builds:** Nearest-15-eligible-citizen notification batch on ticket creation · validation screens (mobile) · eligibility checks (§9.2: radius, not-reporter, not-already-validated, phone-verified, daily cap) · 3-validator quorum flips ticket to `VALIDATED` · 72h stale-batch re-notify logic.
**Acceptance:** Ticket created → 15 nearest eligible citizens notified → 3 independent validations flips state → 4th+ validations are discarded without error.

---

### Phase 4 — Agency Routing + Project Head Core Workflows
**Spec refs:** Part III §7 (category/routing matrix), Part I §13–15, §19 (inspection, project creation, direct ticket creation/W-P9), Part II §2.3/§4.2 (Project Head web IA/screens)
**Builds:** Table-driven category→agency routing (system-configurable, not hardcoded) · Project Head web dashboard · inspection workflow UI+API · project creation from validated ticket · W-P9 agency-originated ticket creation form (this is reused unmodified in Phase 8).
**Acceptance:** A validated ticket auto-routes to the correct primary agency; a Project Head only sees tickets/projects scoped to their own agency; W-P9 form creates a ticket with no citizen reporter.

---

### Phase 5 — Dependency System
**Spec refs:** Part I §16–18, Part III §12 (dependency state machine), §16.4 (dependency API)
**Builds:** Dependency request creation (Project Head/Engineer) · response menu (assign engineer / unavailable / not-concerned) · escalation path · dependency state machine `REQUESTED → ... → FULFILLED`.
**Acceptance:** Cross-agency dependency request appears in receiving agency's queue; each response path transitions state correctly; unresolved dependency past threshold triggers escalation.

---

### Phase 6 — Executive Engineer Workflows
**Spec refs:** Part I §20–22, §27 (project completion), Part III §11 (project state machine), Part II §2.4–2.5/§3.2/§4.3 (Engineer mobile+web)
**Builds:** Engineer mobile app: assigned work list, geographic projects view, project uptake, completion evidence submission (photo+notes) · project state machine wiring `CREATED → ... → CLOSED`.
**Acceptance:** Engineer accepts a project, timeline becomes editable, submitting completion evidence moves project to `WORK_COMPLETED` and triggers citizen verification flow (Phase 3's validators).

---

### Phase 7 — Conflict Detection Engine (Generic)
**Spec refs:** Part III §13 (detection logic, severity, output), Part I §23–24 (timeline conflict detection, non-blocking)
**Builds:** Geo+date overlap check (200m/same ward, per §13.2 default) running on every project timeline set/modify · severity classification · advisory (non-blocking) warning surfaced to Engineer/Project Head, never a hard stop.
**Acceptance:** Two overlapping projects on the same ward within 200m produce a warning banner; the Engineer can still save the timeline anyway.

---

### Phase 8 — Road-Cutting Intelligence Layer (Flagship)
**Spec refs:** Delta doc §4.1–4.4, §6 (demo script), §5 (pitch framing → analytics labels)
**Builds:**
- `RoadSegment` entity fully wired (already in Phase 1 schema) with PostGIS polyline geometry, ward link, intervention history view
- `Intervention` entity attached 1:1 to `Project` for Road Damage category
- Extended 6-type conflict engine (Spatial, Temporal, Sequencing violation, Restoration-too-early, Repeated-excavation risk, Duplicate intervention) — runs *in addition to* Phase 7's generic check, only for Road category
- Deterministic sequencing recommendation engine (rule-based, explainable — never a black-box model, per AGENTS.md rule 7)
- Agency-initiated planned-intervention flow reusing Phase 4's W-P9 form, extended with segment picker + intervention fields
- Accept/dismiss UX for recommendations (non-blocking, per rule 2)
**Acceptance:** Reproduce the exact demo script (delta doc §6, steps 1–5): three agencies log conflicting interventions on the same segment → system flags Restoration-too-early → sequencing engine recommends pipeline→cable→restoration→resurfacing order → Project Head can accept or dismiss.

---

### Phase 9 — Notifications
**Spec refs:** Part I §26, Part II §6, Part III §16.6
**Builds:** Push notifications (Expo) for mobile roles, in-app notification center for web roles · all trigger points from earlier phases wired (validation requests, dependency responses, completion evidence, conflict/sequencing flags) · notification type→icon/color mapping per Part II §6.2.
**Acceptance:** Every state transition defined in earlier phases produces the correct notification to the correct role, matching Part I §26's per-role notification lists.

---

### Phase 10 — Analytics, System Configuration, Transparency Dashboard
**Spec refs:** Part III §19 (metrics/reporting), §20 (system configuration), delta doc §6 (road-specific metrics table)
**Builds:** Agency-scoped Project Head analytics · public transparency dashboard (`/analytics/public-dashboard`, no auth, anonymized) · road-specific metrics (conflicts detected, repeated-excavation avoided, sequencing recommendations accepted/dismissed, simulated cost saved — labeled per AGENTS.md rule 5) · database-driven system configuration provisioned outside the operational personas.
**Acceptance:** Public dashboard loads with no auth and shows only aggregated data; Project Head analytics remain agency-scoped; routing changes take effect from database configuration without a deploy.

---

### Phase 11 — Design System / UI Polish
**Spec refs:** Part II §1 (design system, brand, color, typography, components, density modes), full §3–4 screen list
**Builds:** Apply brand direction/color palette/typography consistently across web+mobile · shared component library · all screens from Part II §3–4 present and reachable via the navigation IA (§2).
**Acceptance:** Every screen listed in Part II §3–4 exists and is reachable through the specified nav IA for its role; visual consistency pass across mobile and web.

---

### Phase 12 — Demo Data, Rehearsal, Deployment
**Spec refs:** Part I §31 (end-to-end example), delta doc §6 (flagship demo script), §9 (risk mitigation)
**Builds:** Seed data supporting both the general end-to-end example (§31) and the flagship road-cutting script (§6) · deploy API+DB (Railway/Render), web (Vercel), mobile (Expo EAS build/preview link) · full dry-run of both demo scripts end to end on deployed infra, not localhost.
**Acceptance:** Both demo scripts run start-to-finish on the deployed build with no manual DB edits mid-demo; mobile app installable via Expo link on a judge's/your own phone.

---

## Sequencing note
Phases 1–7 build the general platform (matches delta doc §9's "build the category list as data-driven config, only fully wire Road category for the demo" risk mitigation — Phase 7's generic engine covers all 12 categories at the *rule* level even if only Road gets deep UI polish in Phase 11). Phase 8 is the differentiator and should not start until Phases 1, 4, and 7 are solid, since it depends on Project (Phase 4/6) and the base conflict engine (Phase 7) existing first.
