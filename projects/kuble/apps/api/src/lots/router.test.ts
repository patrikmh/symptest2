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
