import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { visibleBotOwnerUserId } from "./visible-bot.js";

const actor: Actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

describe("visibleBotOwnerUserId", () => {
  it("returns the owner when Admin looks up someone else's bot", async () => {
    const prisma = {
      bot: {
        findFirst: vi.fn().mockResolvedValue({ spaceId: "space-1", userId: "user-b" }),
      },
      spaceMember: {
        findUnique: vi.fn().mockResolvedValue({ role: "admin" }),
      },
      capabilityInstall: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    await expect(visibleBotOwnerUserId(prisma, actor, "bot-b")).resolves.toBe("user-b");
  });

  it("hides another member's private bot", async () => {
    const prisma = {
      bot: {
        findFirst: vi.fn().mockResolvedValue({ spaceId: "space-1", userId: "user-b" }),
      },
      spaceMember: {
        findUnique: vi.fn().mockResolvedValue({ role: "member" }),
      },
      capabilityInstall: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    await expect(visibleBotOwnerUserId(prisma, actor, "bot-b")).resolves.toBeNull();
  });

});
