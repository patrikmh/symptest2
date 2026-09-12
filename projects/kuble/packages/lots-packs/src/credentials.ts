import type { AdapterContext } from "@rakazo/adapter-kit";
import { findPackWrite } from "./execute.js";
import type { PackReconcileLookup } from "./reconcile.js";
import { PACK_CONNECTOR_ID } from "./settings.js";
import { packTokensFromSecret, providerForPackTool, refreshGoogleAccessToken } from "./token.js";

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
  };
};

export type PackAccessTokenResolver = (
  context: Pick<AdapterContext, "spaceId" | "userId">,
  provider: "github" | "google",
) => Promise<string | null>;

export function createPackAccessTokenResolver(input: {
  prisma: PackSecretStore;
  decrypt: (ciphertext: string, recordId: string) => string;
}): PackAccessTokenResolver {
  return async (context, provider) => {
    if (!context.spaceId || !context.userId) return null;
    const connection = await input.prisma.connection.findFirst({
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
    const secret = await input.prisma.secret.findUnique({
      where: { id: connection.secretId },
      select: { id: true, ciphertext: true },
    });
    if (!secret) return null;
    let raw: string;
    try {
      raw = input.decrypt(secret.ciphertext, secret.id);
    } catch {
      return null;
    }
    return packTokensFromSecret(raw)?.accessToken ?? null;
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
