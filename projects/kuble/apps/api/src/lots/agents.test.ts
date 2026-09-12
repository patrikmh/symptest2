import type { Actor, Bot } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { getLotsAgent, listLotsAgents } from "./agents.js";

const actorA: Actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

function bot(id: string): Bot {
  return {
    id,
    spaceId: "space-1",
    name: id,
    title: "",
    description: "",
    instructions: "",
    color: "#FFD86B",
    notifyOnFinish: true,
    pinned: false,
    sectionId: null,
    archivedAt: null,
    unread: false,
    parentBotId: null,
    memoryScope: null,
    threadId: `thread-${id}`,
    preview: "",
    status: "idle",
    computerMode: "team",
    updatedAt: "2026-09-12T00:00:00.000Z",
    createdAt: "2026-09-12T00:00:00.000Z",
    voiceId: null,
    autoSpeak: false,
    modelProvider: null,
    modelId: null,
    thinkingLevel: null,
    teamChatAmbientEnabled: false,
    teamChatRules: "",
    webhookConfigured: false,
    spawnKey: null,
  };
}

describe("listLotsAgents", () => {
  it("returns only the member's own bots", async () => {
    const listBots = vi.fn(async (listed: Actor) =>
      listed.userId === "user-a" ? [bot("a-1")] : [bot("b-1")],
    );
    const listed = await listLotsAgents({
      actor: actorA,
      role: "MEMBER",
      listBots,
      listOwnerUserIds: async () => ["user-a", "user-b"],
    });
    expect(listed.map((item) => item.id)).toEqual(["a-1"]);
    expect(listBots).toHaveBeenCalledTimes(1);
  });

  it("returns every owner's bots for Admin and Owner", async () => {
    const listBots = vi.fn(async (listed: Actor) => [bot(`${listed.userId}-bot`)]);
    const listed = await listLotsAgents({
      actor: actorA,
      role: "ADMIN",
      listBots,
      listOwnerUserIds: async () => ["user-a", "user-b"],
    });
    expect(listed.map((item) => item.id)).toEqual(["user-a-bot", "user-b-bot"]);
  });
});

describe("getLotsAgent", () => {
  const own = bot("a-1");
  const other = bot("b-1");

  it("returns 404-equivalent null when a Member asks for someone else's agent", async () => {
    const found = await getLotsAgent({
      actor: actorA,
      role: "MEMBER",
      botId: "b-1",
      listBots: async () => [other],
      loadOwner: async () => ({ spaceId: "space-1", ownerUserId: "user-b" }),
    });
    expect(found).toBeNull();
  });

  it("returns the agent for Admin and Owner", async () => {
    const listBots = vi.fn(async () => [other]);
    await expect(
      getLotsAgent({
        actor: actorA,
        role: "ADMIN",
        botId: "b-1",
        listBots,
        loadOwner: async () => ({ spaceId: "space-1", ownerUserId: "user-b" }),
      }),
    ).resolves.toEqual(other);
    await expect(
      getLotsAgent({
        actor: { ...actorA, userId: "owner-1" },
        role: "OWNER",
        botId: "b-1",
        listBots,
        loadOwner: async () => ({ spaceId: "space-1", ownerUserId: "user-b" }),
      }),
    ).resolves.toEqual(other);
  });

  it("returns the member's own agent", async () => {
    await expect(
      getLotsAgent({
        actor: actorA,
        role: "MEMBER",
        botId: "a-1",
        listBots: async () => [own],
        loadOwner: async () => ({ spaceId: "space-1", ownerUserId: "user-a" }),
      }),
    ).resolves.toEqual(own);
  });
});
