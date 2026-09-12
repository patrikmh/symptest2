import { Trans, useLingui } from "@lingui/react/macro";
import type { Approval, ApprovalStatus, ApprovalTab } from "@rakazo/contracts";
import { Button, cn, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; approvals: Approval[] };

const PREVIEW_LABELS = {
  to: "To",
  subject: "Subject",
  title: "Title",
  collection: "Collection",
  name: "Name",
  body: "Body",
} as const;

/** Approvals inbox (spec §33): Pending / History over ExternalEffect. */
export function ApprovalsPage() {
  const { t } = useLingui();
  const [tab, setTab] = useState<ApprovalTab>("pending");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextTab: ApprovalTab) => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", approvals: await rpc.lots.approvals.list({ tab: nextTab }) });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  async function decide(approval: Approval, decision: "approve" | "reject") {
    if (busyId) return;
    setBusyId(approval.id);
    try {
      if (decision === "approve") await rpc.lots.approvals.approve({ approvalId: approval.id });
      else await rpc.lots.approvals.reject({ approvalId: approval.id });
      await load(tab);
    } catch {
      await load(tab);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10"
      data-testid="lots-approvals"
    >
      <h1 className="text-[26px] font-semibold tracking-tight">
        <Trans>Approvals</Trans>
      </h1>
      <p className="mt-1 text-[14px] text-muted-foreground">
        <Trans>When a coworker wants to act outside Ratatosk, they wait here for a yes.</Trans>
      </p>

      <Tabs value={tab} onValueChange={(value) => setTab(value as ApprovalTab)} className="mt-8">
        <TabsList aria-label={t`Approvals`}>
          <TabsTrigger value="pending">
            <Trans>Pending</Trans>
          </TabsTrigger>
          <TabsTrigger value="history">
            <Trans>History</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-6">
          {state.kind === "loading" ? (
            <ul className="space-y-4" aria-busy="true">
              {[0, 1].map((index) => (
                <li key={index} className="rounded-3xl border border-border bg-card p-5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-3 h-3 w-2/3" />
                  <Skeleton className="mt-6 h-3 w-1/2" />
                </li>
              ))}
            </ul>
          ) : state.kind === "error" ? (
            <div className="flex flex-col items-center text-center">
              <p className="text-[15px] text-foreground/80">
                <Trans>Approvals could not be loaded.</Trans>
              </p>
              <Button variant="outline" className="mt-4" onClick={() => void load(tab)}>
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : (
            <ApprovalsView
              tab={tab}
              approvals={state.approvals}
              busyId={busyId}
              onApprove={(approval) => void decide(approval, "approve")}
              onReject={(approval) => void decide(approval, "reject")}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ApprovalsView({
  tab,
  approvals,
  busyId,
  onApprove,
  onReject,
}: {
  tab: ApprovalTab;
  approvals: Approval[];
  busyId: string | null;
  onApprove: (approval: Approval) => void;
  onReject: (approval: Approval) => void;
}) {
  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center text-center">
        <h2 className="text-[18px] font-medium">
          {tab === "pending" ? <Trans>Nothing waiting</Trans> : <Trans>No approval history</Trans>}
        </h2>
        <p className="mt-2 max-w-[420px] text-[14px] text-muted-foreground">
          {tab === "pending" ? (
            <Trans>
              When a coworker wants to send email, post or create something, the request lands here.
            </Trans>
          ) : (
            <Trans>Approved, rejected and expired requests will show up here.</Trans>
          )}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4" data-testid="lots-approval-list">
      {approvals.map((approval) => (
        <li key={approval.id}>
          <ApprovalCard
            approval={approval}
            busy={busyId === approval.id}
            onApprove={() => onApprove(approval)}
            onReject={() => onReject(approval)}
          />
        </li>
      ))}
    </ul>
  );
}

function ApprovalCard({
  approval,
  busy,
  onApprove,
  onReject,
}: {
  approval: Approval;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useLingui();
  const pending = approval.status === "PENDING";
  const when = new Date(approval.createdAt);
  return (
    <article
      className="rounded-3xl border border-border bg-card p-5 shadow-sm"
      data-testid="lots-approval-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-muted-foreground">{approval.botName}</p>
          <h2 className="mt-1 text-[16px] font-medium leading-snug">{approval.summary}</h2>
        </div>
        <StatusPill status={approval.status} />
      </div>
      {approval.checking ? (
        <p className="mt-4 text-[13.5px] text-foreground/80">
          <Trans>LOTS is checking whether this action completed.</Trans>
          <span className="mt-1 block text-muted-foreground">
            <Trans>Do not retry it manually yet.</Trans>
          </span>
        </p>
      ) : null}
      {Object.keys(approval.preview).length > 0 ? (
        <dl className="mt-4 space-y-1.5 text-[13.5px]">
          {Object.entries(approval.preview).map(([key, value]) => (
            <div key={key} className="flex gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground">
                {PREVIEW_LABELS[key as keyof typeof PREVIEW_LABELS] ?? key}
              </dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground/90">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {pending ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={onApprove} data-testid="lots-approval-approve">
            <Trans>Approve</Trans>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onReject}
            data-testid="lots-approval-reject"
          >
            <Trans>Reject</Trans>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link to={`/app/${approval.botId}`} />}
          >
            <Trans>Open coworker</Trans>
          </Button>
        </div>
      ) : (
        <div className="mt-5">
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link to={`/app/${approval.botId}`} />}
          >
            <Trans>Open coworker</Trans>
          </Button>
        </div>
      )}
      <details className="mt-4 text-[13px] text-muted-foreground">
        <summary className="cursor-pointer select-none text-foreground/80">
          <Trans>Details</Trans>
        </summary>
        <dl className="mt-3 space-y-1.5">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0">
              <Trans>Tool</Trans>
            </dt>
            <dd className="min-w-0 break-all">{approval.tool}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0">
              <Trans>When</Trans>
            </dt>
            <dd>{Number.isNaN(when.getTime()) ? approval.createdAt : when.toLocaleString()}</dd>
          </div>
          {approval.detail ? (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0">
                <Trans>Payload</Trans>
              </dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words">{approval.detail}</dd>
            </div>
          ) : null}
        </dl>
        <p className="sr-only">{t`Approval ${approval.id}`}</p>
      </details>
    </article>
  );
}

function StatusPill({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
        status === "PENDING" ? "bg-amber-100 text-amber-950" : "bg-muted text-muted-foreground",
      )}
    >
      {status === "PENDING" ? (
        <Trans>Pending</Trans>
      ) : status === "APPROVED" ? (
        <Trans>Approved</Trans>
      ) : status === "REJECTED" ? (
        <Trans>Rejected</Trans>
      ) : status === "EXPIRED" ? (
        <Trans>Expired</Trans>
      ) : (
        <Trans>Done</Trans>
      )}
    </span>
  );
}
