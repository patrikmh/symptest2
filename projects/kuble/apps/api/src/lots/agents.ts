import { type Role, visibleTo } from "@lots/access";
import type { Actor, Bot } from "@rakazo/contracts";

/**
 * Members see their own bots via upstream `listBots`. Owner/Admin also see
 * every other owner's bots in the space (spec §7). `bots.list` stays unchanged.
 */
export async function listLotsAgents(input: {
  actor: Actor;
  role: Role;
  listBots: (actor: Actor) => Promise<Bot[]>;
  listOwnerUserIds: () => Promise<string[]>;
}): Promise<Bot[]> {
  const canSeeOthers = visibleTo(
    { userId: input.actor.userId, spaceId: input.actor.spaceId, role: input.role },
    { spaceId: input.actor.spaceId, ownerUserId: "__other__" },
  );
  if (!canSeeOthers) return input.listBots(input.actor);

  const ownerIds = await input.listOwnerUserIds();
  const unique = [...new Set(ownerIds.length > 0 ? ownerIds : [input.actor.userId])];
  const lists = await Promise.all(
    unique.map((userId) => input.listBots({ ...input.actor, userId })),
  );
  return lists.flat();
}

export async function getLotsAgent(input: {
  actor: Actor;
  role: Role;
  botId: string;
  loadOwner: (botId: string) => Promise<{ spaceId: string; ownerUserId: string } | null>;
  listBots: (actor: Actor) => Promise<Bot[]>;
}): Promise<Bot | null> {
  const resource = await input.loadOwner(input.botId);
  if (!resource) return null;
  if (
    !visibleTo(
      { userId: input.actor.userId, spaceId: input.actor.spaceId, role: input.role },
      resource,
    )
  ) {
    return null;
  }
  const bots = await input.listBots({ ...input.actor, userId: resource.ownerUserId });
  return bots.find((bot) => bot.id === input.botId) ?? null;
}
