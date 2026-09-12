import { type Role, visibleTo } from "@lots/access";
import {
  approvalPreview,
  approvalStatusFromEffect,
  approvalSummary,
  createApprovalExpireStore,
  expireStaleApprovals,
  isStaleIntended,
} from "@lots/approvals";
import type { JobPublisher } from "@rakazo/adapter-kit";
import { approvalExpireJob, runContinueJob } from "@rakazo/adapter-kit";
import type { Actor, Approval, ApprovalTab } from "@rakazo/contracts";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";

export class LotsApprovalError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "LotsApprovalError";
  }
}

type EffectRow = {
  id: string;
  spaceId: string;
  runId: string;
  kind: string;
  status: string;
  request: unknown;
  createdAt: Date;
  run: {
    threadId: string;
    botId: string;
    bot: { name: string; userId: string; archivedAt: Date | null };
  };
};

type AskIndex = Map<string, { messageId: string; text?: string; detail?: string }>;

function notFound(): never {
  throw new LotsApprovalError("NOT_FOUND", "Resource not found");
}

function requireVisible(actor: Actor, role: Role, row: EffectRow): void {
  if (row.run.bot.archivedAt) notFound();
  if (
    !visibleTo(
      { userId: actor.userId, spaceId: actor.spaceId, role },
      { spaceId: row.spaceId, ownerUserId: row.run.bot.userId },
    )
  ) {
    notFound();
  }
}

function mapApproval(row: EffectRow, ask: AskIndex): Approval {
  return {
    id: row.id,
    botId: row.run.botId,
    botName: row.run.bot.name,
    runId: row.runId,
    threadId: row.run.threadId,
    messageId: ask.get(row.id)?.messageId ?? null,
    tool: row.kind,
    summary: approvalSummary(row.kind, row.request, ask.get(row.id)?.text),
    detail: ask.get(row.id)?.detail ?? null,
    preview: approvalPreview(row.request),
    status: approvalStatusFromEffect(row.status, row.createdAt),
    checking: row.status === "uncertain",
    createdAt: row.createdAt.toISOString(),
  };
}

async function indexAsks(prisma: PrismaClient, runIds: string[]): Promise<AskIndex> {
  const index: AskIndex = new Map();
  if (runIds.length === 0) return index;
  const messages = await prisma.message.findMany({
    where: { runId: { in: runIds }, role: "bot" },
    select: { id: true, runId: true, blocks: true },
  });
  for (const message of messages) {
    if (!Array.isArray(message.blocks)) continue;
    for (const block of message.blocks) {
      if (!block || typeof block !== "object") continue;
      const ask = block as {
        kind?: string;
        approvalEffectId?: string;
        text?: string;
        detail?: string;
      };
      if (ask.kind !== "ask" || !ask.approvalEffectId || index.has(ask.approvalEffectId)) continue;
      index.set(ask.approvalEffectId, {
        messageId: message.id,
        text: ask.text,
        detail: ask.detail,
      });
    }
  }
  return index;
}

export { createApprovalExpireStore };

export async function runApprovalExpire(
  prisma: PrismaClient,
  jobs: JobPublisher,
  payload: { effectId?: string } = {},
): Promise<string[]> {
  return expireStaleApprovals({
    store: createApprovalExpireStore(prisma),
    continueRun: (runId) => jobs.enqueue(runContinueJob(runId)),
    scheduleSweep: (availableAt) => jobs.enqueue(approvalExpireJob(undefined, availableAt)),
    effectId: payload.effectId,
  });
}

async function loadEffect(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  approvalId: string,
): Promise<EffectRow> {
  const row = await prisma.externalEffect.findFirst({
    where: { id: approvalId, spaceId: actor.spaceId },
    include: {
      run: { include: { bot: { select: { name: true, userId: true, archivedAt: true } } } },
    },
  });
  if (!row) notFound();
  requireVisible(actor, role, row);
  return row;
}

export async function listApprovals(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  tab: ApprovalTab = "pending",
): Promise<Approval[]> {
  const rows = await prisma.externalEffect.findMany({
    where: {
      spaceId: actor.spaceId,
      status: tab === "pending" ? "intended" : { not: "intended" },
    },
    include: {
      run: { include: { bot: { select: { name: true, userId: true, archivedAt: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const visible = rows.filter((row) =>
    visibleTo(
      { userId: actor.userId, spaceId: actor.spaceId, role },
      { spaceId: row.spaceId, ownerUserId: row.run.bot.userId },
    ),
  );
  const ask = await indexAsks(
    prisma,
    visible.map((row) => row.runId),
  );
  return visible
    .filter((row) => !row.run.bot.archivedAt)
    .filter((row) => (tab === "pending" ? !isStaleIntended(row.createdAt) : true))
    .map((row) => mapApproval(row, ask));
}

export async function getApproval(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  approvalId: string,
): Promise<Approval> {
  const row = await loadEffect(prisma, actor, role, approvalId);
  const ask = await indexAsks(prisma, [row.runId]);
  return mapApproval(row, ask);
}

export async function decideApproval(
  prisma: PrismaClient,
  events: Pick<ThreadEvents, "answerRunInput">,
  jobs: JobPublisher,
  actor: Actor,
  role: Role,
  approvalId: string,
  decision: "allow" | "deny",
): Promise<{ ok: true }> {
  const row = await loadEffect(prisma, actor, role, approvalId);
  if (row.status !== "intended" || isStaleIntended(row.createdAt)) {
    if (row.status === "intended" && isStaleIntended(row.createdAt)) {
      await expireStaleApprovals({
        store: createApprovalExpireStore(prisma),
        continueRun: (runId) => jobs.enqueue(runContinueJob(runId)),
        effectId: row.id,
      });
    }
    throw new LotsApprovalError("CONFLICT", "This approval is no longer waiting.");
  }
  const ask = await indexAsks(prisma, [row.runId]);
  const messageId = ask.get(row.id)?.messageId;
  if (!messageId) {
    throw new LotsApprovalError("CONFLICT", "This approval is no longer waiting.");
  }
  const answered = await events.answerRunInput({
    spaceId: actor.spaceId,
    threadId: row.run.threadId,
    runId: row.runId,
    messageId,
    answeredByUserId: actor.userId,
    answer: decision,
  });
  if (!answered) {
    throw new LotsApprovalError("CONFLICT", "This approval is no longer waiting.");
  }
  await jobs.enqueue(runContinueJob(row.runId));
  return { ok: true as const };
}
