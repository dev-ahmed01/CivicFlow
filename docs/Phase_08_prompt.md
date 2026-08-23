PASTE INTO CODEX (after Phases 1, 4, and 7 are verified and committed — this phase depends on all three). Follow AGENTS.md strictly, especially rules 2 (non-blocking) and 7 (explainable sequencing).

---

Build Phase 8: Road-Cutting Intelligence Layer — the flagship SIH differentiator. This is additive on top of the generic conflict engine (Phase 7), scoped to the Road Damage category only. Do not modify Phase 7's generic engine — this runs *in addition to* it.

**1. `RoadSegment` and `Intervention` — already in the Phase 1 schema, wire the logic now:**
- `RoadSegment.intervention_history` — implement as a derived view/query (all `Intervention` records referencing this segment), not a stored/denormalized field
- `Intervention` is 1:1 with `Project` for Road Damage category projects only — when a Project Head creates a Road Damage project (via Phase 4's W-P6 or the new flow below), attach an `Intervention` row with: `segment_id`, `requesting_agency`, `purpose` (pipeline/cable/OFC/resurfacing/other), `planned_start`/`planned_end` (mirrors Project timeline), `affected_length_m`, `dependency_refs`

**2. Agency-initiated planned-intervention flow — extends Phase 4's W-P9 form, do not rebuild it:**
- Add a `RoadSegment` picker (searchable by road name/ward) and the `Intervention` fields above, shown conditionally when category = Road Damage
- This produces a `Project` (per Phase 4's existing agency-originated path) with an attached `Intervention`
- Citizen-reported road damage (reactive, from Phase 2's normal flow) can also attach to an existing `RoadSegment` if one exists at that location — link it as a secondary path, not required for the primary flagship flow

**3. Extended 6-type conflict engine, Road Damage category only — runs after Phase 7's generic check, only when both projects reference the same `RoadSegment`:**

| Type | Logic | Severity |
|---|---|---|
| Spatial | Two interventions' `affected_length_m` ranges overlap on the exact same `segment_id` (not the 200m radius — exact segment match) | High |
| Temporal | `[planned_start, planned_end]` ranges intersect | Medium–High |
| Sequencing violation | Intervention B starts before a declared dependency (Intervention A, via `dependency_refs`) reaches `WORK_COMPLETED` | High |
| Restoration-too-early | A resurfacing/restoration intervention scheduled while another intervention on the same segment is still `WORK_IN_PROGRESS` or has unresolved dependencies | High |
| Repeated-excavation risk | New intervention's `planned_start` falls within 90 days (config, not hardcoded) of `RoadSegment.last_restoration_date` | Medium — flag even with no other active intervention on the segment, this is a single-record risk |
| Duplicate intervention | Two records: same segment, same agency, overlapping dates, similar `purpose` | Medium — routes to Project Head for manual merge, **never auto-merge agency-originated records** (unlike citizen ticket merging in Phase 2, which is a different, already-approved auto-merge case) |

All six checks stay advisory/non-blocking — "Continue Anyway" always available, per AGENTS.md rule 2.

**4. Sequencing Recommendation Engine — the actual differentiator, deterministic, not a model:**
Triggered when a Sequencing violation or Restoration-too-early conflict is detected. Rule set, in order:
1. Identify all interventions on the affected segment with overlapping or dependent timelines
2. Utility work (pipeline, cable, OFC) always ordered before resurfacing
3. Among utility work, order by declared dependency (`dependency_refs`) first, then by requested date
4. Consolidated restoration is recommended only once all utility work on the segment reaches `WORK_COMPLETED`
5. Generate a plain-language explanation string following this pattern: name the conflicting agencies/work types, state the specific problem (e.g. "resurfacing before cable work completes will likely require re-cutting"), then state the recommended order with dates
6. Every recommendation must carry a machine-readable trace of which rule(s) above produced it — this is what makes it explainable to a judge asking "why this order," not just a nice sentence
- Present as **advisory**: Project Head can Accept / Modify / Dismiss. Dismissal is logged (create an audit/log entry — reuse Phase 5/6/7's notification-adjacent logging pattern if one exists, otherwise a simple `SequencingRecommendationLog` table: recommendation_id, segment_id, proposed_order, outcome [accepted/modified/dismissed], acted_by, acted_at)

**5. UI:**
- Extend W-P9/W-P6 (Phase 4) and the conflict panel (Phase 7's W-E5/M-E6) to show Road-specific conflict types with the same visual treatment, plus a distinct "Sequencing Recommendation" panel/card showing the plain-language explanation and Accept/Modify/Dismiss actions
- RoadSegment intervention history should be viewable on the segment (simple list view: past + planned interventions, dates, agencies, purpose — this is what makes "dug up 4 times this year" a visible fact)

**6. Acceptance — reproduce the exact flagship demo script (delta doc §6) end to end:**
1. Road authority Project Head logs planned resurfacing on Segment X, Jun 20–24 → `Intervention` created
2. BWSSB Project Head logs pipeline intervention on the same segment, Jun 10–16 → system flags **Restoration-too-early** against the resurfacing intervention
3. Sequencing engine generates a recommendation: reorder pipeline → cable → consolidated restoration → resurfacing, shown to both Project Heads with plain-language explanation
4. BESCOM Project Head logs cable intervention, Jun 15–18 → third conflict layer added, recommendation updates to include all three
5. Road authority Project Head reviews and accepts a revised resurfacing date (Jun 22+) — verify this is non-blocking (could also dismiss; test the dismiss path too and confirm it's logged, not silently dropped)
6. All six conflict types are independently testable with seed data (write a seed scenario or test fixture per type, not just the demo script's three)

Update AGENTS.md's build status checklist when done.
