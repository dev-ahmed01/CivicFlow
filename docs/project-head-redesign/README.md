# Project Head reference redesign

Implemented against the seven supplied approved references. Local preview: http://localhost:3002/project-head. The API remains at localhost:4000. No deployment was performed.

## Changes and files

Paths below are relative to the repository root.

| Area | Files | Result |
| --- | --- | --- |
| Shared shell | `apps/web/app/layout.tsx`, `apps/web/app/project-head/project-head.css`, `apps/web/app/project-head/_components/project-head-shell.tsx` | Role-scoped green navigation, unified canvas, larger headings, consistent cards and controls, responsive layout, skip link and existing profile/notification access. |
| Today | `apps/web/app/project-head/page.tsx` | Attention list and four linked Command Centre cards; removed repeated map, schedule, activity and work summaries. |
| Work | `apps/web/app/project-head/projects/page.tsx`, `pipeline.ts`, `pipeline.test.ts` | Five lifecycle tabs, readable registry rows, sorting, existing pagination and quick views. Legacy state drill-down URLs remain supported. |
| Schedule | `apps/web/app/project-head/work-calendar/work-calendar-client.tsx` | Map/Timeline workspace, period controls, selected-work details and history; simplified the filter area. |
| Coordination | `apps/web/app/project-head/_components/coordination-register.tsx`, `coordination-composer.tsx`, `apps/web/app/project-head/coordination/[id]/coordination-detail-client.tsx` | Agency request register and detail/composer workspace, draft saving through existing APIs, expandable supporting context in embedded details. |
| Team | `apps/web/app/project-head/teams/page.tsx` | Engineer master/detail view, actual capacity and deadlines, assigned work and assignment review. |
| Insights | `apps/web/app/project-head/reports/page.tsx`, `apps/web/app/project-head/_components/report-charts.tsx` | Date-driven reports, four real metrics, accessible volume and resolution charts, expandable existing detailed tables. |
| Notifications | `apps/web/app/_components/notification-center.tsx` | Project Head row presentation and category labels; original grouping, read state and actions retained. |
| Local build isolation | `apps/web/next.config.mjs`, `apps/web/tsconfig.json`, `.gitignore`, `eslint.config.mjs` | Development uses `.next-dev` so production verification cannot corrupt a running preview. |
| Verification | `docs/project-head-redesign/*`, `AGENTS.md` | Screenshots, responsive audit script/results and implementation status. |

Shared additions are the Project Head CSS tokens/layout patterns and `VolumeChart` / `ResolutionChart`. Existing `PageHeader`, operational cards, quick-view drawers, assignment cards, notification logic and coordination components are reused.

## Preserved behavior

- Existing authentication, server-side role/agency scope checks, API contracts, Prisma schema and backend business logic are unchanged.
- Today metrics and attention records use the existing endpoints. Active, conflict, overdue and upcoming cards retain functional drill-downs.
- Lifecycle tabs are presentation groups. Underlying ticket/project states and assignment, inspection, uptake, execution, review and closure rules remain unchanged. Cancelled history retains an explicit cancelled label.
- Work quick views, full records, legacy query links, pagination, sorting and registration entry points remain available.
- The existing MapLibre map, geometry, external basemap, selection, zoom, region search, timeline and permanent location history remain in use.
- Coordination sends and draft saves use the existing request lifecycle. Conflict warnings remain advisory and their existing explanations remain accessible.
- Team capacity comes from `EngineerCapacitySummary`; reassignment decisions and blocker resolution remain available.
- Reports retain explicit date submission and real API data. Notification grouping, expansion, read handling, pagination and related-record links are retained. Shared notification changes are conditional on the Project Head role.

## Deliberate differences from the references

- No invented thumbnails, completion percentages, engineer identities, skills, phone numbers, trends or notification KPI totals were added. The current list/report contracts do not supply all those values.
- Insights charts show available ticket volume/resolution data instead of relabeling it as coordination request metrics. No illustrative cost/time savings are shown.
- Team shows the actual two engineers and computed availability in this local database, rather than the three fictional people in the reference.
- The local agency and record titles come from existing data, including older acceptance-test records. Counts, row heights and dates therefore differ from the mockups.
- Work retains the existing page size rather than forcing five screenshot-like records. Long real titles wrap. Forms and detail panels retain necessary workflow fields and supporting context.
- Schedule retains its existing initial date window (120 days back, 245 days forward), result limit and map provider. The removed broad filter toolbar is replaced by the requested period and map-region controls.

