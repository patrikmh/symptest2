import type { AdapterContext } from "@rakazo/adapter-kit";
import { findPackWrite } from "./execute.js";
import type { PackReconcileLookup } from "./reconcile.js";
import { PACK_CONNECTOR_ID } from "./settings.js";
import {
  applyGoogleAccessToken,
  packTokensFromSecret,
  providerForPackTool,
  refreshGoogleAccessToken,
  refreshGoogleTokens,
} from "./token.js";

type ConnectionRow = {
  id: string;
  secretId: string | null;
  provider: string;
};

export type PackSecretStore = {
  connection: {
    findFirst: (args: {
      where: {
        spaceId: string;
        userId: string;
        connectorId: string;
        provider: string;
        status: string;
      };
      select: { id: true; secretId: true; provider: true };
    }) => Promise<ConnectionRow | null>;
  };
  secret: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; ciphertext: true };
    }) => Promise<{ id: string; ciphertext: string } | null>;
    update?: (args: { where: { id: string }; data: { ciphertext: string } }) => Promise<unknown>;
  };
};

export type PackAccessTokenResolver = (
  context: Pick<AdapterContext, "spaceId" | "userId">,
  provider: "github" | "google",
) => Promise<string | null>;

export type PackGoogleRefresh = (
  context: Pick<AdapterContext, "spaceId" | "userId">,
  fetchImpl?: typeof fetch,
) => Promise<string | null>;

export type PackSecretPut = (
  plaintext: string,
  recordId: string,
  context: Pick<AdapterContext, "spaceId" | "userId">,
) => Promise<{ ciphertext: string }>;

export function packSecretPutFromStore(secrets: {
  put: (
    plaintext: string,
    context: AdapterContext,
    recordId?: string,
  ) => Promise<{ ciphertext: string }>;
}): PackSecretPut {
  return (plaintext, recordId, context) =>
    secrets.put(
      plaintext,
      {
        operationId: "lots.packs.refresh",
        traceId: "lots.packs.refresh",
        spaceId: context.spaceId ?? "",
        userId: context.userId ?? "",
        signal: AbortSignal.timeout(10_000),
      },
      recordId,
    );
}

async function loadConnectedPackSecret(
  prisma: PackSecretStore,
  decrypt: (ciphertext: string, recordId: string) => string,
  context: Pick<AdapterContext, "spaceId" | "userId">,
  provider: "github" | "google",
): Promise<{ secretId: string; raw: string } | null> {
  if (!context.spaceId || !context.userId) return null;
  const connection = await prisma.connection.findFirst({
    where: {
      spaceId: context.spaceId,
      userId: context.userId,
      connectorId: PACK_CONNECTOR_ID,
      provider,
      status: "connected",
    },
    select: { id: true, secretId: true, provider: true },
  });
  if (!connection?.secretId) return null;
  const secret = await prisma.secret.findUnique({
    where: { id: connection.secretId },
    select: { id: true, ciphertext: true },
  });
  if (!secret) return null;
  try {
    return { secretId: secret.id, raw: decrypt(secret.ciphertext, secret.id) };
  } catch {
    return null;
  }
}

export function createPackAccessTokenResolver(input: {
  prisma: PackSecretStore;
  decrypt: (ciphertext: string, recordId: string) => string;
}): PackAccessTokenResolver {
  return async (context, provider) => {
    const loaded = await loadConnectedPackSecret(input.prisma, input.decrypt, context, provider);
    if (!loaded) return null;
    return packTokensFromSecret(loaded.raw)?.accessToken ?? null;
  };
}

/** Used after a 401: try the Google refresh token once. */
export async function refreshPackGoogleToken(input: {
  rawSecret: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const tokens = packTokensFromSecret(input.rawSecret);
  if (!tokens?.refreshToken) return null;
  return refreshGoogleAccessToken({
    refreshToken: tokens.refreshToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    fetchImpl: input.fetchImpl,
  });
}

/**
 * Reload the Google connection, exchange the refresh token, and persist the new
 * access token when `put` + `secret.update` are available.
 */
export function createPackGoogleRefresh(input: {
  prisma: PackSecretStore;
  decrypt: (ciphertext: string, recordId: string) => string;
  clientId?: string;
  clientSecret?: string;
  put?: PackSecretPut;
}): PackGoogleRefresh {
  return async (context, fetchImpl) => {
    if (!input.clientId || !input.clientSecret) return null;
    const loaded = await loadConnectedPackSecret(input.prisma, input.decrypt, context, "google");
    if (!loaded) return null;
    const tokens = packTokensFromSecret(loaded.raw);
    if (!tokens?.refreshToken) return null;
    const next = await refreshGoogleTokens({
      refreshToken: tokens.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      fetchImpl,
    });
    if (!next) return null;
    if (input.put && input.prisma.secret.update) {
      try {
        const stored = await input.put(
          applyGoogleAccessToken(loaded.raw, next.accessToken, next.refreshToken),
          loaded.secretId,
          context,
        );
        await input.prisma.secret.update({
          where: { id: loaded.secretId },
          data: { ciphertext: stored.ciphertext },
        });
      } catch {
        // The current call can still retry with the in-memory token.
      }
    }
    return next.accessToken;
  };
}

export function createPackReconcileLookup(input: {
  resolveToken: PackAccessTokenResolver;
  fetchImpl?: typeof fetch;
}): PackReconcileLookup {
  return {
    async find(query) {
      const provider = providerForPackTool(query.tool);
      if (!provider || !query.spaceId || !query.userId) return null;
      const accessToken = await input.resolveToken(
        { spaceId: query.spaceId, userId: query.userId },
        provider,
      );
      if (!accessToken) return null;
      return findPackWrite(query.tool, query.request, {
        accessToken,
        fetchImpl: input.fetchImpl,
      });
    },
  };
}
