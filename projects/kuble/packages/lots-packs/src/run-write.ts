import { lotsEffectIdempotencyKey } from "@lots/core";
import type { PackReconcileLookup } from "./reconcile.js";
import { reconcilePackWrite } from "./reconcile.js";

export type PackWriteRecord = {
  key: string;
  status: "completed" | "uncertain";
  result?: Record<string, unknown>;
};

export type PackWriteStore = {
  get: (key: string) => PackWriteRecord | undefined;
  put: (record: PackWriteRecord) => void;
};

export function createMemoryWriteStore(seed: PackWriteRecord[] = []): PackWriteStore {
  const rows = new Map(seed.map((row) => [row.key, row]));
  return {
    get: (key) => rows.get(key),
    put: (record) => {
      rows.set(record.key, record);
    },
  };
}

export type PackWriteScope = {
  organization: string;
  agent: string;
  run: string;
  tool: string;
};

/**
 * Apply spec §19/§20 around a pack write: replay completed results, mark
 * timeouts UNKNOWN, and reconcile without calling send again.
 */
export async function runPackWrite(input: {
  scope: PackWriteScope;
  payload: Record<string, unknown>;
  store: PackWriteStore;
  execute: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  lookup?: PackReconcileLookup;
}): Promise<{
  key: string;
  status: "completed" | "uncertain";
  result: Record<string, unknown>;
  sent: boolean;
}> {
  const key = lotsEffectIdempotencyKey({ ...input.scope, payload: input.payload });
  if (!key) throw new Error(`Not a protected pack write: ${input.scope.tool}`);
  const existing = input.store.get(key);
  if (existing?.status === "completed" && existing.result) {
    return { key, status: "completed", result: existing.result, sent: false };
  }
  if (existing?.status === "uncertain" && input.lookup) {
    const recovered = await reconcilePackWrite(input.scope.tool, input.payload, input.lookup);
    if (recovered.status === "succeeded") {
      input.store.put({ key, status: "completed", result: recovered.result });
      return { key, status: "completed", result: recovered.result, sent: false };
    }
  }
  try {
    const result = await input.execute();
    input.store.put({ key, status: "completed", result });
    return { key, status: "completed", result, sent: true };
  } catch {
    input.store.put({ key, status: "uncertain" });
    if (input.lookup) {
      const outcome = await reconcilePackWrite(input.scope.tool, input.payload, input.lookup);
      if (outcome.status === "succeeded") {
        input.store.put({ key, status: "completed", result: outcome.result });
        return { key, status: "completed", result: outcome.result, sent: true };
      }
    }
    return {
      key,
      status: "uncertain",
      result: { error: "UNKNOWN", uncertain: true },
      sent: true,
    };
  }
}
