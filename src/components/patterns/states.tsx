import { Banner } from "@/components/patterns/banner";

/** Empty: the one line illustration, a title, one sentence and at most one action (DESIGN_SYSTEM §10). */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG from /public, no optimisation needed */}
      <img src="/brand/empty-state.svg" width={96} height={72} alt="" aria-hidden="true" />
      <h3 className="font-display text-title-2 text-ink">{title}</h3>
      <p className="max-w-sm text-body text-ink-muted">{children}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/** Loading: skeletons shaped like the real rows, plus a "Loading …" line for screen readers. */
export function LoadingSkeleton({ rows = 4, label = "Loading …" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-4">
      <p className="sr-only">{label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-md bg-sunken" />
      ))}
    </div>
  );
}

/** Error: a danger banner that says what failed and what is kept, with Retry. */
export function ErrorBanner({
  children,
  onRetry,
}: {
  children: React.ReactNode;
  onRetry: () => void;
}) {
  return <Banner tone="danger" action={{ label: "Retry", onClick: onRetry }}>{children}</Banner>;
}
