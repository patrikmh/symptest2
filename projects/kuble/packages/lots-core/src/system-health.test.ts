import { describe, expect, it } from "vitest";
import { SYSTEM_CHECK_IDS, systemChecksFromHealth } from "./system-health.js";

describe("systemChecksFromHealth", () => {
  it("maps the spec §42 rows from the four health payloads", () => {
    expect(SYSTEM_CHECK_IDS).toEqual(["api", "db", "worker", "computer", "model"]);
    expect(
      systemChecksFromHealth({
        api: { ok: true, runtime: "pi", sandbox: "docker", jobs: "graphile" },
        db: { ok: true },
        worker: { ok: true, driver: "graphile" },
        computer: { ok: true, ready: true, sandbox: "docker" },
      }),
    ).toEqual([
      { id: "api", ok: true, detail: "pi" },
      { id: "db", ok: true, detail: null },
      { id: "worker", ok: true, detail: "graphile" },
      { id: "computer", ok: true, detail: "docker" },
      { id: "model", ok: true, detail: "pi" },
    ]);
  });

  it("treats a missing or failed probe as not ok", () => {
    expect(
      systemChecksFromHealth({
        api: null,
        db: { ok: false },
        worker: {},
        computer: { ok: false, ready: false, sandbox: "none" },
      }),
    ).toEqual([
      { id: "api", ok: false, detail: null },
      { id: "db", ok: false, detail: null },
      { id: "worker", ok: false, detail: null },
      { id: "computer", ok: false, detail: "none" },
      { id: "model", ok: false, detail: null },
    ]);
  });

  it("prefers computer.ready over computer.ok", () => {
    const [computer] = systemChecksFromHealth({
      api: { ok: true, runtime: "scripted" },
      db: { ok: true },
      worker: { ok: true, driver: "memory" },
      computer: { ok: true, ready: false, sandbox: "docker" },
    }).filter((row) => row.id === "computer");
    expect(computer).toEqual({ id: "computer", ok: false, detail: "docker" });
  });
});
