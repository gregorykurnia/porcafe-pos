import type { ReactNode } from "react";

/**
 * A table from the sm breakpoint up, and a stack of cards below it. Both are in the page, and CSS shows
 * one. A display:none element is not announced, so a screen reader only reads the one on screen. The
 * table is the children; the cards are `li` elements built by the caller from the same rows.
 */
export function ResponsiveTable({
  label,
  cards,
  children,
}: {
  label: string;
  cards: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block" role="region" aria-label={`${label} table`}>
        {children}
      </div>
      <ul className="space-y-2 sm:hidden" aria-label={label}>
        {cards}
      </ul>
    </>
  );
}
