import type { Assignment, Course } from "../../types/dayboard";
import { parseIcs, type IcsEvent } from "./ics";

/** One importable item from a Canvas feed, already in the student's timezone. Only the fields DayBoard keeps. */
export interface CanvasItem {
  externalId: string;
  kind: "assignment" | "exam" | "event";
  title: string;
  /** "" when the summary had no [Course Name]. */
  courseName: string;
  assignmentType: Assignment["assignmentType"];
  date: string;
  /** "" for all-day items. */
  time: string;
  endTime: string;
  allDay: boolean;
  url: string;
  /** Plain-text description, trimmed; "" when it adds nothing. */
  note: string;
}

const NOTE_LIMIT = 300;

/** Splits "Lab 4 report [CHEM 201 Fall 2026]" into the title and the course name. */
export function splitSummary(summary: string): { title: string; courseName: string } {
  const match = summary.match(/^(.*?)\s*\[([^\[\]]+)\]\s*$/);
  if (!match || !match[1].trim()) return { title: summary.trim(), courseName: "" };
  return { title: match[1].trim(), courseName: match[2].trim() };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Canvas descriptions are HTML-ish: turn them into a short plain-text note, or "" if there's nothing useful. */
export function toPlainNote(description: string, title: string): string {
  const text = description
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
      const lower = code.toLowerCase();
      if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith("#") && lower !== "#39") return String.fromCodePoint(Number(lower.slice(1)));
      return ENTITIES[lower] ?? entity;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (text.length < 12) return "";
  if (text.toLowerCase() === title.toLowerCase()) return "";
  if (/^(no description|see (canvas|below)|n\/a|none)\.?$/i.test(text)) return "";
  if (text.length <= NOTE_LIMIT) return text;
  return `${text.slice(0, NOTE_LIMIT - 1).replace(/\s+\S*$/, "")}…`;
}

const EXAM_WORDS = /\b(exam|midterm|mid-term|test)\b/i;
const FINAL_WORK = /\b(project|paper|essay|report|presentation|draft|portfolio|reflection)\b/i;

export function isExamTitle(title: string) {
  if (/\bpractice\b/i.test(title) && /\bquiz\b/i.test(title)) return false;
  return EXAM_WORDS.test(title) || (/\bfinal\b/i.test(title) && !FINAL_WORK.test(title));
}

export function assignmentTypeFor(title: string): Assignment["assignmentType"] {
  if (/\bquiz(zes)?\b/i.test(title)) return "quiz";
  if (/\blab\b/i.test(title)) return "lab";
  if (/\b(essay|paper)\b/i.test(title)) return "paper";
  if (/\bproject\b/i.test(title)) return "project";
  return "homework";
}

/** Assignment, exam or calendar event, from the Canvas UID and the title. */
export function classifyEvent(event: IcsEvent, options: { importNotes: boolean }): CanvasItem | null {
  if (!event.start) return null;
  const { title, courseName } = splitSummary(event.summary);
  if (!title) return null;
  const isAssignment = /assignment/i.test(event.uid);
  const kind: CanvasItem["kind"] = isExamTitle(title) ? "exam" : isAssignment ? "assignment" : "event";
  const end = event.end && !event.end.allDay && event.end.date === event.start.date ? event.end.time : "";
  return {
    externalId: event.uid.slice(0, 300),
    kind,
    title: title.slice(0, 200),
    courseName: courseName.slice(0, 200),
    assignmentType: assignmentTypeFor(title),
    date: event.start.date,
    time: event.start.time,
    endTime: end,
    allDay: event.start.allDay,
    url: /^https:\/\//i.test(event.url) ? event.url.slice(0, 1000) : "",
    note: options.importNotes ? toPlainNote(event.description, title) : ""
  };
}

/** Parse + classify a whole feed. */
export function readCanvasFeed(text: string, timezone: string, options: { importNotes: boolean }): CanvasItem[] {
  const seen = new Set<string>();
  const items: CanvasItem[] = [];
  for (const event of parseIcs(text, timezone)) {
    const item = classifyEvent(event, options);
    if (!item || seen.has(item.externalId)) continue;
    seen.add(item.externalId);
    items.push(item);
  }
  return items;
}

/** Lowercase letters and digits only, single-spaced. */
export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value: string) {
  return new Set(normalizeName(value).split(" ").filter((word) => word.length > 1));
}

/** How alike two titles are, 0 to 1 (shared words over all words). */
export function titleSimilarity(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * Best DayBoard class for a Canvas course name, or null. Canvas names often look like
 * "CHEM 201-01: General Chemistry (Fall 2026)", so a match on the class code or name is enough.
 */
export function matchCourse(canvasName: string, courses: Course[]): Course | null {
  if (!canvasName) return null;
  const target = normalizeName(canvasName);
  const compactTarget = target.replace(/ /g, "");
  let best: { course: Course; score: number } | null = null;
  for (const course of courses) {
    const code = normalizeName(course.code);
    const name = normalizeName(course.name);
    let score = 0;
    if (code && code.length >= 3 && compactTarget.includes(code.replace(/ /g, ""))) score = 0.95;
    if (name && (target === name)) score = Math.max(score, 1);
    else if (name && name.length >= 4 && target.includes(name)) score = Math.max(score, 0.9);
    else score = Math.max(score, titleSimilarity(canvasName, course.name) * 0.9);
    if (score > (best?.score ?? 0)) best = { course, score };
  }
  return best && best.score >= 0.6 ? best.course : null;
}

/** "Found 5 courses, 23 assignments, 3 exams" for the preview. */
export function summarizeItems(items: CanvasItem[]) {
  const courses = new Map<string, { assignments: number; exams: number; events: number }>();
  for (const item of items) {
    const key = item.courseName || "No course";
    const entry = courses.get(key) ?? { assignments: 0, exams: 0, events: 0 };
    if (item.kind === "assignment") entry.assignments += 1;
    else if (item.kind === "exam") entry.exams += 1;
    else entry.events += 1;
    courses.set(key, entry);
  }
  return {
    courses: [...courses.entries()].map(([name, counts]) => ({ name, ...counts })).sort((a, b) => a.name.localeCompare(b.name)),
    assignments: items.filter((item) => item.kind === "assignment").length,
    exams: items.filter((item) => item.kind === "exam").length,
    events: items.filter((item) => item.kind === "event").length
  };
}
