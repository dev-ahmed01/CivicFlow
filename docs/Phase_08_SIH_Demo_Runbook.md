# Phase 8 SIH demonstration runbook

This is the operator checklist for the BTM Layout City Connect demonstration. It uses existing product behavior only: agency-planned work, advisory conflict detection, structured coordination, inspection evidence, formal dependencies, deterministic sequencing, the Spatial Work Calendar, the Civic Work Ledger, and privacy-safe citizen visibility.

## Deterministic baseline

The reset owns only the reserved BTM coordination fixtures. It removes rehearsal-generated coordination, dependency, sequence, evidence, audit, transition, and notification records for those two project IDs, then recreates their baseline history. It deliberately preserves unrelated and user-created records.

| Fixture | Stable ID | Baseline |
|---|---|---|
| BTM road segment | `80000000-0000-4000-8000-000000000002` | 16th Main Road, BTM Layout 2nd Stage |
| PWD resurfacing | `8b000000-0000-4000-8000-000000000001` | 8–15 November 2026 |
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
| `head.pwd@civicos.local` | Project Head | PWD / Roads Authority initiates coordination |
| `head.bwssb@civicos.local` | Project Head | BWSSB replies and accepts the dependency |
| `engineer.bwssb@civicos.local` | Engineer | Pipeline inspection and evidence |
| `engineer.pwd@civicos.local` | Engineer | Optional road-side inspection/execution |
| `citizen.jayanagar@cityconnect.local` | Citizen | Reporting, tracking, nearby works, closure verification when eligible |

The seed reads `DEMO_INTERNAL_PASSWORD`. Citizen OTP behavior is selected by the deployment profile: real SMS in production or an explicitly configured fixed code in the isolated demo profile.

## Recommended live order

1. Warm `GET /health`, the public transparency page, and all three signed-in clients before presenting.
2. As the PWD Project Head, open **Conflicts** and select the reserved BTM resurfacing conflict. Point out that the warning is advisory and names the overlapping BWSSB pipeline dates and road chainage.
3. Open the PWD resurfacing project and send a structured coordination request to BWSSB. Request inspection/Engineer involvement and attach the prepared PDF inspection brief.
4. As the BWSSB Project Head, open the request from Notifications, reply, assign the BWSSB Engineer, and formally accept the dependency.
5. On the Engineer mobile client, open the coordination assignment, start the inspection, attach a geotagged site-evidence image, submit the inspection result, and complete the assigned action.
6. Return to the PWD Project Head project. Show the explainable recommendation: **pipeline → consolidated inspection/restoration → resurfacing**. Open the rule trace, then accept or modify the advisory dates.
7. Open **Spatial Work Calendar**, filter to BTM Layout/16th Main Road, and show the revised order.
8. Open **Civic Work Ledger** and show the creation, conflict, coordination, dependency, sequence action, Engineer evidence, and status history.
9. On the citizen mobile client, open nearby civic works at BTM Layout. Show the public status and dates; internal coordination text, dependency flags, private attachment metadata, and precise work geometry must not appear.
10. Demonstrate the existing citizen report path separately: capture photo → relevance preflight → GPS/reporting-area resolution → submit → ticket tracking. The reserved agency-planned BTM work has no citizen reporter, so closure voting does not apply to it. Use a citizen-originated ticket when demonstrating closure verification.

Keep the structured coordination request URL or request ID on the presenter card as a fallback; never put a token or password there.

## Presenter assets

Prepare these before the event:

- One harmless PDF named `BTM-pipeline-inspection-brief.pdf`.
- One JPEG site-evidence photo taken near the rehearsal location, with no faces, number plates, or personal data.
- A phone with the current internal Android build and location/photo permissions already granted.
- Separate browser profiles for PWD Project Head and BWSSB Project Head to avoid live logout delays.

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
