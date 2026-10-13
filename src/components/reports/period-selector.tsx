import { PeriodChoice } from "@/components/fields/period-choice";
import type { ReportPeriod } from "@/lib/report-period";

/**
 * The one period every Reports tab shares (DESIGN_SYSTEM §10 "Period selector"): This month, Last month, Last 30 days
 * or Custom range, plus the date-range button. The range is applied from its popover.
 */
export function PeriodSelector({
  period,
  today,
  onChange,
}: {
  period: ReportPeriod;
  today: string;
  onChange: (next: ReportPeriod) => void;
}) {
  return (
    <div className="w-full tablet:w-auto">
      <PeriodChoice period={period} today={today} onChange={onChange} />
    </div>
  );
}
