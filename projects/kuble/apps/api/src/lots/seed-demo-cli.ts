import { existsSync, readFileSync } from "node:fs";
import { GraphileJobPublisher } from "@rakazo/adapters";
import { createDb } from "@rakazo/db";
import { seedDemo } from "./demo-seed.js";

function applyEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

applyEnvFile(".env");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env, then retry.");
  }
  const { prisma, pool } = createDb(databaseUrl);
  const jobs =
    (process.env.WAKEUP_DRIVER ?? "graphile") === "memory"
      ? undefined
      : new GraphileJobPublisher(databaseUrl);
  try {
    const result = await seedDemo(prisma, { jobs });
    process.stdout.write(
      [
        "Demo seed ready.",
        `Workspace ${result.spaceId}`,
        `Coworkers: ${Object.keys(result.bots).join(", ")}`,
        `Fyrar: ${result.fyrar.length}`,
        `Approvals: ${result.approvals.length}`,
        "",
      ].join("\n"),
    );
  } finally {
    await jobs?.close();
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

await main();
