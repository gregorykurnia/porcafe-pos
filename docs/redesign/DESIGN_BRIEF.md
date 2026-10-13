# Design Brief — Porcafe POS revamp

A from-scratch visual redesign of the whole app. The current UI is **not** a reference; only the
content inventory (`CONTENT_INVENTORY.md`) defines what must exist.

## Brand
- Name: **Charred by Porcafe**. Logo: `logo.png` / `logo.pdf` — a fine single-weight line illustration
  of a person eating from a rice bowl, with solid fills for hair and bowl.
- Colors from the logo: deep forest green (approx. `#163D2F`) on warm cream/beige (approx. `#F6F0E6`).
  The palette should be built around these: light, bright-ish, cream base with green as the main accent.
- Wordmark: geometric sans, all caps, wide letter-spacing; secondary line "— BY PORCAFE —" with thin rules.

## Feel
- Modern, calm, aesthetic, "visually looks good".
- Roomy rather than dense; generous whitespace; clear hierarchy over packing things in.
- Light theme (primary). Dark is not required.
- Modern fonts; the fine-line, hand-drawn character of the logo can inform details (thin rules,
  outline icons, subtle illustration) but restraint over decoration.

## Devices
- Mac (browser, laptop width) and phone. Both must work well; phone is not an afterthought.

## Users & context
- Small café owner and staff doing daily sales close, inventory, item setup and reports.
  See `CONTENT_INVENTORY.md` for screens, data, actions and states.

## Priorities
- Every screen matters equally. The design system must scale across data-heavy screens
  (lists of items, money, quantities, reports) without losing the calm feel.

## Constraints
- Built on Next.js + Tailwind (+ shadcn primitives as plumbing). The look comes from tokens and
  our own components, not library defaults.
- Money is Indonesian Rupiah; quantities and dates are frequent.
