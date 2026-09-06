# Engineer Portal UX and navigation correction

Completed 6 September 2026. Frontend-only work; no backend, database, shared domain contracts, map provider, or Project Head page redesign was performed in this pass.

## 1. Files modified

Paths are relative to the repository root. Some early Engineer changes were included in a repository commit made while this task was in progress; this inventory covers the entire pass, not only the final working-tree diff.

- `apps/web/app/engineer/layout.tsx` — Suspense boundary for URL-driven client state.
- `apps/web/app/engineer/_components/engineer-shell.tsx` — installs history provenance tracking.
- `apps/web/app/engineer/_components/engineer-ui.tsx` — reusable interactive summary card.
- `apps/web/app/engineer/_components/back-button.tsx` — history-aware detail Back button.
- `apps/web/app/engineer/_components/project-list.tsx` — lifecycle cards, accurate paginated counts, attention/blocked collections, URL state.
- `apps/web/app/engineer/_lib/navigation.ts` — query updates, pagination normalization, safe history provenance.
- `apps/web/app/engineer/_lib/navigation.test.ts` — four navigation regression tests.
- `apps/web/app/engineer/_lib/work-data.ts` — existing stage API pagination and overdue predicate.
- `apps/web/app/engineer/_lib/work-data.test.ts` — two pagination/scope regression tests.
- `apps/web/app/engineer/page.tsx` — Today drill-downs and real contextual CTA.
- `apps/web/app/engineer/inspections/page.tsx` — four lifecycle cards; removes tabs and search/filter toolbar.
- `apps/web/app/engineer/inspections/[id]/inspection-detail-client.tsx` — contextual Back.
- `apps/web/app/engineer/projects/[id]/project-detail-client.tsx` — contextual Back.
- `apps/web/app/engineer/map/page.tsx` — disclosure and URL-backed selected work/list expansion.
- `apps/web/app/engineer/notifications/page.tsx` — controlled category/page state on the shared feed.
- `apps/web/app/engineer/engineer.css` — targeted typography, interaction, disclosure, notification, and responsive styling.
- `apps/web/app/_components/notification-center.tsx` — optional controlled navigation and Engineer feed presentation, using existing notification destinations.
- `AGENTS.md` — completion status.
- `docs/engineer-ux-correction/` — this report, agent-browser verification script, audit JSONL, and screenshots.

## 2. Components reused or refactored

Reused `NotificationCenter`, `NotificationBell`, `ActionButton`, `PaginationControls`, `PageHeader`, `PortalStatePill`, the existing `WorkMap`, existing work actions, API clients, and shared notification presentation/destination helpers. Added `EngineerStatCard` and `EngineerBackButton`. Project Head notification rendering remains on the existing shared component and its existing styles.

## 3–4. My Work controls

Removed the Assigned/Scheduled/Active/Completed tab row completely. The four cards are native buttons with hover/focus feedback, `aria-pressed`, a pale selected surface, and a stronger border. Clicking a selected card clears the selection; a small Show all work button also clears it.

Assigned retains `/projects?scope=assigned`; the other cards retain the existing `scope=mine&stage=...` queries. Every API page is read, fixing the former 50-record summary cap and allowing the Completed count to include CLOSED records. Overdue is computed from outstanding action deadlines and shown separately. Existing acceptance, timeline, update, completion, and evidence/detail actions remain.

## 5. Today cards

- Active works → `/engineer/projects?state=active`.
- Needs attention → `/engineer/projects?state=attention`, containing pending assignments, overdue work actions, assigned/overdue inspections, and open dependencies assigned to the engineer.
- Dependencies → existing `/engineer/dependencies` workspace.
- Blocked → `/engineer/projects?state=blocked`, using unique work IDs from the existing open blocker API.

All four are whole-card links. The attention banner's Review now action opens the specific assignment, inspection, or blocked project.

## 6–8. Inspections

Removed the entire lifecycle tab row and the search/priority/status/time toolbar, including its local filter state. Assigned, Accepted, In Progress, and Submitted remain accessible through exactly four native card buttons. Submitted continues to include REVIEWED records, with an accurate explanatory subtitle. All includes other existing statuses such as cancelled records. Total count appears next to the list heading. Empty states describe the selected lifecycle directly.

## 9. Mapped work list

Replaced the plain summary text with a full-width, bordered disclosure button. Measured height: 48px. It has `aria-expanded`, keyboard activation, focus feedback, a rotating chevron, and a real count badge. Existing list rows continue selecting the real map work. Removed the redundant large Tip card. The map implementation, markers, data queries, geometry, and cross-agency read-only behavior were retained.

## 10. Notifications

Engineer uses the same shared feed and date groups as Project Head, with compact horizontal rows, restrained typography, pale category badges, contextual destinations, and expandable runs of related updates. Categories are shown only when present in the Engineer's actual notifications. Engineer categories are applied before frontend pagination across the API pages, so a category is not silently limited to the current server page. Existing notification-read behavior continues for the displayed page.

## 11. Back-navigation diagnosis

