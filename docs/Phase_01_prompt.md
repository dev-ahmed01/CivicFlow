PASTE THIS INTO CODEX IN AN EMPTY REPO (after AGENTS.md is already in repo root).

---

Set up the CivicOS monorepo foundation. Follow AGENTS.md for stack and conventions exactly.

**1. Scaffold the monorepo:**
- Turborepo + pnpm workspaces
- `apps/api` — Express + TypeScript
- `apps/web` — Next.js 14 (App Router), TypeScript
- `apps/mobile` — Expo (React Native), TypeScript
- `packages/db` — Prisma schema + client, targeting PostgreSQL with the PostGIS extension enabled
- `packages/shared` — Zod schemas and shared TS types for every entity below; this is the single source of truth other packages import from
- `packages/config` — shared eslint + tsconfig base

**2. Prisma schema — implement these entities and relationships:**
- `User` (id, role: CITIZEN | PROJECT_HEAD | ENGINEER, phone (citizens) or email (internal), auth fields, agencyId nullable, wardId nullable, createdAt)
- `Ward` (id, name, boundary geometry, verificationRadiusOverrideMeters nullable)
- `Agency` (id, name, type e.g. Roads/PWD, Electrical, Water Board, etc.)
- `Category` (id, name, primaryAgencyId, system-configurable — seed with the 12 categories: Road Damage, Streetlight, Water Supply, Drainage/Sewage, Garbage/Waste, Electrical Hazard, Public Toilet, Parks & Trees, Stray Animals, Illegal Construction, Traffic & Signage, Other)
- `RoutingRule` (categoryId, dependencyAgencyId — the "commonly-associated dependency agencies" table)
- `Ticket` (id, categoryId, reporterId nullable [null for agency-originated], coordinates (PostGIS point), wardId, state enum matching the full ticket state machine, createdAt)
- `Observation` (id, ticketId, submitterId, imageUrl, note, createdAt) — additional submissions merged into an existing ticket
- `Validation` (id, ticketId, validatorId, vote, createdAt)
- `Project` (id, ticketId nullable [agency-originated projects may not have a source ticket], agencyId, state enum matching full project state machine, plannedStart, plannedEnd, engineerId nullable, createdAt)
- `Dependency` (id, projectId, requestingAgencyId, respondingAgencyId, state enum matching dependency state machine, createdAt)
- `RoadSegment` (id, roadName, geometry (PostGIS LineString), wardId, surfaceType, lastRestorationDate nullable) — build the table now, don't wire logic yet
- `Intervention` (id, projectId [1:1], segmentId, requestingAgencyId, purpose, plannedStart, plannedEnd, affectedLengthM, dependencyRefs) — build the table now, don't wire logic yet
- `Notification` (id, userId, type, payload, read, createdAt)
- `SystemConfig` (key, value, description) — for tunable thresholds (verification radius, duplicate detection thresholds, validation daily cap, etc. — do not hardcode these anywhere in app logic, read from this table)

Use Postgres enums for all state machines. Add indexes on coordinates (GiST), ticket state, project state, and foreign keys.

**3. Auth:**
- Citizen: phone number + OTP. Use a pluggable OTP provider interface (mock/console-log provider for local dev, real SMS provider swappable later) — do not hardcode a specific vendor SDK call inline, wrap it.
- Project Head / Engineer: email + password, bcrypt hashed, first-login forces password reset.
- JWT access token (short-lived) + refresh token (longer-lived), issued on successful auth for all roles.
- Express middleware: `requireAuth`, `requireRole(...roles)` — every protected route must use both; reject with 403 on role mismatch, 401 on missing/invalid token.

**4. Seed script (`packages/db/seed.ts`):**
- 3–4 Bengaluru wards (real-sounding names, e.g. Koramangala, Indiranagar, HSR Layout)
- Agencies: BWSSB (Water Board), BESCOM (Electrical/Power), PWD/Roads Authority, Municipal Waste Management, Traffic Police, Town Planning
- All 12 categories with correct primary agency mapping per the routing matrix
- 2–3 seed users per role for local testing

**5. Verify:**
- `pnpm install && pnpm build` succeeds across all workspaces
- `pnpm --filter db exec prisma migrate dev` runs clean against a local Postgres+PostGIS instance
- `pnpm --filter db exec prisma db seed` populates correctly
- A quick script or Postman collection proving: citizen OTP login returns a JWT; that JWT fails on a Project-Head-only route; a seeded Project Head's login succeeds on that same route.

Do not build any UI screens yet — this phase is data model + auth only. Update the "Current build status" checklist in AGENTS.md to check off Phase 1 when done.
