# CivicOS

Civic infrastructure accountability platform — built for Smart India Hackathon. Citizens report and verify civic issues (potholes, streetlight outages, water/sewage problems, etc.); Project Heads and Executive Engineers across municipal agencies (BWSSB, BESCOM, PWD, and others) route, coordinate, and resolve them. The flagship differentiator is the **Road-Cutting Intelligence Layer**: a conflict-detection and sequencing-recommendation engine that catches agencies about to dig up the same stretch of road for unrelated reasons — before it happens, not after.

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
    web/      # Next.js 14 — Project Head + Admin (web-only roles)
    mobile/   # Expo React Native — Citizen + Engineer (native apps)
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
| 10 | Analytics, admin config, transparency dashboard | 1–9 |
| 11 | Design system / UI polish | all screens from 2–10 |
| 12 | Seed data, demo rehearsal, deployment | all |

## Local setup

```bash
git clone <this-repo-url>
cd civicos
corepack enable
pnpm install
copy .env.example .env       # use `cp` on macOS/Linux
docker compose up -d postgres
pnpm --filter db exec prisma migrate dev
pnpm --filter db exec prisma db seed
pnpm build
pnpm test
pnpm verify:auth             # OTP/JWT/RBAC smoke test against the seeded DB
pnpm dev
```

The compose service maps PostgreSQL to host port `5433` to avoid common conflicts with an existing local PostgreSQL installation. Local seeded internal accounts use `CivicOS@123`; accounts marked for first-login reset can only reach the password-reset flow until they change it.

## Demo scripts

Two rehearsed end-to-end walkthroughs (built out fully in Phase 12):
- **General flow** — a full citizen-report → validation → routing → inspection → project → dependency → execution → completion cycle on a non-road category
- **Flagship road-cutting flow** — three agencies logging conflicting interventions on the same road segment, the system catching a restoration-too-early conflict, and the sequencing engine recommending a coordinated order

## Status

Track live build progress in the checklist at the bottom of `AGENTS.md`.