Confirmed code-level causes were local-only lifecycle/filter changes, My Work reading `view` only once and otherwise defaulting to Active, and explicit detail Back links always navigating to unfiltered parent lists. Those changes did not create history entries and lost the originating notification/map/list context. No normal authorized-navigation `replace('/engineer')`, Engineer middleware redirect, or mount redirect to Today was found. Login/logout and expired-session redirects were authentication redirects, and were preserved. The exact reported browser jump directly from a detail page to Today was not reproduced against the original code before editing; it is not attributed to an unverified auth defect.

## 12. Exact navigation fix

Meaningful list changes use Next router push with `scroll: false`, updating URL query parameters. Detail Back uses `router.back()` only when the browser entry records a previous Engineer workflow location. The shell preserves Next's own history state while attaching this provenance. Direct-entry fallbacks use the logical parent (`/engineer/projects` or `/engineer/inspections`) instead of Today. Map selection/list expansion replace the current map entry so they do not add a history stop for every marker/disclosure interaction. No API or auth rules changed.

## 13. State restoration

Implemented URL state: work lifecycle/attention/blocked state and page; inspection lifecycle and page; notification category and page; map selected work and disclosure expansion. Legacy `?view=assigned` links still work. Browser tests confirmed Active, Needs Attention, Submitted inspection state, notification Conflicts category, and selected map work restore after detail navigation. Inspection state and map selection/expansion also survive refresh. Precise scroll-position restoration was not separately implemented or comprehensively verified; map viewport and advanced map filters still use their original local state.

## 14–16. Automated checks

- Frontend TypeScript: `tsc --noEmit --incremental false -p apps/web/tsconfig.json` — passed.
- Frontend lint: `pnpm --filter web lint` — passed, zero warnings.
- Frontend production build: `pnpm --filter web build` — passed, 36 pages generated.
- Frontend tests: `pnpm --filter web test` — 33 passed across 8 files, including 6 new regression tests.
- Backend tests: not run; backend source was not changed.
- Browser errors command returned no page JavaScript errors at the end of verification.
- Development server logged webpack cache snapshot warnings; compilation and production build completed successfully.

## 17. Routes and flows visually/functionally verified

Used the installed agent-browser CLI with real local APIs and seeded Engineer accounts. No frontend response fixtures or fabricated records were used.

| Route or flow | Result |
| --- | --- |
| `/engineer` at 1440×900 and 390×844 | All four cards navigate correctly; contextual attention CTA retained; no horizontal overflow. |
| `/engineer/projects` at both sizes | No duplicate tabs; all four cards select correct states. Observed real counts: 6 Assigned, 1 Scheduled, 2 Active, 2 Completed. Assignment and active-work actions render. |
| Today → Active → work detail → Back → Today | Browser Back and explicit detail Back verified; Active remains selected. |
| Today → Needs Attention → assignment detail → Back | Both Back methods return to the attention collection. |
| Today → Dependencies / Blocked | Both reach existing functional destinations; Blocked was empty for this account. |
| `/engineer/inspections` at both sizes | Four cards, no duplicate tab row or toolbar. Accepted and In Progress contextual empty states verified. |
| Submitted → real reviewed inspection → Back/Forward/explicit Back/refresh | Passed with BESCOM's existing inspection, preserving Submitted. |
| `/engineer/map` at both sizes | Provider and real data render; marker pointer click opens selected-work panel. |
| Mapped works disclosure | Enter/Space interaction checked; final measurement 48px, 9 real works and 9 rows, expanded chevron true; URL state survives refresh. |
| Map → owned work detail → browser/explicit Back | Returns to Map with selected work retained. |
| `/engineer/notifications` at both sizes | Real feed, categories and date groups render; Assignments and Conflicts filters work. |
| Conflicts notification → work detail → browser/explicit Back | Returns to Notifications with Conflicts selected. |
| Direct work detail → explicit Back | Falls back to My Work. |
| Direct inspection detail → explicit Back | Falls back to Inspections. |

Real detail routes checked include:

- `/engineer/projects/81d50a83-6bfc-4c25-8408-a2d02a88d951`
- `/engineer/projects/9e2b368a-e8d9-4201-b48b-e9c633d6c173`
- `/engineer/projects/82000000-0000-4000-8000-000000000001`
- `/engineer/inspections/90000000-0000-4000-8000-000000000004`

Data-dependent limits: the available demo accounts had no Assigned, Accepted, or In Progress inspection records. Their cards and empty states were tested, but a populated Assigned → inspection detail flow could not be tested; a real Submitted/Reviewed inspection exercised the same detail Back component. The primary demo account had no open assigned dependency or blocked-work records, so their populated drill-down results were not tested. Workflow mutations (accept/start/complete/submit/upload) were preserved in code but were not executed to alter the demo records during this UX pass. API authentication required restarting the stopped local API; sign-in then succeeded.

Screenshots and `audit.jsonl` accompany this report. `verify.ps1` automates repeatable read-only UI flows against an already authenticated local browser session; flows requiring records report their data prerequisites.
