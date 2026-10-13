import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatRupiahDraft, formatRupiahText, parseRupiah } from "@/lib/money";

type MoneyInputProps = {
  id: string;
  label: string;
  /** Text as the user sees it. The parent keeps the string and parses it with parseRupiah(). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** "row" puts the label on the left (88 px) and the input on the right, as the payment rows in Daily close do. */
  layout?: "stacked" | "row";
};

/**
 * Rupiah field (DESIGN_SYSTEM §10). A fixed Rp prefix, digits right-aligned, grouped while typing (1500 → 1.500).
 * Shorthand such as "1,5jt" or "150rb" is read on blur and a hint says what it read. Anything unreadable is
 * flagged inline and the parent should not save it.
 */
export function MoneyInput({ id, label, value, onChange, disabled, placeholder = "0", layout = "stacked" }: MoneyInputProps) {
  const amount = parseRupiah(value);
  const invalid = value.trim() !== "" && amount === null;
  // The read-back only matters for shorthand such as "1,5jt" or "150rb", not for plain digits.
  const isShorthand = /[^\d.\s]/.test(value);
  const readAs = amount !== null && isShorthand ? formatRupiahText(amount) : null;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  function normaliseOnBlur() {
    if (amount === null) return;
    onChange(formatRupiahText(amount));
  }

  const field = (
    <div className="min-w-0">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body font-medium text-ink-muted">Rp</span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={[invalid ? errorId : null, readAs ? hintId : null].filter(Boolean).join(" ") || undefined}
          onChange={(event) => onChange(formatRupiahDraft(event.target.value))}
          onBlur={normaliseOnBlur}
          className="pl-10 text-right tabular-nums"
        />
      </div>
      {invalid && (
        <p id={errorId} className="mt-1 text-small text-danger">
          Use digits, for example 1.500.000 or 1,5jt.
        </p>
      )}
      {readAs && !invalid && (
        <p id={hintId} className="mt-1 text-small text-ink-muted">
          Read &ldquo;{value}&rdquo; as Rp {readAs}
        </p>
      )}
    </div>
  );

  if (layout === "row") {
    return (
      <div className="flex items-start gap-3">
        <Label htmlFor={id} className="w-[88px] shrink-0 pt-3 text-body text-ink">
          {label}
        </Label>
        {field}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5")}>
      <Label htmlFor={id} className="text-small text-ink-muted">
        {label}
      </Label>
      {field}
    </div>
  );
}
