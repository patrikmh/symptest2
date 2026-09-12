import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  inviteSpaceMember,
  LotsAccessError,
  listSpaceMembers,
  updateSpaceMemberRole,
} from "./members.js";

const owner: Actor = {
  userId: "user-owner",
  spaceId: "space-1",
  email: "owner@ratatosk.test",
  isDeploymentOwner: true,
};

function prismaMock(partial: Record<string, unknown>) {
  return partial as unknown as PrismaClient;
}

describe("listSpaceMembers", () => {
  it("forbids Members", async () => {
    await expect(listSpaceMembers(prismaMock({}), owner, "MEMBER")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns members and pending invitations", async () => {
    const prisma = prismaMock({
      space: { findUnique: vi.fn().mockResolvedValue({ organizationId: "org-1" }) },
      spaceMember: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sm-1",
            userId: "user-owner",
            role: "owner",
            member: { user: { email: "owner@ratatosk.test", name: "Owner" } },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      invitation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "inv-1",
            email: "new@ratatosk.test",
            role: "member",
            expiresAt: new Date("2026-09-19T00:00:00.000Z"),
          },
        ]),
      },
    });
    const listed = await listSpaceMembers(prisma, owner, "OWNER");
    expect(listed.viewerRole).toBe("owner");
    expect(listed.ownerCount).toBe(1);
    expect(listed.members).toEqual([
      expect.objectContaining({ id: "sm-1", kind: "member", role: "owner" }),
      expect.objectContaining({ id: "inv-1", kind: "invitation", email: "new@ratatosk.test" }),
    ]);
  });
});

describe("inviteSpaceMember", () => {
  it("creates a pending Invitation", async () => {
    const create = vi.fn().mockImplementation(async ({ data }: { data: { email: string } }) => ({
      id: "inv-new",
      email: data.email,
      role: "member",
      expiresAt: new Date("2026-09-19T00:00:00.000Z"),
    }));
    const prisma = prismaMock({
      space: { findUnique: vi.fn().mockResolvedValue({ organizationId: "org-1" }) },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      invitation: { findFirst: vi.fn().mockResolvedValue(null), create },
    });
    const invited = await inviteSpaceMember(prisma, owner, "OWNER", {
      email: "Alex@Ratatosk.test",
      role: "member",
    });
    expect(invited.kind).toBe("invitation");
    expect(invited.email).toBe("alex@ratatosk.test");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "alex@ratatosk.test",
          role: "member",
          status: "pending",
          organizationId: "org-1",
          inviterId: "user-owner",
        }),
      }),
    );
  });

  it("rejects a duplicate pending invite", async () => {
    const prisma = prismaMock({
      space: { findUnique: vi.fn().mockResolvedValue({ organizationId: "org-1" }) },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      invitation: { findFirst: vi.fn().mockResolvedValue({ id: "inv-1" }), create: vi.fn() },
    });
    await expect(
      inviteSpaceMember(prisma, owner, "OWNER", { email: "alex@ratatosk.test", role: "member" }),
    ).rejects.toBeInstanceOf(LotsAccessError);
  });

  it("forbids Admin from inviting an Admin", async () => {
    await expect(
      inviteSpaceMember(prismaMock({}), owner, "ADMIN", { email: "a@x.test", role: "admin" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("updateSpaceMemberRole", () => {
  it("persists OWNER / ADMIN / MEMBER on both SpaceMember and Member", async () => {
    const spaceMemberUpdate = vi.fn().mockResolvedValue({
      id: "sm-2",
      userId: "user-2",
      role: "admin",
      member: { user: { email: "pat@ratatosk.test", name: "Pat" } },
    });
    const memberUpdate = vi.fn().mockResolvedValue({});
    const prisma = prismaMock({
      spaceMember: {
        findFirst: vi.fn().mockResolvedValue({
          id: "sm-2",
          userId: "user-2",
          organizationId: "org-1",
          role: "member",
          member: { user: { email: "pat@ratatosk.test", name: "Pat" } },
        }),
        count: vi.fn().mockResolvedValue(1),
        update: spaceMemberUpdate,
      },
      member: { update: memberUpdate },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    });
    const updated = await updateSpaceMemberRole(prisma, owner, "OWNER", {
      memberId: "sm-2",
      role: "admin",
    });
    expect(updated.role).toBe("admin");
    expect(spaceMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "admin" } }),
    );
    expect(memberUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { role: "admin" } }));
  });

  it("rejects removing the last Owner", async () => {
    const prisma = prismaMock({
      spaceMember: {
        findFirst: vi.fn().mockResolvedValue({
          id: "sm-1",
          userId: "user-owner",
          organizationId: "org-1",
          role: "owner",
          member: { user: { email: owner.email, name: "Owner" } },
        }),
        count: vi.fn().mockResolvedValue(1),
      },
    });
    await expect(
      updateSpaceMemberRole(prisma, owner, "OWNER", { memberId: "sm-1", role: "member" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Cannot remove the final Owner.",
    });
  });
});
