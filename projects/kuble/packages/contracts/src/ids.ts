import * as z from "zod";

export const Id = z.string().min(1);
export const IsoDate = z.string().datetime({ offset: true });

export const ActorSchema = z.object({
  userId: Id,
  spaceId: Id,
  email: z.string().email(),
  isDeploymentOwner: z.boolean(),
});
export type Actor = z.infer<typeof ActorSchema>;

/** Ratatosk agent palette: pastel fills that keep dark eyes and black type legible. */
export const BOT_COLORS = [
  "#FFD86B",
  "#9AD0F5",
  "#CDB4F7",
  "#A8E4B4",
  "#F8A7B6",
  "#F9C59B",
  "#B7E3E8",
] as const;

export const RunStatus = z.enum([
  "queued",
  "leased",
  "running",
  "waiting_input",
  "waiting_takeover",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const EffectStatus = z.enum(["intended", "completed", "failed", "ambiguous", "reconciled"]);
export type EffectStatus = z.infer<typeof EffectStatus>;

export const MemoryScope = z.enum(["bot", "user"]);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const SandboxKind = z.enum(["docker", "e2b", "daytona", "box", "desktop", "fake"]);
export type SandboxKind = z.infer<typeof SandboxKind>;
