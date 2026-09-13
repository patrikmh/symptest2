import { Trans } from "@lingui/react/macro";
import type { SystemCheck, SystemCheckId } from "@lots/core";
import { cn, Skeleton } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { loadSystemChecks } from "./system-health-load.js";

export { loadSystemChecks } from "./system-health-load.js";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; checks: SystemCheck[] };

const LABELS: Record<SystemCheckId, string> = {
  api: "API",
  db: "Database",
  worker: "Worker",
  computer: "Docker computer",
  model: "Model provider",
};

/** Settings → System (spec §42): API, DB, worker, Docker computer, model provider. */
export function SystemSettingsPanel() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      setState({ kind: "ready", checks: await loadSystemChecks() });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-testid="lots-system-settings" className="space-y-4">
      <p className="text-[14px] text-muted-foreground">
        <Trans>Whether Ratatosk can reach the API, database, worker, computer and model.</Trans>
      </p>
      {state.kind === "loading" ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <li key={index} className="rounded-xl border border-border px-4 py-3">
              <Skeleton className="h-4 w-1/3" />
            </li>
          ))}
        </ul>
      ) : state.kind === "error" ? (
        <p className="text-[14px] text-foreground/80">
          <Trans>System status could not be loaded.</Trans>
        </p>
      ) : (
        <SystemChecksView checks={state.checks} />
      )}
    </div>
  );
}

export function SystemChecksView({ checks }: { checks: SystemCheck[] }) {
  return (
    <ul className="space-y-2" data-testid="lots-system-checks">
      {checks.map((check) => (
        <li
          key={check.id}
          data-testid={`lots-system-${check.id}`}
          data-ok={check.ok ? "true" : "false"}
          className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-[14.5px] font-medium text-foreground">{LABELS[check.id]}</p>
            {check.detail ? (
              <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{check.detail}</p>
            ) : null}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
              check.ok
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-500/15 text-rose-800 dark:text-rose-300",
            )}
          >
            {check.ok ? <Trans>Ready</Trans> : <Trans>Unavailable</Trans>}
          </span>
        </li>
      ))}
    </ul>
  );
}
