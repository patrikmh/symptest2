import { ORPCError } from "@orpc/server";
import type { JobPublisher } from "@rakazo/adapter-kit";
import type { Actor, Bot } from "@rakazo/contracts";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { getLotsAgent, listLotsAgents } from "./agents.js";
import { decideApproval, getApproval, LotsApprovalError, listApprovals } from "./approvals.js";
import {
  createFyr,
  getFyr,
  LotsFyrError,
  listFyrar,
  listFyrRuns,
  runFyrNow,
  setFyrEnabled,
  updateFyr,
} from "./fyrar.js";
import { listInbox } from "./inbox.js";
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
  if (error instanceof LotsFyrError) {
    throw new ORPCError(error.code, { message: error.message });
  }
  if (error instanceof LotsApprovalError) {
    throw new ORPCError(error.code, { message: error.message });
  }
  throw error;
}

export function createLotsRouter(args: {
  // Authed builder is the full app contract; oRPC ProcedureHandler types are not restated here.
  authed: any;
  prisma: PrismaClient;
  repos: { listBots: (actor: Actor) => Promise<Bot[]> };
  jobs: JobPublisher;
  events: Pick<ThreadEvents, "answerRunInput">;
}) {
  const { authed, prisma, repos, jobs, events } = args;

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
    fyrar: {
      list: authed.lots.fyrar.list.handler(async ({ context }: { context: { actor: Actor } }) => {
        try {
          const role = await loadSpaceRole(prisma, context.actor);
          return await listFyrar(prisma, context.actor, role);
        } catch (error) {
          mapAccessError(error);
        }
      }),
      get: authed.lots.fyrar.get.handler(
        async ({ context, input }: { context: { actor: Actor }; input: { fyrId: string } }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await getFyr(prisma, context.actor, role, input.fyrId);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      create: authed.lots.fyrar.create.handler(
        async ({
          context,
          input,
        }: {
          context: { actor: Actor };
          input: {
            botId: string;
            name: string;
            instruction: string;
            crons: string[];
            timezone: string;
            enabled: boolean;
          };
        }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await createFyr(prisma, jobs, context.actor, role, input);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      update: authed.lots.fyrar.update.handler(
        async ({
          context,
          input,
        }: {
          context: { actor: Actor };
          input: {
            fyrId: string;
            name?: string;
            instruction?: string;
            crons?: string[];
            timezone?: string;
            enabled?: boolean;
          };
        }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await updateFyr(prisma, jobs, context.actor, role, input);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      pause: authed.lots.fyrar.pause.handler(
        async ({ context, input }: { context: { actor: Actor }; input: { fyrId: string } }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await setFyrEnabled(prisma, jobs, context.actor, role, input.fyrId, false);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      resume: authed.lots.fyrar.resume.handler(
        async ({ context, input }: { context: { actor: Actor }; input: { fyrId: string } }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await setFyrEnabled(prisma, jobs, context.actor, role, input.fyrId, true);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      runNow: authed.lots.fyrar.runNow.handler(
        async ({ context, input }: { context: { actor: Actor }; input: { fyrId: string } }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await runFyrNow(prisma, jobs, context.actor, role, input.fyrId);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      runs: authed.lots.fyrar.runs.handler(
        async ({ context, input }: { context: { actor: Actor }; input: { fyrId: string } }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await listFyrRuns(prisma, context.actor, role, input.fyrId);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
    },
    approvals: {
      list: authed.lots.approvals.list.handler(
        async ({
          context,
          input,
        }: {
          context: { actor: Actor };
          input: { tab?: "pending" | "history" };
        }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await listApprovals(prisma, context.actor, role, input.tab ?? "pending");
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      get: authed.lots.approvals.get.handler(
        async ({
          context,
          input,
        }: {
          context: { actor: Actor };
          input: { approvalId: string };
        }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await getApproval(prisma, context.actor, role, input.approvalId);
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      approve: authed.lots.approvals.approve.handler(
        async ({
          context,
          input,
        }: {
          context: { actor: Actor };
          input: { approvalId: string };
        }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await decideApproval(
              prisma,
              events,
              jobs,
              context.actor,
              role,
              input.approvalId,
              "allow",
            );
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
      reject: authed.lots.approvals.reject.handler(
        async ({
          context,
          input,
        }: {
          context: { actor: Actor };
          input: { approvalId: string };
        }) => {
          try {
            const role = await loadSpaceRole(prisma, context.actor);
            return await decideApproval(
              prisma,
              events,
              jobs,
              context.actor,
              role,
              input.approvalId,
              "deny",
            );
          } catch (error) {
            mapAccessError(error);
          }
        },
      ),
    },
    inbox: {
      list: authed.lots.inbox.list.handler(async ({ context }: { context: { actor: Actor } }) => {
        try {
          const role = await loadSpaceRole(prisma, context.actor);
          return await listInbox(prisma, context.actor, role);
        } catch (error) {
          mapAccessError(error);
        }
      }),
    },
  };
}
