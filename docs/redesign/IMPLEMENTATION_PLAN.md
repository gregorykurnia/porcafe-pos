# Redesign implementation plan — Canopy

Status: planning; no application code changed yet  
Date: 2026-10-13  
Chosen direction: **B · Canopy** (`directions/direction-b.html`)

## Scope and guardrails

A from-scratch visual redesign of the whole app in the Canopy direction. This changes **how the app looks and is laid out**, not what it does.

- **No behaviour changes.** Data loading, Firestore writes, validation, hooks (`use-daily-close.ts` etc.) and business rules stay as they are. If a screen's logic is tangled with its markup, pull the logic out into a hook first in a separate refactor-only commit, then redesign.
- **Write fresh JSX; don't edit the old one.** Each screen's visual layer is rebuilt from an empty file against the new components. The old screen is a checklist of content, not a starting layout.
- **The content inventory is the definition of done.** Every data point, action and state listed for a screen in `CONTENT_INVENTORY.md` must exist on the redesigned screen.
- **Use as few Firestore reads as possible.** Build and review components on `/lab` with fake data. Check real screens live once per screen, not in repeated sweeps (the daily quota ran out on 2026-10-12).
- **One work package per commit, pushed to `main`** (no redesign branch, per the owner).
- **Reference material:** `DESIGN_BRIEF.md`, `CONTENT_INVENTORY.md`, `directions/direction-b.html`. The old `docs/DESIGN_DIRECTION.md` is replaced by this redesign and should not be used as a reference.

## Stack notes

- Next.js 16.3.4 (App Router), React 19, Tailwind v4 (CSS-first `@theme` in `src/app/globals.css`), shadcn and `radix-ui` primitives, `lucide-react` icons, `sonner` toasts.
- Before any code, read the relevant guides in `node_modules/next/dist/docs/` (see `AGENTS.md`). In particular, check `next/font` and layout conventions before swapping fonts.
- Routes: `/` Home · `/items` Daily close · `/reports` Reports · `/inventory` Stock · `/setup` Setup.

---

## Phase R0 — Refine Canopy (design only)

Goal: settle Canopy's known weak spots before writing code. All work is in mockups; no app code.

Optional: run `HANDOFF_CANOPY_REVIEW.md` with a stronger model. It covers R0.1–R0.5 and drafts R1.3 (`DESIGN_SYSTEM.md`), and writes its critique to `CANOPY_REVIEW.md`.

- [ ] **R0.1 Sidebar options.** Mock two variants side by side: (a) solid forest-green sidebar as in Direction B, (b) light cream sidebar with green accents and active states. Owner picks one.
- [ ] **R0.2 Dense-screen stress test.** Mock one data-heavy screen (Reports → Items, plus Stock → Usage recap or Setup → Menu) in Canopy. It must show how lists stay readable and fit enough rows at desktop and phone widths. Decide on a "compact" density for lists inside cards.
- [ ] **R0.3 Status colours.** Cut the honey, mint and terra tints down to a fixed, small status palette (success, warning, danger, info, neutral, plus honey for highlights only). Write down which meaning each colour has.
- [ ] **R0.4 Phone navigation.** Confirm the floating pill bar and the raised centre "Close" button, and decide where the 5th section and sub-sections live on phone.
- [ ] **R0.5 Owner sign-off.** Record decisions in the decisions log below. Save the final mockup as `directions/canopy-final.html`.

**Exit:** owner approves `canopy-final.html`.

## Phase R1 — Design system foundations

Goal: make the tokens real in code. After R1 the app looks broadly re-themed, even before screens are rebuilt.

- [ ] **R1.1 Tokens.** Replace the colour, radius, shadow and spacing tokens in `src/app/globals.css` with Canopy's: cream canvas, surfaces, forest-green primary and hover, text levels, borders, status palette, and the honey highlight. Remove token names that no longer mean anything, and map the shadcn variables (`--background`, `--primary`, `--ring` etc.) onto the new tokens so the primitives inherit them.
- [ ] **R1.2 Typography.** Swap Inter and Geist Mono for Outfit (headings and figures) and Figtree (body) via `next/font` in `src/app/layout.tsx`. Define a type scale (display, title, heading, body, small, label) and tabular numerals for money and quantities.
- [ ] **R1.3 Design rules doc.** Write `docs/redesign/DESIGN_SYSTEM.md`, a short reference for future work. It covers tokens, the type scale, spacing rhythm, card versus plain-list rules, density modes, status colours, icon style and writing tone.
- [ ] **R1.4 Brand assets.** `public/` already has `logo.png`, `logo-mark.png` and the icons. Replace them with the new logo (SVG if possible, else a trimmed PNG) and the wordmark. Update the favicon and PWA icons and the manifest theme and background colours.

**Exit:** the app builds, nothing is visually broken, and the tokens doc exists.

## Phase R2 — Component kit and `/lab`

Goal: every building block exists in the Canopy style and is reviewable without touching real data.

- [ ] **R2.1 `/lab` route.** A development-only page that renders every component in every state with fake data. It must make no Firestore calls and should be excluded or hidden in production.
- [ ] **R2.2 Primitives.** Restyle or rebuild `src/components/ui/*`: button (primary, secondary, ghost, destructive, sizes), input, select, popover, dropdown, dialog, tabs, segmented control, badge (becoming the status chip), table, separator, calendar, toast.
- [ ] **R2.3 Fields.** Rebuild `fields/money-input`, `quantity-input` (pill stepper), `date-stepper` and `field-row` in the Canopy style.
- [ ] **R2.4 Patterns.** Rebuild the page header, stat tile, list row, compact list and responsive table, async section (loading, empty and error), status badge, saved-at indicator, confirm dialog, change diff, sortable head and period selector.
- [ ] **R2.5 App shell.** Build a new `nav.tsx`: the sidebar on desktop, with sub-sections unfolding under the active section, and the floating pill bar on phone with the raised Close button. Keep `navigation-guard` behaviour (unsaved work), the offline notice and the push or PWA hooks working exactly as now.
- [ ] **R2.6 Owner review.** The owner opens `/lab` on the Mac and on a phone and approves it.

