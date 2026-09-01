# Phase 12 deployment and rehearsal runbook

> Legacy reference: use [`Phase_08_SIH_Demo_Runbook.md`](Phase_08_SIH_Demo_Runbook.md) for the current BTM Layout SIH rehearsal and deterministic reset.

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
- Flagship road segment: `80000000-0000-4000-8000-000000000001`, “Segment X · 11th Main Road”, Jayanagar.
- Flagship projects: resurfacing `82000000-0000-4000-8000-000000000001`, pipeline `...0002`, cable `...0003`.

## FREE DEMO DEPLOYMENT ($0 profile)

The free demo is deliberately separate from production. Create it from `render.demo.yaml`; keep `render.yaml` for the paid, production-safe architecture. Both use the same Docker image, Prisma schema, PostgreSQL migrations, APIs, Vercel web app, and Expo app.

| Concern | Free demo | Production |
| --- | --- | --- |
| Profile guard | `DEPLOYMENT_PROFILE=free_demo` | `DEPLOYMENT_PROFILE=production` |
| API | Render Free web service; expect idle spin-down/cold start | Render Starter, always on |
| Database | Supabase Free PostgreSQL/PostGIS | Render PostgreSQL/PostGIS |
| Images | Cloudflare R2 Standard free allowance | Any configured S3-compatible production bucket |
| Citizen auth | `DEMO_AUTH_MODE=fixed_otp` and `OTP_PROVIDER=demo` | `DEMO_AUTH_MODE=disabled` and `OTP_PROVIDER=twilio` |
| Image relevance | Explicitly simulated deterministic adapter, or a compatible local/free CLIP endpoint | Hosted CLIP endpoint, fail closed |

There is no automatic downgrade path. With `NODE_ENV=production`, the API rejects a local profile, rejects `OTP_MOCK_CODE`, and validates storage/CORS. The production profile additionally rejects demo OTP and deterministic relevance, and requires Twilio plus hosted CLIP. The free-demo profile will not start unless its demo provider, mode, six-digit code, and CLIP mode are all explicit.

### A. Supabase Free PostgreSQL/PostGIS

1. Create a Supabase Free project in a region close to Render Singapore.
2. Enable the `postgis` extension from Database → Extensions. The first Prisma migration also uses `CREATE EXTENSION IF NOT EXISTS postgis`; no schema fork is needed.
3. In Connect, copy the shared Supavisor **session-mode** URL on port `5432`. Render is a persistent container and the shared session pooler supplies IPv4 connectivity on the free plan. URL-encode special characters in the password.
4. Use that unchanged PostgreSQL URL for `DATABASE_URL`. Do not use Supabase Auth, Storage, Data API, or client libraries for this profile.
5. Keep the project active before a rehearsal. Free Supabase projects can pause after inactivity; restoration/warm-up is an operator preparation step, not acceptance evidence.

The free Render Blueprint cannot use the paid pre-deploy command. Its `dockerCommand` therefore runs `prisma migrate deploy`, the idempotent seed, and then the API on each container start. A free-service cold start can take about a minute; open `/health` before handing out links.

### B. Cloudflare R2 free demo storage

1. Create an R2 **Standard** bucket and an object read/write API token scoped only to that bucket.
2. Enable an `r2.dev` public development URL or attach a public custom domain. Put that base URL in `S3_PUBLIC_BASE_URL`.
3. Set the Render values as follows:

```text
S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=<bucket-name>
S3_ACCESS_KEY_ID=<bucket-scoped-access-key>
S3_SECRET_ACCESS_KEY=<bucket-scoped-secret>
S3_PUBLIC_BASE_URL=https://<public-bucket-host>
```

4. Apply `deploy/r2-cors.demo.json` after replacing its placeholder with the exact Vercel origin. The current storage adapter already signs S3-compatible PUT URLs; no Cloudflare SDK or Prisma change is involved. R2 usage is only $0 while it remains within Cloudflare’s current Standard-storage free allowance.

### C. Explicit demo authentication

Set these exact Render values:

```text
OTP_PROVIDER=demo
DEMO_AUTH_MODE=fixed_otp
DEMO_AUTH_CODE=<six-digit rehearsal code>
```

