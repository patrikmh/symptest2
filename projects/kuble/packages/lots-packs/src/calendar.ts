import type { PackExecuteContext } from "./define-pack.js";
import { PackProviderError, packFetch, pickFields, requireAccessToken, stringArg } from "./http.js";

function calendarId(args: Record<string, unknown>): string {
  return stringArg(args, "calendarId") || "primary";
}

function eventFields(value: unknown) {
  return pickFields(value, ["id", "summary", "start", "end", "htmlLink", "status"]) ?? {};
}

export async function executeCalendarTool(
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
  const id = encodeURIComponent(calendarId(args));
  switch (name) {
    case "calendar.listEvents":
    case "calendar_listEvents": {
      const { json } = await packFetch({
        ...request,
        url: `https://www.googleapis.com/calendar/v3/calendars/${id}/events?maxResults=20&singleEvents=true&orderBy=startTime`,
      });
      const items = Array.isArray((json as { items?: unknown }).items)
        ? ((json as { items: unknown[] }).items ?? [])
        : [];
      return { events: items.map(eventFields) };
    }
    case "calendar.searchEvents":
    case "calendar_searchEvents": {
      const query = stringArg(args, "query");
      const { json } = await packFetch({
        ...request,
        url: `https://www.googleapis.com/calendar/v3/calendars/${id}/events?q=${encodeURIComponent(query)}&maxResults=20&singleEvents=true`,
      });
      const items = Array.isArray((json as { items?: unknown }).items)
        ? ((json as { items: unknown[] }).items ?? [])
        : [];
      return { events: items.map(eventFields) };
    }
    case "calendar.checkAvailability":
    case "calendar_checkAvailability": {
      const { json } = await packFetch({
        ...request,
        method: "POST",
        url: "https://www.googleapis.com/calendar/v3/freeBusy",
        body: JSON.stringify({
          timeMin: stringArg(args, "start"),
          timeMax: stringArg(args, "end"),
          items: [{ id: calendarId(args) }],
        }),
      });
      return pickFields(json, ["kind", "timeMin", "timeMax", "calendars"]) ?? {};
    }
    case "calendar.createEvent":
    case "calendar_createEvent": {
      const { json } = await packFetch({
        ...request,
        method: "POST",
        url: `https://www.googleapis.com/calendar/v3/calendars/${id}/events`,
        body: JSON.stringify({
          summary: stringArg(args, "title"),
          start: { dateTime: stringArg(args, "start") },
          end: { dateTime: stringArg(args, "end") || stringArg(args, "start") },
        }),
      });
      return eventFields(json);
    }
    case "calendar.updateEvent":
    case "calendar_updateEvent": {
      const eventId = stringArg(args, "eventId");
      if (!eventId) throw new PackProviderError("eventId is required.", "bad_request");
      const patch: Record<string, unknown> = {};
      if (stringArg(args, "title")) patch.summary = stringArg(args, "title");
      if (stringArg(args, "start")) patch.start = { dateTime: stringArg(args, "start") };
      if (stringArg(args, "end")) patch.end = { dateTime: stringArg(args, "end") };
      const { json } = await packFetch({
        ...request,
        method: "PATCH",
        url: `https://www.googleapis.com/calendar/v3/calendars/${id}/events/${encodeURIComponent(eventId)}`,
        body: JSON.stringify(patch),
      });
      return eventFields(json);
    }
    case "calendar.deleteEvent":
    case "calendar_deleteEvent": {
      const eventId = stringArg(args, "eventId");
      if (!eventId) throw new PackProviderError("eventId is required.", "bad_request");
      await packFetch({
        ...request,
        method: "DELETE",
        url: `https://www.googleapis.com/calendar/v3/calendars/${id}/events/${encodeURIComponent(eventId)}`,
      });
      return { ok: true, id: eventId };
    }
    default:
      throw new PackProviderError("Unknown Calendar tool.", "bad_request");
  }
}

export async function findCalendarEvent(
  request: Record<string, unknown>,
  context: PackExecuteContext,
): Promise<Record<string, unknown> | null> {
  if (!context.accessToken) return null;
  const title = stringArg(request, "title");
  if (!title) return null;
  try {
    const listed = await executeCalendarTool(
      "calendar.searchEvents",
      { query: title, calendarId: stringArg(request, "calendarId") },
      context,
    );
    const events = Array.isArray(listed.events) ? listed.events : [];
    const start = stringArg(request, "start");
    const found = events.find((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as { summary?: unknown; start?: { dateTime?: unknown } };
      if (String(row.summary ?? "") !== title) return false;
      if (!start) return true;
      return String(row.start?.dateTime ?? "") === start;
    });
    return found && typeof found === "object" ? (found as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
