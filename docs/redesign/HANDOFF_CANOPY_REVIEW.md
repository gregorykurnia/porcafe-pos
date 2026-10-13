# Handoff prompt — review and perfect the Canopy design

> Paste everything below the line into a new session with the strongest available model.
> Run it from the repo root (`porcafe-pos/`), or attach the files listed under **Inputs**.

---

You are a world-class product designer and design-systems lead, the kind who has shipped calm, beautiful operational software (think Linear, Things, Square Dashboard, Toast's back office). Your job is to **pressure-test and then perfect** a chosen design direction for a small café's back-office web app. You will critique it honestly, decide the open questions, and deliver a final, polished, implementation-ready design.

## Context

- **Product:** the back office for one small Indonesian café, *Charred by Porcafe*. It is not a checkout terminal. Sales happen on paper and payment terminals; this app records and reviews them afterwards. Its centre is the **nightly Daily close** (portions sold per menu item plus payment totals, typed in or read from a photo of the handwritten tally sheet). Around that sit reports, stock and ordering, and setup.
- **Users:** a shift closer or staff member (nightly close, ~5–10 minutes every day, often tired, at the counter on a phone), and the owner/manager (reports, ordering and setup, mostly on a Mac).
- **The owner's taste:** modern, calm, aesthetic, roomy rather than dense, a light theme, modern fonts, and colours from the logo (forest green on warm cream, bright-ish). Dark mode is not needed.
- **Where we are:** a designer with **no access to the current UI** produced three directions from a written brief. The owner chose **B · Canopy**. Its known risks are:
  - the big dark green sidebar feels less "light" than the brief asks
  - cards and shadows fit fewer rows on data-heavy screens
  - the honey, mint and terra status tints can get busy
- **What comes after you:** the design will be built in Next.js 16 with Tailwind v4 (CSS `@theme` tokens) and shadcn/Radix primitives, plus `lucide-react` icons and `sonner` toasts. It has to be buildable with these, so no effects that need heavy custom engineering.

## Inputs (read these and only these)

All files are in `docs/redesign/`:
1. `DESIGN_BRIEF.md` — brand, feel, devices, constraints.
2. `CONTENT_INVENTORY.md` — every screen, data point, action, state and flow. This is the definition of "complete". Read all of it.
3. `logo.png` — look at it closely: the line weight, the fills, the wordmark spacing.
4. `directions/direction-b.html` — **Canopy, the chosen direction.** Open it and screenshot it at desktop and phone widths if you can run a headless browser.
5. `directions/direction-a.html`, `directions/direction-c.html`, `directions/SUMMARY.md` — the directions that weren't chosen. Borrow good ideas from them (e.g. A's calm and rule discipline, C's density and number alignment) as long as they fit Canopy's character.

**Hard rule:** do not open `src/`, `public/` or any other doc in `docs/` (especially `DESIGN_DIRECTION.md` and `UX_AUDIT.md`). They describe the old UI, and the point is a design free of its influence. Do not run the app or touch any database.

## Your tasks

### 1. Audit the brief
Is the brief right for this product and these users? Check it against the inventory and say what's missing, contradictory or under-specified. Known tension: the brief says "Mac + phone", but the inventory mentions a **counter tablet** too. Decide whether tablet width needs first-class treatment, and say why. Keep this short and decisive; propose brief amendments as a diff-style list.

### 2. Critique Canopy
Go screen by screen and principle by principle. Rank the findings (critical / major / minor), each with the problem, why it matters for *this* user, and the fix. Cover at least:
- **Hierarchy and calm:** does each screen have one obvious focus? Is anything competing?
- **Brand fit:** does it feel like the logo (fine line, warm cream, restrained green), or like a generic SaaS template in green?
- **The nightly close on a phone:** speed, thumb reach, error prevention, the unsaved, complete and undo states, and the photo-scan flow.
- **Data-heavy screens:** Reports → Items, Stock, Usage recap, Setup → Menu and Recipes. Are rows scannable? Do Rupiah figures line up (tabular numerals, right-aligned)? Is density adequate?
- **Status language:** is the colour system small, consistent and colour-blind safe? Check against inventory §4.13.
- **Navigation:** sidebar versus a cream variant, sub-sections, the phone pill bar and raised Close button, and where 5 sections plus sub-sections live on phone.
- **Typography:** are Outfit and Figtree right, at what scale, and are the figures legible?
- **Accessibility:** WCAG AA contrast (compute actual ratios for text on cream, on surfaces, on green, and for the status colours), focus states, 44px touch targets, labels on icon-only controls.
- **Completeness:** anything in the inventory that Canopy doesn't show a home for.

### 3. Decide the open questions
Make a clear call on each, with a one-line rationale. Mock both options only where the choice is genuinely close.
- **Sidebar:** solid forest green, or cream with green accents?
- **List density** inside cards: one density, or a comfortable/compact pair, and where each applies.
- **Phone navigation:** keep the raised centre Close button? Where do the sections and sub-sections go?
- **Status palette:** the final set and meaning of each colour. Honey is for highlights only, or say why not.
- **Cards versus plain lists:** the rule for when something gets a card.

### 4. Deliver `directions/canopy-final.html`
A single self-contained HTML file: Tailwind via CDN (`https://cdn.tailwindcss.com`), Google Fonts only, everything else inline, the logo by relative path `logo.png` (a copy sits in `directions/`). Use realistic fake data from the same café: Rupiah formatted like "Rp 3.215.000", the menu items and suppliers already used in the directions. Keep figures consistent across screens. It must contain:
1. **System sheet:** colour tokens (name, hex, role, contrast ratio against its background), type scale (name, family, size/line-height/weight, usage), spacing scale, radius, shadows/elevation, icon style, and motion (durations and easing, kept minimal).
2. **Component sheet**, all states: buttons (primary, secondary, ghost, destructive; default, hover, focus, disabled, loading), text, money and quantity inputs (with the pill stepper), date stepper, period selector, select, status chips (every status in inventory §4.13), list rows (comfortable and compact), the data table pattern, stat tiles, empty, loading and error states, toast, confirm dialog (normal and destructive), the unsaved-changes guard, the offline notice, and before/after diffs.
3. **App shell** at desktop (1280), tablet (if you decided it's first-class) and phone (390).
4. **Screens at desktop:** Home, Daily close (in progress, unsaved, complete review, recap with undo), Scan sheet (at least the photo and review phases), History, Reports → Revenue (with an inline-SVG chart), Reports → Items, Stock, Stock → To order, Stock → Orders, Usage recap, Setup → Menu, and Setup → Recipes.
5. **Screens at phone width:** Home, Daily close (entry and complete), Scan sheet, Stock, Reports → Revenue, and the navigation open.

### 5. Deliver `DESIGN_SYSTEM.md`
Write `docs/redesign/DESIGN_SYSTEM.md`, the spec engineers will build from. Include:
- tokens as a ready-to-paste Tailwind v4 `@theme` block (CSS custom properties, names that describe the role such as `--color-surface` or `--color-status-warning`)
- font setup (Google Fonts families and weights for `next/font`)
- the type scale, spacing and radius rules
- density modes and when to use each
- the card-versus-list rule
- status colour meanings
- component anatomy notes for the non-obvious ones (money input, quantity stepper, period selector, the Daily close totals bar, phone nav)
- writing tone for labels, empty states and errors

Keep it tight. It is a rulebook, not an essay.

### 6. Self-review before you finish
Open `canopy-final.html` in a headless browser if one is available, and screenshot it at 1280, 1024 and 390 widths. Then fix:
- text overflow, wrapping and truncation
- misaligned figures
- inconsistent spacing
- contrast failures
- anything that breaks calm

Repeat until clean. Then check the final file against every section of `CONTENT_INVENTORY.md` and list anything you deliberately left out, with the reason.

## Output

Write `docs/redesign/CANOPY_REVIEW.md` with:
1. the brief amendments
2. the ranked critique
3. the decisions, with rationale
4. what changed from `direction-b.html` and why, as a short list
5. remaining risks and open questions for the owner, at most five

Then reply with a short summary and the paths of `CANOPY_REVIEW.md`, `directions/canopy-final.html` and `DESIGN_SYSTEM.md`.

## Quality bar

- **Calm:** one focal point per screen, generous but purposeful whitespace, a restrained palette, and no decoration that doesn't carry meaning.
- **Warm and on-brand:** it should feel like *this* café, not a template. The logo's fine-line character can show up in thin rules, outline icons, and perhaps one small line illustration for empty states.
- **Fast for the nightly close:** the most common action is always the most obvious and the easiest to reach.
- **Numbers are first-class:** tabular figures, consistent Rupiah formatting, right-aligned, and legible at a glance.
- **Complete and buildable:** every inventory item has a home, and everything maps to Tailwind tokens and Radix/shadcn primitives.
