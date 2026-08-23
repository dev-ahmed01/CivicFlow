PASTE INTO CODEX (after Phase 6 is verified and committed).

---

Build Phase 7: Conflict Detection Engine (Generic). Follow AGENTS.md. This fills in the stub left in Phase 6's `CONFLICT_CHECKED` transition — do not change the state machine wiring itself, only the function body.

**1. Detection logic (Part III §13.2), runs whenever a project's timeline is created or modified:**
A conflict is flagged against any *other* active/planned project when ALL hold:
1. Geographic overlap: within 200m (PostGIS `ST_DWithin`) OR same ward/segment identifier — threshold from `SystemConfig`, not hardcoded
2. Date overlap: `[start_date, end_date]` ranges intersect
3. Different agency or different project record (never conflicts with itself)

**2. Severity (§13.3) — advisory only, never blocking (AGENTS.md rule 2):**
- Full date overlap + <100m → prominent warning, still dismissible/continuable
- Partial date overlap or 100–200m → lighter inline note, same non-blocking behavior

**3. Output record (§13.4) — `ConflictLog`:**
Each detected conflict stores: conflicting project ID, conflicting agency, overlapping date range, location description. Write one `ConflictLog` row per detected pair, don't duplicate on re-check unless the underlying timeline actually changed.

**4. UI wiring:**
- Mobile M-E6 Conflict Warning (toast/sheet): conflicting project name, agency, overlapping dates, location; "Continue Anyway" always present and always works
- Web W-E5 Project Detail: conflict panel listing warnings inline (not just a toast) — same non-blocking rule
- `GET /projects/{id}/conflicts` now returns real data instead of Phase 6's stub

**5. Acceptance:**
- Two projects, different agencies, same ward, overlapping dates, <100m apart → prominent warning on both, both projects remain fully editable/saveable
- Same scenario but 150m apart → lighter inline note only
- A project can be saved with the timeline unchanged from a previous conflicting save without creating duplicate `ConflictLog` rows
- Reproduce Part I §23's example scenario from the context doc if one exists in your local copy, to confirm expected output shape matches

Update AGENTS.md's build status checklist when done.
