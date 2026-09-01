# CivicOS — Build Guide (Codex Execution)

## 1. How to actually build this in Codex

Codex (the CLI agent) works best as a **phase-by-phase loop**, not one giant prompt. The failure mode to avoid: dumping the whole 1800-line spec into one session and asking it to "build CivicOS" — it will produce a shallow skeleton across everything instead of a working slice.

**The loop, per phase:**
1. You paste the phase prompt (from `02_Phase_Plan.md` / individual phase files) into Codex in your repo root.
2. Codex reads `AGENTS.md` automatically (drop it in repo root once — it persists across sessions) — this carries stack conventions, folder structure, and non-negotiable rules so you don't repeat them every phase.
3. Codex implements the phase, writes/updates tests, runs the build.
4. **You verify before moving on**: run the app, hit the new endpoints/screens, check against the phase's acceptance criteria.
5. Commit with the phase number in the message (`git commit -m "Phase 3: community verification"`). This gives you rollback points — critical when an agent's later phase breaks an earlier one.
6. Only then start the next phase prompt.

**Rules that keep Codex on track over 12 phases:**
- Never let a phase touch files outside its own scope unless the phase explicitly says "extends X." Say so in the prompt if Codex starts refactoring unrelated code.
- Re-paste the relevant Master Spec section number (not the whole doc) when a phase needs precision — Codex should implement *that* section, not reinvent it.
- If Codex proposes a schema/API change mid-phase that contradicts an earlier phase, stop and reconcile manually before continuing — don't let it silently drift from the spec.
- Keep `AGENTS.md` updated as decisions get made (e.g., final OTP provider, final image storage bucket name) so later phases inherit them automatically.

---

## 2. Tech Stack

Real native mobile + web + full spec, one build cycle → this needs a monorepo with a shared backend, not two disconnected apps.

| Layer | Choice | Why |
|---|---|---|
| Monorepo tooling | **Turborepo** (npm/pnpm workspaces) | One repo, shared types between mobile/web/api, single Codex context |
| Backend API | **Node.js + Express (TypeScript)** | Fast to scaffold, huge Codex training coverage, easy to reason about REST contracts already specified in Part III §16 |
| Database | **PostgreSQL + PostGIS extension** | `RoadSegment.geometry` (§4.1 of the delta doc) needs real polyline geometry, not lat/lng hacks. PostGIS also makes the 200m/75m radius checks (§8.1, §13.2, §9.1) native SQL instead of app-layer haversine math |
| ORM | **Prisma** | Type-safe schema shared across API, generates TS types the frontend/mobile can import directly |
| Web app (Project Head + Engineer operational portals, supported citizen web experience) | **Next.js 14 (App Router)** | App Router and server components support operations dashboards and field workflows |
| Mobile app (Citizen + Engineer, native) | **React Native + Expo** | Real native app per your answer, still shares TypeScript types/validation with the backend; Expo EAS gets you a real installable build without native Xcode/Android Studio setup pain mid-hackathon |
| Auth | **Phone OTP (citizens) via MSG91/Twilio test mode** + **email/password + JWT (internal roles)** — exactly Part III §17.1 | Matches spec's SIH-pattern default; use a sandbox/test OTP provider for demo reliability |
| Image storage | **Cloudflare R2 / Supabase Storage (S3-compatible)** | Cheap, simple presigned-upload flow from mobile |
| AI image relevance | **CLIP (zero-shot) via a hosted inference endpoint** (e.g., Replicate or a small self-hosted CLIP service) | Matches §14.1's explicit recommendation, avoids training a classifier |
| Push notifications | **Expo Notifications (mobile)** + in-app feed (web) | Matches §26 without needing a native FCM/APNs setup detour |
| Hosting | **API + DB: Railway or Render (Postgres+PostGIS addon). Web: Vercel. Mobile: Expo EAS Build** | Fast provisioning, no infra babysitting during build |

**Repo layout:**
```
civicos/
  apps/
    api/          # Express + Prisma backend
    web/          # Next.js — Project Head + Engineer portals and citizen web
    mobile/       # Expo — Citizen + Engineer
  packages/
    db/           # Prisma schema, migrations, seed
    shared/       # Zod schemas, shared TS types, constants (categories, state enums)
    config/       # eslint/tsconfig base
  AGENTS.md
```

This structure means **Phase 1 (data model) only touches `packages/db` and `packages/shared`**, and every later phase imports from there instead of redefining types — this is what stops the mobile app and web app from drifting into two different ideas of what a `Ticket` is.
