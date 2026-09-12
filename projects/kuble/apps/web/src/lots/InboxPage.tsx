import { Trans } from "@lingui/react/macro";
import type { InboxItem, InboxItemKind } from "@rakazo/contracts";
import { Button, Skeleton } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: InboxItem[] };

const SECTIONS: { kind: InboxItemKind; title: string }[] = [
  { kind: "approval", title: "Needs you" },
  { kind: "fyr_failed", title: "Failed Fyrar" },
  { kind: "fyr_completed", title: "Finished Fyrar" },
  { kind: "update", title: "Updates" },
];

/** Inbox (spec §30): pending approvals, failed Fyrar, completed Fyrar, then updates. */
export function InboxPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      setState({ kind: "ready", items: await rpc.lots.inbox.list() });
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
      data-testid="lots-inbox"
    >
      <h1 className="text-[26px] font-semibold tracking-tight">
        <Trans>Inbox</Trans>
      </h1>
      <p className="mt-1 text-[14px] text-muted-foreground">
        <Trans>Things that need you, then what your coworkers already finished.</Trans>
      </p>

      {state.kind === "loading" ? (
        <div className="mt-8 space-y-3" aria-busy="true">
          <Skeleton className="h-16 w-full max-w-2xl" />
          <Skeleton className="h-16 w-full max-w-2xl" />
        </div>
      ) : state.kind === "error" ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-[15px] text-foreground/80">
            <Trans>Your inbox could not be loaded.</Trans>
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : (
        <InboxView items={state.items} />
      )}
    </div>
  );
}

export function InboxView({ items }: { items: InboxItem[] }) {
  if (items.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <h2 className="text-[18px] font-medium">
          <Trans>All quiet</Trans>
        </h2>
        <p className="mt-2 max-w-[420px] text-[14px] text-muted-foreground">
          <Trans>Approvals, failed Fyrar and finished work will gather here, in that order.</Trans>
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
    );
  }

  return (
    <div className="mt-8 space-y-8" data-testid="lots-inbox-list">
      {SECTIONS.map((section) => {
        const rows = items.filter((item) => item.kind === section.kind);
        if (rows.length === 0) return null;
        return (
          <section key={section.kind} aria-label={section.title}>
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              {section.kind === "approval" ? (
                <Trans>Needs you</Trans>
              ) : section.kind === "fyr_failed" ? (
                <Trans>Failed Fyrar</Trans>
              ) : section.kind === "fyr_completed" ? (
                <Trans>Finished Fyrar</Trans>
              ) : (
                <Trans>Updates</Trans>
              )}
            </h2>
            <ul className="mt-3 space-y-3">
              {rows.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    className="block rounded-3xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-muted/40"
                    data-testid="lots-inbox-item"
                    data-kind={item.kind}
                  >
                    <p className="text-[15px] font-medium">{item.title}</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">{item.subtitle}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
