import { Input } from "@/components/ui/input";
import { acceptQuantityInput } from "@/lib/field-input";

type MaterialQuantityInputProps = {
  id?: string;
  /** Names the field for screen readers. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Always shown after the number, for example "g" or "ml". */
  unit: string;
  disabled?: boolean;
};

/**
 * Material quantity (DESIGN_SYSTEM §10): a plain input with the unit suffix, not a stepper. Decimals are allowed.
 * The unit stays visible so "1.250 g" reads without a label.
 */
export function MaterialQuantityInput({ id, label, value, onChange, unit, disabled }: MaterialQuantityInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        aria-label={label}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = acceptQuantityInput(event.target.value, true);
          if (next !== null) onChange(next);
        }}
        className="pr-12 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-small text-ink-muted">{unit}</span>
    </div>
  );
}
