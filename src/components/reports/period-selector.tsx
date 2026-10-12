import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  presetFor,
  presetRange,
  REPORT_PRESETS,
  type ReportPeriod,
  type ReportPresetKey,
} from "@/lib/report-period";

/** The one period every Reports tab shares. A preset sets both dates; editing a date makes the period custom. */
export function PeriodSelector({
  period,
  today,
  onChange,
}: {
  period: ReportPeriod;
  today: string;
  onChange: (next: ReportPeriod) => void;
}) {
  const preset = presetFor(period, today);

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <Label htmlFor="report-period">Period</Label>
        <Select
          value={preset}
          onValueChange={(value) => {
            if (value !== "custom") onChange(presetRange(value as ReportPresetKey, today));
          }}
        >
          <SelectTrigger id="report-period" className="h-11 w-full bg-surface sm:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_PRESETS.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
            <SelectItem value="custom" disabled>
              Custom range
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-from">From</Label>
        <Input
          id="report-from"
          type="date"
          value={period.from}
          className="h-11 bg-surface sm:h-10"
          onChange={(event) => {
            if (event.target.value) onChange({ ...period, from: event.target.value });
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-to">To</Label>
        <Input
          id="report-to"
          type="date"
          value={period.to}
          className="h-11 bg-surface sm:h-10"
          onChange={(event) => {
            if (event.target.value) onChange({ ...period, to: event.target.value });
          }}
        />
      </div>
    </div>
  );
}
