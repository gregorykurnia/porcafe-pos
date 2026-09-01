"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Wallet, UtensilsCrossed } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sales", label: "Sales", icon: Wallet },
  { href: "/items", label: "Menu Items", icon: UtensilsCrossed },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar (desktop + mobile) */}
      <header className="sticky top-0 z-40 border-b border-[#1f3a2f]/10 bg-[#f7f2e9]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-[#1f3a2f]">
            <Image src="/logo-mark.png" alt="Charred by Porcafe" width={28} height={28} className="shrink-0" priority />
            <span>Charred by Porcafe</span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[#1f3a2f] text-[#f7f2e9]"
                      : "text-[#1f3a2f]/70 hover:bg-[#1f3a2f]/10 hover:text-[#1f3a2f]"
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

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#1f3a2f]/10 bg-[#f7f2e9] sm:hidden">
        <div className="mx-auto flex max-w-5xl">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium",
                  active ? "text-[#1f3a2f]" : "text-[#1f3a2f]/50"
                )}
              >
                <l.icon className="size-5" />
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
