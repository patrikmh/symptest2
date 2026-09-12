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

export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
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
    const parsed = (await response.json()) as { access_token?: unknown };
    return typeof parsed.access_token === "string" ? parsed.access_token : null;
  } catch {
    return null;
  }
}

export function providerForPackTool(tool: string): "github" | "google" | null {
  const id = tool.trim().replaceAll(".", "_");
  if (id.startsWith("github_")) return "github";
  if (id.startsWith("gmail_") || id.startsWith("calendar_")) return "google";
  return null;
}
