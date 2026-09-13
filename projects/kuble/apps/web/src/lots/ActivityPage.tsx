import { Trans } from "@lingui/react/macro";
import type { ActivityItem } from "@rakazo/contracts";
import { Button, Skeleton } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; items: ActivityItem[] };

/** Activity timeline (spec §36): what coworkers did, asked, and handed off. */
export function ActivityPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState({ kind: "ready", items: await rpc.lots.activity.list() });
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
      data-testid="lots-activity"
    >
      <h1 className="text-[26px] font-semibold tracking-tight">
        <Trans>Activity</Trans>
      </h1>
      <p className="mt-1 text-[14px] text-muted-foreground">
        <Trans>A readable timeline of what your coworkers did, asked and handed off.</Trans>
      </p>

      {state.kind === "loading" ? (
        <div className="mt-8 space-y-3" aria-busy="true">
          <Skeleton className="h-16 w-full max-w-2xl" />
          <Skeleton className="h-16 w-full max-w-2xl" />
        </div>
      ) : state.kind === "error" ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-[15px] text-foreground/80">
            <Trans>Activity could not be loaded.</Trans>
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : state.items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="max-w-[420px] text-[15px] leading-relaxed text-foreground/80">
            <Trans>
              Nothing here yet. Chat with a coworker or run a fyr — the trail shows up here.
            </Trans>
          </p>
        </div>
      ) : (
        <ol className="mt-8 max-w-2xl space-y-2" data-testid="lots-activity-list">
          {state.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-testid="lots-activity-item"
                data-kind={item.kind}
                onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
                className="w-full rounded-3xl border border-border bg-card px-5 py-4 text-start shadow-sm transition-colors hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[14.5px] font-medium text-foreground">{item.text}</p>
                  <time
                    dateTime={item.createdAt}
                    className="shrink-0 text-[12px] text-muted-foreground"
                  >
                    {formatWhen(item.createdAt)}
                  </time>
                </div>
                {openId === item.id ? <ActivityDetail item={item} /> : null}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ActivityDetail({ item }: { item: ActivityItem }) {
  const rows = [
    ["Coworker", item.detail.agent],
    ["Tool", item.detail.tool],
    ["Provider", item.detail.provider],
    ["Run", item.detail.runId],
    ["Reference", item.detail.externalRef],
    ["Error", item.detail.error],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return (
    <div className="mt-3 border-t border-border pt-3 text-[12.5px] text-muted-foreground">
      <dl className="grid gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-20 shrink-0">{label}</dt>
            <dd className="min-w-0 truncate">{value}</dd>
          </div>
        ))}
      </dl>
      <Link to={item.href} className="mt-3 inline-block text-[13px] text-foreground underline">
        <Trans>Open chat</Trans>
      </Link>
    </div>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
