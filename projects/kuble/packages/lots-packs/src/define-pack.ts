import {
  classificationRequiresApproval,
  isPackClassification,
  normalizePackToolName,
  type PackClassification,
} from "./classification.js";

export const PACK_KEYS = ["web", "github", "gmail", "calendar"] as const;
export type PackKey = (typeof PACK_KEYS)[number];

export const PACK_CONNECTIONS = ["none", "github", "google"] as const;
export type PackConnection = (typeof PACK_CONNECTIONS)[number];

export type PackToolExecute = (
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export type PackTool = {
  name: string;
  classification: PackClassification;
  description: string;
  inputSchema: Record<string, unknown>;
  execute?: PackToolExecute;
  reconcile?: PackToolExecute;
};

export type PackDefinition = {
  key: PackKey;
  name: string;
  description: string;
  connection: PackConnection;
  enabledByDefault: boolean;
  tools: readonly PackTool[];
};

export function definePack(input: PackDefinition): PackDefinition {
  if (!input.tools.length) {
    throw new Error(`Pack ${input.key} must declare at least one tool.`);
  }
  const names = new Set<string>();
  for (const tool of input.tools) {
    if (!tool.name?.trim()) {
      throw new Error(`Pack ${input.key} has a tool without a name.`);
    }
    if (!isPackClassification(tool.classification)) {
      throw new Error(`Pack ${input.key} tool ${tool.name} is missing a classification.`);
    }
    const id = normalizePackToolName(tool.name);
    if (names.has(id)) {
      throw new Error(`Pack ${input.key} registered ${id} twice.`);
    }
    names.add(id);
  }
  return input;
}

export function packToolByName(
  packs: readonly PackDefinition[],
  toolName: string,
): PackTool | undefined {
  const id = normalizePackToolName(toolName);
  for (const pack of packs) {
    for (const tool of pack.tools) {
      if (normalizePackToolName(tool.name) === id) return tool;
    }
  }
  return undefined;
}

export function packToolRequiresApproval(
  packs: readonly PackDefinition[],
  toolName: string,
): boolean | undefined {
  const tool = packToolByName(packs, toolName);
  if (!tool) return undefined;
  return classificationRequiresApproval(tool.classification);
}
