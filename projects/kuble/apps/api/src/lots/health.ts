import { computerHealthFromSandbox } from "@lots/core";
import type { PrismaClient } from "@rakazo/db";

export type DbHealth = { ok: boolean };
export type WorkerHealth = { ok: boolean; driver: string };
export type ComputerHealthPayload = {
  ok: boolean;
  ready: boolean;
  sandbox: string | null;
  supervisor: boolean | null;
};

export async function checkDbHealth(prisma: Pick<PrismaClient, "$queryRaw">): Promise<DbHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function checkWorkerHealth(input: {
  driver: string;
  prisma: Pick<PrismaClient, "$queryRaw">;
}): Promise<WorkerHealth> {
  if (input.driver === "memory") return { ok: true, driver: "memory" };
  try {
    const rows = await input.prisma.$queryRaw`SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = 'graphile_worker'`;
    const found = Array.isArray(rows) && rows.length > 0;
    return { ok: found, driver: input.driver };
  } catch {
    return { ok: false, driver: input.driver };
  }
}

export async function checkComputerHealth(input: {
  sandbox: string;
  supervisorUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<ComputerHealthPayload> {
  const base = computerHealthFromSandbox(input.sandbox);
  if (!base.ready) {
    return { ok: false, ready: false, sandbox: base.sandbox, supervisor: null };
  }
  if (input.sandbox !== "docker") {
    return { ok: true, ready: true, sandbox: base.sandbox, supervisor: null };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(new URL("/health", ensureTrailingSlash(input.supervisorUrl)), {
      signal: AbortSignal.timeout(2_500),
    });
    const ready = response.ok;
    return { ok: ready, ready, sandbox: base.sandbox, supervisor: ready };
  } catch {
    return { ok: false, ready: false, sandbox: base.sandbox, supervisor: false };
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
