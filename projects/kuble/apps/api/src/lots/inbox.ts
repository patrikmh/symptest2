import { type Role, visibleTo } from "@lots/access";
import { isStaleIntended } from "@lots/approvals";
import { fyrarStatusFromRunStatus } from "@lots/core";
import type { Actor, InboxItem } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { listApprovals } from "./approvals.js";

function owns(
  actor: Actor,
  role: Role,
  resource: { spaceId: string; ownerUserId: string },
): boolean {
  return visibleTo(
    { userId: actor.userId, spaceId: actor.spaceId, role },
    { spaceId: resource.spaceId, ownerUserId: resource.ownerUserId },
  );
}

/** Inbox (spec §30): pending approvals, failed Fyrar, completed Fyrar, then updates. */
export async function listInbox(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
): Promise<InboxItem[]> {
  const [approvals, fyrRuns, updates] = await Promise.all([
    listApprovals(prisma, actor, role, "pending"),
    prisma.run.findMany({
      where: {
        spaceId: actor.spaceId,
        routineId: { not: null },
        status: { in: ["failed", "completed"] },
      },
      include: {
        bot: { select: { name: true, userId: true } },
        routine: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.run.findMany({
      where: {
        spaceId: actor.spaceId,
        routineId: null,
        status: "completed",
      },
      include: { bot: { select: { name: true, userId: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const items: InboxItem[] = approvals
    .filter((approval) => !isStaleIntended(approval.createdAt))
    .map((approval) => ({
      kind: "approval" as const,
      id: `approval:${approval.id}`,
      title: `${approval.botName} needs a yes`,
      subtitle: approval.summary,
      href: "/app/approvals",
      createdAt: approval.createdAt,
    }));

  for (const run of fyrRuns) {
    if (!owns(actor, role, { spaceId: actor.spaceId, ownerUserId: run.bot.userId })) continue;
    const failed = fyrarStatusFromRunStatus(run.status) === "FAILED";
    items.push({
      kind: failed ? "fyr_failed" : "fyr_completed",
      id: `fyr:${run.id}`,
      title: failed
        ? `${run.routine?.name ?? "Fyr"} failed`
        : `${run.routine?.name ?? "Fyr"} finished`,
      subtitle: run.bot.name,
      href: run.routineId ? `/app/fyrar/${run.routineId}` : `/app/${run.botId}`,
      createdAt: (run.completedAt ?? run.createdAt).toISOString(),
    });
  }

  for (const run of updates) {
    if (!owns(actor, role, { spaceId: actor.spaceId, ownerUserId: run.bot.userId })) continue;
    items.push({
      kind: "update",
      id: `run:${run.id}`,
      title: `${run.bot.name} finished`,
      subtitle: "Open the coworker to read what they wrote.",
      href: `/app/${run.botId}`,
      createdAt: (run.completedAt ?? run.createdAt).toISOString(),
    });
  }

  const rank = { approval: 0, fyr_failed: 1, fyr_completed: 2, update: 3 };
  return items.sort((left, right) => {
    const byKind = rank[left.kind] - rank[right.kind];
    if (byKind !== 0) return byKind;
    return right.createdAt.localeCompare(left.createdAt);
  });
}
