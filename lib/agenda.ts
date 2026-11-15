import type { CalendarEvent, Course, DayBoardData, EventCategory, Tone } from "@/types/dayboard";
import { addDays, formatShortTime, getDayDistance, getLocalDateKey, minutesFromTime, nowMinutes, timeFromMinutes, weekdayOf } from "./date-utils";

export type AgendaKind = "event" | "class" | "study" | "task" | "assignment" | "exam";

/** One thing that happens or is due on a day, whatever table it came from. */
export interface AgendaItem {
  key: string;
  kind: AgendaKind;
  sourceId: string;
  title: string;
  date: string;
  /** Minutes from midnight. Timed items have start and end; due items only have `due`. */
  start?: number;
  end?: number;
  due?: number;
  allDay?: boolean;
  detail: string;
  tone: Tone;
  done: boolean;
  planned: boolean;
  courseId?: string;
  linkedTaskId?: string;
}

const CATEGORY_TONE: Record<EventCategory, Tone> = {
  school: "blue",
  work: "neutral",
  personal: "accent",
  gym: "green",
  study: "amber",
  appointment: "rose",
  deadline: "rose",
  social: "teal",
  other: "neutral"
};

const DAY_WORDS: Array<[RegExp, number]> = [
  [/sun/g, 0],
  [/mon/g, 1],
  [/tue/g, 2],
  [/wed/g, 3],
  [/thu/g, 4],
  [/fri/g, 5],
  [/sat/g, 6]
];

/** Reads free-text class days such as "Mon, Wed", "MWF", "TTh" or "Tue/Thu" into weekday numbers (0 = Sunday). */
export function parseCourseDays(days: string | undefined): number[] {
  if (!days) return [];
  const text = days.toLowerCase();
  const found = new Set<number>();
  for (const [pattern, day] of DAY_WORDS) if (text.match(pattern)) found.add(day);
  if (found.size > 0) return [...found].sort();

  const letters = text.replace(/[^a-z]/g, "");
  if (!letters || letters.length > 8 || /[^mtwrfsuha]/.test(letters)) return [];
  for (let index = 0; index < letters.length; index += 1) {
    const pair = letters.slice(index, index + 2);
    if (pair === "th") { found.add(4); index += 1; }
    else if (pair === "tu") { found.add(2); index += 1; }
    else if (pair === "su") { found.add(0); index += 1; }
    else if (pair === "sa") { found.add(6); index += 1; }
    else if (letters[index] === "m") found.add(1);
    else if (letters[index] === "t") found.add(2);
    else if (letters[index] === "w") found.add(3);
    else if (letters[index] === "r") found.add(4);
    else if (letters[index] === "f") found.add(5);
    else if (letters[index] === "s") found.add(6);
    else if (letters[index] === "u") found.add(0);
  }
  return [...found].sort();
}

export function eventOccursOn(event: CalendarEvent, dateKey: string) {
  if (event.date === dateKey) return true;
  const repeat = event.repeatType ?? "never";
  if (repeat === "never" || dateKey < event.date) return false;
  const day = weekdayOf(dateKey);
  if (repeat === "daily") return true;
  if (repeat === "weekdays") return day >= 1 && day <= 5;
  if (repeat === "weekly") return day === weekdayOf(event.date);
  if (repeat === "biweekly") return getDayDistance(dateKey, event.date) % 14 === 0;
  if (repeat === "monthly") return dateKey.slice(8) === event.date.slice(8);
  if (repeat === "custom") return (event.repeatDays ?? []).includes(day);
  return false;
}

export function courseOf(data: DayBoardData, courseId?: string): Course | undefined {
  return courseId ? data.courses.find((course) => course.id === courseId) : undefined;
}

export function courseTone(data: DayBoardData, courseId?: string, fallback: Tone = "accent"): Tone {
  return courseOf(data, courseId)?.color ?? fallback;
}

function isLegacyDuplicate(data: DayBoardData, title: string, dueDate: string) {
  const needle = title.toLowerCase();
  return data.tasks.some((task) => task.dueDate === dueDate && task.title.toLowerCase().includes(needle) && /created from/i.test(task.description ?? ""));
}

export function timeRangeLabel(item: Pick<AgendaItem, "start" | "end" | "due" | "allDay">) {
  if (item.allDay) return "All day";
  if (item.start !== undefined && item.end !== undefined) return `${formatShortTime(timeFromMinutes(item.start))} – ${formatShortTime(timeFromMinutes(item.end))}`;
  if (item.start !== undefined) return formatShortTime(timeFromMinutes(item.start));
  if (item.due !== undefined) return `Due ${formatShortTime(timeFromMinutes(item.due))}`;
  return "Any time";
}

