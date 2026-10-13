# Design Brief — Porcafe POS revamp

A from-scratch visual redesign of the whole app. The current UI is **not** a reference; only the
content inventory (`CONTENT_INVENTORY.md`) defines what must exist.

## Brand
- Name: **Charred by Porcafe**. Logo: `logo.png` / `logo.pdf` — a fine single-weight line illustration
  of a person eating from a rice bowl, with solid fills for hair and bowl.
- Colors from the logo: deep forest green (`#163D2F`) on warm cream (`#F6F0E6`).
  The palette should be built around these: light, bright-ish, cream base with green as the main accent.
- Wordmark: geometric sans, all caps, wide letter-spacing; secondary line "— BY PORCAFE —" with thin rules.

## Feel
- Modern, calm, aesthetic, "visually looks good".
- Roomy rather than dense; generous whitespace; clear hierarchy over packing things in.
- Light theme (primary). Dark is not required.
- Modern fonts; the fine-line, hand-drawn character of the logo can inform details (thin rules,
  outline icons, subtle illustration) but restraint over decoration.

## Devices
- Phone (390): the installed PWA, used for the nightly close, receiving deliveries and alerts.
- Counter tablet (768–1183, touch only): touch density everywhere and a labelled rail, not a squeezed
  desktop. Landscape gets the two-column close; portrait drops to one column.
- Mac (1280+, browser): reviews, ordering and setup.
- Standalone PWA: respect safe areas; there is no browser chrome to rely on.

## Users & context
- Small café owner and staff doing daily sales close, inventory, item setup and reports.
  See `CONTENT_INVENTORY.md` for screens, data, actions and states.

## Priorities
- Every screen must be complete; not every screen gets equal attention. Order of care:
  Daily close + Scan sheet (nightly, tired, phone) > Home > Stock (receive, count, order)
  > Reports > Setup. When the close and another screen disagree, the close wins.
- Roomy chrome, compact data: generous space around sections, and compact rows inside
  data tables on desktop.

## Accessibility
- WCAG 2.2 AA: 4.5:1 text contrast, 3:1 for input borders and meaningful marks, 44 px touch
  targets, a visible focus ring, and status never shown by colour alone.
- Inputs at 16 px on touch (no iOS zoom). Smallest text 12 px.

## Content and states
- Money, quantities and dates follow inventory §4.7–4.9; figures are tabular.
- Loading, empty, error, offline, conflict and unsaved states are in scope for every screen.

## Constraints
- Next.js 16, Tailwind v4 (`@theme` tokens), shadcn/Radix, lucide-react icons, sonner toasts.
  The look comes from tokens and our own components, not library defaults. No effect that needs
  custom engineering beyond these.
- Brand cream is #F6F0E6 (the logo), not an approximation.
- Money is Indonesian Rupiah; quantities and dates are frequent.
