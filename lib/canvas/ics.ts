/**
 * A small, strict iCalendar (RFC 5545) reader for Canvas calendar feeds.
 * Pure functions only: runs the same on the server, in the browser and in tests.
 */

export interface IcsDateTime {
  /** YYYY-MM-DD in the student's timezone. */
  date: string;
  /** HH:MM in the student's timezone, or "" for all-day values. */
  time: string;
  allDay: boolean;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  url: string;
  start: IcsDateTime | null;
  end: IcsDateTime | null;
}

/** Joins folded lines: a line that starts with a space or tab continues the previous one. */
export function unfoldLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

/** Reverses iCalendar text escaping: \n, \N, \, \; and \\. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_match, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Splits `NAME;PARAM=x;PARAM="y:z":value` at the first colon outside quotes. */
export function parseProperty(line: string): Property | null {
  let inQuotes = false;
  let split = -1;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ":" && !inQuotes) {
      split = index;
      break;
    }
  }
  if (split <= 0) return null;
  const [rawName, ...rawParams] = line.slice(0, split).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf("=");
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: rawName.toUpperCase(), params, value: line.slice(split + 1) };
}

function isValidTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds `timezone` is ahead of UTC at the given instant. */
function zoneOffset(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
}

/** The real moment a wall-clock time happens in `timezone` (handles daylight-saving changes). */
export function wallTimeToInstant(year: number, month: number, day: number, hour: number, minute: number, second: number, timezone: string) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wall - zoneOffset(wall, timezone);
  instant = wall - zoneOffset(instant, timezone);
  return instant;
}

/** Date and time of an instant in `timezone`. */
export function instantToLocal(instant: number, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/**
 * Reads a DTSTART/DTEND value into the student's timezone:
 *   VALUE=DATE:20261124            all day
 *   20261125T065900Z               UTC
 *   TZID=America/Denver:20261124T235900   wall time in that zone
 *   20261124T235900                floating: already the student's local time
 */
export function parseIcsDate(value: string, params: Record<string, string>, studentTimezone: string): IcsDateTime | null {
  const trimmed = value.trim();
  if (params.VALUE === "DATE" || /^\d{8}$/.test(trimmed)) {
    const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    return match ? { date: `${match[1]}-${match[2]}-${match[3]}`, time: "", allDay: true } : null;
  }

  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = "00", utc] = match;
  const parts = [Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s)] as const;

  let instant: number;
  if (utc) instant = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  else if (params.TZID && isValidTimeZone(params.TZID)) instant = wallTimeToInstant(...parts, params.TZID);
  else return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, allDay: false };

  return { ...instantToLocal(instant, studentTimezone), allDay: false };
}

/** Every VEVENT in a feed, with text unescaped and dates in the student's timezone. */
export function parseIcs(text: string, studentTimezone: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;
  let depth = 0;

  for (const line of unfoldLines(text)) {
    if (!line.trim()) continue;
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = { uid: "", summary: "", description: "", url: "", start: null, end: null };
      depth = 0;
      continue;
    }
    if (!current) continue;
    // Skip nested components such as VALARM inside an event.
    if (upper.startsWith("BEGIN:")) {
      depth += 1;
      continue;
    }
    if (upper.startsWith("END:") && depth > 0) {
      depth -= 1;
      continue;
    }
    if (upper === "END:VEVENT") {
      if (current.uid && current.start) events.push(current as IcsEvent);
      current = null;
      continue;
    }
    if (depth > 0) continue;

    const property = parseProperty(line);
    if (!property) continue;
    switch (property.name) {
      case "UID":
        current.uid = property.value.trim();
        break;
      case "SUMMARY":
        current.summary = unescapeText(property.value).trim();
        break;
      case "DESCRIPTION":
        current.description = unescapeText(property.value);
        break;
      case "URL":
        current.url = property.value.trim();
        break;
      case "DTSTART":
        current.start = parseIcsDate(property.value, property.params, studentTimezone);
        break;
      case "DTEND":
        current.end = parseIcsDate(property.value, property.params, studentTimezone);
        break;
    }
  }
  return events;
}
