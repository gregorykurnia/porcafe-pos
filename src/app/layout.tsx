import type { Metadata, Viewport } from "next";
import "./globals.css";
import { figtree, outfit } from "./fonts";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { SwRegister } from "@/components/sw-register";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { NavigationGuardProvider } from "@/components/navigation-guard";

export const metadata: Metadata = {
  title: "Porcafe POS",
  description: "Sales & menu item recap for Charred by Porcafe",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Porcafe POS",
  },
};

export const viewport: Viewport = {
  themeColor: "#163D2F",
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${outfit.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-dvh w-full min-w-0 flex flex-col bg-background text-foreground">
        <ConfirmProvider>
          <NavigationGuardProvider>
            <SwRegister />
            <Nav />
            <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 sm:pb-10 sm:pt-8">
              {children}
            </main>
            <Toaster />
          </NavigationGuardProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
