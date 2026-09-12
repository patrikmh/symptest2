const SENSITIVE_KEY =
  /^(access_token|refresh_token|id_token|token|secret|password|authorization|api[_-]?key|cookie|credential|client_secret|private_key)$/i;

const SENSITIVE_TEXT =
  /\b(?:Bearer\s+[A-Za-z0-9._\-+/=]+|sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;

export const REDACTED = "[redacted]";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.trim());
}

export function redactSensitiveText(text: string): string {
  return text.replace(SENSITIVE_TEXT, REDACTED);
}

/** Strip secret-shaped keys and token-like strings from pack payloads and activity text. */
export function redactSensitive(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactSensitive(nested),
      ]),
    );
  }
  return value;
}

export function redactSensitiveRecord(value: Record<string, string>): Record<string, string> {
  const redacted = redactSensitive(value);
  if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) return {};
  return Object.fromEntries(Object.entries(redacted).map(([key, nested]) => [key, String(nested)]));
}
