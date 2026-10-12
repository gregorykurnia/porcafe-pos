import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptQuantityInput, stepQuantity } from "@/lib/field-input";

type QuantityInputProps = {
  id?: string;
  /** Names the field for screen readers and the − / + buttons. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  unit?: string;
  allowDecimal?: boolean;
  disabled?: boolean;
};

/** Integer stepper with 44 px touch targets on phones. Decimals only when allowed. */
export function QuantityInput({ id, label, value, onChange, min = 0, unit, allowDecimal = false, disabled }: QuantityInputProps) {
  function step(delta: number) {
    onChange(stepQuantity(value, delta, { min, allowDecimal }));
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon" aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => step(-1)}>
        −
      </Button>
      <Input
        id={id}
        aria-label={label}
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
        className="h-11 w-20 text-center tabular-nums sm:h-8"
      />
      <Button type="button" variant="outline" size="icon" aria-label={`Increase ${label}`} disabled={disabled} onClick={() => step(1)}>
        +
      </Button>
      {unit && <span className="pl-1 text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}
