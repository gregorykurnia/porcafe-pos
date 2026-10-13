# Charred by Porcafe: three design directions

## A · Daybook (`direction-a.html`)
- **Idea:** the app as a well-kept ledger. One calm centred column, thin rules in place of boxes, light Fraunces serif numerals with Inter for the UI. Top text-tab nav on desktop; classic bottom tab bar on phone.
- **Strengths:** the calmest and most "aesthetic" of the three. It is close to the logo's fine-line character, and the typography makes money figures feel considered. Few components, so it would be easy to build consistently.
- **Risks:** with few containers, very dense screens (Setup tables, recipe editor) need careful rule discipline or they turn into a long scroll. The serif numerals are less compact in wide tables. The top nav can only hold five sections before it gets crowded.

## B · Canopy (`direction-b.html`)
- **Idea:** a warm, card-based workspace under a solid forest-green sidebar, with sub-sections unfolding in the sidebar. Outfit (geometric, matches the wordmark) plus Figtree, pill controls, 24 px cards and a honey accent. Phone: a floating pill bar with a raised centre "Close" button.
- **Strengths:** the friendliest and most immediately "app-like". The strongest brand presence (big green areas). The nightly close is one thumb away on phone. Item tiles and pill steppers are very touch-friendly on the counter tablet.
- **Risks:** cards and shadows use more space, so data-heavy pages hold fewer rows per screen. Honey, mint and terra tints across many statuses can get busy. The large dark sidebar makes the app feel less "light" than the brief asks.

## C · Mise (`direction-c.html`)
- **Idea:** a precise, tool-like workspace with a slim icon rail, a top toolbar (sub-sections, period, ⌘K jump) and split panes (list beside detail: days | items | receipt; materials | material detail). Geist with Geist Mono figures and mono caps labels. Phone: the section name opens a sheet of all sections, with a contextual bottom action dock.
- **Strengths:** scales best to data-heavy screens: Rupiah columns line up, more fits in without feeling cramped, and master–detail suits Stock, Orders, Recipes and Setup. The day list with status dots makes jumping between days easy. Keyboard shortcuts help the owner on the Mac.
- **Risks:** the most "technical" personality, so it may feel less warm or café-like than A or B. Phone navigation is hidden behind one tap, which is less discoverable than a tab bar. Three-pane layouts need careful collapse rules at tablet width.
