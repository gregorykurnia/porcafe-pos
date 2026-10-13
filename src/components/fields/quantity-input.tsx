import { Minus, Plus } from "lucide-react";
import { acceptQuantityInput, stepQuantity } from "@/lib/field-input";
import { cn } from "@/lib/utils";

type QuantityInputProps = {
  id?: string;
  /** The item name. Each button reads as "One more <label>" or "One fewer <label>". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  unit?: string;
  allowDecimal?: boolean;
  disabled?: boolean;
};

/**
 * Portions stepper (DESIGN_SYSTEM §10). A sunken pill track holds − / value / +. When the value is above 0 the
 * track turns brand-soft and the value turns brand. Buttons are 36 px on desk and 44 px on touch. − is disabled at 0.
 */
export function QuantityInput({ id, label, value, onChange, min = 0, unit, allowDecimal = false, disabled }: QuantityInputProps) {
  const numeric = Number(value);
  const hasValue = value.trim() !== "" && Number.isFinite(numeric) && numeric > min;
  const atMin = !Number.isFinite(numeric) || numeric <= min;

  function step(delta: number) {
    onChange(stepQuantity(value, delta, { min, allowDecimal }));
  }

  const button =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors duration-fast hover:bg-canvas disabled:pointer-events-none disabled:opacity-40 sm:size-9 [@media(pointer:coarse)]:size-11";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full p-1 transition-colors duration-fast",
        hasValue ? "bg-brand-soft" : "bg-sunken"
      )}
    >
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        disabled={disabled || atMin}
        onClick={() => step(-1)}
        className={button}
      >
        <Minus className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </button>
      <input
        id={id}
        role="spinbutton"
        aria-label={label}
        aria-valuemin={min}
        aria-valuenow={Number.isFinite(numeric) ? numeric : undefined}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        autoComplete="off"
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = acceptQuantityInput(event.target.value, allowDecimal);
          if (next !== null) onChange(next);
        }}
        className={cn(
          "h-11 w-16 bg-transparent text-center font-display text-fig-m tabular-nums outline-none sm:h-9",
          hasValue ? "text-brand" : "text-ink"
        )}
      />
      <button
        type="button"
        aria-label={`One more ${label}`}
        disabled={disabled}
        onClick={() => step(1)}
        className={button}
      >
        <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {unit && <span className="pr-2 text-small text-ink-muted">{unit}</span>}
    </div>
  );
}
