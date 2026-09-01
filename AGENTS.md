# AGENTS.md — CivicOS

Read this before every task. This file encodes conventions that must not be re-derived or re-decided per phase.

## Stack (do not substitute)
- Monorepo: Turborepo + pnpm workspaces
- API: `apps/api` — Node.js, Express, TypeScript
- Web: `apps/web` — Next.js 14 App Router (Project Head + Engineer operational portals, plus the supported citizen web experience)
- Mobile: `apps/mobile` — React Native + Expo (Citizen + Engineer native experiences, per spec Part II §2.1/§2.4)
- DB: PostgreSQL + PostGIS, accessed via Prisma (`packages/db`)
- Shared types/validation: `packages/shared` (Zod schemas). API, web, and mobile all import from here — never redefine a `Ticket`, `Project`, etc. shape locally.
- Auth: Phone OTP for Citizens, email/password+JWT for Project Head/Engineer (Part III §17.1). Session = short-lived JWT access token + refresh token.

## Non-negotiable product rules (violating these breaks the spec, not just style)
1. **RBAC is enforced server-side on every endpoint**, never trusted from client role state. Check role AND ownership/scope (e.g. Project Head can only act on tickets routed to their own agency). Reference: Part III §17.2 RBAC matrix.
2. **Conflict warnings are always advisory, never blocking.** A Project Head/Engineer can proceed past a conflict warning. This applies to both the generic conflict engine (§13, §23-24) and the Road-Cutting sequencing engine. Never implement a hard block on conflicting timelines.
3. **Citizens are never shown "duplicate" or "merged" language.** A duplicate submission silently becomes an additional observation on the existing ticket and the citizen sees their own ticket ID as normal (§7, §8.3).
4. **Nothing is hardcoded that the spec marks configurable**: issue categories, agency-routing matrix, ward boundaries, verification radius, validation caps, thresholds (§7.1, §7.2, §20). These live in `SystemConfig` and related DB tables provisioned through controlled system operations, not enums baked into application logic or unrestricted Project Head endpoints.
5. **Any cost/time-saved metric shown anywhere in the UI must be visibly labeled "simulated/illustrative"** if it is not computed from real data (delta doc §5, §6). Never present a fabricated number as measured.
6. **Human-in-the-loop over automation**: AI (image relevance, duplicate similarity) assists and flags; it never auto-resolves, auto-merges without the defined deterministic rule (§8.2), or auto-creates dependencies (dependency creation is always a human Project Head/Engineer action, §16 in original context doc).
7. **Sequencing recommendations must be explainable.** The Road-Cutting sequencing engine (delta doc §4.4) is a deterministic rule set, not a black-box model — every recommendation must be traceable to a specific rule.

## Working conventions
- Every phase = one focused unit of work. Do not touch files outside the phase's stated scope unless the phase explicitly says "extends X."
- After implementing a phase: run `pnpm build` and `pnpm test` (or the relevant workspace's build/test) before considering it done. Report failures, don't silently skip.
- All new DB fields go through a Prisma migration, never manual SQL against the dev DB.
- Reference spec sections by number in code comments where logic is non-obvious (e.g. `// Part III §9.2 — eligibility rule 5`), so a reviewer can trace implementation back to spec.
- Seed data lives in `packages/db/seed.ts` and should stay demo-realistic (Bengaluru wards, real-sounding agency names: BWSSB, BESCOM, PWD) — this seed is what powers the live SIH demo script, keep it in sync as entities are added.

## Current build status
_(Update this section as phases complete — Codex should read it to know what already exists before starting a new phase.)_
- [x] Phase 1 — Foundation (monorepo, data model, auth)
- [x] Phase 2 — Citizen reporting flow + AI relevance + duplicate detection
- [x] Phase 3 — Community verification
- [x] Phase 4 — Agency routing + Project Head core workflows
- [x] Phase 5 — Dependency system
- [x] Phase 6 — Executive Engineer workflows
- [x] Phase 7 — Conflict detection engine (generic)
- [x] Phase 8 — Road-Cutting Intelligence Layer (flagship)
- [x] Phase 9 — Notifications
- [x] Phase 10 — Analytics, system configuration, transparency dashboard
- [x] Phase 11 — Design system / UI polish
- [x] Phase 12 — Seed data, demo rehearsal, deployment
- [x] SIH Role Redesign Phase 1 — Three-persona role model; retired global administration surfaces
- [x] SIH Role Redesign Phase 5 — Project Head Command Centre and unified Work Pipeline
