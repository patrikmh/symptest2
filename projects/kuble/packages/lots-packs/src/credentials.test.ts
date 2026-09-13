import { describe, expect, it, vi } from "vitest";
import {
  createPackAccessTokenResolver,
  createPackGoogleRefresh,
  type PackSecretStore,
} from "./credentials.js";
import { PACK_CONNECTOR_ID } from "./settings.js";

const context = { spaceId: "space-1", userId: "user-1" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function memoryStore(input: {
  accessToken?: string;
  refreshToken?: string | null;
}): PackSecretStore & { ciphertext: string } {
  const store = {
    ciphertext: JSON.stringify({
      access_token: input.accessToken ?? "expired",
      refresh_token: input.refreshToken === undefined ? "refresh-me" : input.refreshToken,
    }),
    connection: {
      findFirst: async () => ({
        id: "conn-1",
        secretId: "sec-1",
        provider: "google",
      }),
    },
    secret: {
      findUnique: async () => ({ id: "sec-1", ciphertext: store.ciphertext }),
      update: async (args: { where: { id: string }; data: { ciphertext: string } }) => {
        store.ciphertext = args.data.ciphertext;
        return args.data;
      },
    },
  };
  return store;
}

describe("createPackAccessTokenResolver", () => {
  it("returns the stored access token", async () => {
    const prisma = memoryStore({ accessToken: "tok" });
    const resolve = createPackAccessTokenResolver({
      prisma,
      decrypt: (ciphertext) => ciphertext,
    });
    await expect(resolve(context, "google")).resolves.toBe("tok");
  });
});

describe("createPackGoogleRefresh", () => {
  it("exchanges the refresh token and persists the new access token", async () => {
    const prisma = memoryStore({ accessToken: "expired" });
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://oauth2.googleapis.com/token");
      return jsonResponse({ access_token: "fresh-token" });
    });
    const put = vi.fn(async (plaintext: string, recordId: string) => {
      expect(recordId).toBe("sec-1");
      expect(JSON.parse(plaintext)).toMatchObject({
        access_token: "fresh-token",
        refresh_token: "refresh-me",
      });
      return { ciphertext: plaintext };
    });
    const refresh = createPackGoogleRefresh({
      prisma,
      decrypt: (ciphertext) => ciphertext,
      clientId: "cid",
      clientSecret: "csecret",
      put,
    });
    await expect(refresh(context, fetchImpl as unknown as typeof fetch)).resolves.toBe(
      "fresh-token",
    );
    expect(put).toHaveBeenCalledOnce();
    expect(JSON.parse(prisma.ciphertext)).toMatchObject({
      access_token: "fresh-token",
      refresh_token: "refresh-me",
    });
    expect(prisma.ciphertext).not.toContain("csecret");
  });

  it("skips refresh when Google client credentials are missing", async () => {
    const refresh = createPackGoogleRefresh({
      prisma: memoryStore({}),
      decrypt: (ciphertext) => ciphertext,
    });
    await expect(refresh(context)).resolves.toBeNull();
  });

  it("skips refresh when the stored secret has no refresh token", async () => {
    const refresh = createPackGoogleRefresh({
      prisma: memoryStore({ refreshToken: null }),
      decrypt: (ciphertext) => ciphertext,
      clientId: "cid",
      clientSecret: "csecret",
    });
    await expect(refresh(context)).resolves.toBeNull();
  });
});

describe("pack connection lookup", () => {
  it("loads only the lots connector for that provider", async () => {
    const findFirst = vi.fn(async (args: { where: { connectorId: string; provider: string } }) => {
      expect(args.where.connectorId).toBe(PACK_CONNECTOR_ID);
      expect(args.where.provider).toBe("google");
      return { id: "conn-1", secretId: "sec-1", provider: "google" };
    });
    const resolve = createPackAccessTokenResolver({
      prisma: {
        connection: { findFirst },
        secret: {
          findUnique: async () => ({
            id: "sec-1",
            ciphertext: JSON.stringify({ access_token: "tok" }),
          }),
        },
      },
      decrypt: (ciphertext) => ciphertext,
    });
    await expect(resolve(context, "google")).resolves.toBe("tok");
  });
});
