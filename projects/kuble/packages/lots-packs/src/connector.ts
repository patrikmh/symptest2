import type {
  AdapterContext,
  ConnectorEvent,
  ConnectorProvider,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import { LOTS_PACKS } from "./catalog.js";
import { classificationRequiresApproval, normalizePackToolName } from "./classification.js";
import type { PackKey } from "./define-pack.js";

export function createLotsPacksConnector(input: {
  listEnabledPackKeys: (context: AdapterContext) => Promise<Iterable<string>>;
}): ConnectorProvider {
  return {
    describe() {
      return {
        id: "lots-packs",
        contractVersion: "1",
        adapterVersion: "0.1.0",
        capabilities: { discover: true, oauth: false, secretsBrokered: true },
      };
    },
    async discoverTools(context) {
      const enabled = new Set(await input.listEnabledPackKeys(context));
      const tools: ConnectorTool[] = [];
      for (const pack of LOTS_PACKS) {
        if (!enabled.has(pack.key)) continue;
        for (const tool of pack.tools) {
          if (pack.key === "web" && (tool.name === "web.search" || tool.name === "web.fetch")) {
            continue;
          }
          tools.push({
            name: normalizePackToolName(tool.name),
            description: tool.description,
            inputSchema: tool.inputSchema,
            readOnly: !classificationRequiresApproval(tool.classification),
            route: { connectorId: "lots-packs", toolName: tool.name, catalogGroup: pack.key },
          });
        }
      }
      return tools;
    },
    async *execute(call, _context): AsyncIterable<ConnectorEvent> {
      const id = normalizePackToolName(call.tool);
      for (const pack of LOTS_PACKS) {
        for (const tool of pack.tools) {
          if (normalizePackToolName(tool.name) !== id) continue;
          if (!tool.execute) {
            yield {
              type: "error",
              message: `${tool.name} needs a connected ${pack.name} account.`,
            };
            return;
          }
          yield { type: "result", data: await tool.execute(call.args) };
          return;
        }
      }
      yield { type: "error", message: `Unknown pack tool: ${call.tool}` };
    },
  };
}

export function isEnabledPackKey(key: string, enabled: Iterable<string>): key is PackKey {
  return [...enabled].includes(key);
}