The code is not sent, logged, or returned by the API. The presenter gives it to testers. Every request still creates a bcrypt-hashed challenge with the configured expiry and attempt cap; verification issues the same short-lived access and refresh tokens as SMS authentication. Use distinct E.164-format phone numbers for the reporter and validators. Never set `OTP_MOCK_CODE` on Render.

Twilio classes and credentials remain untouched for the production profile. Setting `DEMO_AUTH_MODE=fixed_otp` under `DEPLOYMENT_PROFILE=production` is a startup error, even if someone also supplies a demo code.

### D. Free/local CLIP choices

The unattended $0 Blueprint sets:

```text
CLIP_MODE=local_clip
CLIP_LOCAL_MODEL=Xenova/clip-vit-base-patch32
```

This runs a quantized CLIP model inside the API process. It downloads the public model from Hugging Face on first use, decodes the uploaded image, and compares its pixels against the system-configured category prompts and unrelated-content prompts. It needs no API token or payment card. The first relevance request after a cold deployment is slower while model files are downloaded and cached.

`CLIP_MODE=demo_deterministic` is retained only as a fail-closed legacy setting: every result is `LOW_CONFIDENCE`; it never accepts an image without inspecting pixels.

For a real CLIP demonstration at $0, run a compatible CLIP service locally or on a free inference host, expose its HTTPS endpoint to Render, and instead set:

```text
CLIP_MODE=hosted
CLIP_INFERENCE_URL=https://<free-or-tunnelled-clip-host>/clip
CLIP_INFERENCE_TOKEN=<optional-token>
```

The endpoint contract is unchanged: accept `POST { imageUrl, categoryId }` and return `{ score, pass, embedding? }`. Test the endpoint from the public internet before rehearsal; a URL on `localhost` cannot be reached by Render. Production always requires `CLIP_MODE=hosted` and a configured URL, so the simulated adapter cannot silently reach production.

### E. Create the free Render and Vercel deployments

Create a Render Blueprint using `render.demo.yaml` and supply every `sync: false` value:

- Supabase session-mode `DATABASE_URL`
- strong `DEMO_INTERNAL_PASSWORD`, six-digit `DEMO_AUTH_CODE`, and `DEMO_NOTIFY_ALL_CITIZENS=true`
- all six R2 values
- exact Vercel origin in `CORS_ORIGINS`

Deploy the web app to Vercel exactly as described below, with `NEXT_PUBLIC_API_URL` pointing to the free Render API. Vercel configuration remains environment-scoped and the web production build still rejects a local API URL. After changing the Vercel hostname, update both Render CORS and the R2 bucket CORS policy.

### F. Mobile steps that are actually free

The existing Expo/EAS production profile is preserved; `free-demo` is an additional internal-distribution profile.

- Free: create an Expo account/project, set EAS preview environment variables, resolve app configuration, use the limited free EAS build queue, build an Android APK with `--profile free-demo`, host its EAS install link, and sideload it on physical Android devices. No Google Play account is needed for direct APK installation.
- Free with local tooling: build Android locally with Android Studio/SDK, or use `eas build --platform android --profile free-demo --local` on a supported Linux/macOS setup. Windows local EAS builds are not officially supported; WSL is possible but unsupported.
- Free but insufficient for acceptance: an iOS Simulator build or Expo Go can exercise JavaScript on a simulator/device, but neither proves installation of the requested standalone preview on a physical iPhone.
- Production-only/paid external prerequisite: an iOS ad hoc/internal `.ipa` for physical devices requires Apple signing, registered devices, and an Apple Developer Program account. The EAS Free plan can supply limited build capacity, but it does not remove Apple’s signing requirement.

```powershell
corepack pnpm dlx eas-cli@latest build --platform android --profile free-demo
```

Do not record Android or iOS acceptance as passed until the produced binary is installed and opened on the named physical device.

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

Preparation: install the preview app on the presenter’s phone plus three validator phones and grant location. The free-demo profile broadcasts validation requests to every eligible citizen except the reporter, while production retains the configured location radius. In production, sign in with real Twilio-reachable numbers and SMS codes. In the free-demo profile, use distinct E.164-format numbers and the configured `DEMO_AUTH_CODE`. Use the seeded BESCOM/PWD Project Head and Engineer accounts with `DEMO_INTERNAL_PASSWORD`.

