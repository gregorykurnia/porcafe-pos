# Mobile Responsiveness Prompt

```text
Improve mobile responsiveness across the Porcafe POS PWA.

Use the attached screenshot as a concrete example: on a phone-sized screen, page content and navigation appear wider than the viewport, with text and controls clipped. Audit the whole app so the fix covers other screens and shared components too.

First, inspect the repository instructions and existing UI patterns. Read the relevant Next.js guide under node_modules/next/dist/docs before changing code, as required by AGENTS.md. Identify the app’s routes and shared layouts, then trace the screenshot issue to its underlying cause.

Review every major screen and shared component on narrow mobile widths, including navigation, cards, tables, forms, dialogs, dropdowns, and fixed or sticky elements. Check the PWA’s viewport and safe-area behavior as well.

Implement fixes so that:
- Each page fits the available viewport width, with no accidental horizontal overflow.
- The bottom navigation and other fixed controls fit on small screens and don’t cover page content.
- Tables and other genuinely wide content have a usable mobile layout.
- Text, buttons, inputs, and touch targets remain readable and easy to use.
- Forms and dialogs remain usable when the on-screen keyboard is open.
- Layouts adapt cleanly across phone sizes, in both browser and installed-PWA views.
- Existing POS workflows, desktop layouts, and visual styling continue to work.

After implementing, review the affected screens at common phone widths and check that the reported clipping is fixed throughout the app. Summarize the cause, the changes made, and any remaining mobile issues. Follow AGENTS.md’s Git workflow: make a focused commit and push it to the configured remote after completing the change.
```
