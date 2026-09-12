import { type Role, visibleTo } from "@lots/access";
import { fyrarStatusFromRunStatus } from "@lots/core";
import {
  type JobPublisher,
  routineJobKey,
  routineWakeupJob,
  runContinueJob,
} from "@rakazo/adapter-kit";
import type { Actor, Fyr, FyrRun } from "@rakazo/contracts";
import {
  formatCron,
  hasMixedOneShotSchedule,
  isOneShotRoutineCrons,
  nextCronDateAcrossStrict,
} from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";

export class LotsFyrError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "LotsFyrError";
  }
}

export type FyrRow = {
  id: string;
  spaceId: string;
  botId: string;
  userId: string;
  name: string;
  prompt: string;
  crons: string[];
  timezone: string;
  active: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  createdAt: Date;
  bot: { name: string; userId: string; archivedAt: Date | null };
};

export type FyrRunRow = {
  id: string;
  routineId: string | null;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  error: string | null;
};

const botSelect = { name: true, userId: true, archivedAt: true } as const;

export function fyrScheduleWords(crons: string[]): string {
  return crons.map((cron) => formatCron(cron)).join(" · ");
}

export function assertRecurringFyrCrons(crons: string[]): void {
  if (crons.length === 0) {
    throw new LotsFyrError("BAD_REQUEST", "Add a repeating schedule.");
  }
  if (hasMixedOneShotSchedule(crons) || isOneShotRoutineCrons(crons)) {
    throw new LotsFyrError("BAD_REQUEST", "Fyrar need a repeating schedule.");
  }
}

export function nextFyrRunAt(crons: string[], timezone: string, enabled: boolean): Date | null {
  if (!enabled) return null;
  let next: Date | null;
  try {
    next = nextCronDateAcrossStrict(crons, new Date(), timezone);
  } catch {
    throw new LotsFyrError("BAD_REQUEST", "Enter a valid schedule.");
  }
  if (!next) throw new LotsFyrError("BAD_REQUEST", "Enter a valid schedule.");
  return next;
}

