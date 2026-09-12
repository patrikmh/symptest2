import { redactSensitiveRecord, redactSensitiveText } from "@lots/core";

const PREVIEW_KEYS = ["to", "subject", "title", "collection", "name", "body"] as const;

export function extractApprovalArgs(request: unknown): Record<string, unknown> {
  if (Array.isArray(request) && request[2] && typeof request[2] === "object") {
    return request[2] as Record<string, unknown>;
  }
  if (request && typeof request === "object" && !Array.isArray(request)) {
    return request as Record<string, unknown>;
  }
  return {};
}

export function approvalPreview(request: unknown): Record<string, string> {
  const args = extractApprovalArgs(request);
  const preview: Record<string, string> = {};
  for (const key of PREVIEW_KEYS) {
    const value = args[key];
    if (value == null || value === "") continue;
    preview[key] = String(value).slice(0, 280);
  }
  return redactSensitiveRecord(preview);
}

export function approvalSummary(tool: string, request: unknown, askText?: string | null): string {
  if (askText?.trim()) {
    return redactSensitiveText(
      askText
        .trim()
        .replace(/^Review before /i, "")
        .replace(/\?$/, ""),
    );
  }
  if (tool === "schedule_create") return "Create Fyr";
  if (tool === "create_space") return "Create space";
  const args = extractApprovalArgs(request);
  const target = args.to ?? args.title ?? args.subject ?? args.name;
  if (target) return redactSensitiveText(`${tool} → ${String(target)}`);
  return tool.replaceAll("_", " ");
}
