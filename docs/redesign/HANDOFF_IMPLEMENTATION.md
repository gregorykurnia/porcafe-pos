# Handoff prompt — build the Canopy redesign

> Start a **new session for each phase** (R1, R2, then R3 a few work packages at a time, then R4), so each one starts with a fresh context.
> Paste everything below the line, or say: *"Follow `docs/redesign/HANDOFF_IMPLEMENTATION.md`."*
> The session picks up the next unchecked item in the plan and stops at the next owner checkpoint.

---

You are a senior front-end engineer with a strong eye for design. You are implementing a full visual redesign ("Canopy") of a café back-office app in this repo (`porcafe-pos`). The design is finished and approved; your job is to **build it faithfully, safely and completely**, one work package at a time.

## 1. Read first, in this order

1. `AGENTS.md` and `CLAUDE.md`: project rules. This Next.js version differs from what you may know, so read the relevant guide in `node_modules/next/dist/docs/` before touching an API you haven't checked (fonts, layouts, routing, `notFound`, metadata).
2. `docs/redesign/IMPLEMENTATION_PLAN.md`: **the source of truth for what to do.** Find the first unchecked `[ ]` item. That's where you start. Read its phase in full, plus the guardrails, the "Behaviour changes" section and the decisions log.
3. `docs/redesign/DESIGN_SYSTEM.md`: the rules you build to. If the plan, the design system and the mockup disagree, the order of priority is: plan decisions log > `DESIGN_SYSTEM.md` > `canopy-final.html`.
4. `docs/redesign/directions/canopy-final.html`: the visual reference. It's large (around 175 KB). Read only the sections for your work package, or open it in a headless browser and screenshot the relevant frames at the widths you need.
5. `docs/redesign/CONTENT_INVENTORY.md`: for each screen work package, read the sections the plan lists. This is the checklist of everything that must exist.
6. `docs/redesign/CANOPY_REVIEW.md`: why things are the way they are. Section 6 maps the inventory to the design.

**Do not use** `docs/DESIGN_DIRECTION.md`, `docs/UX_AUDIT.md` or `docs/redesign/directions/direction-*.html`. They describe the old or unchosen designs.

## 2. How to work

- **Work in plan order.** Do the next unchecked item, then the one after it. Don't skip ahead, and don't start a phase whose previous phase ended at an unmet owner checkpoint.
- **One work package = one commit, pushed to `main`.** In the same commit, tick its box in `IMPLEMENTATION_PLAN.md` and add any notes. If you change course, add a dated row to the decisions log saying what and why. Commit messages say what changed and why, e.g. `Redesign R3.1: Home in Canopy`.
- **Stop at owner checkpoints** and report. The checkpoints are:
  - **after R1**: the owner looks at the live app re-themed
  - **at R2.6**: the owner approves `/lab`
  - **after R3.2**: the owner tries the new Daily close on a real night before the rest of R3 goes on
  - **after R4.5**: the final walkthrough

  You may also stop early when your context is getting heavy. Leave the plan accurate so the next session can continue.
- **Behaviour stays the same.** Keep the hooks and `src/lib/*` logic (`use-daily-close.ts`, `use-unsaved-changes.ts`, `use-query-state.ts`, `use-report-data.ts`, `money.ts` with `parseRupiah`, `close-checks.ts`, `attention.ts` and so on) as they are. If logic is tangled with markup, first move it out in a **refactor-only commit** that changes nothing visually, then redesign. The only approved behaviour changes are the ones the plan marks ✅. Nav signals are ❌ declined, so don't add any data loading to the app shell.
- **Write fresh JSX for each screen; don't edit the old one.** Write the new presentation in a new or emptied file using only the R2 components. Use the old file only to see which hooks, handlers and data it wires up, never for its layout or classes.
- **Never drop a feature.** Before committing a screen, go through its inventory sections line by line: every data point, action, state (empty, loading, error, offline, conflict, unsaved, success), validation message and flow step. Put the checklist in your report. If something has no home in the design, build it from existing patterns and say so; don't leave it out.

## 3. Safety: `main` is live

Pushes to `main` deploy to production on Vercel, and staff close the day in this app every night.

