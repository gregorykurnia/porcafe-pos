"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import { DataMaintenance } from "@/components/setup/data-maintenance";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryState } from "@/hooks/use-query-state";

type SetupTab = "notifications" | "data";

const SETUP_TABS: { key: SetupTab; label: string }[] = [
  { key: "notifications", label: "Notifications" },
  { key: "data", label: "Data maintenance" },
];

function isSetupTab(value: string): boolean {
  return SETUP_TABS.some((tab) => tab.key === value);
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
      <SetupWorkspace />
    </Suspense>
  );
}

// The open tab lives in the URL (?tab=), so a link such as the Stock alert chip opens the right section.
function SetupWorkspace() {
  const [tab, setTab] = useQueryState<SetupTab>("tab", { default: "notifications", validate: isSetupTab });

  return (
    <div className="space-y-6">
      <PageHeader title="Setup" description="Settings the team changes rarely, and checks on the stored data." />

      <Tabs value={tab} onValueChange={(value) => setTab(value as SetupTab)}>
        <TabsList>
          {SETUP_TABS.map((item) => (
            <TabsTrigger key={item.key} id={`setup-tab-${item.key}`} aria-controls={`setup-panel-${item.key}`} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div id={`setup-panel-${tab}`} role="tabpanel" aria-labelledby={`setup-tab-${tab}`} tabIndex={0} className="space-y-6">
        {tab === "notifications" && <PushNotificationsSettings />}
        {tab === "data" && <DataMaintenance />}
      </div>
    </div>
  );
}
