export type PackTokenSecret = {
  accessToken: string;
  refreshToken: string | null;
};

export function packTokensFromSecret(raw: string): PackTokenSecret | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const access =
      typeof parsed.access_token === "string"
        ? parsed.access_token
        : typeof parsed.accessToken === "string"
          ? parsed.accessToken
          : "";
    if (!access.trim()) return null;
    const refresh =
      typeof parsed.refresh_token === "string"
        ? parsed.refresh_token
        : typeof parsed.refreshToken === "string"
          ? parsed.refreshToken
          : null;
    return { accessToken: access.trim(), refreshToken: refresh?.trim() || null };
  } catch {
    return null;
  }
}

export type GoogleRefreshedTokens = {
  accessToken: string;
  refreshToken: string | null;
};

export async function refreshGoogleTokens(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleRefreshedTokens | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
    };
    if (typeof parsed.access_token !== "string" || !parsed.access_token.trim()) return null;
    return {
      accessToken: parsed.access_token.trim(),
      refreshToken:
        typeof parsed.refresh_token === "string" ? parsed.refresh_token.trim() || null : null,
    };
  } catch {
    return null;
  }
}

export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  return (await refreshGoogleTokens(input))?.accessToken ?? null;
}

/** Keep the stored OAuth JSON, replacing only the access token (and refresh if Google rotated it). */
export function applyGoogleAccessToken(
  rawSecret: string,
  accessToken: string,
  refreshToken?: string | null,
): string {
  try {
    const parsed = JSON.parse(rawSecret) as Record<string, unknown>;
    parsed.access_token = accessToken;
    if (typeof parsed.accessToken === "string") parsed.accessToken = accessToken;
    if (refreshToken) {
      parsed.refresh_token = refreshToken;
      if (typeof parsed.refreshToken === "string") parsed.refreshToken = refreshToken;
    }
    return JSON.stringify(parsed);
  } catch {
    return JSON.stringify({
      access_token: accessToken,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
    });
  }
}

export function providerForPackTool(tool: string): "github" | "google" | null {
  const id = tool.trim().replaceAll(".", "_");
  if (id.startsWith("github_")) return "github";
  if (id.startsWith("gmail_") || id.startsWith("calendar_")) return "google";
  return null;
}
