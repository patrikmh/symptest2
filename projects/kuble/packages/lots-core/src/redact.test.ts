import { describe, expect, it } from "vitest";
import { REDACTED, redactSensitive, redactSensitiveRecord, redactSensitiveText } from "./redact.js";

describe("redactSensitive", () => {
  it("replaces secret-shaped keys and token-like strings", () => {
    expect(
      redactSensitive({
        to: "ada@example.com",
        access_token: "secret-value",
        nested: { refresh_token: "r1", subject: "Hello" },
        note: "Authorization Bearer abc.def.ghi",
      }),
    ).toEqual({
      to: "ada@example.com",
      access_token: REDACTED,
      nested: { refresh_token: REDACTED, subject: "Hello" },
      note: `Authorization ${REDACTED}`,
    });
    expect(redactSensitiveText("key sk-abcdefghijklmnopqrstuvwxyz")).toContain(REDACTED);
    expect(redactSensitiveRecord({ body: "ok", apiKey: "nope" })).toEqual({
      body: "ok",
      apiKey: REDACTED,
    });
  });
});
