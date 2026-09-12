import type { PackExecuteContext } from "./define-pack.js";
import { PackProviderError, packFetch, pickFields, requireAccessToken, stringArg } from "./http.js";

function gmailRaw(input: { to: string; subject: string; body: string }): string {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function executeGmailTool(
  name: string,
  args: Record<string, unknown>,
  context: PackExecuteContext = {},
): Promise<Record<string, unknown>> {
  const token = requireAccessToken(context.accessToken);
  const request = {
    accessToken: token,
    signal: context.signal,
    fetchImpl: context.fetchImpl,
  };
  switch (name) {
    case "gmail.search":
    case "gmail_search": {
      const query = stringArg(args, "query");
      const { json } = await packFetch({
        ...request,
        url: `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
      });
      const messages = Array.isArray((json as { messages?: unknown }).messages)
        ? ((json as { messages: unknown[] }).messages ?? [])
        : [];
      return {
        messages: messages
          .map((item) => pickFields(item, ["id", "threadId"]))
          .filter((item): item is Record<string, unknown> => item !== null),
      };
    }
    case "gmail.readThread":
    case "gmail_readThread": {
      const threadId = stringArg(args, "threadId");
      if (!threadId) throw new PackProviderError("threadId is required.", "bad_request");
      const { json } = await packFetch({
        ...request,
        url: `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata`,
      });
      return pickFields(json, ["id", "snippet", "historyId"]) ?? {};
    }
    case "gmail.createDraft":
    case "gmail_createDraft": {
      const { json } = await packFetch({
        ...request,
        method: "POST",
        url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        body: JSON.stringify({
          message: {
            raw: gmailRaw({
              to: stringArg(args, "to"),
              subject: stringArg(args, "subject"),
              body: stringArg(args, "body"),
            }),
          },
        }),
      });
      return pickFields(json, ["id", "message"]) ?? { id: null };
    }
    case "gmail.send":
    case "gmail_send": {
      const { json } = await packFetch({
        ...request,
        method: "POST",
        url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        body: JSON.stringify({
          raw: gmailRaw({
            to: stringArg(args, "to"),
            subject: stringArg(args, "subject"),
            body: stringArg(args, "body"),
          }),
        }),
      });
      return pickFields(json, ["id", "threadId", "labelIds"]) ?? {};
    }
    default:
      throw new PackProviderError("Unknown Gmail tool.", "bad_request");
  }
}

export async function findGmailSend(
  request: Record<string, unknown>,
  context: PackExecuteContext,
): Promise<Record<string, unknown> | null> {
  if (!context.accessToken) return null;
  const to = stringArg(request, "to");
  const subject = stringArg(request, "subject");
  if (!to || !subject) return null;
  const query = `in:sent to:${to} subject:"${subject.replaceAll('"', "")}"`;
  try {
    const listed = await executeGmailTool("gmail.search", { query }, context);
    const messages = Array.isArray(listed.messages) ? listed.messages : [];
    const first = messages[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
