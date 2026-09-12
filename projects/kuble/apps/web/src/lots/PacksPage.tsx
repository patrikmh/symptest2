import { Trans } from "@lingui/react/macro";
import type { Pack } from "@rakazo/contracts";
import { Button, cn, Skeleton } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; packs: Pack[] };

/** Tools grid (spec §34): the four MVP packs. */
export function PacksPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      setState({ kind: "ready", packs: await rpc.lots.packs.list() });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10"
      data-testid="lots-packs"
    >
      <h1 className="text-[26px] font-semibold tracking-tight">
        <Trans>Tools</Trans>
      </h1>
      <p className="mt-1 text-[14px] text-muted-foreground">
        <Trans>
          What your coworkers may use. Web research is on; the others wait until you connect them.
        </Trans>
      </p>

      {state.kind === "loading" ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <li key={index} className="rounded-3xl border border-border bg-card p-5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-3 h-3 w-3/4" />
            </li>
          ))}
        </ul>
      ) : state.kind === "error" ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-[15px] text-foreground/80">
            <Trans>Your tools could not be loaded.</Trans>
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : (
        <PacksView packs={state.packs} />
      )}
    </div>
  );
}

export function PacksView({ packs }: { packs: Pack[] }) {
  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="lots-pack-grid">
      {packs.map((pack) => (
        <li key={pack.key}>
          <Link
            to={`/app/packs/${pack.key}`}
            className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-muted/40"
            data-testid="lots-pack-card"
            data-pack={pack.key}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px] font-medium">{pack.name}</h2>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
                  pack.enabled ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {pack.enabled ? <Trans>On</Trans> : <Trans>Off</Trans>}
              </span>
            </div>
            <p className="mt-3 text-[13.5px] leading-snug text-foreground/80">{pack.description}</p>
            <p className="mt-4 text-[12px] text-muted-foreground">
              {pack.connection === "none" ? (
                <Trans>No account needed</Trans>
              ) : pack.connected ? (
                <Trans>Connected</Trans>
              ) : (
                <Trans>Not connected</Trans>
              )}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
