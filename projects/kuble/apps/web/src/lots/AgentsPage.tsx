import { Trans, useLingui } from "@lingui/react/macro";
import { type AgentStatus, agentStatusFromRunStatus } from "@lots/core";
import { BOT_COLORS, type Bot } from "@rakazo/contracts";
import { BotAvatar, Button, cn, Skeleton } from "@rakazo/ui-web";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";
import { NewAgentDialog } from "./NewAgentDialog";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; bots: Bot[] };

/** Coworkers grid (spec §31). Reads the upstream bot list; the chat itself is the upstream shell. */
export function AgentsPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const bots = await rpc.bots.list();
      setState({ kind: "ready", bots });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight">
            <Trans>Coworkers</Trans>
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            <Trans>People you can give work to. They remember the conversation.</Trans>
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="lots-new-agent">
          <Plus aria-hidden="true" />
          <Trans>New coworker</Trans>
        </Button>
      </div>

      {state.kind === "loading" ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className="rounded-3xl border border-border bg-card p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="size-12 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="mt-5 h-3 w-3/4" />
            </li>
          ))}
        </ul>
      ) : state.kind === "error" ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-[15px] text-foreground/80">
            <Trans>Your coworkers could not be loaded.</Trans>
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : state.bots.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <BotAvatar color={BOT_COLORS[2]} identity="empty" size={64} variant="lots" />
          <h2 className="mt-6 text-[18px] font-medium">
            <Trans>No coworkers yet</Trans>
          </h2>
          <p className="mt-2 max-w-[400px] text-[14px] text-muted-foreground">
            <Trans>
              A coworker is someone you keep: they remember what you talked about, can use tools,
              and can repeat work on a schedule.
            </Trans>
          </p>
          <Button className="mt-6" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            <Trans>Add your first coworker</Trans>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="lots-agent-grid">
          {state.bots.map((bot) => (
            <li key={bot.id}>
              <AgentCard bot={bot} />
            </li>
          ))}
        </ul>
      )}

      <NewAgentDialog open={creating} onOpenChange={setCreating} onCreated={() => void load()} />
    </div>
  );
}

function AgentCard({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const status = agentStatusFromRunStatus(bot.status);
  const computer = bot.computerMode === "dedicated" ? t`Own computer` : t`Shared computer`;
  return (
    <Link
      to={`/app/${bot.id}`}
      className="group flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      data-testid="lots-agent-card"
      data-agent-status={status}
    >
      <div className="flex items-start gap-4">
        <BotAvatar
          color={bot.color}
          identity={bot.id}
          size={48}
          status={bot.status}
          variant="lots"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[16px] font-medium">{bot.name}</h2>
            {bot.unread ? (
              <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-background uppercase">
                <Trans>New</Trans>
              </span>
            ) : null}
          </div>
          <p className="truncate text-[13px] text-muted-foreground">{bot.title || t`Coworker`}</p>
        </div>
        <StatusPill status={status} />
      </div>
      <p className="mt-4 line-clamp-2 min-h-[2.6em] text-[13.5px] leading-snug text-foreground/75">
        {bot.preview || (
          <span className="text-muted-foreground">{t`Say hello to get started`}</span>
        )}
      </p>
      <p className="mt-4 text-[12px] text-muted-foreground">{computer}</p>
    </Link>
  );
}

function StatusPill({ status }: { status: AgentStatus }) {
  const label =
    status === "WORKING" ? (
      <Trans>Working</Trans>
    ) : status === "WAITING" ? (
      <Trans>Needs you</Trans>
    ) : status === "ERROR" ? (
      <Trans>Failed</Trans>
    ) : (
      <Trans>Ready</Trans>
    );
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
        status === "WORKING" && "bg-foreground text-background",
        status === "WAITING" && "bg-warning/20 text-foreground",
        status === "ERROR" && "bg-destructive/15 text-destructive",
        status === "IDLE" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
