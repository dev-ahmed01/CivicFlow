# Phase 12 deployment and rehearsal runbook

This document is the operator handoff for the two CivicOS demo stories. It never substitutes a local result for deployed acceptance evidence.

## Fixture reset and verification

Run the seed before each rehearsal. It is safe to repeat and restores the three Segment X projects to their exact scripted dates while clearing prior warnings, recommendation actions, and related notifications for that segment.

```powershell
$env:DATABASE_URL="<deployed Render external database URL>"
corepack pnpm db:seed
corepack pnpm verify:phase12
corepack pnpm db:seed
```

The last seed is intentional: `verify:phase12` triggers the deterministic road checks, and the final seed returns the live demo to its untouched “pending review” state.

Stable showcase records:

- General non-road lifecycle: ticket `90000000-0000-4000-8000-000000000001`, Streetlight, CMH Road near Indiranagar Metro, state `CLOSED`.
- General project: `90000000-0000-4000-8000-000000000005`, including three confirmations, BESCOM inspection, fulfilled PWD dependency, field note, completion evidence, and three citizen verifications.
- Flagship road segment: `80000000-0000-4000-8000-000000000001`, “Segment X · 80 Feet Road”, Koramangala.
- Flagship projects: resurfacing `82000000-0000-4000-8000-000000000001`, pipeline `...0002`, cable `...0003`.

## Deployment order

### 1. Render API and PostGIS

Create a Blueprint from the repository-root `render.yaml`. It provisions an always-on Starter API and a Singapore `basic-256mb` PostgreSQL 16 database, runs Prisma migrations before deploy, and seeds once after the initial healthy deploy. These tiers are billable by design; a sleeping free API is unsuitable for an unassisted judge visit.

Render prompts for every `sync: false` value. Provide all of them—never blank or local values:

- `DEMO_INTERNAL_PASSWORD`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`
- `CLIP_INFERENCE_URL`, `CLIP_INFERENCE_TOKEN`
- `CORS_ORIGINS` (the production Vercel origin; add a comma-separated preview origin only when that preview is being rehearsed)

Production startup rejects console OTP, `OTP_MOCK_CODE`, localhost storage, local storage credentials, missing CLIP, missing Twilio, and missing CORS configuration. Verify:

```text
GET https://<api-host>/health
GET https://<api-host>/analytics/public-dashboard
```

Both must return `200`; the second must work without an `Authorization` header.

### 2. Vercel web

Import the monorepo as one Vercel project with Root Directory `apps/web`. Set `NEXT_PUBLIC_API_URL=https://<api-host>` in Production and in any Preview environment used for rehearsal. The production build fails if this value is missing or local.

After the production deployment is ready, add its exact origin to Render `CORS_ORIGINS` and redeploy the API. Verify both:

```text
https://<web-host>/transparency
https://<api-host>/analytics/public-dashboard
```

Use Vercel’s preview-to-production promotion flow only after the preview has passed the browser walk-through.

### 3. Expo EAS mobile

From `apps/mobile`, initialize/link the Expo project, then place `EAS_PROJECT_ID` and the deployed `EXPO_PUBLIC_API_URL` in both EAS `preview` and `production` environments. `EXPO_PUBLIC_API_URL` is public configuration, not a secret. The dynamic app config rejects localhost, the Android emulator alias, a missing API URL, or a missing project ID during EAS builds.

```powershell
corepack pnpm dlx eas-cli@latest login
corepack pnpm dlx eas-cli@latest init
corepack pnpm dlx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://<api-host> --environment preview --visibility plaintext
corepack pnpm dlx eas-cli@latest env:set --name EAS_PROJECT_ID --value <project-uuid> --environment preview --visibility sensitive
corepack pnpm dlx eas-cli@latest build --platform android --profile preview
corepack pnpm dlx eas-cli@latest device:create
corepack pnpm dlx eas-cli@latest build --platform ios --profile preview
```

The Android preview is an installable APK. The iOS preview is ad hoc: register every test device before building, and use a paid Apple Developer account. Record both EAS build-detail URLs and install each binary directly; Expo Go does not count.

## General Part I §31 live rehearsal

