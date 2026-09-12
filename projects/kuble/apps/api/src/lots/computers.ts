import { type Role, visibleTo } from "@lots/access";
import type { Actor, LotsComputer } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

export class LotsComputerError extends Error {
  constructor(
    readonly code: "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LotsComputerError";
  }
}

const COMPUTER_STATES = ["stopped", "booting", "running", "suspended", "error"] as const;
type ComputerState = (typeof COMPUTER_STATES)[number];

type ComputerRow = {
  id: string;
  spaceId: string;
  userId: string;
  scope: string;
  state: string;
  kind: string;
  bots: Array<{ id: string; name: string }>;
};

function computerState(value: string): ComputerState {
  return (COMPUTER_STATES as readonly string[]).includes(value)
    ? (value as ComputerState)
    : "stopped";
}

function toDto(row: ComputerRow): LotsComputer {
  return {
    id: row.id,
    scope: row.scope === "dedicated" ? "dedicated" : "team",
    state: computerState(row.state),
    kind: row.kind,
    ownerUserId: row.userId,
    bots: row.bots.map((bot) => ({ id: bot.id, name: bot.name })),
  };
}

function canSee(actor: Actor, role: Role, row: ComputerRow): boolean {
  return visibleTo(
    { userId: actor.userId, spaceId: actor.spaceId, role },
    {
      spaceId: row.spaceId,
      ownerUserId: row.userId,
      sharedViaTeam: row.scope === "team",
    },
  );
}

export async function listLotsComputers(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
): Promise<LotsComputer[]> {
  const rows = await prisma.computer.findMany({
    where: { spaceId: actor.spaceId },
    include: {
      bots: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.filter((row) => canSee(actor, role, row)).map(toDto);
}

export async function getLotsComputer(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  computerId: string,
): Promise<LotsComputer> {
  const row = await prisma.computer.findFirst({
    where: { id: computerId, spaceId: actor.spaceId },
    include: {
      bots: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!row || !canSee(actor, role, row)) {
    throw new LotsComputerError("NOT_FOUND", "Computer not found.");
  }
  return toDto(row);
}
