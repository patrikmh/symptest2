import { describe, expect, it, vi } from "vitest";
import { APPROVAL_TTL_MS } from "./approval-status.js";
import { answerExpiredAsk, expireStaleApprovals } from "./expire.js";

describe("answerExpiredAsk", () => {
  it("answers only the matching approval card", () => {
    const blocks = [
      { kind: "text", text: "hi" },
      { kind: "ask", approvalEffectId: "e-1", status: "pending" },
      { kind: "ask", approvalEffectId: "e-2", status: "pending" },
    ];
    expect(answerExpiredAsk(blocks, "e-1")).toEqual([
      { kind: "text", text: "hi" },
      { kind: "ask", approvalEffectId: "e-1", status: "answered", answer: "deny" },
      { kind: "ask", approvalEffectId: "e-2", status: "pending" },
    ]);
  });
});

describe("expireStaleApprovals", () => {
  it("expires a stale intended effect and continues the run", async () => {
    const continueRun = vi.fn(async () => undefined);
    const saveAsk = vi.fn(async () => undefined);
    const expired = await expireStaleApprovals({
      now: new Date("2026-09-12T20:00:00.000Z"),
      ttlMs: APPROVAL_TTL_MS,
      continueRun,
      store: {
        listIntended: async () => [
          {
            id: "e-1",
            runId: "run-1",
            spaceId: "space-1",
            createdAt: new Date("2026-09-11T19:00:00.000Z"),
          },
        ],
        markExpired: async () => true,
        loadAsk: async () => ({
          messageId: "msg-1",
          blocks: [{ kind: "ask", approvalEffectId: "e-1", status: "pending" }],
        }),
        saveAsk,
        queueWaitingRun: async () => true,
      },
    });
    expect(expired).toEqual(["e-1"]);
    expect(saveAsk).toHaveBeenCalledWith("msg-1", [
      { kind: "ask", approvalEffectId: "e-1", status: "answered", answer: "deny" },
    ]);
    expect(continueRun).toHaveBeenCalledWith("run-1");
  });

  it("does not expire a fresh intended effect", async () => {
    const markExpired = vi.fn(async () => true);
    const expired = await expireStaleApprovals({
      now: new Date("2026-09-12T20:00:00.000Z"),
      continueRun: async () => undefined,
      store: {
        listIntended: async () => [
          {
            id: "e-1",
            runId: "run-1",
            spaceId: "space-1",
            createdAt: new Date("2026-09-12T19:00:00.000Z"),
          },
        ],
        markExpired,
        loadAsk: async () => null,
        saveAsk: async () => undefined,
        queueWaitingRun: async () => false,
      },
    });
    expect(expired).toEqual([]);
    expect(markExpired).not.toHaveBeenCalled();
  });

  it("cannot expire an effect that is no longer intended", async () => {
    const expired = await expireStaleApprovals({
      now: new Date("2026-09-12T20:00:00.000Z"),
      continueRun: async () => undefined,
      store: {
        listIntended: async () => [
          {
            id: "e-1",
            runId: "run-1",
            spaceId: "space-1",
            createdAt: new Date("2026-09-11T00:00:00.000Z"),
          },
        ],
        markExpired: async () => false,
        loadAsk: async () => null,
        saveAsk: async () => undefined,
        queueWaitingRun: async () => false,
      },
    });
    expect(expired).toEqual([]);
  });

  it("re-enqueues a sweep after a full pass", async () => {
    const scheduleSweep = vi.fn(async () => undefined);
    await expireStaleApprovals({
      now: new Date("2026-09-12T20:00:00.000Z"),
      continueRun: async () => undefined,
      scheduleSweep,
      store: {
        listIntended: async () => [],
        markExpired: async () => false,
        loadAsk: async () => null,
        saveAsk: async () => undefined,
        queueWaitingRun: async () => false,
      },
    });
    expect(scheduleSweep).toHaveBeenCalledTimes(1);
  });
});
