/**
 * Computer check for first-run onboarding (spec §38 step 5) and Settings → System.
 * Prefer `/health/computer`; `/health` still works via the `sandbox` field.
 */
export type ComputerHealth = {
  ready: boolean;
  sandbox: string | null;
};

export function computerHealthFromSandbox(sandbox: string | null | undefined): ComputerHealth {
  const value = typeof sandbox === "string" ? sandbox.trim() : "";
  return { ready: value.length > 0 && value !== "none", sandbox: value || null };
}

export function computerHealthFromPayload(
  payload: { sandbox?: unknown; ready?: unknown; ok?: unknown } | null | undefined,
): ComputerHealth {
  const sandbox = typeof payload?.sandbox === "string" ? payload.sandbox : null;
  if (typeof payload?.ready === "boolean") {
    return { ready: payload.ready, sandbox };
  }
  if (typeof payload?.ok === "boolean") {
    return { ready: payload.ok && computerHealthFromSandbox(sandbox).ready, sandbox };
  }
  return computerHealthFromSandbox(sandbox);
}
