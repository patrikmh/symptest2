import { randomBytes } from "node:crypto";
import { can, type Role } from "@lots/access";
import {
  classificationRequiresApproval,
  enabledPackKeys,
  githubAuthorizeUrl,
  googleAuthorizeUrl,
  isPackKey,
  LOTS_PACKS,
  listPackSettingRows,
  PACK_CONNECTOR_ID,
  type PackKey,
  packByKey,
  packOAuthRedirectUri,
  setPackEnabled,
} from "@lots/packs";
import type { EncryptedSecretStore } from "@rakazo/adapters";
import type { Actor, Pack, PackConnectResult } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

export class LotsPackError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "LotsPackError";
  }
}

type ConnectionRow = {
  id: string;
  provider: string;
  status: string;
  secretId: string | null;
  userId: string;
};

export type PackOAuthEnv = {
  webOrigin: string;
  googleClientId?: string;
  googleClientSecret?: string;
  githubClientId?: string;
  githubClientSecret?: string;
};

const emptyOauth: PackOAuthEnv = { webOrigin: "http://127.0.0.1:5173" };

function requirePack(packKey: string) {
  if (!isPackKey(packKey)) throw new LotsPackError("NOT_FOUND", "Resource not found");
  const pack = packByKey(packKey);
  if (!pack) throw new LotsPackError("NOT_FOUND", "Resource not found");
  return pack;
}

function connectionProvider(packKey: PackKey): "github" | "google" | null {
  const pack = packByKey(packKey);
  if (!pack || pack.connection === "none") return null;
  return pack.connection;
}

function mapPack(
  packKey: PackKey,
  enabled: ReadonlySet<string>,
  connection: ConnectionRow | undefined,
): Pack {
  const pack = packByKey(packKey)!;
  const status = connection?.status;
  const connectionStatus =
    pack.connection === "none"
      ? "none"
      : status === "connected" || status === "pending" || status === "revoked" || status === "error"
        ? status
        : "none";
  return {
    key: pack.key,
    name: pack.name,
    description: pack.description,
    connection: pack.connection,
    enabled: enabled.has(pack.key),
    connected: pack.connection === "none" ? true : connection?.status === "connected",
    connectionStatus,
    tools: pack.tools.map((tool) => ({
      name: tool.name,
      classification: tool.classification,
      description: tool.description,
      approval: classificationRequiresApproval(tool.classification),
    })),
  };
}

export async function listPacks(prisma: PrismaClient, actor: Actor): Promise<Pack[]> {
  const [rows, connections] = await Promise.all([
    listPackSettingRows(prisma, actor.spaceId),
    prisma.connection.findMany({
      where: { spaceId: actor.spaceId, userId: actor.userId, connectorId: PACK_CONNECTOR_ID },
      select: { id: true, provider: true, status: true, secretId: true, userId: true },
    }),
  ]);
  const enabled = new Set(enabledPackKeys(rows));
  return LOTS_PACKS.map((pack) => {
    const provider = connectionProvider(pack.key);
    return mapPack(
      pack.key,
      enabled,
      provider ? connections.find((row) => row.provider === provider) : undefined,
    );
  });
}

export async function getPack(prisma: PrismaClient, actor: Actor, packKey: string): Promise<Pack> {
  requirePack(packKey);
  const packs = await listPacks(prisma, actor);
  const found = packs.find((pack) => pack.key === packKey);
  if (!found) throw new LotsPackError("NOT_FOUND", "Resource not found");
  return found;
}

export async function setPackAvailability(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  packKey: string,
  enabled: boolean,
): Promise<Pack> {
  const pack = requirePack(packKey);
  if (!can(role, "configurePacks")) {
    throw new LotsPackError("FORBIDDEN", "You cannot change which tools this workspace uses.");
  }
  await setPackEnabled(prisma, {
    spaceId: actor.spaceId,
    userId: actor.userId,
    packKey: pack.key,
    enabled,
  });
  return getPack(prisma, actor, pack.key);
}

export async function connectPack(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  packKey: string,
  oauth: PackOAuthEnv = emptyOauth,
): Promise<PackConnectResult> {
  const pack = requirePack(packKey);
  if (!can(role, "connectOwnAccounts")) {
    throw new LotsPackError("FORBIDDEN", "You cannot connect accounts.");
  }
  if (pack.connection === "none") {
    return { pack: await getPack(prisma, actor, pack.key), authorizationUrl: null };
  }
  const provider = pack.connection;
  const state = randomBytes(16).toString("hex");
  const redirectUri = packOAuthRedirectUri(oauth.webOrigin);
  const authorizationUrl =
    provider === "google" && oauth.googleClientId
      ? googleAuthorizeUrl({ clientId: oauth.googleClientId, redirectUri, state })
      : provider === "github" && oauth.githubClientId
        ? githubAuthorizeUrl({ clientId: oauth.githubClientId, redirectUri, state })
        : null;
  const existing = await prisma.connection.findFirst({
    where: {
      spaceId: actor.spaceId,
      userId: actor.userId,
      connectorId: PACK_CONNECTOR_ID,
      provider,
    },
  });
  if (existing?.status === "connected") {
    return { pack: await getPack(prisma, actor, pack.key), authorizationUrl: null };
  }
  if (existing) {
    await prisma.connection.update({
      where: { id: existing.id },
      data: {
        status: authorizationUrl ? "pending" : existing.status,
        providerRef: state,
        metadata: { state, packKey: pack.key },
        displayName: pack.name,
      },
    });
  } else {
    await prisma.connection.create({
      data: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        connectorId: PACK_CONNECTOR_ID,
        provider,
        displayName: pack.name,
        status: authorizationUrl ? "pending" : "pending",
        providerRef: state,
        metadata: { state, packKey: pack.key },
      },
    });
  }
  return { pack: await getPack(prisma, actor, pack.key), authorizationUrl };
}

