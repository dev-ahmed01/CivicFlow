PASTE INTO CODEX (after Phase 9 is verified and committed).

---

Build Phase 10: Analytics, System Configuration, Transparency Dashboard. Follow AGENTS.md, especially rule 5 (label simulated metrics).

**1. Metrics (Part III §19.1) — compute from real data across all earlier phases:**
Tickets created/resolved (by category, ward, period) · average time-to-validation (by ward) · average time-to-inspection (by agency) · average resolution time (by category, agency) · dependency response time (by agency) · dependency escalation rate (by agency) · validator participation rate (by ward) · conflict frequency (by ward, agency-pair) · rework rate (by agency, engineer) · citizen "not resolved" rate (by agency)

**2. Road-specific metrics (delta doc §6), extend the same reporting layer:**
Conflicts detected on road segments (by ward, conflict type) · repeated-excavation incidents avoided (by segment, agency) · sequencing recommendations accepted vs. dismissed (by agency, using Phase 8's `SequencingRecommendationLog`) · estimated restoration cost saved — **this one must be computed from an explicit, documented simulated formula and labeled "Simulated/Illustrative" directly in the UI wherever it appears, never presented as measured.**

**3. Reporting surfaces (§19.2):**
- Project Head dashboard widgets — extend Phase 4's W-P2 with agency-scoped real-time counts and filters
- Public transparency dashboard — `GET /analytics/public-dashboard`, **no auth required**, anonymized/aggregated only (no citizen names, no individual ticket details), city-wide resolution stats, category breakdowns and agency performance
- Do not add a global operational persona or grant Project Heads cross-agency private analytics

**4. System configuration (Part III §20):**
- Keep categories, routing, wards and thresholds database-driven through `SystemConfig` and related tables
- Provision global configuration through controlled system operations outside the three operational personas
- Do not expose unrestricted configuration or user CRUD to Project Heads

**5. Acceptance:**
- Public dashboard loads with zero auth and shows no PII of any kind
- Project Head analytics are restricted to the authenticated user's agency, even when another agency is supplied in query parameters
- Routing and thresholds are read from database configuration without hardcoded enums or process restarts
- Every road-specific "cost saved" figure anywhere in the UI visibly says "Simulated" or "Illustrative" next to the number

Update AGENTS.md's build status checklist when done.
