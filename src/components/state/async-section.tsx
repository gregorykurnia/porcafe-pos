import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type AsyncStatus = "loading" | "error" | "empty" | "ready";

/**
 * Shows one of four states for data that loads. Until the first load succeeds the caller passes
 * "loading", so the skeleton stays up and an empty state never flashes. During a refresh the
 * caller keeps "ready", so the figures already on screen stay visible.
 */
export function AsyncSection({
  status,
  children,
  skeleton,
  label = "Loading",
  onRetry,
  errorTitle = "Couldn't load this",
  errorDescription = "Check the connection and try again.",
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  status: AsyncStatus;
  children?: ReactNode;
  skeleton?: ReactNode;
  label?: string;
  onRetry?: () => void;
  errorTitle?: string;
  errorDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  if (status === "loading") {
    return (
      skeleton ?? (
        <div className="space-y-3 rounded-xl border border-border p-4" role="status" aria-label={label}>
          {[1, 2, 3].map((row) => <div key={row} className="h-8 animate-pulse rounded bg-muted" />)}
        </div>
      )
    );
  }

  if (status === "error") {
    return (
      <div role="alert" className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center">
        <p className="font-medium text-foreground">{errorTitle}</p>
        <p className="mt-1 text-table text-muted-foreground">{errorDescription}</p>
        {onRetry && (
          <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        {emptyTitle && <p className="font-medium text-foreground">{emptyTitle}</p>}
        {emptyDescription && <p className="mt-1 text-table text-muted-foreground">{emptyDescription}</p>}
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return <>{children}</>;
}
