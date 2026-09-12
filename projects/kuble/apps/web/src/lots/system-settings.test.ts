import { systemChecksFromHealth } from "@lots/core";
import { describe, expect, it, vi } from "vitest";
import { loadSystemChecks } from "./system-health-load.js";

describe("loadSystemChecks", () => {
  it("fetches the four health endpoints and maps spec §42 rows", async () => {
    const fetchHealth = vi.fn(async (path: string) => {
      if (path === "/health") return { ok: true, runtime: "pi", jobs: "graphile" };
      if (path === "/health/db") return { ok: true };
      if (path === "/health/worker") return { ok: true, driver: "graphile" };
      if (path === "/health/computer") return { ok: true, ready: true, sandbox: "docker" };
      return null;
    });
    await expect(loadSystemChecks(fetchHealth)).resolves.toEqual(
      systemChecksFromHealth({
        api: { ok: true, runtime: "pi", jobs: "graphile" },
        db: { ok: true },
        worker: { ok: true, driver: "graphile" },
        computer: { ok: true, ready: true, sandbox: "docker" },
      }),
    );
    expect(fetchHealth.mock.calls.map((call) => call[0])).toEqual([
      "/health",
      "/health/db",
      "/health/worker",
      "/health/computer",
    ]);
  });
});
