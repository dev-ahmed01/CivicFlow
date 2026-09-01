# Phase 11 screen and navigation audit

This audit reconstructs the Part II §7 role matrix from the screen IDs retained in the phase prompts and the completed Phase 1–10 flows. The full Part II source document is not present in this repository, so the route/state mapping below is the reviewable source of truth for Phase 11.

## Citizen mobile — 15/15

| ID | Screen | Reachability |
|---|---|---|
| M-C1 | Phone sign-in | Profile → Sign in with phone |
| M-C2 | OTP verification | M-C1 → Send verification code |
| M-C3 | Home | Home tab |
| M-C4 | Select issue category | Report tab |
| M-C5 | Upload evidence | Select a category in M-C4 |
| M-C6 | Confirm location | Continue from M-C5 |
| M-C7 | Relevance feedback / retake | Failed relevance check from M-C6 |
| M-C8 | Submit confirmation | Successful report submission |
| M-C9 | My tickets — ongoing | My tickets tab / Ongoing card |
| M-C10 | My tickets — past | Home → Past card |
| M-C11 | Ticket detail | Tap any M-C9/M-C10 `TicketCard` |
| M-C12 | Nearby verification request | Home → Nearby verification requests → request |
| M-C13 | Completion verification | Home → Verify completed work → request |
| M-C14 | Notifications | Updates tab |
| M-C15 | Profile | Profile tab |

Citizen tabs: Home · Report · My tickets · Updates · Profile. Nearby and completion verification are task entry points on Home and notification destinations, keeping task-specific items out of the global tab bar.

## Citizen web — 9/9

| ID | Screen | Reachability |
|---|---|---|
| W-C1 | Phone sign-in / OTP | Profile → Sign in with phone → `/login` |
| W-C2 | Citizen home | `/` |
| W-C3 | Scrollable report flow | Header Report → `/#report-category` |
| W-C4 | My tickets | Header My tickets → `/tickets` |
| W-C5 | Ticket detail | Any W-C4 `TicketCard` → `/tickets/[id]` |
| W-C6 | Nearby verification | Header Verify nearby → `/verify` |
| W-C7 | Completion verification | W-C6 → Verify completed work → `/completion-verification` |
| W-C8 | Notifications | Header notification button → `/notifications` |
| W-C9 | Profile | Header Profile → `/profile` |

`/transparency` remains an additional public, role-neutral route.

## Project Head web — 14/14

| ID | Screen | Reachability |
|---|---|---|
| W-P1 | Login | `/project-head/login` |
| W-P2 | Dashboard | Overview → `/project-head` |
| W-P3 | Validated ticket queue | Ticket queue |
| W-P4 | Ticket detail / inspection | Open a W-P3 `TicketCard` |
| W-P5 | Dependency assessment | W-P4 → Create project |
| W-P6 | Create project / assign engineer | W-P5 review flow |
| W-P7 | Dependency inbox | Dependency inbox |
| W-P8 | Dependency outbox | Dependency outbox |
| W-P9 | Agency-originated ticket / intervention | Create agency ticket |
| W-P10 | Projects list | Projects |
| W-P11 | Project detail | Open a project from W-P10 |
| W-P12 | Road intelligence and sequencing actions | Road project detail in W-P11 |
| W-P13 | Notifications | Notifications |
| W-P14 | Profile | Profile |

Project Head is web-only. No Project Head screens or navigation items exist in `apps/mobile`.

## Executive Engineer mobile — 12/12

| ID | Screen | Reachability |
|---|---|---|
| M-E1 | Login | Citizen Home → Executive Engineer sign in |
| M-E2 | Field operations dashboard | Home tab after sign-in |
| M-E3 | My projects | Work tab / dashboard card |
| M-E4 | Assigned work | Dashboard → Assigned work |
| M-E5 | Project detail | Open a project from M-E3/M-E4/M-E10 |
| M-E6 | Advisory conflict warning | Save a conflicting timeline in M-E7 |
| M-E7 | Execution timeline | M-E5 → Edit timeline |
| M-E8 | Completion evidence | M-E5 → Add completion evidence |
| M-E9 | Dependency inbox/outbox | Dashboard → Dependencies |
| M-E10 | Area projects | Area tab |
| M-E11 | Notifications | Updates tab |
| M-E12 | Profile | Profile tab |

Engineer tabs: Home · Work · Area · Updates · Profile. Dependencies remain a dashboard/workflow destination.

## Executive Engineer web — 10/10

| ID | Screen | Reachability |
|---|---|---|
| W-E1 | Login | `/engineer/login` |
| W-E2 | Dashboard | Dashboard → `/engineer` |
| W-E3 | My projects | My projects |
| W-E4 | Assigned work | Assigned work |
| W-E5 | Project detail and inline conflicts | Open a project |
| W-E6 | Timeline and completion actions | Owned W-E5 project actions |
| W-E7 | Dependency inbox/outbox | Dependencies |
| W-E8 | Geographic projects | Geographic projects |
| W-E9 | Notifications | Notifications |
| W-E10 | Profile | Profile |

## Phase 11 presentation decisions

- Density follows audience rather than a user preference: citizen surfaces are comfortable; internal portals are compact. No unsupported density toggle was invented.
- Engineer geographic work remains a filterable list for the SIH release. A map is deferred because the available product decision explicitly permitted list-only launch and the list preserves full workflow reachability. Citizen location confirmation retains its functional map.
- Dark mode is intentionally deferred by the design specification.
- `TicketCard`, `NotificationRow`, `StatusChip`, `PrimaryButton`, category tiles, conflict banners, and sequencing recommendation cards are consolidated in each platform library. Web and React Native cannot share renderer code, but expose matching component contracts and token semantics.
- Conflict warnings use warning tokens only and remain advisory. Sequencing recommendations use info tokens.

## Verification checklist

- [x] All 60 role-matrix IDs have a route or explicit in-flow state.
- [x] All top-level screens are reachable through role-isolated navigation.
- [x] Citizen and Engineer mobile tab bars contain no cross-role items.
- [x] Project Head and Engineer web sidebars contain no cross-role items.
- [x] Raw colors are confined to `design-tokens.css` and `theme.ts`.
- [x] UI typography uses 400/500 weights and the 12/14/16/18/22 scale.
- [x] Citizen and agency category selectors use the same tile-grid component.
- [x] Citizen, Project Head, and Engineer lists use the same platform `TicketCard` contract.
- [x] Citizen and internal notification centers use the same platform `NotificationRow` contract.
- [x] Internal geographic list-only decision and dark-mode deferral are documented.

Current verification evidence: the production build generates 34 web routes after retiring the global management route tree. Citizen, Project Head, and Engineer navigation targets remain covered by the route/state mapping and automated suites.
