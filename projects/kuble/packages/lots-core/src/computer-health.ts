/**
 * Computer check for first-run onboarding (spec §38 step 5).
 * `/health/computer` arrives in Phase 7; until then the web reads `sandbox`
 * from `/health`.
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
  payload: { sandbox?: unknown } | null | undefined,
): ComputerHealth {
  const sandbox = typeof payload?.sandbox === "string" ? payload.sandbox : null;
  return computerHealthFromSandbox(sandbox);
}
