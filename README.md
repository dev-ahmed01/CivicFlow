# CivicOS

Civic infrastructure accountability platform — built for Smart India Hackathon. Citizens report and verify civic issues (potholes, streetlight outages, water/sewage problems, etc.); Project Heads and Executive Engineers across municipal agencies (BWSSB, BESCOM, PWD, and others) route, coordinate, and resolve them. The flagship differentiator is the **Road-Cutting Intelligence Layer**: a conflict-detection and sequencing-recommendation engine that catches agencies about to dig up the same stretch of road for unrelated reasons — before it happens, not after.

The Project Head web portal opens on an agency-scoped **Command Centre**: priority decisions, live operations, a compact city-work map, and a feed backed by recorded workflow notifications. Its **Work Pipeline** unifies citizen-originated and agency-planned work across Intake, Inspection, Ready, Scheduled, Active, Closure, and Closed stages.

The final operational personas are **Citizen**, **Project Head**, and **Engineer**. Project Heads decide and coordinate within their agency; Engineers perform assigned inspections and field execution; the system detects conflicts and produces explainable, advisory recommendations. Saving a schedule never starts work—only the assigned Engineer's explicit **Start Work** action records `actualStart` and begins execution.

## Repo layout

```
civicos/
  AGENTS.md              # Codex reads this every session — stack, conventions, non-negotiable rules
  README.md              # this file
  docs/
    00_Build_Guide.md            # how to run the Codex build loop, full tech stack + reasoning
    02_Phase_Plan.md             # all 12 phases, spec-referenced, with acceptance criteria
    03_Design_System.md          # color tokens, typography, component patterns
    Phase_01_prompt.md           # ready-to-paste Codex prompts, one per phase
    Phase_02_prompt.md
    ...
    Phase_12_prompt.md
    CivicOS_Master_Specification.md      # source spec — full platform
    CivicOS_Unified_SIH_Specification.md # source spec — road-cutting delta/flagship layer
  apps/
    api/      # Express + TypeScript backend (scaffolded in Phase 1)
    web/      # Next.js 14 — Project Head + Engineer portals and citizen web experience
    mobile/   # Expo React Native — Citizen + Engineer native apps
  packages/
    db/       # Prisma schema, migrations, seed data
    shared/   # Zod schemas + TS types shared across api/web/mobile
    config/   # shared eslint/tsconfig
```

Phase 1 scaffolds `apps/` and `packages/`; later phases extend those foundations without redefining shared entities.

## Stack

Turborepo monorepo · Express + Prisma + PostgreSQL/PostGIS · Next.js 14 (web) · Expo/React Native (mobile) · Zod for shared validation · CLIP for AI image-relevance checks · Phone OTP (citizens) + email/JWT (internal roles) for auth.

Full reasoning for every choice is in `docs/00_Build_Guide.md`.

## How this gets built

This repo is built phase-by-phase with Codex CLI, not in one pass:

1. `AGENTS.md` sits in the repo root and is read automatically every Codex session — it carries stack conventions and non-negotiable product rules (RBAC enforcement, non-blocking conflict warnings, no "duplicate" language shown to citizens, etc.) so they don't need to be repeated per phase.
2. Paste each `docs/Phase_0N_prompt.md` into Codex in order, one phase per session.
3. After each phase: run the build/tests, manually verify against that phase's acceptance criteria in `docs/02_Phase_Plan.md`, then commit (`git commit -m "Phase N: <name>"`) before moving to the next.
4. Update the build-status checklist at the bottom of `AGENTS.md` as phases complete.

Full methodology and the reasoning behind this loop is in `docs/00_Build_Guide.md`.

## Phases

| # | Phase | Depends on |
|---|---|---|
| 1 | Foundation — monorepo, data model, auth | — |
| 2 | Citizen reporting flow + AI relevance + duplicate detection | 1 |
| 3 | Community verification | 2 |
| 4 | Agency routing + Project Head core workflows | 3 |
| 5 | Dependency system | 4 |
| 6 | Executive Engineer workflows | 4 |
| 7 | Conflict detection engine (generic) | 6 |
| 8 | **Road-Cutting Intelligence Layer** (flagship) | 1, 4, 7 |
| 9 | Notifications | all trigger points from 2–8 |
| 10 | Analytics, system configuration, transparency dashboard | 1–9 |
| 11 | Design system / UI polish | all screens from 2–10 |
| 12 | Seed data, demo rehearsal, deployment | all |

## Local setup

```bash
git clone <this-repo-url>
cd civicos
corepack enable
pnpm install
copy .env.example .env       # use `cp` on macOS/Linux
pnpm infra:up
pnpm --filter db exec prisma migrate dev
pnpm --filter db exec prisma db seed
pnpm build
pnpm test
pnpm verify:auth             # OTP/JWT/RBAC smoke test against the seeded DB
pnpm dev
```