Preparation: install the preview app on the presenter’s phone plus three validator phones, sign the validators in with real Twilio-reachable numbers, grant location, and keep all four devices within the configured validation radius. Use the seeded BESCOM/PWD Project Head and Engineer accounts with the production `DEMO_INTERNAL_PASSWORD`.

Start a stopwatch when the citizen taps “Report an Issue”; stop after the third completion verification closes the ticket.

1. Citizen mobile: sign in by real SMS OTP, choose Streetlight, capture evidence, confirm location, submit.
2. Three citizen mobiles: open Nearby verification requests and confirm the issue. The third confirmation routes it to BESCOM.
3. BESCOM Project Head web: open Ticket queue, attach the inspection file, and complete inspection.
4. BESCOM Project Head web: create the project, assign the BESCOM engineer, select PWD dependency, and enter the statement of need.
5. PWD Project Head web: respond in Dependency inbox and assign the PWD engineer.
6. PWD Engineer mobile: open Dependencies and mark the support fulfilled.
7. BESCOM Engineer mobile: accept the project, enter its timeline and description, add a field note, then mark work completed.
8. BESCOM Engineer mobile: photograph the completed work and submit it for verification.
9. The same three validators: verify completion. Confirm the citizen ticket is Closed and visible under Past tickets.
10. Public browser: refresh `/transparency` and confirm aggregate resolution metrics changed without signing in.

No database shell, console job, mock OTP, or fabricated completion is allowed during timing.

## Flagship delta §6 live rehearsal

Reset the seed first. Start a stopwatch at PWD Project Head login and stop after the refreshed public dashboard displays the accepted recommendation metric.

1. Sign in at `/project-head/login` as `head.pwd@civicos.local`.
2. Open Projects and select resurfacing project `82000000-0000-4000-8000-000000000001`.
3. Show Segment X history: BWSSB pipeline Jun 10–16, BESCOM cable Jun 15–18, PWD resurfacing Jun 20–24.
4. Show the prominent Restoration-too-early advisory warning and state that it does not block saving.
5. Show the explainable recommendation: pipeline → cable → consolidated restoration → resurfacing.
6. Expand “Why this order?” and show the six deterministic rule-trace entries.
7. Click Accept with dates. Confirm the action is logged and the recommendation remains visible.
8. Optionally demonstrate raw W-P9 entry at `/project-head/tickets/new`; do not submit a duplicate intervention during the timed path.
9. Open `/transparency` in a signed-out window and confirm road warnings plus the accepted recommendation’s simulated/illustrative savings metric.

## Evidence ledger

Do not mark Phase 12 complete until every pending cell has a real URL, duration, device, or person attached.

| Acceptance item | Evidence | Status |
| --- | --- | --- |
| Seed executed twice without duplicates | `pnpm db:seed` twice, 2026-08-24 | Passed locally |
| Fixture and deterministic-engine check | `pnpm verify:phase12` before and after reset, 2026-08-24 | Passed locally |
| Render container artifact | `docker build`, production container `/health`, public dashboard, and in-container `prisma migrate deploy`, 2026-08-24 | Passed locally |
| EAS configuration resolution | Preview profile resolved deployed API, project ID, Android package, and iOS bundle ID, 2026-08-24 | Passed locally |
| Render API + PostGIS | Deployment URL and Render event | Pending credentials/billing approval |
| Vercel production web | Deployment URL and READY status | Pending account/project link |
| Public dashboard, no auth | HTTP/browser capture from deployed API and `/transparency` | Pending deployment |
| Android direct install | EAS build URL, device model, tester | Pending Expo account/device |
| iOS direct install | EAS build URL, device model/UDID registration, tester | Pending Apple/Expo account/device |
| General scenario duration | Stopwatch/video duration and ticket ID | Pending deployed rehearsal |
| Flagship scenario duration | Stopwatch/video duration and recommendation log ID | Pending deployed rehearsal |
| Pitch-slot fit | Compare both measured durations with delta §8 allocation | Blocked: delta §8 source is not present in this repository |
| Cold-start judge exploration | Name, timestamp, dashboard result | Pending deployed handoff |
