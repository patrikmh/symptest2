import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  acceptSpaceInvitation,
  declineSpaceInvitation,
  inviteSpaceMember,
  LotsAccessError,
  listMyInvitations,
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

const invitee: Actor = {
  userId: "user-alex",
  spaceId: "personal-space",
  email: "Alex@Ratatosk.test",
  isDeploymentOwner: false,
};

describe("listMyInvitations", () => {
  it("returns pending invites for the signed-in email", async () => {
    const prisma = prismaMock({
      invitation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "inv-1",
            email: "alex@ratatosk.test",
            role: "member",
            expiresAt: new Date("2026-09-19T00:00:00.000Z"),
            organization: {
              name: "Ratatosk",
              spaces: [
                { id: "space-1", isDefault: true },
                { id: "space-2", isDefault: false },
              ],
            },
            user: { name: "Owner", email: "owner@ratatosk.test" },
          },
        ]),
      },
    });
    await expect(listMyInvitations(prisma, invitee)).resolves.toEqual([
      expect.objectContaining({
        id: "inv-1",
        spaceId: "space-1",
        organizationName: "Ratatosk",
        inviterName: "Owner",
        role: "member",
      }),
    ]);
  });
});

describe("acceptSpaceInvitation", () => {
  it("creates org and space memberships and marks the invite accepted", async () => {
    const memberUpsert = vi.fn().mockResolvedValue({});
    const spaceUpsert = vi.fn().mockResolvedValue({
      id: "sm-new",
      userId: "user-alex",
      role: "admin",
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      invitation: { updateMany },
      member: { upsert: memberUpsert },
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: "alex@ratatosk.test", name: "Alex" }),
      },
      spaceMember: { upsert: spaceUpsert },
    };
    const prisma = prismaMock({
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inv-1",
          email: "alex@ratatosk.test",
          role: "admin",
          status: "pending",
          expiresAt: new Date("2026-09-19T00:00:00.000Z"),
          organizationId: "org-1",
          organization: {
            id: "org-1",
            spaces: [{ id: "space-1", isDefault: true }],
          },
        }),
      },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    });
    const accepted = await acceptSpaceInvitation(prisma, invitee, "inv-1");
    expect(accepted.spaceId).toBe("space-1");
    expect(accepted.member).toEqual(
      expect.objectContaining({
        id: "sm-new",
        kind: "member",
        role: "admin",
        email: "alex@ratatosk.test",
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "inv-1", status: "pending" }),
        data: { status: "accepted" },
      }),
    );
    expect(memberUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: "org-1",
          userId: "user-alex",
          role: "admin",
        }),
      }),
    );
  });

  it("hides an invite addressed to someone else", async () => {
    const prisma = prismaMock({
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inv-1",
          email: "other@ratatosk.test",
          role: "member",
          status: "pending",
          expiresAt: new Date("2026-09-19T00:00:00.000Z"),
          organizationId: "org-1",
          organization: { id: "org-1", spaces: [{ id: "space-1", isDefault: true }] },
        }),
      },
    });
    await expect(acceptSpaceInvitation(prisma, invitee, "inv-1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("declineSpaceInvitation", () => {
  it("marks a matching pending invite declined", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = prismaMock({
      invitation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inv-1",
          email: "alex@ratatosk.test",
          role: "member",
          status: "pending",
          expiresAt: new Date("2026-09-19T00:00:00.000Z"),
        }),
        updateMany,
      },
    });
    await expect(declineSpaceInvitation(prisma, invitee, "inv-1")).resolves.toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "declined" } }),
    );
  });
});