export async function disconnectPack(
  prisma: PrismaClient,
  actor: Actor,
  role: Role,
  packKey: string,
): Promise<Pack> {
  const pack = requirePack(packKey);
  if (!can(role, "connectOwnAccounts")) {
    throw new LotsPackError("FORBIDDEN", "You cannot disconnect accounts.");
  }
  const provider = connectionProvider(pack.key);
  if (!provider) return getPack(prisma, actor, pack.key);
  await prisma.connection.updateMany({
    where: {
      spaceId: actor.spaceId,
      userId: actor.userId,
      connectorId: PACK_CONNECTOR_ID,
      provider,
    },
    data: { status: "revoked", secretId: null, providerRef: null },
  });
  return getPack(prisma, actor, pack.key);
}

export async function completePackConnect(
  prisma: PrismaClient,
  actor: Actor,
  secrets: Pick<EncryptedSecretStore, "put">,
  oauth: PackOAuthEnv,
  input: { code: string; state: string },
): Promise<Pack> {
  const row = await prisma.connection.findFirst({
    where: {
      spaceId: actor.spaceId,
      userId: actor.userId,
      connectorId: PACK_CONNECTOR_ID,
      providerRef: input.state,
    },
  });
  if (!row) throw new LotsPackError("NOT_FOUND", "Resource not found");
  const tokens = await exchangePackCode(row.provider, input.code, oauth);
  const stored = await secrets.put(
    JSON.stringify(tokens),
    {
      operationId: "lots.packs.complete",
      traceId: "lots.packs.complete",
      spaceId: actor.spaceId,
      userId: actor.userId,
      signal: new AbortController().signal,
    },
    row.id,
  );
  await prisma.secret.upsert({
    where: { id: stored.id },
    create: {
      id: stored.id,
      userId: actor.userId,
      spaceId: actor.spaceId,
      kind: "lots-pack",
      ciphertext: stored.ciphertext,
    },
    update: { ciphertext: stored.ciphertext },
  });
  await prisma.connection.update({
    where: { id: row.id },
    data: { status: "connected", secretId: stored.id },
  });
  const metadata =
    row.metadata && typeof row.metadata === "object" ? (row.metadata as { packKey?: unknown }) : {};
  const packKey =
    typeof metadata.packKey === "string" && isPackKey(metadata.packKey)
      ? metadata.packKey
      : row.provider === "github"
        ? "github"
        : row.provider === "google"
          ? "gmail"
          : "web";
  const mapped = await getPack(prisma, actor, packKey);
  if ("secretId" in mapped || "ciphertext" in mapped || "token" in mapped) {
    throw new LotsPackError("CONFLICT", "Refusing to return credential material.");
  }
  return mapped;
}

async function exchangePackCode(provider: string, code: string, oauth: PackOAuthEnv) {
  const redirectUri = packOAuthRedirectUri(oauth.webOrigin);
  if (provider === "google") {
    if (!oauth.googleClientId || !oauth.googleClientSecret) {
      throw new LotsPackError("BAD_REQUEST", "Google OAuth is not configured.");
    }
    const body = new URLSearchParams({
      code,
      client_id: oauth.googleClientId,
      client_secret: oauth.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new LotsPackError("BAD_REQUEST", "Google did not accept that code.");
    return (await response.json()) as Record<string, unknown>;
  }
  if (provider === "github") {
    if (!oauth.githubClientId || !oauth.githubClientSecret) {
      throw new LotsPackError("BAD_REQUEST", "GitHub OAuth is not configured.");
    }
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: oauth.githubClientId,
        client_secret: oauth.githubClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!response.ok) throw new LotsPackError("BAD_REQUEST", "GitHub did not accept that code.");
    return (await response.json()) as Record<string, unknown>;
  }
  throw new LotsPackError("BAD_REQUEST", "That connection cannot be completed.");
}

export function packOAuthFromEnv(
  webOrigin: string,
  env: NodeJS.ProcessEnv = process.env,
): PackOAuthEnv {
  return {
    webOrigin,
    googleClientId: env.GOOGLE_CLIENT_ID ?? env.LOTS_GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? env.LOTS_GOOGLE_CLIENT_SECRET,
    githubClientId: env.GITHUB_CLIENT_ID ?? env.LOTS_GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET ?? env.LOTS_GITHUB_CLIENT_SECRET,
  };
}
