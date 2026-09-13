import { APPROVAL_EXPIRE_SWEEP_MS, APPROVAL_TTL_MS, isStaleIntended } from "./approval-status.js";

export type ExpireCandidate = {
  id: string;
  runId: string;
  spaceId: string;
  createdAt: Date;
};

export type ExpireAsk = {
  messageId: string;
  blocks: unknown;
};

export type ApprovalExpireStore = {
  listIntended(input: { effectId?: string }): Promise<ExpireCandidate[]>;
  markExpired(effectId: string): Promise<boolean>;
  loadAsk(runId: string, effectId: string): Promise<ExpireAsk | null>;
  saveAsk(messageId: string, blocks: unknown): Promise<void>;
  queueWaitingRun(runId: string, spaceId: string): Promise<boolean>;
};

export type ExpireApprovalsInput = {
  store: ApprovalExpireStore;
  continueRun: (runId: string) => Promise<void>;
  scheduleSweep?: (availableAt: Date) => Promise<void>;
  effectId?: string;
  now?: Date;
  ttlMs?: number;
};

/**
 * Marks stale `intended` effects expired, answers the ask card, and wakes the run
 * so the executor returns a denied tool result (spec §16 EXPIRED).
 */
export async function expireStaleApprovals(input: ExpireApprovalsInput): Promise<string[]> {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? APPROVAL_TTL_MS;
  const candidates = await input.store.listIntended({ effectId: input.effectId });
  const expiredIds: string[] = [];

  for (const candidate of candidates) {
    if (!isStaleIntended(candidate.createdAt, now, ttlMs)) continue;
    const marked = await input.store.markExpired(candidate.id);
    if (!marked) continue;
    const ask = await input.store.loadAsk(candidate.runId, candidate.id);
    if (ask) {
      await input.store.saveAsk(ask.messageId, answerExpiredAsk(ask.blocks, candidate.id));
    }
    const queued = await input.store.queueWaitingRun(candidate.runId, candidate.spaceId);
    if (queued) await input.continueRun(candidate.runId);
    expiredIds.push(candidate.id);
  }

  if (!input.effectId && input.scheduleSweep) {
    await input.scheduleSweep(new Date(now.getTime() + APPROVAL_EXPIRE_SWEEP_MS));
  }
  return expiredIds;
}

export function answerExpiredAsk(blocks: unknown, effectId: string): unknown {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    if (
      !block ||
      typeof block !== "object" ||
      (block as { kind?: string }).kind !== "ask" ||
      (block as { approvalEffectId?: string }).approvalEffectId !== effectId
    ) {
      return block;
    }
    return { ...block, status: "answered", answer: "deny" };
  });
}
