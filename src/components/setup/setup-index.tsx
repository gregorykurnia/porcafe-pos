"use client";

import { Bell, BookOpen, ChevronRight, Database, Package, Soup, Truck, Upload, type LucideIcon } from "lucide-react";
import type { SetupTab } from "@/lib/workspace-tabs";

// The phone Setup index (DESIGN_SYSTEM §10 "Phone tab bar"): one row per Setup page, with an icon, its name and a line
// about it. The lines are fixed text, so opening the index reads nothing from Firestore.
const SETUP_PAGES: { key: SetupTab; label: string; status: string; icon: LucideIcon }[] = [
  { key: "menu", label: "Menu", status: "Items for Daily close and scanning, in sheet order", icon: Soup },
  { key: "materials", label: "Materials", status: "Ingredients and packaging that stock is kept in", icon: Package },
  { key: "recipes", label: "Recipes", status: "Menu and component recipes, kept in versions", icon: BookOpen },
  { key: "suppliers", label: "Suppliers", status: "Prices, reorder settings and deliveries", icon: Truck },
  { key: "import", label: "Import", status: "Recipe workbook review", icon: Upload },
  { key: "notifications", label: "Notifications", status: "Stock alerts on this device", icon: Bell },
  { key: "data", label: "Data maintenance", status: "Legacy rows, duplicate dates and supplier checks", icon: Database },
];

export function SetupIndexList({ onOpen }: { onOpen: (tab: SetupTab) => void }) {
  return (
    <ul aria-label="Setup pages" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {SETUP_PAGES.map((page) => {
        const Icon = page.icon;
        return (
          <li key={page.key}>
            <button
              type="button"
              onClick={() => onOpen(page.key)}
              className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors hover:bg-canvas"
            >
              <span className="flex size-10 flex-none items-center justify-center rounded-md border border-line text-brand">
                <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-lg font-medium text-ink">{page.label}</span>
                <span className="block text-small text-ink-muted">{page.status}</span>
              </span>
              <ChevronRight className="size-5 flex-none text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
