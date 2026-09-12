import { describe, expect, it, vi } from "vitest";
import { decideApproval, LotsApprovalError } from "./approvals.js";

const actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

function effect(status: string, createdAt = new Date()) {
  return {
    id: "e-1",
    spaceId: "space-1",
    runId: "run-1",
    kind: "gmail_send_email",
    status,
    request: { to: "anna@example.com", subject: "Follow-up" },
    createdAt,
    run: {
      threadId: "thread-1",
      botId: "bot-1",
      bot: { name: "Researcher", userId: "user-a", archivedAt: null },
    },
  };
}

describe("decideApproval", () => {
  it("rejects an approval that is no longer intended", async () => {
    const prisma = {
      externalEffect: {
        findFirst: vi.fn().mockResolvedValue(effect("denied")),
      },
      message: { findMany: vi.fn() },
    };
    await expect(
      decideApproval(
        prisma as never,
        { answerRunInput: vi.fn() },
        { enqueue: vi.fn(), cancel: vi.fn(), close: vi.fn() },
        actor,
        "MEMBER",
        "e-1",
        "allow",
      ),
    ).rejects.toBeInstanceOf(LotsApprovalError);
  });

  it("answers allow through the upstream path", async () => {
    const answerRunInput = vi.fn().mockResolvedValue(true);
    const enqueue = vi.fn();
    const prisma = {
      externalEffect: {
        findFirst: vi.fn().mockResolvedValue(effect("intended")),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "msg-1",
            runId: "run-1",
            blocks: [
              {
                kind: "ask",
                approvalEffectId: "e-1",
                text: "Review before sending email",
                detail: "to: anna@example.com",
              },
            ],
          },
        ]),
      },
    };
    await expect(
      decideApproval(
        prisma as never,
        { answerRunInput },
        { enqueue, cancel: vi.fn(), close: vi.fn() },
        actor,
        "MEMBER",
        "e-1",
        "allow",
      ),
    ).resolves.toEqual({ ok: true });
    expect(answerRunInput).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        messageId: "msg-1",
        answer: "allow",
      }),
    );
    expect(enqueue).toHaveBeenCalled();
  });

  it("expires a stale intended approval instead of answering it", async () => {
    const answerRunInput = vi.fn();
    const enqueue = vi.fn();
    const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const prisma = {
      externalEffect: {
        findFirst: vi.fn().mockResolvedValue(effect("intended", createdAt)),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "e-1",
            runId: "run-1",
            spaceId: "space-1",
            createdAt,
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "msg-1",
            blocks: [{ kind: "ask", approvalEffectId: "e-1", status: "pending" }],
          },
        ]),
        update: vi.fn(),
      },
      run: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    await expect(
      decideApproval(
        prisma as never,
        { answerRunInput },
        { enqueue, cancel: vi.fn(), close: vi.fn() },
        actor,
        "MEMBER",
        "e-1",
        "allow",
      ),
    ).rejects.toBeInstanceOf(LotsApprovalError);
    expect(answerRunInput).not.toHaveBeenCalled();
    expect(prisma.externalEffect.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "expired" } }),
    );
    expect(enqueue).toHaveBeenCalled();
  });
});
