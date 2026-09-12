import { describe, expect, it, vi } from "vitest";
import { listInbox } from "./inbox.js";

const actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

describe("listInbox", () => {
  it("orders pending approvals, failed Fyrar, completed Fyrar, then updates", async () => {
    const prisma = {
      externalEffect: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "e-1",
            spaceId: "space-1",
            runId: "run-a",
            kind: "gmail_send_email",
            status: "intended",
            request: { to: "anna@example.com" },
            createdAt: new Date("2026-09-12T10:00:00.000Z"),
            run: {
              threadId: "t-1",
              botId: "bot-1",
              bot: { name: "Researcher", userId: "user-a", archivedAt: null },
            },
          },
        ]),
      },
      message: { findMany: vi.fn().mockResolvedValue([]) },
      run: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "run-failed",
              botId: "bot-1",
              routineId: "fyr-1",
              status: "failed",
              createdAt: new Date("2026-09-12T09:00:00.000Z"),
              completedAt: new Date("2026-09-12T09:05:00.000Z"),
              bot: { name: "Assistant", userId: "user-a" },
              routine: { id: "fyr-1", name: "Morning brief" },
            },
            {
              id: "run-ok",
              botId: "bot-1",
              routineId: "fyr-2",
              status: "completed",
              createdAt: new Date("2026-09-12T08:00:00.000Z"),
              completedAt: new Date("2026-09-12T08:05:00.000Z"),
              bot: { name: "Assistant", userId: "user-a" },
              routine: { id: "fyr-2", name: "Friday recap" },
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "run-chat",
              botId: "bot-1",
              status: "completed",
              createdAt: new Date("2026-09-12T07:00:00.000Z"),
              completedAt: new Date("2026-09-12T07:10:00.000Z"),
              bot: { name: "Assistant", userId: "user-a" },
            },
          ]),
      },
    };

    const items = await listInbox(prisma as never, actor, "MEMBER");
    expect(items.map((item) => item.kind)).toEqual([
      "approval",
      "fyr_failed",
      "fyr_completed",
      "update",
    ]);
    expect(items[0]?.href).toBe("/app/approvals");
    expect(items[1]?.href).toBe("/app/fyrar/fyr-1");
  });
});
