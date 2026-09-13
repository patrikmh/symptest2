import { can, type Role, visibleTo } from "@lots/access";
import { formatActivityEvent } from "@lots/core";
import type { ActivityItem, Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { sharedOwnerUserIds } from "./teams.js";

export class LotsActivityError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LotsActivityError";
  }
}

type EventRow = {
  id: string;
  spaceId: string;
  threadId: string;
  botId: string;
  type: string;
  payload: unknown;
  runId: string | null;
  createdAt: Date;
};

type BotRow = { id: string; name: string; userId: string; archivedAt: Date | null };

function notFound(): never {
  throw new LotsActivityError("NOT_FOUND", "Resource not found");
}

function owns(
  actor: Actor,
  role: Role,
  resource: { spaceId: string; ownerUserId: string },
  shared: boolean,
): boolean {
  return visibleTo(
    { userId: actor.userId, spaceId: actor.spaceId, role },
    { spaceId: resource.spaceId, ownerUserId: resource.ownerUserId, sharedViaTeam: shared },
  );
}

export async function listActivity(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
): Promise<ActivityItem[]> {
  const [rows, shared] = await Promise.all([
    prisma.event.findMany({
      where: { spaceId: actor.spaceId },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    sharedOwnerUserIds(prisma, actor),
  ]);
  return mapActivityRows(prisma, actor, role, rows, shared);
}

export async function getActivity(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  activityId: string,
): Promise<ActivityItem> {
  const row = await prisma.event.findFirst({
    where: { id: activityId, spaceId: actor.spaceId },
  });
  if (!row) notFound();
  const shared = await sharedOwnerUserIds(prisma, actor);
  const [item] = await mapActivityRows(prisma, actor, role, [row], shared);
  if (!item) notFound();
  return item;
}

async function mapActivityRows(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  rows: EventRow[],
  sharedOwners: Set<string>,
): Promise<ActivityItem[]> {
  if (rows.length === 0) return [];
  const botIds = [...new Set(rows.flatMap((row) => botIdsFrom(row)))];
  const bots = await prisma.bot.findMany({
    where: { id: { in: botIds }, spaceId: actor.spaceId },
    select: { id: true, name: true, userId: true, archivedAt: true },
  });
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const orgWide = can(role, "inspectActivity");
  const items: ActivityItem[] = [];
  for (const row of rows) {
    const bot = byId.get(row.botId);
    if (!bot || bot.archivedAt) continue;
    const shared = sharedOwners.has(bot.userId);
    if (!orgWide && !owns(actor, role, { spaceId: row.spaceId, ownerUserId: bot.userId }, shared)) {
      continue;
    }
    const peer = peerBot(row, byId);
    const line = formatActivityEvent({
      type: row.type,
      payload: row.payload,
      botName: bot.name,
      peerName: peer?.name ?? null,
    });
    items.push({
      id: row.id,
      kind: line.kind,
      text: line.text,
      botId: bot.id,
      botName: bot.name,
      href: `/app/${bot.id}`,
      createdAt: row.createdAt.toISOString(),
      detail: { ...line.detail, runId: row.runId ?? line.detail.runId },
    });
  }
  return items;
}

function botIdsFrom(row: EventRow): string[] {
  const ids = [row.botId];
  if (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) {
    const payload = row.payload as Record<string, unknown>;
    for (const key of ["toBotId", "childBotId", "agentId"]) {
      if (typeof payload[key] === "string") ids.push(payload[key]);
    }
  }
  return ids;
}

function peerBot(row: EventRow, bots: Map<string, BotRow>): BotRow | undefined {
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return;
  const payload = row.payload as Record<string, unknown>;
  for (const key of ["toBotId", "childBotId", "agentId"]) {
    const id = payload[key];
    if (typeof id === "string" && bots.has(id)) return bots.get(id);
  }
  return undefined;
}
