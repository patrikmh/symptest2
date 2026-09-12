import { visibleTo } from "@lots/access";
import type { Actor, Bot } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { getLotsAgent, listLotsAgents } from "./agents.js";
import { loadSpaceRole } from "./role.js";
import { sharedOwnerUserIds } from "./teams.js";

/**
 * Visibility-aware bot list/get used by `lots.agents` and the thin adapters on
 * upstream `bots.get`, `spaces.list`, and `resolveThreadTarget`.
 */
export async function listVisibleBots(input: {
  prisma: PrismaClient;
  actor: Actor;
  listBots: (actor: Actor) => Promise<Bot[]>;
}): Promise<Bot[]> {
  const role = await loadSpaceRole(input.prisma, input.actor);
  const shared = await sharedOwnerUserIds(input.prisma, input.actor);
  return listLotsAgents({
    actor: input.actor,
    role,
    listBots: input.listBots,
    sharedOwnerUserIds: shared,
    listOwnerUserIds: async () => {
      const rows = await input.prisma.bot.findMany({
        where: { spaceId: input.actor.spaceId, archivedAt: null },
        select: { userId: true },
        distinct: ["userId"],
      });
      return rows.map((row) => row.userId);
    },
  });
}

export async function getVisibleBot(input: {
  prisma: PrismaClient;
  actor: Actor;
  botId: string;
  listBots: (actor: Actor) => Promise<Bot[]>;
}): Promise<Bot | null> {
  const role = await loadSpaceRole(input.prisma, input.actor);
  const shared = await sharedOwnerUserIds(input.prisma, input.actor);
  return getLotsAgent({
    actor: input.actor,
    role,
    botId: input.botId,
    sharedOwnerUserIds: shared,
    listBots: input.listBots,
    loadOwner: async (botId) => {
      const row = await input.prisma.bot.findFirst({
        where: { id: botId, spaceId: input.actor.spaceId, archivedAt: null },
        select: { spaceId: true, userId: true },
      });
      return row ? { spaceId: row.spaceId, ownerUserId: row.userId } : null;
    },
  });
}

/** Owner user id when the actor may open this bot; otherwise null. */
export async function visibleBotOwnerUserId(
  prisma: PrismaClient,
  actor: Actor,
  botId: string,
): Promise<string | null> {
  const row = await prisma.bot.findFirst({
    where: { id: botId, spaceId: actor.spaceId, archivedAt: null },
    select: { spaceId: true, userId: true },
  });
  if (!row) return null;
  const role = await loadSpaceRole(prisma, actor);
  const shared = await sharedOwnerUserIds(prisma, actor);
  return visibleTo(
    { userId: actor.userId, spaceId: actor.spaceId, role },
    {
      spaceId: row.spaceId,
      ownerUserId: row.userId,
      sharedViaTeam: shared.has(row.userId),
    },
  )
    ? row.userId
    : null;
}
