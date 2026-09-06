# Targeted UI and demo-team corrections

Verified locally on 6 September 2026, using agent-browser against web port 3002 and API port 4000. This report supersedes the original README's two-engineer limitation.

## Exact implementation files

| File | Change |
| --- | --- |
| `apps/web/app/project-head/project-head.css` | Non-scrolling lifecycle tabs, scoped summary typography, three-column attention cards, responsive stacking and more room for attention text. |
| `apps/web/app/project-head/page.tsx` | Today uses the dedicated attention component and short-location formatter. Existing ranking, counts and quick-view callbacks remain. |
| `apps/web/app/project-head/_components/attention-card.tsx` | New independent identity, status and action grid cells. |
| `apps/web/app/project-head/_components/work-summary.tsx` | Shared reference, semibold title, muted short-location hierarchy. |
| `apps/web/app/project-head/_lib/work-summary.ts` | Short-location presentation helper using shared contract types. |
| `apps/web/app/project-head/_lib/work-summary.test.ts` | Seven formatter cases including postal suffixes, legacy labels and missing data. |
| `apps/web/app/project-head/projects/page.tsx` | Work summaries use the shared component and canonical project title. |
| `apps/web/app/project-head/teams/page.tsx` | Alphabetical engineer list and shared summaries for assigned/selectable work. |
| `apps/web/app/project-head/_components/coordination-register.tsx` | Only compact related-work summaries use the shared hierarchy and formatter. |
| `packages/db/seed.ts` | Three Roads demo engineers and non-resetting `team_only` seed mode. |

Documentation/evidence additions: this file, `verify-corrections.ps1`, `correction-audit.jsonl`, the PNGs listed below, and the completion entry in `AGENTS.md`.

## Causes and fixes

The Work row inherited `overflow-x: auto` from `.portal-tabs` and `.project-head-shell .ph-work-tabs` in `globals.css`. That makes the other axis compute to `auto`; the shared tab buttons also had a negative bottom margin. The scoped final rule now uses flex, wrapping when necessary, `overflow: visible` on both axes and zero bottom margin on these buttons. No height constraint or hidden scrollbar workaround was added. All five desktop tabs, counts, filters and underlines remain.

Today previously rendered `ActionCard` from `app/_components/operational-ui.tsx`. Its nested grids and several older `.operational-card-*` overrides constrained the identity area. The final title styles targeted `.operational-card-identity`, which the component never rendered. Today now uses `AttentionCard`: `minmax(0, 1fr) auto auto`, 16px separation, independent status and CTA cells, and a zero-minimum-width identity. Titles are 16px semibold and limited to two lines. References stay on one line; locations ellipsize. Below 760px identity spans the first row, with status/action below. The existing Today sections remain, with more desktop width allocated to attention text.

`getShortWorkLocation` uses recorded road/locality components before city/state/postal suffixes, then available locality/ward or a short recorded label. It drops middle-dot description tails in the supplied examples. Legacy labels containing the work title use an explicit `near ...` place from that recorded title, or the recorded ward. Missing data reads `Location not recorded`. Work detail content is unchanged. Notification messages were inspected; they are event summaries with optional payload context, not complete work records, and were left unchanged rather than inventing reference/location data.

## Seed and assignment evidence

The live database initially had two Roads engineers. Their IDs, email credentials, 15 and 1 assigned project relations, and existing dependency relation were preserved. `seedPwdDemoEngineers` in `packages/db/seed.ts` is used by the normal seed and `DEMO_SEED_MODE=team_only`.

| Display name | Stable ID suffix | Login email | Assigned project relations |
| --- | --- | --- | --- |
| Engineer - 01 | 201 | engineer.pwd@civicos.local | 15 |
| Engineer - 02 | 204 | engineer.bbmp@civicos.local | 1 |
| Engineer - 03 | 205 | engineer03.pwd@civicos.local | 0 |

All three use existing `ENGINEER` role and the Project Head's agency `20000000-0000-4000-8000-000000000003` (BBMP Road Infrastructure / Roads). The unused fourth fixture is no longer created; a guarded retirement handles earlier seeds only when it has no assignment relations. No users were deleted. Other agencies' engineers remain.

The team-only mode ran twice successfully and a Prisma query confirmed exactly three active Roads engineers with unchanged existing assignment counts. It updates names on existing accounts and creates the missing user through Prisma; no work fixtures, schema, auth or assignment API was modified.

Agent-browser confirmed the Team list order 01, 02, 03 and clicked each engineer; the right-panel heading changed each time. Engineer - 03 shows zero current/active/pending work and no deadline. The real work-assignment drawer displayed all three users; selecting each updated `aria-pressed`. Assignment submission was not performed. Inspection and work controls use the same `/project-head/engineers` roster; the live database has no eligible inspection tickets, so a live inspection-assignment submission was not verified.

## Checks

| Check | Result |
| --- | --- |
| Frontend explicit `tsc --noEmit` | Passed |
| Frontend lint | Passed, zero warnings |
| Frontend production build | Passed, 36 static pages generated |
| Frontend tests | 27 passed in 6 files |
| API tests | 120 passed in 23 files |
| Database tests | 17 passed in 3 files |
| Database lint and seed TypeScript compilation | Passed |
| Seed idempotence / actual DB roster | Passed; exactly three active Roads engineers |
| Work and Today responsive DOM audits | Passed at 1536×864, 1440×900, 1280×800 and 390×844 |
| Work tab clicks | All 16, Upcoming 12, Ongoing 2, Review 2, Completed 0; correct row counts and active underline |
| Browser error log | No errors reported |

The environment did not expose `pnpm` on PATH, so checks used the installed equivalent `node node_modules/pnpm/bin/pnpm.cjs ...`. The seed was compiled with the database workspace TypeScript configuration and run with root `.env` and `DEMO_SEED_MODE=team_only`.

## Screenshots and limits

All following paths are in this directory. Desktop captures were visually inspected, alongside DOM rectangle checks. The live Today queue contains older acceptance-test work and does not expose all requested states in its first four cards. The separately named **today-fixture** captures use temporary browser-only fetch responses: two inspection examples and the existing South End Circle completion/Segment X works. These passed identity/status/action collision checks at all four widths. No fixture data was written to the API or database; live fetch behavior was restored afterward. Completion and coordination actions were visually checked, not submitted.

| Evidence | Exact files |
| --- | --- |
| Live Today | `correction-today-1536.png`, `correction-today-1440.png`, `correction-today-1280.png`, `correction-today-390.png` |
| Work tabs/rows | `correction-work-1536.png`, `correction-work-1440.png`, `correction-work-1280.png`, `correction-work-390.png` |
| Browser-only attention fixture | `correction-today-fixture-1536.png`, `correction-today-fixture-1440.png`, `correction-today-fixture-1280.png`, `correction-today-fixture-390.png` |
| Each selected engineer | `correction-team-01.png`, `correction-team-02.png`, `correction-team-03.png` |
| Real assignment roster | `correction-assignment.png` |
| Compact coordination related work | `correction-related-work.png` |

[Work at 1280](correction-work-1280.png) · [Attention fixture at 1280](correction-today-fixture-1280.png) · [Team empty state](correction-team-03.png) · [Assignment roster](correction-assignment.png)
