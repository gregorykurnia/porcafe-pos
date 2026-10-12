import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";

/**
 * A label wired to its control. The control is passed a generated id, so the label
 * and the input stay linked without hand-written ids.
 */
export function FieldRow({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