**Exit:** owner approves `/lab`. No real screen has been redesigned yet.

## Phase R3 — Screen-by-screen rebuild

For **each** work package below:

1. Re-read that screen's section in `CONTENT_INVENTORY.md`.
2. If needed, do a refactor-only commit first to move logic out of the markup.
3. Write new presentation code using only R2 components.
4. Tick off every data point, action, state and flow in the inventory section.
5. Check at desktop (1280px) and phone (390px) widths. Do one live check of the screen.
6. Commit and push: `Redesign R3.x: <screen> in Canopy`.

| WP | Screen | Main files | Inventory § |
|---|---|---|---|
| [ ] R3.1 | Home | `src/app/page.tsx` | 3.1, 4.13 |
| [ ] R3.2 | Daily close (entry, states, complete review, recap) | `src/app/items/page.tsx`, `components/close/daily-close-panel.tsx`, `complete-day-review.tsx`, `close-recap.tsx` | 3.2, 4.2–4.4 |
| [ ] R3.3 | Scan sheet flow (6 phases, photo viewer, review, payments) | `components/close/scan-sheet/*` | 3.3 |
| [ ] R3.4 | Daily close → History | `components/items/item-history.tsx`, `editable-item-sale-row.tsx` | 3.4, 4.10 |
| [ ] R3.5 | Stock (dashboard, current stock, count sheet) | `src/app/inventory/page.tsx`, `inventory/stock-dashboard.tsx`, `current-stock-card.tsx`, `count-sheet.tsx` | 3.6, 3.6.1 |
| [ ] R3.6 | Stock → To order, Orders, supplier schedules | `inventory/reorder-settings.tsx`, `supplier-orders.tsx`, `supplier-schedules.tsx` | 3.6.2, 3.6.3 |
| [ ] R3.7 | Stock → Usage recap | `inventory/usage-recap.tsx` | 3.6.4 |
| [ ] R3.8 | Reports → Revenue, monthly reconciliation, duplicate dates | `src/app/reports/page.tsx`, `reports/revenue-report.tsx`, `monthly-reconciliation.tsx`, `duplicate-dates.tsx` | 3.5, 3.5.1, 4.11 |
| [ ] R3.9 | Reports → Items, Weekday patterns | `reports/items-report.tsx`, `weekday-report.tsx`, `weekday-pattern-analysis.tsx` | 3.5.2, 3.5.3 |
| [ ] R3.10 | Setup → Menu, Materials, Recipes | `src/app/setup/page.tsx`, `setup/menu-catalog.tsx`, `menu-item-row.tsx`, `materials-setup.tsx`, `recipes-setup.tsx`, `inventory/recipes.tsx`, `inventory/materials.tsx` | 3.7–3.9 |
| [ ] R3.11 | Setup → Suppliers, Import, Notifications, Data maintenance | `setup/suppliers-setup.tsx`, `inventory/suppliers.tsx`, `setup/import-setup.tsx`, `inventory/import-review.tsx`, `push-notifications-settings.tsx`, `setup/data-maintenance.tsx` | 3.10–3.13 |

The order follows usage: the nightly close first, then stock, reports and setup. Charts in Reports are restyled to the new palette, following the dataviz rules: colour tokens, accessible contrast, tabular figures.

**Exit:** every screen is ticked off against the inventory.

## Phase R4 — Cleanup and polish

- [ ] **R4.1 Remove dead styles.** Remove unused tokens, components and class patterns from the old design. Search for leftover old token names and hard-coded colours.
- [ ] **R4.2 Consistency pass.** Walk every screen at 1280, 1024 and 390 widths and check spacing, type scale, empty and error states, and toasts.
- [ ] **R4.3 Accessibility pass.** Check contrast (forest-on-cream and the status colours), focus rings, touch targets (44px or more on phone), screen-reader names on icon-only controls, and heading order.
- [ ] **R4.4 Docs.** Update `STAFF_GUIDE.md` screenshots and wording where navigation changed. Mark `docs/DESIGN_DIRECTION.md` as superseded.
- [ ] **R4.5 Lint, typecheck, build.** `npm run lint`, `npx tsc --noEmit` and `npm run build` must all pass. Deploy and do a final owner walkthrough on Mac and phone.

**Exit:** owner signs off. Redesign complete.

---

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-13 | Full-app redesign from a blank slate; current UI not used as reference. |
| 2026-10-13 | Brand: Charred by Porcafe logo, forest green on cream; modern, calm, roomy, light. Dark mode not required. |
| 2026-10-13 | Direction B · Canopy chosen over A · Daybook and C · Mise. |
| 2026-10-13 | Work directly on `main`, one commit per work package. |
| _open_ | R0.1 sidebar: solid green or cream. |
| _open_ | R0.2 list density inside cards. |
| _open_ | R0.4 phone nav: raised Close button, and where the 5th section goes. |

## Out of scope (noted for later)

- Home's "Needs attention" can show stock and delivery alerts, but Home doesn't load that data (inventory §3.1). That needs a data change, so it's a separate feature, not part of the redesign.
- No sign-in or role gating (owner decision in `ACCESS_PLAN.md`). The redesign keeps all sections visible to everyone.
