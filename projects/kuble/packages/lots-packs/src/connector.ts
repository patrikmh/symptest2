import type {
  AdapterContext,
  ConnectorEvent,
  ConnectorProvider,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import { LOTS_PACKS } from "./catalog.js";
import { classificationRequiresApproval, normalizePackToolName } from "./classification.js";
import type { PackAccessTokenResolver, PackGoogleRefresh } from "./credentials.js";
import type { PackDefinition, PackKey, PackTool } from "./define-pack.js";
import { PackProviderError } from "./http.js";

export function createLotsPacksConnector(input: {
  listEnabledPackKeys: (context: AdapterContext) => Promise<Iterable<string>>;
  resolveAccessToken?: PackAccessTokenResolver;
  refreshGoogleToken?: PackGoogleRefresh;
  fetchImpl?: typeof fetch;
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
    async *execute(call, context): AsyncIterable<ConnectorEvent> {
      const id = normalizePackToolName(call.tool);
      for (const pack of LOTS_PACKS) {
        for (const tool of pack.tools) {
          if (normalizePackToolName(tool.name) !== id) continue;
          const accessToken =
            pack.connection === "none"
              ? undefined
              : ((await input.resolveAccessToken?.(context, pack.connection)) ?? undefined);
          if (pack.connection !== "none" && !accessToken) {
            yield {
              type: "error",
              message: `${tool.name} needs a connected ${pack.name} account.`,
            };
            return;
          }
          if (!tool.execute) {
            yield {
              type: "error",
              message: `${tool.name} needs a connected ${pack.name} account.`,
            };
            return;
          }
          try {
            yield {
              type: "result",
              data: await runPackTool(tool, call.args, accessToken, context, input.fetchImpl),
            };
          } catch (error) {
            const retried = await retryGoogleAfterUnauthorized({
              error,
              pack,
              accessToken,
              refreshGoogleToken: input.refreshGoogleToken,
              context,
              fetchImpl: input.fetchImpl,
            });
            if (retried) {
              try {
                yield {
                  type: "result",
                  data: await runPackTool(tool, call.args, retried, context, input.fetchImpl),
                };
                return;
              } catch (retryError) {
                yield { type: "error", message: packExecuteError(retryError) };
                return;
              }
            }
            yield { type: "error", message: packExecuteError(error) };
          }
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

function runPackTool(
  tool: PackTool,
  args: Record<string, unknown>,
  accessToken: string | undefined,
  context: AdapterContext,
  fetchImpl?: typeof fetch,
): Promise<Record<string, unknown>> {
  return Promise.resolve(
    tool.execute!(args, {
      accessToken,
      signal: context.signal,
      fetchImpl,
    }),
  );
}

function packExecuteError(error: unknown): string {
  return error instanceof PackProviderError
    ? error.message
    : "The provider did not accept that request.";
}

async function retryGoogleAfterUnauthorized(input: {
  error: unknown;
  pack: PackDefinition;
  accessToken: string | undefined;
  refreshGoogleToken?: PackGoogleRefresh;
  context: AdapterContext;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  if (!(input.error instanceof PackProviderError) || input.error.code !== "unauthorized") {
    return null;
  }
  if (input.pack.connection !== "google" || !input.accessToken || !input.refreshGoogleToken) {
    return null;
  }
  try {
    const next = await input.refreshGoogleToken(input.context, input.fetchImpl);
    return next && next !== input.accessToken ? next : null;
  } catch {
    return null;
  }
}
