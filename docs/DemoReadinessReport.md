# CivicFlow 100-Event Demo-Readiness Report

Date: 24 August 2026

## Outcome

CivicFlow now meets the defined demo target of approximately 100 civic events and 10–50 concurrent demo users without changing its monorepo, authentication model, PostgreSQL/PostGIS data layer, background-job architecture, or product workflow.

The repeatable local acceptance run used 100 tickets, 100 observations, 100 validations, 30 projects, 130 state transitions, and 100 notifications. All measured API, dashboard, login, conflict-engine, and concurrency targets passed. The fixture cleans itself up after the run.

## Pre-change inventory

- Web entry points: Citizen reporting at `/`; Citizen login, tickets, verification, notifications, profile and transparency routes; separate Project Head, Engineer and Admin route trees with existing login pages.
- Authentication: Citizen OTP; internal email/password login; access/refresh JWTs; refresh-session revocation; password reset; TOTP setup/verification; logout. Server-side role and ownership checks already existed and remain authoritative.
- Roles: `CITIZEN`, `PROJECT_HEAD`, `ENGINEER`, and `ADMIN`.
- Main APIs: tickets, projects, dependencies, validations, conflicts, road intelligence, notifications, analytics, agency operations, image relevance and admin configuration.
- Dashboard APIs: Project Head dashboard plus city/admin analytics endpoints.
- Background work: validation rebatching, dependency escalation and Expo push delivery schedulers, all hosted in the Express process.
- Persistence: PostgreSQL/PostGIS through Prisma, with users, wards, agencies, categories/routing, tickets/observations/validations, projects, dependencies, conflict logs, road intelligence, notifications, configuration, OTP and refresh-session models.
- Deployment: Docker Compose for local dependencies, Dockerfile, Render production and free-demo manifests, and Next.js/Vercel-compatible web configuration.

## DEMO-REQUIRED

### 1. What changed

#### Routing and authentication

- Replaced `/` with an official CivicFlow role gateway linking Citizen, Project Head, Engineer and Administrator to their existing login flows.
- Preserved Citizen reporting at `/report` and updated Citizen navigation accordingly.
- Added an optional, validated `expectedRole` to the existing internal-login request. The API now rejects a credential/portal role mismatch before issuing tokens; it does not create a second auth mechanism or weaken RBAC.
- Applied the role expectation in Project Head, Engineer, Admin and mobile Engineer login clients.
- Fixed Citizen notification destinations and a Citizen ticket-detail response-unwrapping defect revealed by the route change.
- Added focused tests for the gateway, internal role mismatch and Citizen rejection from internal login.

#### Safe performance

- Added bounded page/limit pagination with a default of 20 and maximum of 50 to growing ticket, project and notification lists, plus web pagination controls and bounded mobile requests.
- Reduced list payloads with explicit Prisma field selection.
- Made unread notification polling count-only and added a bulk mark-read endpoint, replacing repeated per-notification writes in web and mobile clients.
- Enabled standard Express response compression. Already-compressed binary assets are not served through these JSON endpoints.
- Replaced broad Project Head analytics loading with targeted aggregate queries and a 30-second in-process cache. The existing simulated metric remains visibly identified as simulated.
- Reduced duplicate/full-list Engineer dashboard requests by using pagination totals.

#### Database hotspots

- Batched dependency insertion, transition history, recipient lookup and notification creation inside the existing transaction.
- Batched conflict candidate normalization, prior-log lookup, bounded upserts, recipient lookup and notification insertion. Conflict warnings remain advisory and existing logs/notifications are preserved.
- Added only queue-aligned composite indexes: agency ticket chronology, agency project chronology, Engineer state/project chronology, and user/read notification chronology. The migration is tracked through Prisma.

#### Runtime reliability

- Added a configurable CLIP request timeout (8 seconds by default, bounded to 1–30 seconds) and retained graceful unavailable/error behavior.
- Added no-overlap guards and caught/logged failures to validation, dependency-escalation and push schedulers.
- Bounded validation and dependency job batches to 50 records per run.
- Added `DEMO_SEED_MODE=if_empty` for hosted demo startup while preserving explicit `reset` mode for intentional rehearsals. Startup no longer repeatedly resets a populated demo database.
- Added a repeatable, self-cleaning 100-event acceptance script: `pnpm verify:demo100`.

