import { randomUUID } from "node:crypto";
import {
  can,
  inviteDenial,
  type Role,
  roleChangeDenial,
  roleFromSpaceMember,
  roleToSpaceMember,
} from "@lots/access";
import type { Actor, SpaceMember as SpaceMemberDto, SpaceMembersList } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { loadOrganizationId } from "./role.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class LotsAccessError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "LotsAccessError";
  }
}

function requireManageMembers(role: Role) {
  if (!can(role, "manageMembers")) {
    throw new LotsAccessError("FORBIDDEN", "You cannot manage members.");
  }
}

function toMemberDto(row: {
  id: string;
  userId: string;
  role: string;
  member: { user: { email: string; name: string } };
}): SpaceMemberDto {
  return {
    id: row.id,
    userId: row.userId,
    email: row.member.user.email,
    name: row.member.user.name,
    role: roleToSpaceMember(roleFromSpaceMember(row.role)),
    kind: "member",
    expiresAt: null,
  };
}

function toInvitationDto(row: {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
}): SpaceMemberDto {
  return {
    id: row.id,
    userId: null,
    email: row.email,
    name: row.email,
    role: roleToSpaceMember(roleFromSpaceMember(row.role)),
    kind: "invitation",
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function listSpaceMembers(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
): Promise<SpaceMembersList> {
  requireManageMembers(role);
  const organizationId = await loadOrganizationId(prisma, actor.spaceId);
  if (!organizationId) throw new LotsAccessError("NOT_FOUND", "Workspace not found.");

  const [memberships, invitations, ownerCount] = await Promise.all([
    prisma.spaceMember.findMany({
      where: { spaceId: actor.spaceId },
      include: { member: { include: { user: { select: { email: true, name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { organizationId, status: "pending" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.spaceMember.count({ where: { spaceId: actor.spaceId, role: "owner" } }),
  ]);

  return {
    viewerRole: roleToSpaceMember(role),
    ownerCount,
    members: [...memberships.map(toMemberDto), ...invitations.map(toInvitationDto)],
  };
}

export async function inviteSpaceMember(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  input: { email: string; role: "owner" | "admin" | "member" },
): Promise<SpaceMemberDto> {
  requireManageMembers(role);
  const invitedRole = roleFromSpaceMember(input.role);
  if (inviteDenial(role, invitedRole)) {
    throw new LotsAccessError("FORBIDDEN", "You cannot invite someone with that role.");
  }
  const organizationId = await loadOrganizationId(prisma, actor.spaceId);
  if (!organizationId) throw new LotsAccessError("NOT_FOUND", "Workspace not found.");

  const email = input.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    const already = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: actor.spaceId, userId: existingUser.id } },
      select: { id: true },
    });
    if (already) throw new LotsAccessError("CONFLICT", "That person is already a member.");
  }
  const pending = await prisma.invitation.findFirst({
    where: { organizationId, email, status: "pending" },
    select: { id: true },
  });
  if (pending) throw new LotsAccessError("CONFLICT", "That email already has a pending invite.");

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const created = await prisma.invitation.create({
    data: {
      id: randomUUID(),
      organizationId,
      email,
      role: roleToSpaceMember(invitedRole),
      status: "pending",
      expiresAt,
      createdAt: new Date(),
      inviterId: actor.userId,
    },
  });
  return toInvitationDto(created);
}

export async function updateSpaceMemberRole(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  input: { memberId: string; role: "owner" | "admin" | "member" },
): Promise<SpaceMemberDto> {
  requireManageMembers(role);
  const target = await prisma.spaceMember.findFirst({
    where: { id: input.memberId, spaceId: actor.spaceId },
    include: { member: { include: { user: { select: { email: true, name: true } } } } },
  });
  if (!target) throw new LotsAccessError("NOT_FOUND", "Member not found.");

  const nextRole = roleFromSpaceMember(input.role);
  const ownerCount = await prisma.spaceMember.count({
    where: { spaceId: actor.spaceId, role: "owner" },
  });
  const denial = roleChangeDenial({
    actorRole: role,
    targetRole: roleFromSpaceMember(target.role),
    nextRole,
    ownerCount,
  });
  if (denial === "last_owner") {
    throw new LotsAccessError("BAD_REQUEST", "Cannot remove the final Owner.");
  }
  if (denial) throw new LotsAccessError("FORBIDDEN", "You cannot change that role.");

  const stored = roleToSpaceMember(nextRole);
  const [updated] = await prisma.$transaction([
    prisma.spaceMember.update({
      where: { id: target.id },
      data: { role: stored },
      include: { member: { include: { user: { select: { email: true, name: true } } } } },
    }),
    prisma.member.update({
      where: {
        organizationId_userId: { organizationId: target.organizationId, userId: target.userId },
      },
      data: { role: stored },
    }),
  ]);
  return toMemberDto(updated);
}
