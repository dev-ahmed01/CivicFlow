PASTE INTO CODEX (after Phase 9 is verified and committed).

---

Build Phase 10: Analytics, Admin Config, Transparency Dashboard. Follow AGENTS.md, especially rule 5 (label simulated metrics).

**1. Metrics (Part III §19.1) — compute from real data across all earlier phases:**
Tickets created/resolved (by category, ward, period) · average time-to-validation (by ward) · average time-to-inspection (by agency) · average resolution time (by category, agency) · dependency response time (by agency) · dependency escalation rate (by agency) · validator participation rate (by ward) · conflict frequency (by ward, agency-pair) · rework rate (by agency, engineer) · citizen "not resolved" rate (by agency)

**2. Road-specific metrics (delta doc §6), extend the same reporting layer:**
Conflicts detected on road segments (by ward, conflict type) · repeated-excavation incidents avoided (by segment, agency) · sequencing recommendations accepted vs. dismissed (by agency, using Phase 8's `SequencingRecommendationLog`) · estimated restoration cost saved — **this one must be computed from an explicit, documented simulated formula and labeled "Simulated/Illustrative" directly in the UI wherever it appears, never presented as measured.**

**3. Reporting surfaces (§19.2):**
- Project Head dashboard widgets — extend Phase 4's W-P2, agency-scoped real-time counts
- Admin analytics module (new role area) — city-wide, filterable by ward/category/agency/date range, CSV/PDF export
- Public transparency dashboard — `GET /analytics/public-dashboard`, **no auth required**, anonymized/aggregated only (no citizen names, no individual ticket details), city-wide resolution stats, category breakdowns, agency performance

**4. Admin panel (Part III §20):**
- `/admin/categories`, `/admin/routing-rules`, `/admin/wards`, `/admin/config`, `/admin/agencies`, `/admin/users` — full CRUD per §16.7
- Wire these to the same tables Phases 1–8 have been reading from all along (categories, routing matrix, thresholds) — editing here must take effect immediately for new tickets/checks, no deploy needed
- Admin login: email+password+optional TOTP 2FA (schema field exists from Phase 1, implement the TOTP flow now)

**5. Acceptance:**
- Public dashboard loads with zero auth and shows no PII of any kind
- Editing a routing rule in `/admin/routing-rules` changes which agency the *next* ticket in that category routes to, without restarting the server
- Every road-specific "cost saved" figure anywhere in the UI (dashboard, public page, demo view) visibly says "Simulated" or "Illustrative" next to the number
- CSV export from the Admin analytics module produces a file matching the filtered view on screen

Update AGENTS.md's build status checklist when done.
