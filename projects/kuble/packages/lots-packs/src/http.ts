export class PackProviderError extends Error {
  constructor(
    message: string,
    readonly code: "timeout" | "unauthorized" | "failed" | "bad_request",
  ) {
    super(message);
    this.name = "PackProviderError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function packFetch(input: {
  url: string;
  accessToken: string;
  method?: string;
  accept?: string;
  contentType?: string;
  body?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; json: unknown }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetchImpl(input.url, {
      method: input.method ?? "GET",
      signal,
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: input.accept ?? "application/json",
        ...(input.body ? { "content-type": input.contentType ?? "application/json" } : {}),
      },
      body: input.body,
    });
  } catch (error) {
    if (error instanceof PackProviderError) throw error;
    throw new PackProviderError("The provider timed out.", "timeout");
  }
  let json: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  if (response.status === 401) {
    throw new PackProviderError("The connected account needs to be reconnected.", "unauthorized");
  }
  if (!response.ok) {
    throw new PackProviderError("The provider did not accept that request.", "failed");
  }
  return { status: response.status, json };
}

export function requireAccessToken(token: string | undefined): string {
  if (!token?.trim()) {
    throw new PackProviderError("This tool needs a connected account.", "unauthorized");
  }
  return token.trim();
}

export function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

export function numberArg(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function pickFields(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in row) picked[key] = row[key];
  }
  return picked;
}