export function mapFyr(row: FyrRow): Fyr {
  return {
    id: row.id,
    botId: row.botId,
    botName: row.bot.name,
    name: row.name,
    instruction: row.prompt,
    crons: row.crons,
    schedule: fyrScheduleWords(row.crons),
    timezone: row.timezone,
    enabled: row.active,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapFyrRun(row: FyrRunRow): FyrRun {
  return {
    id: row.id,
    fyrId: row.routineId ?? "",
    status: fyrarStatusFromRunStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    error: row.error,
  };
}

export function fyrVisibleTo(
  actor: Actor,
  role: Role,
  resource: { spaceId: string; ownerUserId: string },
): boolean {
  return visibleTo(
    { userId: actor.userId, spaceId: actor.spaceId, role },
    { spaceId: resource.spaceId, ownerUserId: resource.ownerUserId },
  );
}

function notFound(): never {
  throw new LotsFyrError("NOT_FOUND", "Resource not found");
}

function requireVisible(actor: Actor, role: Role, row: FyrRow): void {
  if (row.bot.archivedAt) notFound();
  if (!fyrVisibleTo(actor, role, { spaceId: row.spaceId, ownerUserId: row.bot.userId })) {
    notFound();
  }
}

export async function listFyrar(prisma: PrismaClient, actor: Actor, role: Role): Promise<Fyr[]> {
  const rows = await prisma.routine.findMany({
    where: { spaceId: actor.spaceId },
    include: { bot: { select: botSelect } },
    orderBy: [{ nextRunAt: "asc" }, { createdAt: "desc" }],
  });
  return rows
    .filter((row) =>
      fyrVisibleTo(actor, role, { spaceId: row.spaceId, ownerUserId: row.bot.userId }),
    )
    .filter((row) => !row.bot.archivedAt)
    .map(mapFyr);
}

export async function getFyr(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  fyrId: string,
): Promise<Fyr> {
  return mapFyr(await loadFyr(prisma, actor, role, fyrId));
}

async function loadFyr(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  fyrId: string,
): Promise<FyrRow> {
  const row = await prisma.routine.findFirst({
    where: { id: fyrId, spaceId: actor.spaceId },
    include: { bot: { select: botSelect } },
  });
  if (!row) notFound();
  requireVisible(actor, role, row);
  return row;
}

async function loadBotForCreate(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  botId: string,
): Promise<{ id: string; name: string; userId: string; threadId: string | null }> {
  const bot = await prisma.bot.findFirst({
    where: { id: botId, spaceId: actor.spaceId, archivedAt: null },
    select: { id: true, name: true, userId: true, thread: { select: { id: true } } },
  });
  if (!bot) notFound();
  if (!fyrVisibleTo(actor, role, { spaceId: actor.spaceId, ownerUserId: bot.userId })) {
    notFound();
  }
  return { id: bot.id, name: bot.name, userId: bot.userId, threadId: bot.thread?.id ?? null };
}

export async function createFyr(
  prisma: PrismaClient,
  jobs: JobPublisher,
  actor: Actor,
  role: Role,
  input: {
    botId: string;
    name: string;
    instruction: string;
    crons: string[];
    timezone: string;
    enabled: boolean;
  },
): Promise<Fyr> {
  assertRecurringFyrCrons(input.crons);
  const bot = await loadBotForCreate(prisma, actor, role, input.botId);
  const nextRunAt = nextFyrRunAt(input.crons, input.timezone, input.enabled);
  const row = await prisma.routine.create({
    data: {
      spaceId: actor.spaceId,
      botId: bot.id,
      userId: actor.userId,
      name: input.name,
      prompt: input.instruction,
      crons: input.crons,
      timezone: input.timezone,
      active: input.enabled,
      nextRunAt,
    },
    include: { bot: { select: botSelect } },
  });
  if (row.active && row.nextRunAt) {
    await jobs.enqueue(routineWakeupJob(row.id, row.nextRunAt));
  }
  return mapFyr(row);
}

export async function updateFyr(
  prisma: PrismaClient,
  jobs: JobPublisher,
  actor: Actor,
  role: Role,
  input: {
    fyrId: string;
    name?: string;
    instruction?: string;
    crons?: string[];
    timezone?: string;
    enabled?: boolean;
  },
): Promise<Fyr> {
  const existing = await loadFyr(prisma, actor, role, input.fyrId);
  const crons = input.crons ?? existing.crons;
  const timezone = input.timezone ?? existing.timezone;
  const enabled = input.enabled ?? existing.active;
  assertRecurringFyrCrons(crons);
  const scheduleChanged =
    (input.crons !== undefined && JSON.stringify(input.crons) !== JSON.stringify(existing.crons)) ||
    (input.timezone !== undefined && input.timezone !== existing.timezone) ||
    (input.enabled !== undefined && input.enabled !== existing.active);
  const nextRunAt = scheduleChanged
    ? nextFyrRunAt(crons, timezone, enabled)
    : enabled
      ? existing.nextRunAt
      : null;
  const row = await prisma.routine.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      prompt: input.instruction,
      crons: input.crons,
      timezone: input.timezone,
      active: input.enabled,
      nextRunAt,
    },
    include: { bot: { select: botSelect } },
  });
  if (
    scheduleChanged ||
    existing.active !== row.active ||
    (!existing.nextRunAt && !!row.nextRunAt)
  ) {
    if (row.active && row.nextRunAt) {
      await jobs.enqueue(routineWakeupJob(row.id, row.nextRunAt));
    } else {
      await jobs.cancel(routineJobKey(row.id));
    }
  }
  return mapFyr(row);
}

export async function setFyrEnabled(
  prisma: PrismaClient,
  jobs: JobPublisher,
  actor: Actor,
  role: Role,
  fyrId: string,
  enabled: boolean,
): Promise<Fyr> {
  return updateFyr(prisma, jobs, actor, role, { fyrId, enabled });
}

export async function runFyrNow(
  prisma: PrismaClient,
  jobs: JobPublisher,
  actor: Actor,
  role: Role,
  fyrId: string,
): Promise<{ runId: string }> {
  const fyr = await loadFyr(prisma, actor, role, fyrId);
  const bot = await loadBotForCreate(prisma, actor, role, fyr.botId);
  const threadId = bot.threadId;
  if (!threadId) {
    throw new LotsFyrError("BAD_REQUEST", "This coworker has no chat yet.");
  }
  const run = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        spaceId: actor.spaceId,
        botId: bot.id,
        threadId,
        userId: actor.userId,
        prompt: fyr.prompt,
        status: "queued",
      },
    });
    return tx.run.create({
      data: {
        spaceId: actor.spaceId,
        botId: bot.id,
        threadId,
        taskId: task.id,
        userId: actor.userId,
        status: "queued",
        trigger: "routine",
        routineId: fyr.id,
      },
      select: { id: true },
    });
  });
  await jobs.enqueue(runContinueJob(run.id));
  return { runId: run.id };
}

export async function listFyrRuns(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  fyrId: string,
): Promise<FyrRun[]> {
  await loadFyr(prisma, actor, role, fyrId);
  const rows = await prisma.run.findMany({
    where: { routineId: fyrId, spaceId: actor.spaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(mapFyrRun);
}
