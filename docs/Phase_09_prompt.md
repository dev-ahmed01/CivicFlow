PASTE INTO CODEX (after Phase 8 is verified and committed).

---

Build Phase 9: Notifications. Follow AGENTS.md. Every earlier phase has been creating `Notification` DB rows without real delivery — this phase wires actual delivery and the notification center UI.

**1. Delivery mechanisms:**
- Mobile (Citizen, Engineer apps): Expo push notifications
- Web (Project Head, Engineer, Admin): in-app notification center, polling or websocket-based unread count (your choice, document which)
- Every `Notification` row created since Phase 1 must now trigger real delivery on creation — audit all earlier phases' notification-creation call sites and confirm none were missed: ticket validation requests, dependency requests/responses/escalations, completion evidence submissions, conflict/sequencing flags, project assignment, verification outcomes

**2. Notification Center UI (Part II §6):**
- Entry point: bell icon (web) / dedicated tab (mobile)
- Unread badge, cleared on view
- Reverse-chronological, grouped by day (Today/Yesterday/Earlier)
- Each row: type-coded icon, short message, relative timestamp, tap/click-through to the relevant ticket/project/dependency
- Empty state: friendly single-line message + icon
- Type→icon/color mapping exactly per §6.2 table (verification=info blue, validated/agency received=success green, work started=info blue, work completed=warning amber, resolved=success green, dependency request=warning amber, dependency escalation=danger red, conflict detected=warning amber **never red** since it's non-blocking, assignment=info blue)
- Role-specific filter chips on Project Head/Engineer web notification pages (All / Dependencies / Assignments / Conflicts / Completion) — citizens get no filters (§6.3)

**3. Screens to complete:**
M-C14, M-E11 (mobile), W-C8, W-P13, W-E9 (web)

**4. API endpoints (§16.6):**
`GET /notifications?unread=`, `PATCH /notifications/{id}/read`

**5. Acceptance:**
- Trigger one event from each earlier phase (new validation request, dependency escalation, conflict detected, sequencing recommendation, completion evidence) and confirm the correct role receives a real push/in-app notification, not just a silent DB row
- Conflict-detected notifications never render red, regardless of severity
- Unread badge count matches actual unread rows, clears correctly on viewing the list

Update AGENTS.md's build status checklist when done.
