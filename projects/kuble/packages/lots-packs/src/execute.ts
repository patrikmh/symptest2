import { executeCalendarTool, findCalendarEvent } from "./calendar.js";
import { normalizePackToolName } from "./classification.js";
import type { PackExecuteContext } from "./define-pack.js";
import { executeGithubTool, findGithubWrite } from "./github.js";
import { executeGmailTool, findGmailSend } from "./gmail.js";
import { PackProviderError } from "./http.js";

export async function executePackTool(
  name: string,
  args: Record<string, unknown>,
  context: PackExecuteContext = {},
): Promise<Record<string, unknown>> {
  const id = normalizePackToolName(name);
  if (id.startsWith("github_")) return executeGithubTool(name, args, context);
  if (id.startsWith("gmail_")) return executeGmailTool(name, args, context);
  if (id.startsWith("calendar_")) return executeCalendarTool(name, args, context);
  throw new PackProviderError("Unknown pack tool.", "bad_request");
}

export async function findPackWrite(
  tool: string,
  request: Record<string, unknown>,
  context: PackExecuteContext,
): Promise<Record<string, unknown> | null> {
  const id = normalizePackToolName(tool);
  if (id === "gmail_send") return findGmailSend(request, context);
  if (id === "calendar_createEvent") return findCalendarEvent(request, context);
  if (id === "github_createIssue" || id === "github_commentIssue" || id === "github_commentPull") {
    return findGithubWrite(tool, request, context);
  }
  return null;
}
