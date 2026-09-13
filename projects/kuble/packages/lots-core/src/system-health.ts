/**
 * Settings → System rows (spec §42). The API exposes `/health`, `/health/db`,
 * `/health/worker` and `/health/computer`; the UI maps those payloads here.
 */
export const SYSTEM_CHECK_IDS = ["api", "db", "worker", "computer", "model"] as const;
export type SystemCheckId = (typeof SYSTEM_CHECK_IDS)[number];

export type SystemCheck = {
  id: SystemCheckId;
  ok: boolean;
  detail: string | null;
};

export type HealthPayload = {
  ok?: unknown;
  ready?: unknown;
  runtime?: unknown;
  sandbox?: unknown;
  driver?: unknown;
  jobs?: unknown;
} | null;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function flag(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function systemChecksFromHealth(input: {
  api: HealthPayload;
  db: HealthPayload;
  worker: HealthPayload;
  computer: HealthPayload;
}): SystemCheck[] {
  const apiOk = flag(input.api?.ok);
  const runtime = asString(input.api?.runtime);
  const sandbox = asString(input.computer?.sandbox) ?? asString(input.api?.sandbox);
  const workerDriver = asString(input.worker?.driver) ?? asString(input.api?.jobs);
  const computerReady =
    typeof input.computer?.ready === "boolean"
      ? input.computer.ready
      : flag(input.computer?.ok, false);

  return [
    { id: "api", ok: apiOk, detail: runtime },
    { id: "db", ok: flag(input.db?.ok), detail: null },
    { id: "worker", ok: flag(input.worker?.ok), detail: workerDriver },
    { id: "computer", ok: computerReady, detail: sandbox },
    { id: "model", ok: apiOk && runtime !== null, detail: runtime },
  ];
}
