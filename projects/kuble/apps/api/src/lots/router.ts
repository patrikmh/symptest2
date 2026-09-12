import { ORPCError } from "@orpc/server";
import type { Actor, Bot } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { getLotsAgent, listLotsAgents } from "./agents.js";
import {
  inviteSpaceMember,
  LotsAccessError,
  listSpaceMembers,
  updateSpaceMemberRole,
} from "./members.js";
import { loadSpaceRole } from "./role.js";

function mapAccessError(error: unknown): never {
  if (error instanceof LotsAccessError) {
    throw new ORPCError(error.code, { message: error.message });
  }
  throw error;
}

export function createLotsRouter(args: {
  // Authed builder is the full app contract; oRPC ProcedureHandler types are not restated here.
  authed: any;
  prisma: PrismaClient;
  repos: { listBots: (actor: Actor) => Promise<Bot[]> };
}) {
  const { authed, prisma, repos } = args;

  return {
    agents: {
      list: authed.lots.agents.list.handler(async ({ context }: { context: { actor: Actor } }) => {
        const role = await loadSpaceRole(prisma, context.actor);
        return listLotsAgents({
          actor: context.actor,
          role,
          listBots: (actor) => repos.listBots(actor),
          listOwnerUserIds: async () => {
            const rows = await prisma.bot.findMany({
              where: { spaceId: context.actor.spaceId, archivedAt: null },
              select: { userId: true },
              distinct: ["userId"],
            });
            return rows.map((row) => row.userId);
          },
        });
      }),
      get: authed.lots.agents.get.handler(
        async ({ context, input }: { context: { actor: Actor }; input: { botId: string } }) => {
          const role = await loadSpaceRole(prisma, context.actor);
          const found = await getLotsAgent({
            actor: context.actor,
            role,
            botId: input.botId,
            listBots: (actor) => repos.listBots(actor),
            loadOwner: async (botId) => {
              const row = await prisma.bot.findFirst({
                where: { id: botId, spaceId: context.actor.spaceId, archivedAt: null },
                select: { spaceId: true, userId: true },
              });
              return row ? { spaceId: row.spaceId, ownerUserId: row.userId } : null;
            },
          });
          if (!found) throw new ORPCError("NOT_FOUND", { message: "Resource not found" });
          return found;
        },
      ),
    },
    admin: {
      members: {
        list: authed.lots.admin.members.list.handler(
          async ({ context }: { context: { actor: Actor } }) => {
            try {
              const role = await loadSpaceRole(prisma, context.actor);
              return await listSpaceMembers(prisma, context.actor, role);
            } catch (error) {
              mapAccessError(error);
            }
          },
        ),
        invite: authed.lots.admin.members.invite.handler(
          async ({
            context,
            input,
          }: {
            context: { actor: Actor };
            input: { email: string; role: "owner" | "admin" | "member" };
          }) => {
            try {
              const role = await loadSpaceRole(prisma, context.actor);
              return await inviteSpaceMember(prisma, context.actor, role, input);
            } catch (error) {
              mapAccessError(error);
            }
          },
        ),
        updateRole: authed.lots.admin.members.updateRole.handler(
          async ({
            context,
            input,
          }: {
            context: { actor: Actor };
            input: { memberId: string; role: "owner" | "admin" | "member" };
          }) => {
            try {
              const role = await loadSpaceRole(prisma, context.actor);
              return await updateSpaceMemberRole(prisma, context.actor, role, input);
            } catch (error) {
              mapAccessError(error);
            }
          },
        ),
      },
    },
  };
}
