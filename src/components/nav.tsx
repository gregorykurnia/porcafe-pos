"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Boxes, LayoutDashboard, Wallet, UtensilsCrossed } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sales", label: "Sales", icon: Wallet },
  { href: "/items", label: "Daily close", icon: UtensilsCrossed },
  { href: "/inventory", label: "Inventory", icon: Boxes },
];

export function Nav() {
  const pathname = usePathname();
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

  return (
    <>
      {/* Top bar (desktop + mobile) */}
      <header className="sticky top-0 z-40 border-b border-primary/10 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Image src="/logo.png" alt="Charred by Porcafe" width={72} height={57} className="shrink-0 object-contain" priority />
          </Link>
          <nav aria-label="Primary navigation" className="hidden gap-1 rounded-xl bg-primary/5 p-1 sm:flex">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "text-primary/65 hover:bg-primary/10 hover:text-primary"
                  )}
                >
                  <l.icon className="size-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {isOffline && (
        <div role="status" aria-live="polite" className="border-b border-warning/25 bg-warning/10 px-4 py-2 text-sm text-warning sm:px-6">
          <div className="mx-auto max-w-6xl">Offline — changes require a connection and are not queued for later.</div>
        </div>
      )}

      {/* Bottom nav (mobile) */}
      <nav aria-label="Mobile navigation" className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-primary/10 bg-background/95 backdrop-blur-md sm:hidden">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl gap-1 px-1.5 py-1.5">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 py-1.5"
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-lg px-3.5 py-1 transition-colors",
                    active ? "bg-primary/10" : ""
                  )}
                >
                  <l.icon className={cn("size-5", active ? "text-primary" : "text-primary/45")} />
                </span>
                <span className={cn("max-w-full truncate whitespace-nowrap text-xs font-medium", active ? "text-primary" : "text-primary/45")}>
                  {l.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
