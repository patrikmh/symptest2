import { Trans, useLingui } from "@lingui/react/macro";
import { computerHealthFromPayload } from "@lots/core";
import type { LotsComputer, LotsComputerHealth } from "@rakazo/contracts";
import { Button, Skeleton, cn } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; computers: LotsComputer[]; health: LotsComputerHealth };

/** Read-only computers list (spec §37 / §44). */
export function ComputersPage() {
  const { t } = useLingui();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const [computers, health] = await Promise.all([
        rpc.lots.computers.list(),
        rpc.lots.computers.health(),
      ]);
      setState({ kind: "ready", computers, health });
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
      data-testid="lots-computers"
    >
      <h1 className="text-[26px] font-semibold tracking-tight">
        <Trans>Computers</Trans>
      </h1>
      <p className="mt-1 text-[14px] text-muted-foreground">
        <Trans>The place each coworker works — shared with the team, or their own.</Trans>
      </p>

      {state.kind === "loading" ? (
        <div className="mt-8 space-y-3" aria-busy="true">
          <Skeleton className="h-20 w-full max-w-2xl" />
          <Skeleton className="h-20 w-full max-w-2xl" />
        </div>
      ) : state.kind === "error" ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-[15px] text-foreground/80">
            <Trans>Computers could not be loaded.</Trans>
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : (
        <>
          <HealthNote health={state.health} />
          {state.computers.length === 0 ? (
            <div className="mt-16 flex flex-col items-center text-center">
              <p className="max-w-[420px] text-[15px] leading-relaxed text-foreground/80">
                <Trans>
                  You do not need to set this up. Every coworker already has a place to work.
                </Trans>
              </p>
              <Button
                variant="outline"
                className="mt-6"
                nativeButton={false}
                render={<Link to="/app/agents" />}
              >
                <Trans>Go to Coworkers</Trans>
              </Button>
            </div>
          ) : (
            <ul className="mt-8 max-w-2xl space-y-2" data-testid="lots-computer-list">
              {state.computers.map((computer) => (
                <li
                  key={computer.id}
                  data-testid="lots-computer-card"
                  data-scope={computer.scope}
                  data-state={computer.state}
                  className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium">
                        {computer.scope === "dedicated" ? t`Own computer` : t`Shared computer`}
                      </p>
                      <p className="mt-1 truncate text-[13px] text-muted-foreground">
                        {computer.bots.length > 0
                          ? computer.bots.map((bot) => bot.name).join(", ")
                          : t`No coworker assigned`}
                      </p>
                    </div>
                    <StatePill state={computer.state} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function HealthNote({ health }: { health: LotsComputerHealth }) {
  const ready = computerHealthFromPayload(health).ready;
  return (
    <p
      className="mt-6 max-w-2xl text-[13.5px] text-muted-foreground"
      data-testid="lots-computer-health"
      data-ready={ready ? "true" : "false"}
    >
      {ready ? (
        <Trans>The computer runtime is ready.</Trans>
      ) : (
        <Trans>The coworker computer is unavailable. Check Settings → System.</Trans>
      )}
    </p>
  );
}

function StatePill({ state }: { state: LotsComputer["state"] }) {
  const working = state === "running" || state === "booting";
  const failed = state === "error";
  const label =
    state === "running" ? (
      <Trans>Running</Trans>
    ) : state === "booting" ? (
      <Trans>Starting</Trans>
    ) : state === "suspended" ? (
      <Trans>Paused</Trans>
    ) : state === "error" ? (
      <Trans>Failed</Trans>
    ) : (
      <Trans>Stopped</Trans>
    );
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
        working && "bg-foreground text-background",
        failed && "bg-destructive/15 text-destructive",
        !working && !failed && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