### 2. What was intentionally not changed

- No Redis, Kafka, RabbitMQ, WebSockets, microservices, Kubernetes, GraphQL, CQRS, event sourcing, analytics warehouse or distributed locking was added.
- Authentication remains the existing JWT/refresh-session design; it was not rewritten solely to replace local storage.
- Workers remain in the API process because bounded, guarded jobs are sufficient for this target.
- Notification polling, Prisma/PostGIS, object-storage flow and CLIP workflow remain in place.
- Conflict and sequencing semantics, human approvals, audit history, server-side RBAC and all four role workflows remain authoritative.
- No speculative index set or full DTO/SSR rewrite was introduced.

### 3. Current architecture

- Turborepo with pnpm workspaces.
- Express/TypeScript API with server-side RBAC and in-process bounded schedulers.
- Next.js 14 App Router web app for Project Head and Admin, plus the existing demo-accessible Citizen and Engineer web experiences.
- React Native/Expo mobile app for Citizen and Engineer workflows.
- PostgreSQL/PostGIS accessed through Prisma; shared Zod contracts live in `packages/shared`.
- Existing object storage and timeout-protected CLIP inference integration.
- Render/Docker deployment model, with idempotent demo seeding behavior.

### 4. 100-event test results

Tested locally against PostgreSQL/PostGIS with 100 tickets, 100 validations, 30 active projects and realistic related history.

| Check | Result |
| --- | ---: |
| Ticket list | 25.9 ms |
| Project Head project list | 11.7 ms |
| Engineer project list | 9.0 ms |
| Notification list | 17.2 ms |
| Citizen ticket creation | 42.7 ms |
| Project creation with two dependencies | 51.1 ms |
| Dependency response | 21.0 ms |
| Project Head dashboard, cold | 54.7 ms |
| Project Head dashboard, cached | 9.9 ms |
| Conflict sweep (30 conflicts) | 150.1 ms |
| 25 concurrent ticket-list requests | 98.1 ms wall time, 0 failures |
| Citizen login | 70.3 ms |
| Project Head login | 262.0 ms |
| Engineer login | 239.5 ms |
| Admin login | 246.5 ms |
| Process resident memory | 101 MB |

Acceptance: ordinary measured operations were below 500 ms, the cold dashboard was below 1.5 seconds, and all four measured login flows were below 1 second. Invalid credentials, role mismatch and protected-route denial were also exercised.

Regression verification completed successfully:

- Full monorepo tests: 9 tasks passed; API 48 tests, shared 19, web 2, mobile 1 and DB 1.
- Full monorepo lint: 9 tasks passed.
- Full monorepo build: 6 tasks passed.
- Authentication/RBAC verifier passed.
- Phase 5, Phase 7 and Phase 12 acceptance verifiers passed.
- Prisma schema validation and migration diff passed with no schema drift.
- `git diff --check` passed (Git emitted only line-ending conversion warnings).

### 5. Remaining known limitations

- Render cold-start latency was not measured against a deployed free instance. It remains an honest hosting limitation and is not hidden by the application.
- Automated visual browser verification could not run in this environment: the browser automation CLI was unavailable and the in-app browser runtime reported no installed browser. Next.js production build, route generation, API integration tests and HTTP acceptance checks passed, but a final human visual rehearsal on the target browser is still recommended.
- The local benchmark measures application behavior on the development machine, not Internet latency, free-host CPU contention or object-storage/CLIP provider latency.
- Workers are process-local. This is appropriate for one demo API instance, but multiple API replicas would require a single-worker deployment or cross-process coordination.

## FUTURE-SCALE

### 6. Recommendations after the demo target is exceeded

Only revisit these when measurements show the current limits are material:

- Move periodic workers to a separately controlled process before running multiple API replicas.
- Replace process-local dashboard caching with shared caching only when horizontal scaling makes cache divergence relevant.
- Introduce cursor pagination for very large/churn-heavy lists and validate additional indexes using production query plans.
- Add production load testing, request tracing and database-pool telemetry based on real usage patterns.
- Reassess session transport and browser security hardening as part of a deliberate production-auth phase.
- Consider asynchronous image inference only if measured provider latency materially harms report creation.

The 100-event demo target is comfortably handled; further architectural expansion is intentionally stopped here.
