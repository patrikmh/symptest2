import { type SystemCheck, systemChecksFromHealth } from "@lots/core";

async function readHealth(path: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(path);
    const body = (await response.json()) as Record<string, unknown>;
    return body;
  } catch {
    return null;
  }
}

export async function loadSystemChecks(
  fetchHealth: (path: string) => Promise<Record<string, unknown> | null> = readHealth,
): Promise<SystemCheck[]> {
  const [api, db, worker, computer] = await Promise.all([
    fetchHealth("/health"),
    fetchHealth("/health/db"),
    fetchHealth("/health/worker"),
    fetchHealth("/health/computer"),
  ]);
  return systemChecksFromHealth({ api, db, worker, computer });
}
