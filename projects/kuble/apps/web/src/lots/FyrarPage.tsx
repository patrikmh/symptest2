import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Fyr } from "@rakazo/contracts";
import { Button, cn, Skeleton } from "@rakazo/ui-web";
import { Pause, Play, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { rpc } from "../lib/rpc";
import { formatFyrWhen } from "./fyr-format";
import { NewFyrDialog } from "./NewFyrDialog";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; fyrar: Fyr[] };

/** Fyrar grid (spec §32): recurring work attached to a coworker. */
export function FyrarPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [bots, setBots] = useState<Bot[]>([]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [fyrar, listed] = await Promise.all([rpc.lots.fyrar.list(), rpc.lots.agents.list()]);
      setBots(listed);
      setState({ kind: "ready", fyrar });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(fyr: Fyr) {
    if (busyId) return;
    setBusyId(fyr.id);
    try {
      if (fyr.enabled) await rpc.lots.fyrar.pause({ fyrId: fyr.id });
      else await rpc.lots.fyrar.resume({ fyrId: fyr.id });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(fyr: Fyr) {
    if (busyId) return;
    setBusyId(fyr.id);
    try {
      await rpc.lots.fyrar.runNow({ fyrId: fyr.id });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10"
      data-testid="lots-fyrar"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight">
            <Trans>Fyrar</Trans>
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            <Trans>Recurring work attached to a coworker.</Trans>
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="lots-new-fyr-button">
          <Plus aria-hidden="true" />
          <Trans>Create Fyr</Trans>
        </Button>
      </div>

      {state.kind === "loading" ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className="rounded-3xl border border-border bg-card p-5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-3 h-3 w-1/3" />
              <Skeleton className="mt-6 h-3 w-3/4" />
            </li>
          ))}
        </ul>
      ) : state.kind === "error" ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-[15px] text-foreground/80">
            <Trans>Your fyrar could not be loaded.</Trans>
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : state.fyrar.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <h2 className="text-[18px] font-medium">
            <Trans>No fyrar yet</Trans>
          </h2>
          <p className="mt-2 max-w-[420px] text-[14px] text-muted-foreground">
            <Trans>
              A fyr is repeating work — “every morning, summarise overnight email.” Create one here,
              or ask a coworker to set one up.
            </Trans>
          </p>
          <Button className="mt-6" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            <Trans>Create your first fyr</Trans>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="lots-fyr-grid">
          {state.fyrar.map((fyr) => (
            <li key={fyr.id}>
              <FyrCard
                fyr={fyr}
                busy={busyId === fyr.id}
                onToggle={() => void toggle(fyr)}
                onRunNow={() => void runNow(fyr)}
              />
            </li>
          ))}
        </ul>
      )}

      <NewFyrDialog
        open={creating}
        onOpenChange={setCreating}
        bots={bots}
        onSaved={(fyr) => {
          void load();
          navigate(`/app/fyrar/${fyr.id}`);
        }}
      />
    </div>
  );
}

function FyrCard({
  fyr,
  busy,
  onToggle,
  onRunNow,
}: {
  fyr: Fyr;
  busy: boolean;
  onToggle: () => void;
  onRunNow: () => void;
}) {
  const { t } = useLingui();
  const next = formatFyrWhen(fyr.nextRunAt, fyr.timezone);
  return (
    <div
      className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-sm"
      data-testid="lots-fyr-card"
    >
      <Link to={`/app/fyrar/${fyr.id}`} className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h2 className="truncate text-[16px] font-medium">{fyr.name}</h2>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
              fyr.enabled ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {fyr.enabled ? <Trans>On</Trans> : <Trans>Paused</Trans>}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">{fyr.botName}</p>
        <p className="mt-4 text-[13.5px] leading-snug text-foreground/80">{fyr.schedule}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {fyr.enabled ? (next ? t`Next ${next}` : t`Next run not scheduled`) : t`Paused`}
        </p>
      </Link>
      <div className="mt-5 flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onRunNow}>
          <Play aria-hidden="true" />
          <Trans>Run now</Trans>
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onToggle}>
          {fyr.enabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {fyr.enabled ? <Trans>Pause</Trans> : <Trans>Resume</Trans>}
        </Button>
      </div>
    </div>
  );
}
