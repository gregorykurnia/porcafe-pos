"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useNavigationGuard } from "@/components/navigation-guard";
import { PageTabs, type PageTab } from "@/components/patterns/page-tabs";
import { LoadingSkeleton } from "@/components/patterns/states";
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import { DataMaintenance } from "@/components/setup/data-maintenance";
import { SetupIndexList } from "@/components/setup/setup-index";
import { Button } from "@/components/ui/button";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useQueryUpdate } from "@/hooks/use-query-state";
import { SETUP_TABS, isSetupTab, type SetupTab } from "@/lib/workspace-tabs";

function TabLoading() {
  return <LoadingSkeleton rows={4} label="Loading section" />;
}

// Each section loads when its tab opens, so the page stays light until someone needs the section.
const MenuCatalog = dynamic(() => import("@/components/setup/menu-catalog").then((module) => module.MenuCatalog), { loading: TabLoading });
const MaterialsSetup = dynamic(() => import("@/components/setup/materials-setup").then((module) => module.MaterialsSetup), { loading: TabLoading });
const RecipesSetup = dynamic(() => import("@/components/setup/recipes-setup").then((module) => module.RecipesSetup), { loading: TabLoading });
const SuppliersSetup = dynamic(() => import("@/components/setup/suppliers-setup").then((module) => module.SuppliersSetup), { loading: TabLoading });
const ImportSetup = dynamic(() => import("@/components/setup/import-setup").then((module) => module.ImportSetup), { loading: TabLoading });

const SETUP_PAGE_TABS: PageTab<SetupTab>[] = SETUP_TABS.map((item) => ({ value: item.key, label: item.label }));

export default function SetupPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={3} label="Loading Setup" />}>
      <SetupWorkspace />
    </Suspense>
  );
}

/**
 * Setup has seven pages. The open one lives in the URL (?tab=), so a link such as the Stock alert chip opens the right
 * section. On phone, a Setup with no section open shows the index list, and each section shows a back arrow to it.
 */
function SetupWorkspace() {
  const searchParams = useSearchParams();
  const updateQuery = useQueryUpdate();
  const isPhone = useIsPhone();
  const guard = useNavigationGuard();

  const requested = searchParams.get("tab");
  const named: SetupTab | null = requested !== null && isSetupTab(requested) ? requested : null;
  // Desk and tablet open Menu when no section is named. Phone with no section named shows the index.
  const tab: SetupTab | null = named ?? (isPhone === false ? "menu" : null);

  // Leaving a section with unsaved work asks first. A null section goes back to the phone index.
  async function openSection(next: SetupTab | null) {
    if (next === tab) return;
    if (!(await guard.confirmLeave())) return;
    updateQuery({ tab: next });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-1">
        {tab !== null && isPhone === true && (
          <Button variant="ghost" size="icon" className="-ml-2.5 -mt-2.5 shrink-0" aria-label="Back to Setup" onClick={() => void openSection(null)}>
            <ArrowLeft strokeWidth={1.5} aria-hidden="true" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium text-brand tablet:text-title-1">Setup</h1>
          <p className="mt-1 text-small text-ink-muted">Catalog, stock rules and data checks. Usually the manager&apos;s job.</p>
        </div>
      </header>

      {tab === null ? (
        isPhone === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-sunken" aria-busy="true" />
        ) : (
          <SetupIndexList onOpen={(next) => void openSection(next)} />
        )
      ) : (
        <>
          <PageTabs label="Setup sections" value={tab} tabs={SETUP_PAGE_TABS} onChange={(next) => void openSection(next)} />
          <div id={`setup-panel-${tab}`} role="tabpanel" aria-label={SETUP_TABS.find((item) => item.key === tab)?.label} tabIndex={0} className="space-y-6">
            {tab === "menu" && <MenuCatalog />}
            {tab === "materials" && <MaterialsSetup />}
            {tab === "recipes" && <RecipesSetup />}
            {tab === "suppliers" && <SuppliersSetup />}
            {tab === "import" && <ImportSetup />}
            {tab === "notifications" && <PushNotificationsSettings />}
            {tab === "data" && <DataMaintenance />}
          </div>
        </>
      )}
    </div>
  );
}
