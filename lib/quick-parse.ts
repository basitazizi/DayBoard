import type { Assignment, Course, DayBoardData } from "@/types/dayboard";
import { addDays, getLocalDateKey, timeFromMinutes, weekdayOf } from "./date-utils";
import type { DraftItem, DraftKind } from "./drafts";

/**
 * Local natural-language parser for Quick Add.
 * Runs entirely on the device: "Chem exam Friday 9am and bio essay due next Wednesday"
 * becomes an exam and an assignment with the right dates, linked to the right classes.
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_PATTERN = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_PATTERN = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const STOP_WORDS = new Set(["his", "her", "the", "for", "and", "per", "pro", "con", "man", "can", "eng", "due", "set", "new", "act"]);

const STARTERS = "remind|add|buy|call|email|text|finish|study|read|write|submit|pay|book|schedule|pick|send|review|clean|do|get|make|start";
const TYPE_WORDS = "exam|midterm|final|test|quiz|essay|homework|hw|assignment|paper|project|lab|report|meeting|appointment|dentist|doctor|class|lecture|gym|practice";

interface Found<T> {
  value: T;
  text: string;
}

function toKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findDate(text: string, today: string): Found<string> | null {
  const lower = text.toLowerCase();
  let match: RegExpMatchArray | null;

  if ((match = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { value: match[0], text: match[0] };

  if ((match = lower.match(/\b(today|tonight|this (?:morning|afternoon|evening))\b/))) return { value: today, text: match[0] };
  if ((match = lower.match(/\b(tomorrow|tmrw|tmr|tomorow)(?: (?:morning|afternoon|evening|night))?\b/))) return { value: addDays(today, 1), text: match[0] };
  if ((match = lower.match(/\bday after tomorrow\b/))) return { value: addDays(today, 2), text: match[0] };
  if ((match = lower.match(/\bin (\d+|a|an|one|two|three|four|five|six|seven) (day|week)s?\b/))) {
    const count = /^\d+$/.test(match[1]) ? Number(match[1]) : match[1] === "a" || match[1] === "an" ? 1 : NUMBER_WORDS[match[1]] ?? 1;
    return { value: addDays(today, count * (match[2] === "week" ? 7 : 1)), text: match[0] };
  }
  if ((match = lower.match(/\bnext week\b/))) return { value: addDays(today, 7), text: match[0] };

  if ((match = lower.match(new RegExp(`\\b(?:(?:on|by|this|next|due)\\s+)*${WEEKDAY_PATTERN}\\b`)))) {
    const target = WEEKDAYS.findIndex((day) => day.startsWith(match![1].slice(0, 3)));
    const current = weekdayOf(today);
    let ahead = (target - current + 7) % 7;
    if (ahead === 0) ahead = 7;
    // "next Wednesday" said on a Monday means the Wednesday of the following week.
    if (/\bnext\b/.test(match[0]) && current + ahead <= 6) ahead += 7;
    return { value: addDays(today, ahead), text: match[0] };
  }

  const year = Number(today.slice(0, 4));
  const resolveYear = (month: number, day: number, explicit?: number) => {
    if (explicit) return toKey(explicit < 100 ? 2000 + explicit : explicit, month, day);
    const key = toKey(year, month, day);
    return key < today ? toKey(year + 1, month, day) : key;
  };

  if ((match = lower.match(new RegExp(`\\b(?:(?:on|by|due)\\s+)?${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`)))) {
    const month = MONTHS.indexOf(match[1].slice(0, 3)) + 1;
    return { value: resolveYear(month, Number(match[2]), match[3] ? Number(match[3]) : undefined), text: match[0] };
  }
  if ((match = lower.match(new RegExp(`\\b(?:(?:on|by|due)\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_PATTERN}\\b`)))) {
    const month = MONTHS.indexOf(match[2].slice(0, 3)) + 1;
    return { value: resolveYear(month, Number(match[1])), text: match[0] };
  }
  if ((match = lower.match(/\b(?:(?:on|by|due)\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { value: resolveYear(month, day, match[3] ? Number(match[3]) : undefined), text: match[0] };
  }
  return null;
}

function to24(hour: number, minute: number, meridiem?: string) {
  let value = hour % 12;
  if (meridiem) {
    if (meridiem.startsWith("p")) value += 12;
  } else if (hour >= 1 && hour <= 7) {
    value = hour + 12;
  } else {
    value = hour;
  }
  return timeFromMinutes(value * 60 + minute);
}

function findTime(text: string): Found<{ start: string; end?: string }> | null {
  const lower = text.toLowerCase();
  let match: RegExpMatchArray | null;

  if ((match = lower.match(/\b(?:at |by )?noon\b/))) return { value: { start: "12:00" }, text: match[0] };
  if ((match = lower.match(/\b(?:at |by )?midnight\b/))) return { value: { start: "23:59" }, text: match[0] };

  if ((match = lower.match(/\b(?:from |at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/))) {
    const endMeridiem = match[6];
    const startMeridiem = match[3] ?? (Number(match[1]) > Number(match[4]) && endMeridiem.startsWith("p") ? "am" : endMeridiem);
    return { value: { start: to24(Number(match[1]), Number(match[2] ?? 0), startMeridiem), end: to24(Number(match[4]), Number(match[5] ?? 0), endMeridiem) }, text: match[0] };
  }
  if ((match = lower.match(/\b(?:at |by |@ ?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/))) {
    const hour = Number(match[1]);
    if (hour >= 1 && hour <= 12) return { value: { start: to24(hour, Number(match[2] ?? 0), match[3]) }, text: match[0] };
  }
  if ((match = lower.match(/\b(?:at |by |@ ?)(\d{1,2}):(\d{2})\b/))) {
    const hour = Number(match[1]);
    if (hour <= 23) return { value: { start: hour > 12 ? timeFromMinutes(hour * 60 + Number(match[2])) : to24(hour, Number(match[2])) }, text: match[0] };
  }
  if ((match = lower.match(/\b(?:at|@) ?(\d{1,2})\b(?!\s*(?:\/|min|hour|day|week|%))/))) {
    const hour = Number(match[1]);
    if (hour >= 1 && hour <= 12) return { value: { start: to24(hour, 0) }, text: match[0] };
  }
  if ((match = lower.match(new RegExp(`\\bat (${Object.keys(NUMBER_WORDS).join("|")})(?: (thirty))?(?: o'?clock)?(?: (am|pm))?\\b`)))) {
    return { value: { start: to24(NUMBER_WORDS[match[1]], match[2] ? 30 : 0, match[3]) }, text: match[0] };
  }
  return null;
}

function findDuration(text: string): Found<number> | null {
  const match = text.toLowerCase().match(/\b(?:for |takes? |about |~)?(\d+(?:\.\d+)?|an?|half an?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/);
  if (!match) return null;
  const amount = match[1].startsWith("half") ? 0.5 : /^an?$/.test(match[1]) ? 1 : Number(match[1]);
  const minutes = /^h/.test(match[2]) ? amount * 60 : amount;
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) return null;
  return { value: Math.round(minutes), text: match[0] };
}

function findCourse(text: string, courses: Course[]): Found<Course> | null {
  const words: string[] = text.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [];
  let best: { course: Course; word: string; weight: number } | null = null;

  for (const course of courses) {
    const code = course.code.toLowerCase();
    const codeCompact = code.replace(/\s+/g, "");
    const nameWords: string[] = course.name.toLowerCase().match(/[a-z]+/g) ?? [];
    for (const word of words) {
      let weight = 0;
      if (word === codeCompact || word === code.split(/\s+/)[0]) weight = 5;
      else if (nameWords.includes(word) && word.length > 2) weight = 4;
      else if (word.length >= 3 && !STOP_WORDS.has(word) && nameWords.some((nameWord) => nameWord.length > word.length && nameWord.startsWith(word))) weight = 3;
      if (weight > (best?.weight ?? 0)) best = { course, word, weight };
    }
  }
  return best ? { value: best.course, text: best.word } : null;
}

function detectKind(lower: string, hasTime: boolean, hasCourse: boolean): { kind: DraftKind; assignmentType?: Assignment["assignmentType"] } {
  if (/^\s*note\b/.test(lower) || /\b(jot down|write down|note that)\b/.test(lower)) return { kind: "note" };
  if (/\b(every (?:day|morning|night|evening|weekday)|daily|each day|habit)\b/.test(lower)) return { kind: "habit" };
  if (/\b(final)\b/.test(lower) && /\b(exam|final)\b/.test(lower) && !/\b(paper|project|draft|essay)\b/.test(lower)) return { kind: "exam" };
  if (/\b(exam|midterm|test|quiz)\b/.test(lower)) return { kind: "exam" };
  if (/\b(essay|paper)\b/.test(lower)) return { kind: "assignment", assignmentType: "paper" };
  if (/\b(lab report|lab write-?up)\b/.test(lower)) return { kind: "assignment", assignmentType: "lab" };
  if (/\bproject\b/.test(lower)) return { kind: "assignment", assignmentType: "project" };
  if (/\b(homework|hw|assignment|problem set|pset|worksheet|reading response|report)\b/.test(lower)) return { kind: "assignment", assignmentType: "homework" };
  if (hasCourse && /\bdue\b/.test(lower)) return { kind: "assignment", assignmentType: "homework" };
  if (/\b(remind me|due|by)\b/.test(lower)) return { kind: "task" };
  if (/\b(meeting|appointment|dentist|doctor|class|lecture|seminar|practice|game|party|dinner|lunch|interview|gym|workout|shift|office hours|haircut|flight)\b/.test(lower)) return { kind: "event" };
  if (hasTime) return { kind: "event" };
  return { kind: "task" };
}

function splitSegments(text: string) {
  const rough = text
    .replace(/[ \t]+/g, " ")
    .split(/\s*(?:;|\n+|\.\s+(?=[A-Z])|,\s*and\s+|,\s*then\s+|\s+and also\s+|\s+and then\s+|\s+also\s+)\s*/i)
    // A comma starts a new item unless what follows continues the same one ("Nov 20, 2026", "essay, due Friday").
    .flatMap((part) => part.split(/,\s+(?!\d|(?:at|on|by|in|from|until|till|due|for|with|to)\b)/i))
    .filter(Boolean);
  const segments: string[] = [];
  const joiner = new RegExp(`\\s+and\\s+(?=(?:${STARTERS})\\b|(?:(?:my|a|an|the)\\s+)?(?:\\w+\\s+){0,2}(?:${TYPE_WORDS})\\b)`, "i");
  for (const part of rough) {
    for (const piece of part.split(joiner)) if (piece.trim()) segments.push(piece.trim());
  }
  return segments;
}

