import { Trans, useLingui } from "@lingui/react/macro";
import type { Fyr, FyrRun } from "@rakazo/contracts";
import { Button, cn, Skeleton } from "@rakazo/ui-web";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rpc } from "../lib/rpc";
import { formatFyrWhen, fyrRunLabel } from "./fyr-format";
import { NewFyrDialog } from "./NewFyrDialog";

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; fyr: Fyr; runs: FyrRun[] };

/** One fyr: instruction, schedule, coworker, run history (spec §32). */
export function FyrDetailPage() {
  const { t } = useLingui();
  const { fyrId } = useParams<{ fyrId: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!fyrId) {
      setState({ kind: "missing" });
      return;
    }
    try {
      const [fyr, runs] = await Promise.all([
        rpc.lots.fyrar.get({ fyrId }),
        rpc.lots.fyrar.runs({ fyrId }),
      ]);
      setState({ kind: "ready", fyr, runs });
    } catch (error) {
      setState({ kind: errorStatus(error) === 404 ? "missing" : "error" });
    }
  }, [fyrId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    try {
      if (state.fyr.enabled) await rpc.lots.fyrar.pause({ fyrId: state.fyr.id });
      else await rpc.lots.fyrar.resume({ fyrId: state.fyr.id });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    try {
      await rpc.lots.fyrar.runNow({ fyrId: state.fyr.id });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="px-6 py-8 md:px-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-32 w-full max-w-2xl" />
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] text-foreground/80">
          <Trans>That fyr was not found.</Trans>
        </p>
        <Button
          variant="outline"
          className="mt-4"
          nativeButton={false}
          render={<Link to="/app/fyrar" />}
        >
          <Trans>Back to Fyrar</Trans>
        </Button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] text-foreground/80">
          <Trans>This fyr could not be loaded.</Trans>
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  }

  const { fyr, runs } = state;
  const next = formatFyrWhen(fyr.nextRunAt, fyr.timezone);
  const latest = runs[0];

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10"
      data-testid="lots-fyr-detail"
    >
      <p className="text-[13px] text-muted-foreground">
        <Link to="/app/fyrar" className="hover:text-foreground">
          <Trans>Fyrar</Trans>
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{fyr.name}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight">{fyr.name}</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            <Link to={`/app/${fyr.botId}`} className="hover:text-foreground">
              {fyr.botName}
            </Link>
            <span aria-hidden="true"> · </span>
            {fyr.schedule}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void runNow()}>
            <Play aria-hidden="true" />
            <Trans>Run now</Trans>
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void toggle()}>
            {fyr.enabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {fyr.enabled ? <Trans>Pause</Trans> : <Trans>Resume</Trans>}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Trans>Edit</Trans>
          </Button>
        </div>
      </div>

      <section className="mt-8 max-w-2xl rounded-3xl border border-border bg-card p-5">
        <h2 className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
          <Trans>Instruction</Trans>
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{fyr.instruction}</p>
        <p className="mt-4 text-[13px] text-muted-foreground">
          {fyr.enabled
            ? next
              ? t`Next run ${next} (${fyr.timezone})`
              : t`Next run not scheduled`
            : t`Paused`}
        </p>
      </section>

      <section className="mt-8 max-w-2xl">
        <h2 className="text-[16px] font-medium">
          <Trans>Latest result</Trans>
        </h2>
        {latest ? (
          <div className="mt-3 rounded-3xl border border-border bg-card p-5">
            <RunStatus status={latest.status} />
            <p className="mt-2 text-[13px] text-muted-foreground">
              {formatFyrWhen(latest.completedAt ?? latest.createdAt, fyr.timezone)}
            </p>
            {latest.error ? (
              <p className="mt-3 text-[14px] text-destructive">{latest.error}</p>
            ) : latest.status === "SUCCEEDED" ? (
              <p className="mt-3 text-[14px] text-foreground/80">
                <Trans>Finished. Open the coworker to read what they wrote.</Trans>
              </p>
            ) : latest.status === "WAITING_APPROVAL" ? (
              <p className="mt-3 text-[14px] text-foreground/80">
                <Trans>They are waiting for you in chat.</Trans>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-muted-foreground">
            <Trans>This fyr has not run yet.</Trans>
          </p>
        )}
      </section>

      <section className="mt-8 max-w-2xl pb-10">
        <h2 className="text-[16px] font-medium">
          <Trans>Run history</Trans>
        </h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted-foreground">
            <Trans>Runs will show up here after the first time this fyr fires.</Trans>
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-3xl border border-border bg-card">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <RunStatus status={run.status} />
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {formatFyrWhen(run.createdAt, fyr.timezone)}
                  </p>
                </div>
                {run.error ? (
                  <p className="max-w-[50%] truncate text-[12px] text-destructive">{run.error}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <NewFyrDialog
        open={editing}
        onOpenChange={setEditing}
        bots={[]}
        fyr={fyr}
        onSaved={() => void load()}
      />
    </div>
  );
}

function RunStatus({ status }: { status: FyrRun["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-medium",
        status === "RUNNING" && "bg-foreground text-background",
        status === "WAITING_APPROVAL" && "bg-warning/20 text-foreground",
        status === "FAILED" && "bg-destructive/15 text-destructive",
        status === "SUCCEEDED" && "bg-muted text-foreground",
        (status === "QUEUED" || status === "CANCELLED") && "bg-muted text-muted-foreground",
      )}
    >
      {fyrRunLabel(status)}
    </span>
  );
}

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}
