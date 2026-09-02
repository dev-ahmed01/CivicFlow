# Phase 8 SIH demonstration runbook

This is the operator checklist for the BTM Layout City Connect demonstration. It uses existing product behavior only: agency-planned work, advisory conflict detection, structured coordination, inspection evidence, formal dependencies, deterministic sequencing, the Spatial Work Calendar, the Civic Work Ledger, and privacy-safe citizen visibility.

## Deterministic baseline

The reset owns only the reserved BTM coordination fixtures. It removes rehearsal-generated coordination, dependency, sequence, evidence, audit, transition, and notification records for those two project IDs, then recreates their baseline history. It deliberately preserves unrelated and user-created records.

| Fixture | Stable ID | Baseline |
|---|---|---|
| BTM road segment | `80000000-0000-4000-8000-000000000002` | 16th Main Road, BTM Layout 2nd Stage |
| BBMP road resurfacing | `8b000000-0000-4000-8000-000000000001` | 8–15 November 2026 · ready to start |
| BWSSB pipeline | `8b000000-0000-4000-8000-000000000002` | 5–12 November 2026 |
| Advisory conflict | `8d000000-0000-4000-8000-000000000001` | Restoration begins before pipeline excavation ends |

Start PostgreSQL and MinIO, apply committed migrations, and reset the fixtures:

```powershell
corepack pnpm infra:up
corepack pnpm --filter db exec prisma migrate deploy
corepack pnpm demo:reset
```

Run the complete automated rehearsal before opening the room. It resets the fixture at both ends when all checks pass:

```powershell
corepack pnpm verify:sih-demo
```

If a check fails midway, restore the baseline with `corepack pnpm demo:reset` after saving the failure output.

## Expected accounts and roles

These are identifiers, not credentials. Obtain the internal demo password and citizen authentication code from the demo operator's secret store; do not put either value in slides, source control, chat, or this runbook.

| Account | Role | Agency/use |
|---|---|---|
| `head.bbmp@civicos.local` | Project Head | BBMP Road Infrastructure initiates coordination |
| `head.bwssb@civicos.local` | Project Head | BWSSB replies and accepts the dependency |
| `engineer.bwssb@civicos.local` | Engineer | Pipeline inspection and evidence |
| `engineer.bbmp@civicos.local` | Engineer | Road-side inspection, planning, and execution |
| `citizen.jayanagar@cityconnect.local` | Citizen | Reporting, tracking, nearby works, closure verification when eligible |

The seed reads `DEMO_INTERNAL_PASSWORD`. Citizen OTP behavior is selected by the deployment profile: real SMS in production or an explicitly configured fixed code in the isolated demo profile.

## Recommended live order

1. Warm `GET /health`, the transparency page, and separate signed-in browser profiles before presenting. Open the BBMP **Command Centre** first and answer “What requires my decision today?” from its real action queue.
2. As the BBMP Project Head, choose **Register Planned Work** and show that agency work needs no citizen ticket. Use the reserved BBMP resurfacing record as the reset-safe fallback.
3. Open **City Work Map**, filter to BTM Layout and 16th Main Road, and select both persisted works. Show agency identity, overlapping dates, lifecycle state, and the explicit read-only treatment of BWSSB work.
4. Open **Coordination & Conflicts** and select the reserved conflict. Explain the deterministic restoration-too-early rule, repeated-excavation risk, and advisory sequence: **BWSSB pipeline → joint inspection/restoration → BBMP resurfacing**.
5. Send or open the formal coordination record to BWSSB. As the BWSSB Project Head, reply, record the agreement/dependency, and keep the permanent decision history visible.
6. For a citizen-originated issue, the Project Head chooses **Assign Inspection** and selects an Engineer from their own agency. The Engineer opens **Inspections**, accepts, starts, captures structured findings/GPS/evidence, and submits a recommendation. The Project Head reviews it and alone decides whether to create civic work, request another inspection, or close it as no work required.
7. In **My Work**, the assigned Engineer accepts the civic work and saves the timeline. Point out that it is **Ready to Start**, `actualStart` is still empty, and the linked ticket is not yet in progress. Review advisory conflicts and dependencies.
8. Press **Start Work** explicitly. Show the transition to Active, add a field update, report a blocker, and resolve that blocker from the Project Head's **Team & Capacity** view. Then submit completion evidence through the existing completion flow.
9. Return to **City Work Map** and its road/location history. Show creation, conflict, coordination, accepted sequence, Engineer activity, completion evidence, and state history using the same persisted records.
10. On the citizen experience, show public status and eligible closure verification for a citizen-originated ticket. Internal coordination text, dependency details, attachment metadata, and precise private geometry remain hidden.

Keep the structured coordination request URL or request ID on the presenter card as a fallback; never put a token or password there.

## Presenter assets

Prepare these before the event:

- One harmless PDF named `BTM-pipeline-inspection-brief.pdf`.
- One JPEG site-evidence photo taken near the rehearsal location, with no faces, number plates, or personal data.
- A phone with the current internal Android build and location/photo permissions already granted.
- Separate browser profiles for BBMP Project Head, BWSSB Project Head, and the relevant Engineer to avoid live logout delays.

## Reset and rollback

For a normal rehearsal, `corepack pnpm demo:reset` is the rollback. It restores reserved fixtures without deleting unrelated projects or tickets.

For a disposable local environment only, the full reset is:

```powershell
docker compose down -v
corepack pnpm infra:up
corepack pnpm --filter db exec prisma migrate deploy
corepack pnpm demo:reset
```

`docker compose down -v` destroys the local PostgreSQL and MinIO volumes. Never run it against a shared or production environment. For hosted rehearsal data, take a database/object-store backup and reset only an isolated demo deployment.

## Deployment actions required

1. Provision PostgreSQL with PostGIS and S3-compatible object storage; apply CORS for the exact web/mobile origins.
2. Set server secrets and profile values outside source control: `DATABASE_URL`, JWT secrets, internal demo password, OTP/provider settings, storage credentials, CORS origins, cron secret, and CLIP configuration.
3. Set `NEXT_PUBLIC_API_URL` and `EXPO_PUBLIC_API_URL` to the deployed HTTPS API. Configure the Expo/EAS project ID and push credentials for a device build.
4. Run `prisma migrate deploy`, then seed the isolated demo database with an operator-controlled `DEMO_INTERNAL_PASSWORD`.
5. Deploy API and web, build/install the Android preview APK, and validate image upload from the same network and devices used on stage.
6. Run the automated rehearsal, the browser walkthrough, and one physical-device citizen/Engineer pass. Save evidence without recording secrets.
7. Warm the services immediately before judging and keep a read-only backup deployment URL plus the presenter request ID available.

## Known limitations

- The deterministic integration checks use controlled relevance responses; a deployed real CLIP endpoint and its cold-start behavior require a separate network/device rehearsal.
- Remote push delivery, real SMS, hosted object storage, and physical-device GPS/camera behavior cannot be proven by local automated tests.
- Expo JavaScript export validates the mobile bundle, but a native APK still requires an Android SDK locally or an EAS build.
- Notification/deadline workers are process-local. Multi-instance deployment requires the documented single-worker/scheduler arrangement to prevent duplicate work.
- The reset preserves unrelated projects by design, so city-wide lists may contain additional records. Navigate by the stable fixture IDs above.
- Citizen closure verification applies only to eligible citizen-originated tickets, not to the reserved agency-planned BTM projects.