## Automated verification

| Check | Result |
| --- | --- |
| Web tests | Passed: 20 tests in 5 files, including lifecycle mapping and existing Schedule tests. |
| Web production build | Passed: all 36 static pages generated and dynamic routes compiled. |
| Type checking | Passed: explicit TypeScript check and production build type validation. |
| Web lint | Passed with zero warnings. |
| API tests | Passed: 120 tests in 23 files. No backend source was changed. |
| Diff whitespace check | Passed. |
| Browser error check | Fresh authenticated verification session reported `errors: []` after final responsive navigation. |
| Responsive audit | No document-level horizontal overflow, Next error overlays or visible alerts in the audited page states at 1536, 1440, 1280 and 390 pixels. |

Browser checks used `agent-browser` with the real local frontend/API and seeded Project Head account. Screenshots document specific tested states; they are not a claim that every possible workflow state was exercised.

## Routes and screenshots

Each primary page has full-page captures with `-1536`, `-1440`, `-1280` and `-390` suffixes.

| Route | Desktop evidence |
| --- | --- |
| `/project-head` | [Today](today-1440.png) |
| `/project-head/projects` | [Work](work-1440.png) |
| `/project-head/work-calendar` | [Map](schedule-1440.png), [selected map work](map-selection.png), [Timeline](schedule-timeline-1440.png) |
| `/project-head/dependencies` | [Coordination](coordination-1440.png), [sent request](coordination-sent.png) |
| `/project-head/teams` | [Team](team-1440.png) |
| `/project-head/reports` | [Insights](insights-1440.png) |
| `/project-head/notifications` | [Notifications](notifications-1440.png) |
| `/project-head/projects/new` | [Registration](registration-1440.png) |

Also opened existing coordination and project detail routes during request, completion-review and notification checks. Phase screenshots preserve the earlier visual review checkpoints.

Retained secondary routes were also opened and captured: `/project-head/conflicts`, `/project-head/grievances`, and `/project-head/profile`. Verified legacy redirects: dependency inbox/outbox to Coordination, tickets to Work with `view=INTAKE`, and tickets/new to planned-work registration. Their captures use the `route-` prefix. The browser error check remained empty after this navigation.

## Manual workflows and limits

- Passed: Today and Work load; all five lifecycle tabs update selection and rows (12 Upcoming, 2 Ongoing, 2 Review, 0 Completed, 16 All in the tested database); sorting changes; work quick views and full records open.
- Passed: Map/Timeline switching, timeline selection, map marker selection, road-history opening, zoom and map-region search.
- Passed: engineer selection and existing assignment picker; report submission; notification expansion and navigation to its linked project.
- Passed: saved a clearly labeled local verification draft, then sent it through the real API. Request `b54c7f06-3899-4e42-9212-c0f779d25aa2` is titled `UI verification - BTM schedule coordination`; sending created dependency `86065b20-bafd-48c2-9923-5dd1d0bc4c09`. This local test record remains in the database.
- Opened the planned-work registration form; did not submit another work solely for visual testing.
- Opened completion review through the existing work record. The selected record has an existing grievance and retains its review restrictions; final closure was not performed.
- Inspection assignment could not be completed because the local dataset contains no tickets in the eligible `ROUTED_TO_AGENCY` / `INSPECTION_DUE` states.
- Engineer assignment on legacy work `CW202608004` reached the unchanged API but was rejected with `A complete proposed date range is required`. The existing quick-view assignment sends only `engineerId`; this legacy record has incomplete dates. No backend validation was bypassed, and no successful assignment is claimed.
- The external basemap can load more slowly than the application data. The map was checked after tiles rendered.

The incomplete assignment and unavailable inspection fixture are outstanding verification limits, not hidden passing checks. No database reset or fabricated production data was used to make the screenshots match.
