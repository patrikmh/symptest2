import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { listActivity } from "./activity.js";

const actor: Actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

describe("listActivity", () => {
  it("hides another member's events from a Member and redacts tokens", async () => {
    const prisma = {
      event: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "ev-own",
            spaceId: "space-1",
            threadId: "th-a",
            botId: "bot-a",
            type: "thread.subagent",
            payload: { name: "Reviewer", task: "review the brief", access_token: "secret-token" },
            runId: "run-a",
            createdAt: new Date("2026-09-12T08:00:00.000Z"),
          },
          {
            id: "ev-other",
            spaceId: "space-1",
            threadId: "th-b",
            botId: "bot-b",
            type: "run.completed",
            payload: {},
            runId: "run-b",
            createdAt: new Date("2026-09-12T08:01:00.000Z"),
          },
        ]),
      },
      bot: {
        findMany: vi.fn().mockResolvedValue([
          { id: "bot-a", name: "Researcher", userId: "user-a", archivedAt: null },
          { id: "bot-b", name: "Other", userId: "user-b", archivedAt: null },
        ]),
      },
      capabilityInstall: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const items = await listActivity(prisma as never, actor, "MEMBER");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "delegation",
      text: "Researcher asked Reviewer to review the brief",
      botName: "Researcher",
    });
    expect(JSON.stringify(items)).not.toContain("secret-token");
  });

  it("lets Admin inspect the whole space", async () => {
    const prisma = {
      event: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "ev-other",
            spaceId: "space-1",
            threadId: "th-b",
            botId: "bot-b",
            type: "run.completed",
            payload: {},
            runId: "run-b",
            createdAt: new Date("2026-09-12T08:01:00.000Z"),
          },
        ]),
      },
      bot: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "bot-b", name: "Other", userId: "user-b", archivedAt: null }]),
      },
      capabilityInstall: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const items = await listActivity(prisma as never, actor, "ADMIN");
    expect(items.map((item) => item.botName)).toEqual(["Other"]);
  });
});
