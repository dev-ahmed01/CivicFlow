PASTE INTO CODEX (after Phase 1 is verified and committed).

---

Build Phase 2: Citizen Reporting Flow + AI Relevance + Duplicate Detection. Follow AGENTS.md. Do not modify Phase 1's schema except additive migrations if strictly needed — flag first if so.

**1. Mobile screens (`apps/mobile`) — the citizen report wizard, one step per screen, per Part II §3.1:**
- M-C4 Select Issue Category — 2-column icon grid of the 12 categories seeded in Phase 1, search bar
- M-C5 Upload Evidence — 1 mandatory primary image tile + up to 3 supporting tiles, camera/gallery picker
- M-C6 Location Confirm — map pin auto-detected from device GPS/EXIF, address text, manual "adjust pin" if confidence is low
- M-C7 Relevance Check Feedback — plain-language retake prompt if AI relevance fails, no AI/ML terminology shown to the citizen
- M-C8 Submit Confirmation — shows Ticket Title + Ticket ID, "View Ticket" / "Done"
- M-C3 Home screen with "Report an Issue" primary CTA linking into this wizard
- Also build W-C3 on `apps/web` (single scrollable form variant of the same 4 steps, per Part II §4.1)

**2. Image upload:**
- Presigned upload flow to the S3-compatible bucket configured in Phase 1
- Store `Image` records (url, is_primary, ai_relevance_score) linked to a `TicketObservation`

**3. AI image relevance check (Part III §14.1):**
- Wrap a CLIP-style zero-shot image–text similarity call behind a service interface (`checkImageRelevance(imageUrl, categoryId): { score, pass }`) — implementation can call a hosted inference endpoint; keep it swappable
- Confidence tiers per spec: high confidence → proceed silently; low confidence → M-C7 retake prompt; after **3 retries** (state machine `AI_FLAGGED` cap, §10.1) → proceed anyway with `manual_review_recommended = true` flag on the ticket, never a permanent block
- Store the relevance score on the `Image` record

**4. Ticket state machine (§10.1) — implement the full enum and transitions:**
`DRAFT → AI_CHECK_PENDING → (AI_FLAGGED loop, capped at 3) → PENDING_VALIDATION → ...` (stop building transitions past `PENDING_VALIDATION` for now — Phase 3 picks up from there). Also implement the citizen-facing simplified 8-state mapping (§10.3) as a computed view — the citizen app must only ever display the simplified state, never internal enum values.

**5. Duplicate/shared-ticket detection (Part III §8):**
- On every new submission that passes the AI relevance check, run against existing open tickets in the same category:
  - Geographic proximity: Haversine ≤ 75m (use PostGIS `ST_DWithin` since geometry is already in Postgres, not app-layer haversine)
  - Time window: existing ticket still open, created within last 60 days
  - Visual similarity: cosine similarity of CLIP embeddings ≥ 0.75 (secondary signal only)
- Implement the exact decision matrix from §8.2 (geo+time yes → auto-merge regardless of visual signal; geo yes/time no → flag for Project Head review; geo no → new ticket)
- On merge: new submission becomes a `TicketObservation` on the existing ticket, citizen sees the **existing ticket's ID**, no "duplicate" or "merged" language anywhere in the UI (AGENTS.md rule 3). Merged submission enters the ticket's *current* state directly, does not restart from `DRAFT` (§10.2).
- All three thresholds (75m, 60 days, 0.75 similarity) come from the `AdminConfig`/`SystemConfig` table from Phase 1, not hardcoded.

**6. API endpoints (§16.1):**
`POST /tickets`, `GET /tickets/{id}`, `GET /citizens/me/tickets?filter=ongoing|past`, `POST /tickets/{id}/images`, `GET /tickets/{id}/timeline`

**7. Acceptance:**
- Submit a photo of a pothole under "Streetlight" category → relevance check fails → M-C7 retake shown → after 3 fails, ticket proceeds with `manual_review_recommended = true`
- Submit a second report of the same pothole within 75m and 60 days → same Ticket ID returned to the second citizen, no duplicate language shown, `TicketObservation` count increments
- M-C9/M-C10 (My Tickets Ongoing/Past) correctly list tickets using only the simplified 8-state labels

Update AGENTS.md's build status checklist when done.