`pnpm infra:up` starts PostgreSQL plus the MinIO photo service and creates the `civicos-images` bucket. Both are required for citizen ticket submission. `pnpm dev` then starts the web app at `http://localhost:3000` and the API at `http://localhost:4000`; `GET http://localhost:4000/health` should return `{ "status": "ok" }`. The API loads the repository-root `.env` created above even though Turbo runs it from `apps/api`. The web defaults to `http://localhost:4000`; set `NEXT_PUBLIC_API_URL` in the root `.env` when using a different API origin. Use `pnpm dev:all` only when the Expo mobile dev server is also needed.

The compose service maps PostgreSQL to host port `5433` to avoid common conflicts with an existing local PostgreSQL installation. Seeded account identifiers and roles are documented in the SIH runbook; credentials come from operator-controlled environment variables and are never published. Accounts marked for first-login reset can only reach the password-reset flow until they change it.

## Notifications

Notification rows act as a transactional outbox. Citizen and Engineer devices register an Expo token with `POST /notifications/push-tokens`; committed notification batches wake the Expo delivery worker immediately, while `PUSH_DELIVERY_POLL_SECONDS` (15 seconds by default) remains a safety sweep. Delivery records cover every active token for the recipient, retry transient failures up to five times, and disable tokens Expo reports as unregistered. Set `EXPO_ACCESS_TOKEN` only when Expo push access-token security is enabled. A physical-device EAS development or preview build with a configured EAS project ID is required for remote push; Expo Go is not used for production push verification.

For hackathon rehearsals, set `DEMO_NOTIFY_ALL_CITIZENS=true` on the API to invite every other eligible phone-verified citizen with an active session to mobile community validation. Leave it `false` in normal deployments to preserve the existing PostGIS radius and ward-override behavior. The reporter remains excluded and the database still permits only one vote per citizen and ticket.

Project Head and Engineer response deadlines are stored in `WorkflowAction` records. The API checks them every `DEADLINE_ESCALATION_POLL_MINUTES` (15 minutes by default), creates one `ACTION_ATTENTION` notification when one day or less remains, and creates one internal CivicFlow grievance after five unanswered days. An external scheduler can invoke `POST /internal/jobs/deadline-escalation` with the existing `CRON_SECRET`; this is CivicFlow's own grievance workflow and is not an integration with a government grievance platform.

Web notification bells use 30-second polling against `GET /notifications?unread=true`. This keeps the unread badge authoritative to the database without adding a persistent websocket service. Opening a notification page fetches the reverse-chronological list and clears each visible unread row through `PATCH /notifications/{id}/read`. Project Head and Engineer pages provide the Part II §6.3 filters; the citizen page intentionally has none.

Run the delivery/unread acceptance check against the seeded local database with `pnpm verify:phase9`.

Run `pnpm verify:sih-redesign` for the role/scope, inspection, reassignment, schedule/start, blocker, shared-map, and audit acceptance path. Run `pnpm verify:sih-demo` for the longer seeded rehearsal covering the citizen flow, planned-work registry, conflicts, coordination, Engineer execution, notifications, evidence, verification, and reset.

## Demo scripts

Two rehearsed end-to-end walkthroughs (built out fully in Phase 12):
- **General flow** — a full citizen-report → validation → routing → inspection → project → dependency → execution → completion cycle on a non-road category
- **Flagship road-cutting flow** — three agencies logging conflicting interventions on the same road segment, the system catching a restoration-too-early conflict, and the sequencing engine recommending a coordinated order

The current BTM Layout SIH walkthrough, stable fixture IDs, role roster, reset instructions, validation commands, and limitations live in [`docs/Phase_08_SIH_Demo_Runbook.md`](docs/Phase_08_SIH_Demo_Runbook.md). Run `pnpm verify:sih-demo` against the local demo stack to reset, exercise, and reset the complete demonstration path. The older Phase 12 reference remains in [`docs/Phase_12_runbook.md`](docs/Phase_12_runbook.md).

Deployment profiles are intentionally separate: `render.yaml` is the fail-closed production architecture, while `render.demo.yaml` is the $0 SIH profile using Render Free with a Supabase PostgreSQL/PostGIS URL, Cloudflare R2, explicit fixed-code demo authentication, and an explicitly simulated relevance adapter or compatible free/local CLIP endpoint. The runbook records the free-tier limits and never treats free-demo evidence as production evidence.

## Status

Track live build progress in the checklist at the bottom of `AGENTS.md`.
