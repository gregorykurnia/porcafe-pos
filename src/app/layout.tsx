import type { Metadata, Viewport } from "next";
import "./globals.css";
import { figtree, outfit } from "./fonts";
import { Nav, OfflineNotice } from "@/components/nav";
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
      <body className="min-h-dvh w-full min-w-0 bg-canvas text-ink">
        <ConfirmProvider>
          <NavigationGuardProvider>
            <SwRegister />
            <div className="flex min-h-dvh w-full min-w-0">
              <Nav />
              <div className="flex min-w-0 flex-1 flex-col">
                <OfflineNotice />
                <main className="mx-auto w-full min-w-0 max-w-[1120px] flex-1 px-4 pb-28 pt-6 tablet:px-6 tablet:pb-10 tablet:pt-8 desk:px-10 desk:pt-10">
                  {children}
                </main>
              </div>
            </div>
            <Toaster />
          </NavigationGuardProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
