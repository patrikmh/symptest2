import { LOTS_PACKS } from "./catalog.js";
import type { PackKey } from "./define-pack.js";

export const PACK_SETTING_KIND = "lots-pack";
export const PACK_CONNECTOR_ID = "lots";

export type PackSettingRow = { name: string; config: unknown };

export function enabledPackKeys(rows: PackSettingRow[]): PackKey[] {
  const overrides = new Map<string, boolean>();
  for (const row of rows) {
    const config =
      row.config && typeof row.config === "object" ? (row.config as { enabled?: unknown }) : {};
    if (typeof config.enabled === "boolean") overrides.set(row.name, config.enabled);
  }
  return LOTS_PACKS.filter((pack) => overrides.get(pack.key) ?? pack.enabledByDefault).map(
    (pack) => pack.key,
  );
}

export type PackSettingStore = {
  capabilityInstall: {
    findMany: (args: {
      where: { spaceId: string; kind: string };
      select: { name: true; config: true };
    }) => Promise<PackSettingRow[]>;
    findFirst: (args: {
      where: { spaceId: string; kind: string; name: string };
      select: { id: true; config: true };
    }) => Promise<{ id: string; config: unknown } | null>;
    create: (args: {
      data: {
        spaceId: string;
        userId: string;
        kind: string;
        name: string;
        source: string;
        config: { enabled: boolean };
      };
    }) => Promise<unknown>;
    update: (args: {
      where: { id: string };
      data: { config: { enabled: boolean } };
    }) => Promise<unknown>;
  };
};

export async function listPackSettingRows(
  prisma: PackSettingStore,
  spaceId: string,
): Promise<PackSettingRow[]> {
  return prisma.capabilityInstall.findMany({
    where: { spaceId, kind: PACK_SETTING_KIND },
    select: { name: true, config: true },
  });
}

export async function setPackEnabled(
  prisma: PackSettingStore,
  input: { spaceId: string; userId: string; packKey: PackKey; enabled: boolean },
): Promise<void> {
  const existing = await prisma.capabilityInstall.findFirst({
    where: { spaceId: input.spaceId, kind: PACK_SETTING_KIND, name: input.packKey },
    select: { id: true, config: true },
  });
  const config = { enabled: input.enabled };
  if (existing) {
    await prisma.capabilityInstall.update({
      where: { id: existing.id },
      data: { config },
    });
    return;
  }
  await prisma.capabilityInstall.create({
    data: {
      spaceId: input.spaceId,
      userId: input.userId,
      kind: PACK_SETTING_KIND,
      name: input.packKey,
      source: "lots",
      config,
    },
  });
}
