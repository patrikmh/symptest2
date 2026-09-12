import { toolRequiresApproval as rakazoToolRequiresApproval } from "@rakazo/core";
import { LOTS_PACKS } from "./catalog.js";
import { packToolRequiresApproval } from "./define-pack.js";

/**
 * Pack classification wins over Rakazo's name heuristics so drafts stay ALLOW
 * and only EXTERNAL_WRITE / DESTRUCTIVE wait (spec §24–§27).
 */
export function lotsToolRequiresApproval(toolName: string, viaConnector: boolean): boolean {
  const pack = packToolRequiresApproval(LOTS_PACKS, toolName);
  if (pack !== undefined) return pack;
  return rakazoToolRequiresApproval(toolName, viaConnector);
}