- **Nothing gets pushed unless all of these pass:** `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build`.
- Every commit must leave **every** screen usable, including ones not yet redesigned. That's why R1 is a *bridge*:
  - New tokens go in alongside the old ones.
  - The shadcn variables are mapped onto the new palette.
  - Legacy aliases (`success`, `warning`, `warm-accent`) point at the new tones.
  - The **`--color-*: initial` reset waits until R4.1.**
  - The `accent` name clash is fixed in R1.1: the 21 hover usages in `ui/dropdown-menu.tsx`, `ui/select.tsx`, `state/stat.tsx`, `close/daily-close-panel.tsx` and `reports/duplicate-dates.tsx` move to `bg-brand-soft` / `text-ink`, so `accent` can mean links and the focus ring.
- If a push breaks production, revert it straight away with `git revert` and push, then fix it calmly.

## 4. Firestore quota

There is no emulator: `npm run dev` reads the **live production Firestore**, and the daily read quota ran out on 2026-10-12.

- Do almost all visual work on **`/lab`** (built in R2.1). It uses fake data only and makes no Firestore calls. It must return `notFound()` in production.
- For each redesigned real screen, do **one** live check: load it once at each width, take screenshots, and don't reload repeatedly. Never script sweeps across many dates or pages.
- Never add a Firestore read to the app shell or to any component that renders on every page.

## 5. Checking your work visually

- Use headless Chromium. Playwright browsers are cached in `~/Library/Caches/ms-playwright`, and Google Chrome is installed. Put scripts and screenshots in your scratchpad, not the repo.
- Screenshot at **390, 820, 1024 and 1280** widths. Compare each one with the matching frame in `canopy-final.html` (screenshot that too) and fix what differs:
  - spacing and the type scale
  - one solid green per view
  - status shown with word, shape and tone
  - figures tabular and right-aligned
  - no overflow or truncation
  - 44 px touch targets
  - 16 px inputs on touch
- Check keyboard focus rings and that icon-only controls have labels.
- Apply the DESIGN_SYSTEM §13 accessibility checklist to everything you build, not only in R4.3.

## 6. Notes for each phase

- **R1:**
  - Fonts go through `next/font/google` in `src/app/fonts.ts`, per DESIGN_SYSTEM §3. Remove Inter and Geist Mono.
  - Make the brand assets (lockup, round mark, empty-state line illustration) as SVG. Base them on `docs/redesign/logo.png` and the mockup, then update `public/manifest.json` and the icons.
  - Finish by walking every screen once at 390 and 1280 to confirm the old screens are readable under the bridge theme.
- **R2:**
  - Build every component in DESIGN_SYSTEM §10 in `src/components/ui/*`, `src/components/fields/*` and the pattern folders. Keep each component's public props compatible where the old screens still use it. If you can't, add a new component and keep the old one until R4.1.
  - The app shell (`nav.tsx`) must keep `navigation-guard`, the offline notice, push and PWA (`sw-register.tsx`) behaving exactly as now. Sub-section tabs stay in the URL through `use-query-state.ts`.
  - Charts stay on `recharts`, restyled through `src/lib/chart-colors.ts` (see the decisions log).
  - `/lab` gets a width switcher.
- **R3:**
  - Go in the plan's table order. The plan lists each work package's files, inventory sections and design notes.
  - Daily close (R3.2) is the most important screen:
    - one column in sheet order
    - line amounts on desk and tablet only
    - payments after the items
    - one summary card
    - on phone, a sticky totals bar above the tab bar, which the recap with Undo replaces in place
  - The approved recipes unsaved guard is its **own commit** within R3.10.
- **R4:** close the bridge (reset, remove aliases and dead code), do the consistency and accessibility passes, update `STAFF_GUIDE.md`, mark the old design docs as superseded, then lint, typecheck and build.

## 7. When you stop, report

- the work packages completed, with their commit hashes
- what you verified and how (commands run and their results, which widths you screenshotted, where the screenshots are)
- the inventory checklist for each screen work package, with anything built from patterns rather than drawn frames noted
- any decisions or deviations (also written in the plan)
- exactly what the owner should look at or approve next, and on which device

Be honest: if something isn't finished or isn't verified, say so plainly, and leave the plan's checkbox unticked.
