"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import { DataMaintenance } from "@/components/setup/data-maintenance";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryState } from "@/hooks/use-query-state";
import { SETUP_TABS, isSetupTab, type SetupTab } from "@/lib/workspace-tabs";

function TabLoading() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />Loading…
      </CardContent>
    </Card>
  );
}

// Each section loads when its tab opens, so the page stays light until someone needs the section.
const MenuCatalog = dynamic(() => import("@/components/setup/menu-catalog").then((module) => module.MenuCatalog), { loading: TabLoading });
const MaterialsSetup = dynamic(() => import("@/components/setup/materials-setup").then((module) => module.MaterialsSetup), { loading: TabLoading });
const RecipesSetup = dynamic(() => import("@/components/setup/recipes-setup").then((module) => module.RecipesSetup), { loading: TabLoading });
const SuppliersSetup = dynamic(() => import("@/components/setup/suppliers-setup").then((module) => module.SuppliersSetup), { loading: TabLoading });
const ImportSetup = dynamic(() => import("@/components/setup/import-setup").then((module) => module.ImportSetup), { loading: TabLoading });

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
      <SetupWorkspace />
    </Suspense>
  );
}

// The open tab lives in the URL (?tab=), so a link such as the Stock alert chip opens the right section.
function SetupWorkspace() {
  const [tab, setTab] = useQueryState<SetupTab>("tab", { default: "menu", validate: isSetupTab });

  return (
    <div className="space-y-6">
      <PageHeader title="Setup" description="Menu, stock setup, notifications, and checks on the stored data." />

      <div className="overflow-x-auto">
        <Tabs value={tab} onValueChange={(value) => setTab(value as SetupTab)}>
          <TabsList className="w-max">
            {SETUP_TABS.map((item) => (
              <TabsTrigger key={item.key} id={`setup-tab-${item.key}`} aria-controls={`setup-panel-${item.key}`} value={item.key}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div id={`setup-panel-${tab}`} role="tabpanel" aria-labelledby={`setup-tab-${tab}`} tabIndex={0} className="space-y-6">
        {tab === "menu" && <MenuCatalog />}
        {tab === "materials" && <MaterialsSetup />}
        {tab === "recipes" && <RecipesSetup />}
        {tab === "suppliers" && <SuppliersSetup />}
        {tab === "import" && <ImportSetup />}
        {tab === "notifications" && <PushNotificationsSettings />}
        {tab === "data" && <DataMaintenance />}
      </div>
    </div>
  );
}
