PASTE INTO CODEX (after Phase 11 is verified and committed). This is the final phase — deployment and demo rehearsal.

---

Build Phase 12: Demo Data, Rehearsal, Deployment. Follow AGENTS.md.

**1. Seed data supporting BOTH demo scripts:**
- General end-to-end example (Master Spec Part I §31): a full citizen-report → validation → routing → inspection → project → dependency → execution → completion → citizen-verification cycle on a non-Road category, with realistic Bengaluru data
- Flagship road-cutting script (delta doc §6): Segment X on a named real-sounding Bengaluru road, three agencies (Road authority/PWD, BWSSB, BESCOM) with the exact intervention dates from the script (resurfacing Jun 20–24, pipeline Jun 10–16, cable Jun 15–18), pre-seeded so the conflict/sequencing flow can be triggered live without typing dates during the actual demo if preferred, but also leave the raw entry path (W-P9 extended form) usable live in case judges want to see data entry happen in real time
- Keep `packages/db/seed.ts` idempotent (safe to re-run before each rehearsal) so a botched rehearsal run doesn't require a manual DB reset

**2. Deployment:**
- API + Postgres/PostGIS → Railway or Render (per Build Guide's stack choice)
- Web (Project Head + Admin) → Vercel
- Mobile (Citizen + Engineer) → Expo EAS Build, produce a shareable preview/install link
- Environment variables for OTP provider, image storage, CLIP inference endpoint all configured for the deployed environment, not just local dev — confirm none of these silently fall back to a mock/console-log provider in production
- Confirm the public transparency dashboard (`/analytics/public-dashboard`, Phase 10) is reachable with no auth from the deployed URL, since judges may check it independently

**3. End-to-end dry run on deployed infra (not localhost):**
- Run the full Part I §31 general scenario start to finish
- Run the full flagship road-cutting script (steps 1–9 of delta doc §6, including the analytics dashboard showing the resulting metrics) start to finish
- Time both runs — the pitch deck outline (delta doc §8) allocates a specific demo slot, confirm the live/recorded run fits it
- Confirm no step requires a manual DB edit, console command, or "pretend this happened" — everything must be clickable/tappable through the actual UI

**4. Acceptance:**
- Both demo scripts complete end-to-end on the deployed build with zero manual intervention
- Mobile app installs via the Expo link on a real phone (not just the Expo Go simulator) — test on at least one physical Android and iOS device if available
- A cold-start judge (someone who hasn't seen the build before) can be handed the deployed web/mobile links and independently explore the public dashboard without your involvement

Update AGENTS.md's build status checklist — all 12 phases should now be checked off.
