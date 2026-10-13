"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import {
  listDailyItemLogs,
  listItemSales,
  listMenuItems,
  listMonthlyAdjustments,
  listSalesEntries,
} from "@/lib/data";
import type { DailyItemLog, ItemSale, MenuItem, MonthlyAdjustment, SalesEntry } from "@/lib/types";

export type ReportData = {
  salesEntries: SalesEntry[];
  adjustments: MonthlyAdjustment[];
  menuItems: MenuItem[];
  itemSales: ItemSale[];
  dailyLogs: DailyItemLog[];
};

const EMPTY_DATA: ReportData = {
  salesEntries: [],
  adjustments: [],
  menuItems: [],
  itemSales: [],
  dailyLogs: [],
};

/**
 * Loads everything the Reports tabs read. A refresh that fails keeps the figures already on
 * screen and says so. Only a failed first load shows the error state.
 */
export function useReportData() {
  const [data, setData] = useState<ReportData>(EMPTY_DATA);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const [salesEntries, adjustments, menuItems, itemSales, dailyLogs] = await Promise.all([
        listSalesEntries(),
        listMonthlyAdjustments(),
        listMenuItems(),
        listItemSales(),
        listDailyItemLogs(),
      ]);
      setData({ salesEntries, adjustments, menuItems, itemSales, dailyLogs });
      hasLoaded.current = true;
      setStatus("ready");
    } catch (err) {
      console.error("Failed to load report data:", err);
      if (hasLoaded.current) toast.error("Could not refresh reports. Figures may be out of date.");
      else setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return { ...data, status, reload: load };
}
