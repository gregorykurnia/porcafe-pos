"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useNavigationGuard } from "@/components/navigation-guard";
import { ToneShape } from "@/components/patterns/status-chip";
import { ChartColumn, ClipboardCheck, House, Package, SlidersHorizontal } from "lucide-react";

// Five sections (DESIGN_SYSTEM §10). Desk shows a 232 px sidebar, tablet an 88 px labelled rail, and phone a docked
// tab bar with Close in the centre. The per-section signals (draft dot, To order count) are declined for now, so
// nothing here loads data.
const links = [
  { href: "/", label: "Home", shortLabel: "Home", icon: House },
  { href: "/items", label: "Daily close", shortLabel: "Close", icon: ClipboardCheck },
  { href: "/reports", label: "Reports", shortLabel: "Reports", icon: ChartColumn },
  { href: "/inventory", label: "Stock", shortLabel: "Stock", icon: Package },
  { href: "/setup", label: "Setup", shortLabel: "Setup", icon: SlidersHorizontal },
];

// Phone order puts Close in the centre.
const phoneLinks = [links[0], links[2], links[1], links[3], links[4]];

// Prefix matching: /items and /items?view=… are active on /items, and "/" only matches exactly.
function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const updateConnection = () => setIsOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  return isOffline;
}

/** The 40 px strip across the top of the content while offline. Save buttons stay visible but disabled. */
export function OfflineNotice() {
  const isOffline = useIsOffline();
  if (!isOffline) return null;
  return (
    <div role="status" aria-live="polite" className="flex h-10 items-center justify-center gap-2 bg-warn-tint px-4 text-small font-medium text-warn">
      Offline. Changes require a connection and are not queued for later.
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const guard = useNavigationGuard();
  const isOffline = useIsOffline();

  // Unsaved work asks first. The guarded link is cancelled and navigation runs
  // only if the user chooses to leave.
  function guardedNavigate(event: { preventDefault: () => void }, href: string) {
    if (href === pathname || !guard.isDirty()) return;
    event.preventDefault();
    void guard.confirmLeave().then((leave) => {
      if (leave) router.push(href);
    });
  }

  return (
    <>
      {/* Desk sidebar (1184 px and up) and tablet rail (768 to 1183 px) */}
      <aside
        aria-label="Sections"
        className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-canvas py-5 tablet:flex tablet:w-[88px] tablet:items-center desk:w-[232px] desk:items-stretch desk:px-5"
      >
        <Link href="/" className="flex items-center gap-3 desk:px-1" aria-label="Charred by Porcafe, home">
          <Image src="/logo-mark.png" alt="" width={44} height={44} className="size-11 shrink-0" priority />
          <span className="hidden desk:block">
            <span className="block font-display text-[13px] font-medium tracking-[0.34em] text-brand">CHARRED</span>
            <span className="mt-1.5 flex items-center gap-1.5 text-[8.5px] tracking-[0.3em] text-ink-muted">
              <span className="h-px w-3 bg-current" />
              BY PORCAFE
              <span className="h-px w-3 bg-current" />
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="mt-8 flex flex-col gap-1 tablet:items-center desk:items-stretch">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onNavigate={(event) => guardedNavigate(event, link.href)}
                aria-current={active ? "page" : undefined}
                title={link.label}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-full px-3 text-body font-medium transition-colors duration-fast",
                  "tablet:w-16 tablet:flex-col tablet:justify-center tablet:gap-0.5 tablet:px-0 tablet:py-2 tablet:text-micro",
                  "desk:w-full desk:flex-row desk:gap-3 desk:px-4 desk:py-0 desk:text-body",
                  active ? "bg-brand-soft text-brand" : "text-ink-muted hover:text-ink"
                )}
              >
                <link.icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span className="tablet:max-w-full tablet:truncate">
                  <span className="desk:hidden">{link.shortLabel}</span>
                  <span className="hidden desk:inline">{link.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center gap-2 px-1 text-small text-ink-muted tablet:justify-center" role="status">
          <ToneShape tone={isOffline ? "warn" : "ok"} className={isOffline ? "text-warn-mark" : "text-ok"} />
          <span className="hidden desk:inline">{isOffline ? "Offline" : "Connected"}</span>
          <span className="sr-only tablet:hidden">{isOffline ? "Offline" : "Connected"}</span>
        </div>
      </aside>

      {/* Phone tab bar: docked, 86 px including the home-indicator area */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(64px+env(safe-area-inset-bottom))] items-start border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] tablet:hidden"
      >
        <div className="mx-auto flex h-16 w-full min-w-0 max-w-[1120px] items-stretch px-2">
          {phoneLinks.map((link) => {
            const active = isActive(pathname, link.href);
            const isClose = link.href === "/items";
            return (
              <Link
                key={link.href}
                href={link.href}
                onNavigate={(event) => guardedNavigate(event, link.href)}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 flex-col items-center justify-start gap-1 pt-1.5"
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-fast",
                    isClose && active ? "bg-brand text-brand-on" : active ? "bg-brand-soft text-brand" : isClose ? "bg-brand-soft text-brand" : "text-ink-muted"
                  )}
                >
                  <link.icon className="size-6" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <span className={cn("max-w-full truncate whitespace-nowrap text-micro font-semibold", active ? "text-brand" : "text-ink-muted")}>
                  {link.shortLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
