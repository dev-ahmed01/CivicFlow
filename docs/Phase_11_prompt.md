PASTE INTO CODEX (after Phase 10 is verified and committed).

---

Build Phase 11: Design System / UI Polish. Follow AGENTS.md. This phase touches presentation only — do not change any business logic, state machines, or API contracts built in Phases 1–10.

**1. Design system (Part II §1):**
- Apply brand direction (§1.1), color palette (§1.2), typography (§1.3) consistently across every screen built in Phases 2–10, on both `apps/web` and `apps/mobile`
- Build/consolidate the shared component library (§1.4) — buttons, cards, chips, form fields, the notification row pattern, the ticket-card pattern used identically across M-C9/M-C10/W-C4 — so components aren't reimplemented per screen
- Implement density modes (§1.5) if the spec defines distinct comfortable/compact modes — check the source doc for specifics before inventing behavior

**2. Screen completeness audit — go through Part II §7's Role-to-Screen matrix and confirm every screen exists and is reachable via its role's nav IA (§2):**
- Citizen: 15 mobile (M-C1–M-C15) + 9 web (W-C1–W-C9)
- Project Head: 14 web (W-P1–W-P14) — web-only role, no mobile screens should exist for this role
- Executive Engineer: 12 mobile (M-E1–M-E12) + 10 web (W-E1–W-E10)
- Fill in any screen that earlier phases skipped or stubbed (check each phase's prompt — a few screens were explicitly deferred, e.g. map views were allowed to launch as list-only per §8's open decision; decide now whether to add the map or keep list-only and document the choice)

**3. Navigation IA (§2):**
- Verify each role's nav structure matches §2.1–§2.5 exactly — tab bar items (mobile), sidebar/top-nav items (web) — and that cross-role IA principles (§2.6) are respected (e.g. no role sees another role's nav items)

**4. Category menu pattern (§5):**
- Confirm the icon+label tile grid is used identically everywhere a category selector appears (citizen report flow, W-P9/Phase 8's road-cutting form) — same component, not two different implementations

**5. Acceptance:**
- Every screen ID in §7's matrix is reachable by clicking/tapping through the actual nav for its role — do a manual walkthrough per role and check off each screen
- No screen uses a color/type style outside the defined design tokens (spot-check a sample, not exhaustive)
- Same `TicketCard` and `NotificationRow` components render identically (same props, different data) across every screen that uses them

Update AGENTS.md's build status checklist when done.
