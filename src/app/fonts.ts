import { Figtree, Outfit } from "next/font/google";

// Canopy fonts (docs/redesign/DESIGN_SYSTEM.md §3). Both are variable fonts, so no `weight` is set.
// Outfit is for titles and figures; Figtree is for everything you read or type.
export const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
export const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
