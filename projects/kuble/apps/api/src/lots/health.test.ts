import { describe, expect, it, vi } from "vitest";
import { checkComputerHealth, checkDbHealth, checkWorkerHealth } from "./health.js";

describe("checkDbHealth", () => {
  it("is ok when SELECT 1 succeeds", async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };
    await expect(checkDbHealth(prisma)).resolves.toEqual({ ok: true });
  });

  it("is not ok when the query throws", async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error("down")) };
    await expect(checkDbHealth(prisma)).resolves.toEqual({ ok: false });
  });
});

describe("checkWorkerHealth", () => {
  it("treats the in-process memory driver as healthy", async () => {
    const prisma = { $queryRaw: vi.fn() };
    await expect(checkWorkerHealth({ driver: "memory", prisma })).resolves.toEqual({
      ok: true,
      driver: "memory",
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("is ok when the graphile_worker schema exists", async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{}]) };
    await expect(checkWorkerHealth({ driver: "graphile", prisma })).resolves.toEqual({
      ok: true,
      driver: "graphile",
    });
  });

  it("is not ok when the schema is missing or the query fails", async () => {
    await expect(
      checkWorkerHealth({
        driver: "graphile",
        prisma: { $queryRaw: vi.fn().mockResolvedValue([]) },
      }),
    ).resolves.toEqual({ ok: false, driver: "graphile" });
    await expect(
      checkWorkerHealth({
        driver: "graphile",
        prisma: { $queryRaw: vi.fn().mockRejectedValue(new Error("no schema")) },
      }),
    ).resolves.toEqual({ ok: false, driver: "graphile" });
  });
});

describe("checkComputerHealth", () => {
  it("is not ready when the sandbox is none", async () => {
    await expect(
      checkComputerHealth({ sandbox: "none", supervisorUrl: "http://127.0.0.1:7091" }),
    ).resolves.toEqual({ ok: false, ready: false, sandbox: "none", supervisor: null });
  });

  it("is ready for fake and cloud providers without probing Docker", async () => {
    await expect(
      checkComputerHealth({ sandbox: "fake", supervisorUrl: "http://127.0.0.1:7091" }),
    ).resolves.toEqual({ ok: true, ready: true, sandbox: "fake", supervisor: null });
  });

  it("probes the supervisor /health for docker", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      checkComputerHealth({
        sandbox: "docker",
        supervisorUrl: "http://supervisor:7091",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ ok: true, ready: true, sandbox: "docker", supervisor: true });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://supervisor:7091/health");
  });

  it("is not ready when the supervisor probe fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      checkComputerHealth({
        sandbox: "docker",
        supervisorUrl: "http://127.0.0.1:7091",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ ok: false, ready: false, sandbox: "docker", supervisor: false });
  });
});
