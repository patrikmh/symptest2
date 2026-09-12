import { RPCHandler } from "@orpc/server/fetch";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "../router.js";

const spaceId = "workspace-1";

function actor(userId: string): Actor {
  return {
    spaceId,
    userId,
    email: `${userId}@ratatosk.test`,
    isDeploymentOwner: userId === "owner-1",
  };
}

const otherBotRow = {
  id: "bot-b",
  spaceId,
  userId: "user-b",
  name: "B's coworker",
  title: "",
  description: "",
  instructions: "",
  color: "#FFD86B",
  notifyOnFinish: true,
  pinned: false,
  position: 0,
  sectionId: null,
  archivedAt: null,
  parentBotId: null,
  memoryScope: null,
  createdAt: new Date("2026-09-12T00:00:00.000Z"),
  updatedAt: new Date("2026-09-12T00:00:00.000Z"),
  thread: { id: "thread-b", unread: false, messages: [] },
  runs: [],
  computer: null,
};

function lotsDeps(role: string) {
  const prisma = {
    spaceMember: {
      findUnique: vi.fn().mockResolvedValue({ role }),
    },
    bot: {
      findFirst: vi.fn().mockResolvedValue({ spaceId, userId: "user-b" }),
      findMany: vi.fn().mockResolvedValue([otherBotRow]),
    },
    run: { findMany: vi.fn().mockResolvedValue([]) },
    routine: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    externalEffect: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    message: { findMany: vi.fn().mockResolvedValue([]) },
    capabilityInstall: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    connection: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    spaceModelPreference: { findFirst: vi.fn().mockResolvedValue(null) },
    deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
  const deps = {
    prisma,
    env: {
      defaultProvider: "fake",
      defaultModel: "fake-model",
      webOrigin: "http://127.0.0.1:5173",
      screenProxySecret: "fake-test-secret",
      sandboxProvider: "fake",
    },
    dataDir: "/tmp/rakazo-lots-router-test",
    jobs: { enqueue: vi.fn(), cancel: vi.fn(), close: vi.fn() },
    events: { answerRunInput: vi.fn() },
    secrets: { put: vi.fn() },
  } as unknown as RouterDeps;
  return { prisma, handler: new RPCHandler(createRouter(deps)) };
}

async function getAgent(handler: RPCHandler<unknown>, userId: string, botId = "bot-b") {
  return handler.handle(
    new Request("http://127.0.0.1/rpc/lots/agents/get", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { botId } }),
    }),
    { prefix: "/rpc", context: { actor: actor(userId) } },
  );
}

async function getFyr(handler: RPCHandler<unknown>, userId: string, fyrId = "fyr-b") {
  return handler.handle(
    new Request("http://127.0.0.1/rpc/lots/fyrar/get", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { fyrId } }),
    }),
    { prefix: "/rpc", context: { actor: actor(userId) } },
  );
}

async function getApprovalRpc(handler: RPCHandler<unknown>, userId: string, approvalId = "e-b") {
  return handler.handle(
    new Request("http://127.0.0.1/rpc/lots/approvals/get", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { approvalId } }),
    }),
    { prefix: "/rpc", context: { actor: actor(userId) } },
  );
}

describe("lots.agents.get", () => {
  it("returns 404 when a Member asks for another member's agent", async () => {
    const { handler } = lotsDeps("member");
    const { response } = await getAgent(handler, "user-a");
    expect(response.status).toBe(404);
  });

  it("returns the agent for Admin and Owner", async () => {
    for (const [role, userId] of [
      ["admin", "admin-1"],
      ["owner", "owner-1"],
    ] as const) {
      const { handler } = lotsDeps(role);
      const { response } = await getAgent(handler, userId);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        json: expect.objectContaining({ id: "bot-b", name: "B's coworker" }),
      });
    }
  });
});

const otherFyrRow = {
  id: "fyr-b",
  spaceId,
  botId: "bot-b",
  userId: "user-b",
  name: "Morning brief",
  prompt: "Summarise overnight email",
  crons: ["0 9 * * 1-5"],
  timezone: "UTC",
  active: true,
  nextRunAt: new Date("2026-09-14T09:00:00.000Z"),
  lastRunAt: null,
  createdAt: new Date("2026-09-12T00:00:00.000Z"),
  bot: { name: "B's coworker", userId: "user-b", archivedAt: null },
};

describe("lots.fyrar.get", () => {
  it("returns 404 when a Member asks for another member's fyr", async () => {
    const { prisma, handler } = lotsDeps("member");
    vi.mocked(prisma.routine.findFirst).mockResolvedValue(otherFyrRow as never);
    const { response } = await getFyr(handler, "user-a");
    expect(response.status).toBe(404);
  });

  it("returns the fyr for Admin and Owner", async () => {
    for (const [role, userId] of [
      ["admin", "admin-1"],
      ["owner", "owner-1"],
    ] as const) {
      const { prisma, handler } = lotsDeps(role);
      vi.mocked(prisma.routine.findFirst).mockResolvedValue(otherFyrRow as never);
      const { response } = await getFyr(handler, userId);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        json: expect.objectContaining({
          id: "fyr-b",
          name: "Morning brief",
          botName: "B's coworker",
          schedule: "Weekdays at 9:00 AM",
        }),
      });
    }
  });
});

const otherApprovalRow = {
  id: "e-b",
  spaceId,
  runId: "run-b",
  kind: "gmail_send_email",
  status: "intended",
  request: { to: "anna@example.com", subject: "Follow-up" },
  createdAt: new Date("2026-09-12T10:00:00.000Z"),
  run: {
    threadId: "thread-b",
    botId: "bot-b",
    bot: { name: "B's coworker", userId: "user-b", archivedAt: null },
  },
};

describe("lots.approvals.get", () => {
  it("returns 404 when a Member asks for another member's approval", async () => {
    const { prisma, handler } = lotsDeps("member");
    vi.mocked(prisma.externalEffect.findFirst).mockResolvedValue(otherApprovalRow as never);
    const { response } = await getApprovalRpc(handler, "user-a");
    expect(response.status).toBe(404);
  });

  it("returns the approval for Admin and Owner", async () => {
    for (const [role, userId] of [
      ["admin", "admin-1"],
      ["owner", "owner-1"],
    ] as const) {
      const { prisma, handler } = lotsDeps(role);
      vi.mocked(prisma.externalEffect.findFirst).mockResolvedValue(otherApprovalRow as never);
      const { response } = await getApprovalRpc(handler, userId);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        json: expect.objectContaining({
          id: "e-b",
          botName: "B's coworker",
          status: "PENDING",
          summary: "gmail_send_email → anna@example.com",
        }),
      });
    }
  });
});
