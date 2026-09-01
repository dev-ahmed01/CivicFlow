# CivicOS — Visual Design System (for Codex)

Paste this into Codex during Phase 11 (or earlier, if you want Phase 2 onward to use real tokens instead of placeholders — recommended, since retrofitting colors across 40+ screens is wasted work). This REPLACES any placeholder color values used in earlier phases — do not keep both systems.

## Design direction
Light, airy, sustainable-feeling — white/cream surfaces with green as the only strong accent, black/near-black text for legibility. No gradients, no shadows beyond a single soft card elevation, generous whitespace on citizen-facing screens, tighter density on internal screens. The palette should read as calm and trustworthy, not corporate-cold or consumer-flashy — this is public infrastructure software.

Two coordinated sub-palettes, same hue family, tuned for two different jobs:
- **Citizen surfaces (mobile + citizen web)**: warmer, brighter, more whitespace — optimized for a one-off/occasional user who needs to feel welcomed and reassured.
- **Internal surfaces (Project Head and Engineer web)**: higher contrast, tighter density — optimized for someone using this for hours a day who needs speed and legibility over charm.

## Color tokens

### Citizen palette (mint & cream)
```
--cv-bg:            #FFFDF7   /* page background */
--cv-surface:       #FFFFFF   /* cards */
--cv-surface-alt:   #F5F3E8   /* secondary cards, list rows */
--cv-accent:        #C9EBD4   /* primary CTA fill, light mint */
--cv-accent-strong: #1F7A44   /* accent text/icons on light fills, pressed states */
--cv-border:        #E8E3D3
--cv-text:          #141614   /* near-black, not pure #000 */
--cv-text-secondary:#5B5F58
```

### Internal palette (forest & white)
```
--cv-bg:            #FFFFFF
--cv-surface:       #FFFFFF
--cv-surface-alt:   #F6F6F6
--cv-accent:        #1F5A34   /* deep forest, used for primary buttons/active nav */
--cv-accent-light:  #E4F1E7   /* light fill for chips/tags/hover states */
--cv-border:        #E2E2E2
--cv-text:          #111111
--cv-text-secondary:#5F5F5F
```

### Shared semantic tokens (both palettes — status colors stay desaturated, never alarmist, per existing spec)
```
--cv-success-bg:   #E4F1E7   --cv-success-text: #1F5A34
--cv-warning-bg:   #FBF1DE   --cv-warning-text: #8A6416   /* used for advisory conflict flags — never red */
--cv-danger-bg:    #FBEAEA   --cv-danger-text:  #9C3B3B   /* reserved: dependency escalation only, per Notification type mapping */
--cv-info-bg:      #E7F0F7   --cv-info-text:    #2C5C82
```

## Typography
- Font: a clean humanist sans (Inter or similar — pick one that renders well on both React Native and web without licensing friction)
- Two weights only: 400 regular, 500 medium. Never bold/700 — it reads heavy against this palette.
- Scale: 12px (captions/meta) · 14px (body, secondary labels) · 16px (primary body, form inputs) · 18px (section headers) · 22px (screen titles)
- Sentence case everywhere — no Title Case, no ALL CAPS, including button labels and status chips

## Surfaces & elevation
- Cards: `border-radius: 12px`, one hairline border (`--cv-border`) OR one very soft shadow — never both stacked
- No gradients anywhere except (optionally) a single subtle two-stop mint gradient reserved for the citizen app's primary CTA button, nothing else
- Status chips: pill-shaped (`border-radius: 20px`), colored fill from the semantic tokens above, text uses the matching `-text` token, never plain black on a colored chip

## Component patterns (build once, reuse everywhere per AGENTS.md convention)
- `TicketCard` — ticket ID, category, status chip, relative date. Same component on citizen "My Tickets," Project Head queue, Engineer work list — only the visible fields/actions change per role.
- `StatusChip` — maps ticket/project/dependency state → pill using the semantic tokens
- `PrimaryButton` — citizen palette: mint accent fill, forest-strong text; internal palette: solid forest fill, white text
- `ConflictBanner` — always uses `--cv-warning-*`, never `--cv-danger-*`, regardless of severity (advisory-only rule)
- `SequencingRecommendationCard` — visually distinct from `ConflictBanner`: use `--cv-info-*` tokens instead of warning tokens, so the flagship recommendation reads as "helpful suggestion" not "problem," and doesn't visually blend into the six conflict-type warnings sitting next to it

## Icons
Outline-style icon set (not filled), single-weight stroke, colored via `currentColor` so they inherit the token color of their context. Use one consistent set across mobile and web — do not mix icon libraries between the two apps.

## Dark mode
Not required for the SIH build — skip it. Ship light-only to keep Phase 11 scoped; note this as a documented deferral, not an oversight, if asked.

## Acceptance for Phase 11 (or wherever this gets applied)
- Every hardcoded color in earlier phases' UI code is replaced with a token from this file — grep for raw hex values outside this token file and treat any hit as a bug
- Citizen app (mobile + citizen web) uses the citizen palette exclusively; Project Head/Engineer web uses the internal palette exclusively — no screen mixes both
- `ConflictBanner` and `SequencingRecommendationCard` are visually distinguishable at a glance (different token families), not just different copy
- Status chip colors match the semantic mapping exactly — conflict/warning never renders in the danger/red token
