import { type Role, roleFromSpaceMember } from "@lots/access";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

export async function loadSpaceRole(prisma: PrismaClient, actor: Actor): Promise<Role> {
  const row = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: actor.spaceId, userId: actor.userId } },
    select: { role: true },
  });
  return roleFromSpaceMember(row?.role);
}

export async function loadOrganizationId(
  prisma: PrismaClient,
  spaceId: string,
): Promise<string | null> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { organizationId: true },
  });
  return space?.organizationId ?? null;
}
