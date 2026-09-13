import { describe, expect, it, vi } from "vitest";
import {
  completePackConnect,
  connectPack,
  disconnectPack,
  getPack,
  LotsPackError,
  listPacks,
  setPackAvailability,
} from "./packs.js";

const actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    capabilityInstall: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    connection: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    ...overrides,
  };
}

describe("lots.packs", () => {
  it("lists Web Research enabled and the others off, with no token fields", async () => {
    const packs = await listPacks(prismaMock() as never, actor);
    expect(packs.map((pack) => [pack.key, pack.enabled, pack.connected])).toEqual([
      ["web", true, true],
      ["github", false, false],
      ["gmail", false, false],
      ["calendar", false, false],
    ]);
    for (const pack of packs) {
      expect(pack).not.toHaveProperty("secretId");
      expect(JSON.stringify(pack)).not.toContain("token");
    }
  });

  it("lets a member connect but not enable a pack", async () => {
    await expect(
      setPackAvailability(prismaMock() as never, actor, "MEMBER", "gmail", true),
    ).rejects.toBeInstanceOf(LotsPackError);
    const result = await connectPack(prismaMock() as never, actor, "MEMBER", "gmail", {
      webOrigin: "http://127.0.0.1:5173",
      googleClientId: "cid",
    });
    expect(result.authorizationUrl).toContain("accounts.google.com");
    expect(JSON.stringify(result)).not.toContain("cid-secret");
  });

  it("lets an admin enable Gmail and never returns a stored secret", async () => {
    const create = vi.fn();
    const prisma = prismaMock({
      capabilityInstall: {
        findMany: vi.fn().mockResolvedValue([{ name: "gmail", config: { enabled: true } }]),
        findFirst: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
      connection: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "conn-1",
            provider: "google",
            status: "connected",
            secretId: "sec-should-never-leak",
            userId: "user-a",
          },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    const pack = await setPackAvailability(prisma as never, actor, "ADMIN", "gmail", true);
    expect(pack.enabled).toBe(true);
    expect(pack.connected).toBe(true);
    expect(JSON.stringify(pack)).not.toContain("sec-should-never-leak");
  });

  it("disconnects without echoing credential material", async () => {
    const updateMany = vi.fn();
    const prisma = prismaMock({
      connection: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany,
      },
    });
    const pack = await disconnectPack(prisma as never, actor, "MEMBER", "github");
    expect(updateMany).toHaveBeenCalled();
    expect(pack.connected).toBe(false);
    expect(pack).not.toHaveProperty("access_token");
  });

  it("returns 404 for an unknown pack", async () => {
    await expect(getPack(prismaMock() as never, actor, "slack")).rejects.toBeInstanceOf(
      LotsPackError,
    );
  });

  it("completes OAuth without exposing tokens or secret ids", async () => {
    const put = vi.fn().mockResolvedValue({ id: "sec-1", ciphertext: "sealed" });
    const upsert = vi.fn();
    const update = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok-secret", refresh_token: "ref-secret" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const prisma = prismaMock({
      connection: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "conn-1",
            provider: "google",
            status: "connected",
            secretId: "sec-1",
            userId: "user-a",
          },
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id: "conn-1",
          provider: "google",
          providerRef: "state-1",
          metadata: { packKey: "calendar" },
        }),
        create: vi.fn(),
        update,
        updateMany: vi.fn(),
      },
      secret: { upsert },
    });
    const pack = await completePackConnect(
      prisma as never,
      actor,
      { put },
      {
        webOrigin: "http://127.0.0.1:5173",
        googleClientId: "cid",
        googleClientSecret: "csecret",
      },
      { code: "code-1", state: "state-1" },
    );
    expect(put).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "connected" }) }),
    );
    expect(pack.key).toBe("calendar");
    expect(pack.connected).toBe(true);
    expect(JSON.stringify(pack)).not.toContain("tok-secret");
    expect(JSON.stringify(pack)).not.toContain("csecret");
    expect(JSON.stringify(pack)).not.toContain("sec-1");
    vi.unstubAllGlobals();
  });
});
