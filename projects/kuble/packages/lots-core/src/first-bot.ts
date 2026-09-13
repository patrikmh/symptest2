import { agentTemplate } from "./agent-templates.js";

/** Idempotency key for the coworker created during first-run onboarding. */
export const FIRST_BOT_SPAWN_KEY = "onboarding:first";

/** Names used before Ratatosk renamed the first coworker Assistant. */
export const LEGACY_FIRST_BOT_NAMES = ["Chief"] as const;

export type FirstBotListItem = {
  id: string;
  name: string;
  spawnKey?: string | null;
};

/**
 * Profile written onto the first coworker (spec §38). Name and description are
 * the Assistant template; `spawnKey` makes create idempotent across tabs.
 */
export function firstBotProfile() {
  const template = agentTemplate("assistant");
  return {
    name: template.name,
    title: template.role,
    description: template.description,
    instructions: template.instructions,
    notifyOnFinish: true,
    computerMode: "team" as const,
    spawnKey: FIRST_BOT_SPAWN_KEY,
  };
}

/**
 * Prefer the spawn-keyed first coworker, then Assistant, then a leftover Chief
 * from workspaces created before the rename.
 */
export function findFirstBot<T extends FirstBotListItem>(bots: readonly T[]): T | undefined {
  const byKey = bots.find((bot) => bot.spawnKey === FIRST_BOT_SPAWN_KEY);
  if (byKey) return byKey;
  const byAssistant = bots.find((bot) => bot.name === firstBotProfile().name);
  if (byAssistant) return byAssistant;
  return bots.find((bot) => (LEGACY_FIRST_BOT_NAMES as readonly string[]).includes(bot.name));
}
