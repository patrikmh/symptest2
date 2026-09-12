import type { ApprovalExpireStore, ExpireAsk, ExpireCandidate } from "./expire.js";

/** Duck-typed Prisma surface used by the expire job (api + worker). */
export type ApprovalExpirePrisma = {
  externalEffect: {
    findMany: (args: unknown) => Promise<ExpireCandidate[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  message: {
    findMany: (args: unknown) => Promise<Array<{ id: string; blocks: unknown }>>;
    update: (args: unknown) => Promise<unknown>;
  };
  run: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

export function createApprovalExpireStore(prisma: object): ApprovalExpireStore {
  const db = prisma as ApprovalExpirePrisma;
  return {
    async listIntended({ effectId }) {
      return db.externalEffect.findMany({
        where: { status: "intended", ...(effectId ? { id: effectId } : {}) },
        select: { id: true, runId: true, spaceId: true, createdAt: true },
        take: effectId ? 1 : 50,
        orderBy: { createdAt: "asc" },
      });
    },
    async markExpired(effectId) {
      const updated = await db.externalEffect.updateMany({
        where: { id: effectId, status: "intended" },
        data: { status: "expired" },
      });
      return updated.count === 1;
    },
    async loadAsk(runId, effectId): Promise<ExpireAsk | null> {
      const messages = await db.message.findMany({
        where: { runId, role: "bot" },
        select: { id: true, blocks: true },
      });
      for (const message of messages) {
        if (!Array.isArray(message.blocks)) continue;
        const match = message.blocks.some(
          (block) =>
            block &&
            typeof block === "object" &&
            (block as { approvalEffectId?: string }).approvalEffectId === effectId,
        );
        if (match) return { messageId: message.id, blocks: message.blocks };
      }
      return null;
    },
    async saveAsk(messageId, blocks) {
      await db.message.update({
        where: { id: messageId },
        data: { blocks: blocks as object[] },
      });
    },
    async queueWaitingRun(runId, spaceId) {
      const updated = await db.run.updateMany({
        where: { id: runId, spaceId, status: "waiting_input" },
        data: { status: "queued" },
      });
      return updated.count === 1;
    },
  };
}
