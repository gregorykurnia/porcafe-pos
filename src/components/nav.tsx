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
      <header className="sticky top-0 z-40 border-b border-[#1f3a2f]/8 bg-[#f7f2e9]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-[#1f3a2f]">
            <Image src="/logo-mark.png" alt="Charred by Porcafe" width={30} height={30} className="shrink-0 rounded-md" priority />
            <span>Charred by Porcafe</span>
          </Link>
          <nav className="hidden gap-1 rounded-full bg-[#1f3a2f]/5 p-1 sm:flex">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-[#1f3a2f] text-[#f7f2e9] shadow-sm shadow-[#1f3a2f]/20"
                      : "text-[#1f3a2f]/60 hover:bg-[#1f3a2f]/10 hover:text-[#1f3a2f]"
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
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#1f3a2f]/8 bg-[#f7f2e9]/95 backdrop-blur-md sm:hidden">
        <div className="mx-auto flex max-w-5xl px-2 py-1.5">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex flex-1 flex-col items-center gap-1 py-1.5"
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full px-3.5 py-1 transition-colors",
                    active ? "bg-[#1f3a2f]/10" : ""
                  )}
                >
                  <l.icon className={cn("size-5", active ? "text-[#1f3a2f]" : "text-[#1f3a2f]/45")} />
                </span>
                <span className={cn("text-[11px] font-medium", active ? "text-[#1f3a2f]" : "text-[#1f3a2f]/45")}>
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
