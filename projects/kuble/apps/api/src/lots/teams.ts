import { type Role, visibleTo } from "@lots/access";
import { LOTS_TEAM_KIND, teamRoleFromValue, teamRoleToValue } from "@lots/core";
import type { Actor, CreateLotsTeamInput, LotsTeam, LotsTeamRole } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

export class LotsTeamError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "LotsTeamError";
  }
}

type InstallRow = {
  id: string;
  spaceId: string;
  userId: string;
  name: string;
  config: unknown;
  createdAt: Date;
};

function notFound(): never {
  throw new LotsTeamError("NOT_FOUND", "Resource not found");
}

export async function sharedOwnerUserIds(prisma: PrismaClient, actor: Actor): Promise<Set<string>> {
  const teams = await listTeams(prisma, actor, "OWNER");
  const shared = new Set<string>();
  const viewerBots = await prisma.bot.findMany({
    where: { spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
    select: { id: true },
  });
  const mine = new Set(viewerBots.map((bot) => bot.id));
  const botOwners = await prisma.bot.findMany({
    where: { spaceId: actor.spaceId, archivedAt: null },
    select: { id: true, userId: true },
  });
  const ownerByBot = new Map(botOwners.map((bot) => [bot.id, bot.userId]));
  for (const team of teams) {
    if (!team.members.some((member) => mine.has(member.botId))) continue;
    for (const member of team.members) {
      const owner = ownerByBot.get(member.botId);
      if (owner) shared.add(owner);
    }
  }
  return shared;
}

export async function listTeams(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
): Promise<LotsTeam[]> {
  const rows = await prisma.capabilityInstall.findMany({
    where: { spaceId: actor.spaceId, kind: LOTS_TEAM_KIND },
    orderBy: { createdAt: "desc" },
  });
  const mapped = await Promise.all(rows.map((row) => mapTeam(prisma, actor, role, row)));
  return mapped.filter((team): team is LotsTeam => team !== null);
}

export async function getTeam(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  teamId: string,
): Promise<LotsTeam> {
  const row = await prisma.capabilityInstall.findFirst({
    where: { id: teamId, spaceId: actor.spaceId, kind: LOTS_TEAM_KIND },
  });
  if (!row) notFound();
  const team = await mapTeam(prisma, actor, role, row);
  if (!team) notFound();
  return team;
}

export async function createTeam(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  input: CreateLotsTeamInput,
): Promise<LotsTeam> {
  const roles = new Set(input.members.map((member) => member.role));
  if (!roles.has("lead")) {
    throw new LotsTeamError("BAD_REQUEST", "A team needs a lead coworker.");
  }
  const botIds = [...new Set(input.members.map((member) => member.botId))];
  if (botIds.length !== input.members.length) {
    throw new LotsTeamError("BAD_REQUEST", "Each coworker can appear once.");
  }
  const bots = await prisma.bot.findMany({
    where: { id: { in: botIds }, spaceId: actor.spaceId, archivedAt: null },
    select: { id: true, name: true, userId: true },
  });
  if (bots.length !== botIds.length) {
    throw new LotsTeamError("NOT_FOUND", "Resource not found");
  }
  for (const bot of bots) {
    if (
      !visibleTo(
        { userId: actor.userId, spaceId: actor.spaceId, role },
        { spaceId: actor.spaceId, ownerUserId: bot.userId },
      )
    ) {
      throw new LotsTeamError("NOT_FOUND", "Resource not found");
    }
  }
  const row = await prisma.capabilityInstall.create({
    data: {
      spaceId: actor.spaceId,
      userId: actor.userId,
      kind: LOTS_TEAM_KIND,
      name: input.name,
      source: "lots",
      config: {
        members: input.members.map((member) => ({
          botId: member.botId,
          role: teamRoleToValue(teamRoleFromValue(member.role)),
        })),
      },
    },
  });
  const team = await mapTeam(prisma, actor, role, row);
  if (!team) notFound();
  return team;
}

async function mapTeam(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  row: InstallRow,
): Promise<LotsTeam | null> {
  const config = row.config && typeof row.config === "object" ? row.config : {};
  const rawMembers = Array.isArray((config as { members?: unknown }).members)
    ? ((config as { members: Array<{ botId?: unknown; role?: unknown }> }).members ?? [])
    : [];
  const botIds = rawMembers
    .map((member) => member.botId)
    .filter((id): id is string => typeof id === "string");
  const bots = await prisma.bot.findMany({
    where: { id: { in: botIds }, spaceId: actor.spaceId, archivedAt: null },
    select: { id: true, name: true, userId: true },
  });
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const members = [];
  for (const entry of rawMembers) {
    if (typeof entry.botId !== "string") continue;
    const bot = byId.get(entry.botId);
    if (!bot) continue;
    if (
      !visibleTo(
        { userId: actor.userId, spaceId: actor.spaceId, role },
        { spaceId: actor.spaceId, ownerUserId: bot.userId },
      )
    ) {
      return null;
    }
    members.push({
      botId: bot.id,
      botName: bot.name,
      role: teamRoleToValue(teamRoleFromValue(typeof entry.role === "string" ? entry.role : "")),
    });
  }
  if (members.length < 2) return null;
  return {
    id: row.id,
    name: row.name,
    members: members as Array<{ botId: string; botName: string; role: LotsTeamRole }>,
    createdAt: row.createdAt.toISOString(),
  };
}
