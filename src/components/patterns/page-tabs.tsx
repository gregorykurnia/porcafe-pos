"use client";

import { cn } from "@/lib/utils";

export type PageTab<T extends string> = { value: T; label: string };

/**
 * Sub-sections as underline tabs under the page title, at every width (DESIGN_SYSTEM §10). On phone the row
 * scrolls sideways. The selected tab stays in the URL, so the caller passes `value` from use-query-state.
 */
export function PageTabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
}: {
  label: string;
  value: T;
  tabs: PageTab<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-6 overflow-x-auto border-b border-line px-4 tablet:mx-0 tablet:px-0">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px h-11 shrink-0 border-b-2 text-body font-medium whitespace-nowrap transition-colors",
              active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