function cleanTitle(segment: string, removals: string[], course: Found<Course> | null, kind: DraftKind) {
  let title = segment;
  for (const piece of removals.filter(Boolean).sort((a, b) => b.length - a.length)) {
    title = title.replace(new RegExp(piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  }
  title = title
    .replace(/^\s*(?:please\s+)?(?:remind me to|remind me about|remind me|add|i have|i've got|i need to|i have to|i gotta|there'?s|schedule|put|create|new|note:?)\s+/i, "")
    .replace(/^(?:a|an|my|the)\s+/i, "")
    .replace(/\b(?:to|on|in) my (?:calendar|tasks|list|to-?do list)\b/gi, " ")
    .replace(/\b(?:every (?:day|morning|night|evening|weekday)|daily|each day)\b/gi, " ")
    .replace(/\s+(?:is |that's |which is )?(?:due|on|at|by|for|this|next|from|until)\s*$/i, "")
    .replace(/\s+(?:is |are )?due\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:-]+|[\s,.:-]+$/g, "");

  if (course && (kind === "exam" || kind === "assignment")) {
    const pattern = new RegExp(`\\b${course.text}\\b`, "i");
    title = pattern.test(title) ? title.replace(pattern, course.value.name) : `${course.value.name} ${title}`;
  }
  if (!title) title = kind === "exam" ? "Exam" : kind === "event" ? "Event" : "Untitled";
  return title[0].toUpperCase() + title.slice(1);
}

export function parseQuickAdd(input: string, data: DayBoardData, now = new Date()): DraftItem[] {
  const today = getLocalDateKey(now, data.timezone);
  const drafts: DraftItem[] = [];

  for (const segment of splitSegments(input.trim())) {
    const date = findDate(segment, today);
    const afterDate = date ? segment.replace(new RegExp(date.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ") : segment;
    const time = findTime(afterDate);
    const afterTime = time ? afterDate.replace(new RegExp(time.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ") : afterDate;
    const duration = findDuration(afterTime);
    const course = findCourse(segment, data.courses);
    const lower = segment.toLowerCase();
    const { kind, assignmentType } = detectKind(lower, Boolean(time), Boolean(course));
    const title = cleanTitle(segment, [date?.text ?? "", time?.text ?? "", kind === "habit" ? "" : (duration?.text ?? "")], course, kind);

    const evening = /\b(tonight|evening)\b/.test(lower);
    const morning = /\bmorning\b/.test(lower);
    const afternoon = /\bafternoon\b/.test(lower);
    const impliedTime = kind === "event" ? (morning ? "09:00" : afternoon ? "15:00" : evening ? "19:00" : undefined) : undefined;

    drafts.push({
      id: crypto.randomUUID(),
      kind,
      title,
      date: date?.value,
      time: time?.value.start ?? impliedTime,
      endTime: time?.value.end,
      courseId: kind === "habit" ? undefined : course?.value.id,
      minutes: duration?.value,
      priority: /\b(urgent|asap|important|critical)\b/.test(lower) ? "high" : undefined,
      assignmentType: /\bquiz\b/.test(lower) ? "quiz" : assignmentType,
      planStudy: kind === "exam" ? true : undefined,
      selected: true
    });
  }
  return drafts;
}

/** True when a sentence reads as "add this" rather than a question. */
export function looksLikeAddRequest(input: string) {
  const lower = input.trim().toLowerCase();
  if (!lower) return false;
  if (/\?\s*$/.test(lower) || /^(what|when|where|who|why|how|which|do i|am i|can you (?:explain|tell)|is |are |should|explain|tell me|show me|list|summari[sz]e)\b/.test(lower)) return false;
  return true;
}