Start a stopwatch when the citizen taps “Report an Issue”; stop after the third completion verification closes the ticket.

1. Citizen mobile: sign in by SMS OTP (production) or the explicit fixed demo code (free-demo), choose Streetlight, capture evidence, confirm location, submit.
2. Three citizen mobiles: open Community validation requests and confirm the issue. The third unique confirmation routes it to BESCOM.
3. BESCOM Project Head web: open Ticket queue, attach the inspection file, and complete inspection.
4. BESCOM Project Head web: create the project, assign the BESCOM engineer, select PWD dependency, and enter the statement of need.
5. PWD Project Head web: respond in Dependency inbox and assign the PWD engineer.
6. PWD Engineer mobile: open Dependencies and mark the support fulfilled.
7. BESCOM Engineer mobile: accept the project, enter its timeline and description, add a field note, then mark work completed.
8. BESCOM Engineer mobile: photograph the completed work and submit it for verification.
9. The same three validators: verify completion. Confirm the citizen ticket is Closed and visible under Past tickets.
10. Public browser: refresh `/transparency` and confirm aggregate resolution metrics changed without signing in.

No database shell, console job, implicit mock OTP, or fabricated completion is allowed during timing. The explicitly configured free-demo code is allowed only when the evidence ledger records the free-demo profile.

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

Do not mark Phase 12 complete until every required pending cell has a real URL, duration, device, or person attached. A free-tier result demonstrates the SIH profile; it is not production evidence.

| Verification class | Acceptance item | Evidence | Status |
| --- | --- | --- | --- |
| Local verification | Seed executed twice without duplicates | `pnpm db:seed` twice, 2026-08-24 | Passed locally |
| Local verification | Fixture and deterministic-engine check | `pnpm verify:phase12` before and after reset, 2026-08-24 | Passed locally |
| Local verification | Container, migrations, and unauthenticated dashboard | `docker build`, production container `/health`, public dashboard, and in-container `prisma migrate deploy`, 2026-08-24 | Passed locally |
| Local verification | EAS configuration resolution | Preview profile resolved API, project ID, Android package, and iOS bundle ID, 2026-08-24 | Passed locally |
| Local verification | Guarded free-demo container startup and authentication | Free Render `dockerCommand` ran 11 migrations + idempotent seed + API under `NODE_ENV=production`/`free_demo`; health/dashboard HTTP 200 and fixed-code citizen JWT issued, 2026-08-24 | Passed locally |
| Free-tier deployment verification | Render Free API + Supabase PostGIS | Public URL, Render event, migration/seed startup log, Supabase project | Pending free-tier accounts |
| Free-tier deployment verification | Cloudflare R2 upload/read | Redacted bucket configuration plus uploaded evidence URL | Pending R2 account/bucket |
| Free-tier deployment verification | Explicit demo authentication | API URL, non-secret mode names, successful login timestamp; never record the code | Pending free-tier deployment |
| Free-tier deployment verification | Vercel web | Deployment URL and READY status | Pending account/project link |
| Free-tier deployment verification | Public dashboard, no auth | HTTP/browser capture from deployed API and `/transparency` | Pending free-tier deployment |
| Free-tier deployment verification | General scenario duration | Stopwatch/video duration and ticket ID | Pending deployed rehearsal |
| Free-tier deployment verification | Flagship scenario duration | Stopwatch/video duration and recommendation log ID | Pending deployed rehearsal |
| Free-tier deployment verification | Cold-start judge exploration | Name, timestamp, cold-start delay, dashboard result | Pending deployed handoff |
| Production-only verification | Render Starter + Render Postgres, Twilio, hosted CLIP | Production URLs and provider events | Pending production credentials/billing |
| Production-only verification | Production web and public dashboard | Vercel production URL and signed-out capture | Pending production deployment |
| Blocked physical-device verification | Android standalone direct install | EAS/local APK URL, device model, tester | Pending Expo account and Android device |
| Blocked physical-device verification | iOS standalone direct install | EAS build URL, device model/UDID, tester | Blocked by Apple Developer account/device |
| Blocked source verification | Pitch-slot fit | Compare measured durations with delta §8 allocation | Blocked: delta §8 source is not present in this repository |
