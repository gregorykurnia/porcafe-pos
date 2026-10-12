import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiahDraft, formatRupiahText, parseRupiah } from "@/lib/money";

type MoneyInputProps = {
  id: string;
  label: string;
  /** Text as the user sees it. The parent keeps the string and parses it with parseRupiah(). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Rupiah field. Digits are grouped while typing (1500 → 1.500). Shorthand such as
 * "1,5jt" or "150rb" is accepted and normalised on blur. Anything unreadable is
 * flagged inline and the parent should not save it.
 */
export function MoneyInput({ id, label, value, onChange, disabled, placeholder = "0" }: MoneyInputProps) {
  const invalid = value.trim() !== "" && parseRupiah(value) === null;
  const errorId = `${id}-error`;

  function normaliseOnBlur() {
    const amount = parseRupiah(value);
    if (amount === null) return;
    onChange(formatRupiahText(amount));
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">Rp</span>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onChange(formatRupiahDraft(event.target.value))}
          onBlur={normaliseOnBlur}
          className="h-11 pl-10 text-right tabular-nums sm:h-10"
        />
      </div>
      {invalid && (
        <p id={errorId} className="text-xs text-destructive">
          Use digits, for example 1.500.000 or 1,5jt.
        </p>
      )}
    </div>
  );
}
