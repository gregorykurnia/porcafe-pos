"use client";

import { useState } from "react";
import { DateStepper } from "@/components/fields/date-stepper";
import { MaterialQuantityInput } from "@/components/fields/material-quantity-input";
import { MoneyInput } from "@/components/fields/money-input";
import { PeriodChoice } from "@/components/fields/period-choice";
import { PeriodStepper, type StepUnit } from "@/components/fields/period-stepper";
import { QuantityInput } from "@/components/fields/quantity-input";
import { todayISO } from "@/lib/dates";
import { presetRange, type ReportPeriod } from "@/lib/report-period";

// Fields with fake data. Each one is shown in its states: empty, filled, shorthand read-back, invalid and disabled.
export function LabFields() {
  const [stacked, setStacked] = useState("");
  const [shorthand, setShorthand] = useState("1,5jt");
  const [invalid, setInvalid] = useState("1.5x");
  const [pay, setPay] = useState("412000");
  const [portions, setPortions] = useState("0");
  const [portionsOn, setPortionsOn] = useState("3");
  const [material, setMaterial] = useState("1250");
  const [date, setDate] = useState(todayISO());
  const [unit, setUnit] = useState<StepUnit>("day");
  const [stepDate, setStepDate] = useState(todayISO());
  const [period, setPeriod] = useState<ReportPeriod>(presetRange("this-month", todayISO()));

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <h3 className="font-display text-title-3 text-ink">Money</h3>
          <MoneyInput id="lab-money-empty" label="Cash" value={stacked} onChange={setStacked} />
          <MoneyInput id="lab-money-short" label="Soundbox" value={shorthand} onChange={setShorthand} />
          <MoneyInput id="lab-money-bad" label="BCA" value={invalid} onChange={setInvalid} />
        </div>
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <h3 className="font-display text-title-3 text-ink">Payment rows</h3>
          <MoneyInput id="lab-pay-cash" label="Cash" value={pay} onChange={setPay} layout="row" />
          <MoneyInput id="lab-pay-bca" label="BCA" value="" onChange={() => undefined} layout="row" />
          <MoneyInput id="lab-pay-off" label="Other" value="" onChange={() => undefined} layout="row" disabled />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <h3 className="font-display text-title-3 text-ink">Portions</h3>
          <QuantityInput id="lab-qty-zero" label="Chicken Nanban" value={portions} onChange={setPortions} />
          <QuantityInput id="lab-qty-on" label="Nasi Goreng Charred" value={portionsOn} onChange={setPortionsOn} />
          <QuantityInput id="lab-qty-off" label="Telur" value="" onChange={() => undefined} disabled />
        </div>
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <h3 className="font-display text-title-3 text-ink">Materials</h3>
          <MaterialQuantityInput id="lab-mat" label="Chicken thigh quantity" value={material} onChange={setMaterial} unit="g" />
          <MaterialQuantityInput id="lab-mat-ml" label="Soy sauce quantity" value="210" onChange={() => undefined} unit="ml" />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
        <h3 className="font-display text-title-3 text-ink">Dates and periods</h3>
        <DateStepper id="lab-date" label="Daily close date" value={date} onChange={setDate} />
        <PeriodStepper unit={unit} onUnitChange={setUnit} value={stepDate} onChange={setStepDate} />
        <PeriodChoice period={period} today={todayISO()} onChange={setPeriod} />
      </div>
    </div>
  );
}
