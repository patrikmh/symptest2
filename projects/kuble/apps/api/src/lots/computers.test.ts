import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { getLotsComputer, LotsComputerError, listLotsComputers } from "./computers.js";

const member: Actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

function row(id: string, userId: string, scope: "team" | "dedicated") {
  return {
    id,
    spaceId: "space-1",
    userId,
    scope,
    state: "stopped",
    kind: "docker",
    bots: [{ id: `${id}-bot`, name: id }],
  };
}

describe("listLotsComputers", () => {
  it("shows a Member their own computer and team-scoped computers", async () => {
    const prisma = {
      computer: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            row("own", "user-a", "dedicated"),
            row("team", "user-b", "team"),
            row("hidden", "user-b", "dedicated"),
          ]),
      },
    } as unknown as PrismaClient;
    const listed = await listLotsComputers(prisma, member, "MEMBER");
    expect(listed.map((item) => item.id)).toEqual(["own", "team"]);
  });

  it("shows every computer in the space to Admin", async () => {
    const prisma = {
      computer: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            row("own", "user-a", "dedicated"),
            row("hidden", "user-b", "dedicated"),
          ]),
      },
    } as unknown as PrismaClient;
    const listed = await listLotsComputers(prisma, member, "ADMIN");
    expect(listed.map((item) => item.id)).toEqual(["own", "hidden"]);
  });
});

describe("getLotsComputer", () => {
  it("hides another member's dedicated computer", async () => {
    const prisma = {
      computer: {
        findFirst: vi.fn().mockResolvedValue(row("hidden", "user-b", "dedicated")),
      },
    } as unknown as PrismaClient;
    await expect(getLotsComputer(prisma, member, "MEMBER", "hidden")).rejects.toBeInstanceOf(
      LotsComputerError,
    );
  });
});