/** Everything on one day, in the order a person would meet it. */
export function getAgenda(data: DayBoardData, dateKey: string): AgendaItem[] {
  const items: AgendaItem[] = [];
  const day = weekdayOf(dateKey);

  for (const event of data.events) {
    if (!eventOccursOn(event, dateKey)) continue;
    const study = event.category === "study" || event.autoPlanned;
    const linkedTask = event.linkedTaskId ? data.tasks.find((task) => task.id === event.linkedTaskId) : undefined;
    items.push({
      key: `event-${event.id}-${dateKey}`,
      kind: study ? "study" : "event",
      sourceId: event.id,
      title: event.title,
      date: dateKey,
      start: event.allDay ? undefined : minutesFromTime(event.startTime),
      end: event.allDay ? undefined : minutesFromTime(event.endTime),
      allDay: event.allDay,
      detail: event.location || event.description || "",
      tone: linkedTask?.courseId ? courseTone(data, linkedTask.courseId, CATEGORY_TONE[event.category]) : CATEGORY_TONE[event.category],
      done: false,
      planned: Boolean(event.autoPlanned),
      linkedTaskId: event.linkedTaskId
    });
  }

  for (const course of data.courses) {
    if (!course.startTime || !course.endTime || !parseCourseDays(course.days).includes(day)) continue;
    items.push({
      key: `class-${course.id}-${dateKey}`,
      kind: "class",
      sourceId: course.id,
      title: course.name,
      date: dateKey,
      start: minutesFromTime(course.startTime),
      end: minutesFromTime(course.endTime),
      detail: course.room && course.room !== "TBA" ? course.room : course.code,
      tone: course.color ?? "blue",
      done: false,
      planned: false,
      courseId: course.id
    });
  }

  for (const exam of data.exams) {
    if (exam.examDate !== dateKey) continue;
    const start = exam.examTime ? minutesFromTime(exam.examTime) : undefined;
    items.push({
      key: `exam-${exam.id}`,
      kind: "exam",
      sourceId: exam.id,
      title: exam.title,
      date: dateKey,
      start,
      end: start !== undefined ? Math.min(start + 90, 24 * 60 - 1) : undefined,
      detail: courseOf(data, exam.courseId)?.name ?? "Exam",
      tone: "amber",
      done: exam.score !== undefined,
      planned: false,
      courseId: exam.courseId || undefined
    });
  }

  for (const task of data.tasks) {
    if (task.dueDate !== dateKey || task.status === "cancelled") continue;
    items.push({
      key: `task-${task.id}`,
      kind: "task",
      sourceId: task.id,
      title: task.title,
      date: dateKey,
      due: task.dueTime ? minutesFromTime(task.dueTime) : undefined,
      detail: courseOf(data, task.courseId)?.name ?? task.category,
      tone: courseTone(data, task.courseId, "accent"),
      done: task.status === "completed",
      planned: false,
      courseId: task.courseId
    });
  }

  for (const assignment of data.assignments) {
    if (assignment.dueDate !== dateKey || isLegacyDuplicate(data, assignment.title, dateKey)) continue;
    items.push({
      key: `assignment-${assignment.id}`,
      kind: "assignment",
      sourceId: assignment.id,
      title: assignment.title,
      date: dateKey,
      due: assignment.dueTime ? minutesFromTime(assignment.dueTime) : undefined,
      detail: courseOf(data, assignment.courseId)?.name ?? "Assignment",
      tone: courseTone(data, assignment.courseId, "accent"),
      done: assignment.status === "submitted" || assignment.status === "graded",
      planned: false,
      courseId: assignment.courseId || undefined
    });
  }

  return items.sort((a, b) => sortValue(a) - sortValue(b) || a.title.localeCompare(b.title));
}

function sortValue(item: AgendaItem) {
  if (item.allDay) return -1;
  return item.start ?? item.due ?? 24 * 60;
}

export interface UpNext {
  item: AgendaItem;
  /** Minutes until it starts; 0 or negative when it is happening now. */
  startsIn: number;
  happeningNow: boolean;
  dayOffset: number;
}

/** The next timed thing: something in progress, else the next start today, else the first one tomorrow. */
export function getUpNext(data: DayBoardData, now = new Date()): UpNext | null {
  const today = getLocalDateKey(now, data.timezone);
  const current = nowMinutes(now, data.timezone);
  const timedToday = getAgenda(data, today).filter((item) => item.start !== undefined && !item.done);

  const active = timedToday.find((item) => item.start! <= current && (item.end ?? item.start!) > current);
  if (active) return { item: active, startsIn: active.start! - current, happeningNow: true, dayOffset: 0 };

  const later = timedToday.find((item) => item.start! > current);
  if (later) return { item: later, startsIn: later.start! - current, happeningNow: false, dayOffset: 0 };

  const tomorrow = getAgenda(data, addDays(today, 1)).find((item) => item.start !== undefined);
  if (tomorrow) return { item: tomorrow, startsIn: 24 * 60 - current + tomorrow.start!, happeningNow: false, dayOffset: 1 };
  return null;
}

export function formatCountdown(minutes: number) {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
