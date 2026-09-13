import { Trans, useLingui } from "@lingui/react/macro";
import type { Pack, PackClassification } from "@rakazo/contracts";
import { Button, cn, Skeleton } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rpc } from "../lib/rpc";

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; pack: Pack };

export function PackDetailPage() {
  const { packKey } = useParams<{ packKey: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { t } = useLingui();

  const load = useCallback(async () => {
    if (!packKey) {
      setState({ kind: "missing" });
      return;
    }
    try {
      setState({
        kind: "ready",
        pack: await rpc.lots.packs.get({ packKey: packKey as Pack["key"] }),
      });
    } catch (error) {
      setState({ kind: errorStatus(error) === 404 ? "missing" : "error" });
    }
  }, [packKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (state.pack.enabled) await rpc.lots.packs.disable({ packKey: state.pack.key });
      else await rpc.lots.packs.enable({ packKey: state.pack.key });
      await load();
    } catch {
      setNotice(t`Ask an admin if you need this tool turned on for the workspace.`);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await rpc.lots.packs.connect({ packKey: state.pack.key });
      if (result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setNotice(
        result.pack.connected
          ? t`Already connected.`
          : t`OAuth is not configured on this install yet.`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    try {
      await rpc.lots.packs.disconnect({ packKey: state.pack.key });
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

  if (state.kind === "missing" || state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[15px] text-foreground/80">
          {state.kind === "missing" ? (
            <Trans>That tool was not found.</Trans>
          ) : (
            <Trans>This tool could not be loaded.</Trans>
          )}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          nativeButton={false}
          render={<Link to="/app/packs" />}
        >
          <Trans>Back to Tools</Trans>
        </Button>
      </div>
    );
  }

  return (
    <PackDetailView
      pack={state.pack}
      busy={busy}
      notice={notice}
      onToggle={() => void toggle()}
      onConnect={() => void connect()}
      onDisconnect={() => void disconnect()}
    />
  );
}

export function PackDetailView({
  pack,
  busy = false,
  notice,
  onToggle,
  onConnect,
  onDisconnect,
}: {
  pack: Pack;
  busy?: boolean;
  notice?: string | null;
  onToggle?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10"
      data-testid="lots-pack-detail"
    >
      <p className="text-[13px] text-muted-foreground">
        <Link to="/app/packs" className="hover:text-foreground">
          <Trans>Tools</Trans>
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{pack.name}</h1>
          <p className="mt-1 max-w-[520px] text-[14px] text-muted-foreground">{pack.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={onToggle}>
            {pack.enabled ? <Trans>Turn off</Trans> : <Trans>Turn on</Trans>}
          </Button>
          {pack.connection !== "none" ? (
            pack.connected ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onDisconnect}>
                <Trans>Disconnect</Trans>
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={onConnect}>
                <Trans>Connect</Trans>
              </Button>
            )
          ) : null}
        </div>
      </div>
      {notice ? <p className="mt-4 text-[13px] text-muted-foreground">{notice}</p> : null}

      <h2 className="mt-10 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
        <Trans>Actions</Trans>
      </h2>
      <ul className="mt-3 max-w-2xl space-y-2">
        {pack.tools.map((tool) => (
          <li
            key={tool.name}
            className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <div>
              <p className="text-[14px] font-medium">{tool.name}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{tool.description}</p>
            </div>
            <ClassificationPill classification={tool.classification} approval={tool.approval} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClassificationPill({
  classification,
  approval,
}: {
  classification: PackClassification;
  approval: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
        approval ? "bg-amber-100 text-amber-950" : "bg-muted text-muted-foreground",
      )}
    >
      {approval ? <Trans>Needs yes</Trans> : classification}
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
