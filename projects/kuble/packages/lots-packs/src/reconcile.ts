import { normalizePackToolName } from "./classification.js";

export const RECONCILABLE_TOOLS = new Set([
  "gmail_send",
  "calendar_createEvent",
  "github_createIssue",
  "github_commentIssue",
  "github_commentPull",
]);

export function isReconcilablePackTool(tool: string): boolean {
  return RECONCILABLE_TOOLS.has(normalizePackToolName(tool));
}

export type PackReconcileLookup = {
  find: (query: {
    tool: string;
    request: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null | "ambiguous">;
};

export type ReconcileOutcome =
  | { status: "succeeded"; result: Record<string, unknown> }
  | { status: "retry" }
  | { status: "ambiguous" };

/** Spec §20: found → SUCCEEDED, missing → safe retry, unclear → ask (stay UNKNOWN). */
export async function reconcilePackWrite(
  tool: string,
  request: Record<string, unknown>,
  lookup: PackReconcileLookup,
): Promise<ReconcileOutcome> {
  if (!isReconcilablePackTool(tool)) return { status: "ambiguous" };
  const found = await lookup.find({ tool: normalizePackToolName(tool), request });
  if (found === "ambiguous") return { status: "ambiguous" };
  if (!found) return { status: "retry" };
  return { status: "succeeded", result: found };
}

export type EffectReconcileRow = {
  id: string;
  kind: string;
  status: string;
  request: unknown;
};

export type EffectReconcileStore = {
  listUncertain: (effectId?: string) => Promise<EffectReconcileRow[]>;
  markCompleted: (effectId: string, result: Record<string, unknown>) => Promise<boolean>;
};

/**
 * Walks uncertain pack writes and applies narrow reconciliation.
 * Succeeded effects are completed with the found provider result (no resend).
 */
export async function reconcileUncertainEffects(input: {
  store: EffectReconcileStore;
  lookup: PackReconcileLookup;
  effectId?: string;
}): Promise<string[]> {
  const rows = await input.store.listUncertain(input.effectId);
  const completed: string[] = [];
  for (const row of rows) {
    if (row.status !== "uncertain") continue;
    const request =
      row.request && typeof row.request === "object" && !Array.isArray(row.request)
        ? (row.request as Record<string, unknown>)
        : {};
    const outcome = await reconcilePackWrite(row.kind, request, input.lookup);
    if (outcome.status !== "succeeded") continue;
    if (await input.store.markCompleted(row.id, outcome.result)) completed.push(row.id);
  }
  return completed;
}

export function createEffectReconcileStore(prisma: object): EffectReconcileStore {
  const db = prisma as {
    externalEffect: {
      findMany: (args: {
        where: { status: string; id?: string };
        select: { id: true; kind: true; status: true; request: true };
        take: number;
      }) => Promise<EffectReconcileRow[]>;
      updateMany: (args: {
        where: { id: string; status: string };
        data: { status: string; result: Record<string, unknown> };
      }) => Promise<{ count: number }>;
    };
  };
  return {
    async listUncertain(effectId) {
      return db.externalEffect.findMany({
        where: { status: "uncertain", ...(effectId ? { id: effectId } : {}) },
        select: { id: true, kind: true, status: true, request: true },
        take: effectId ? 1 : 50,
      });
    },
    async markCompleted(effectId, result) {
      const updated = await db.externalEffect.updateMany({
        where: { id: effectId, status: "uncertain" },
        data: { status: "completed", result },
      });
      return updated.count === 1;
    },
  };
}

export async function runEffectReconcile(
  prisma: object,
  payload: { effectId?: string } = {},
  lookup: PackReconcileLookup = { find: async () => null },
): Promise<string[]> {
  return reconcileUncertainEffects({
    store: createEffectReconcileStore(prisma),
    lookup,
    effectId: payload.effectId,
  });
}
