import type { DayBoardData, TaskStep } from "@/types/dayboard";
import { getAgenda } from "./agenda";
import { addDays, getDayDistance, getLocalDateKey, nowMinutes, timeFromMinutes } from "./date-utils";
import { getWorkItems } from "./work";

export interface Slot {
  date: string;
  start: number;
  end: number;
}

export interface PlannedSession {
  date: string;
  startTime: string;
  endTime: string;
}

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const PREFERRED_START = 16 * 60;
const BUFFER = 10;

function busyBlocks(data: DayBoardData, dateKey: string, extra: Slot[] = []) {
  const blocks = getAgenda(data, dateKey)
    .filter((item) => item.start !== undefined && item.end !== undefined)
    .map((item) => [item.start! - BUFFER, item.end! + BUFFER] as [number, number]);
  for (const slot of extra) if (slot.date === dateKey) blocks.push([slot.start - BUFFER, slot.end + BUFFER]);
  return blocks.sort((a, b) => a[0] - b[0]);
}

/** Open stretches of a day between `from` and `to`, at least `minLength` minutes long. */
export function findFreeSlots(data: DayBoardData, dateKey: string, options: { from?: number; to?: number; minLength?: number; extra?: Slot[] } = {}): Slot[] {
  const from = options.from ?? DAY_START;
  const to = options.to ?? DAY_END;
  const minLength = options.minLength ?? 30;
  const slots: Slot[] = [];
  let cursor = from;

  for (const [start, end] of busyBlocks(data, dateKey, options.extra)) {
    if (start - cursor >= minLength) slots.push({ date: dateKey, start: cursor, end: Math.min(start, to) });
    cursor = Math.max(cursor, end);
    if (cursor >= to) break;
  }
  if (to - cursor >= minLength) slots.push({ date: dateKey, start: cursor, end: to });
  return slots.filter((slot) => slot.end - slot.start >= minLength);
}

function roundUp(minutes: number, step = 15) {
  return Math.ceil(minutes / step) * step;
}

/** Picks a start time for a session: late afternoon first, then the earliest opening. */
function pickSlot(data: DayBoardData, dateKey: string, duration: number, from: number, extra: Slot[]): Slot | null {
  const slots = findFreeSlots(data, dateKey, { from, minLength: duration, extra });
  if (slots.length === 0) return null;
  const preferred = slots.find((slot) => slot.end - Math.max(slot.start, PREFERRED_START) >= duration);
  const chosen = preferred ?? slots[0];
  const start = roundUp(preferred ? Math.max(chosen.start, PREFERRED_START) : chosen.start);
  if (start + duration > chosen.end) return { date: dateKey, start: chosen.start, end: chosen.start + duration };
  return { date: dateKey, start, end: start + duration };
}

/** Spreads study sessions across the days before a deadline, avoiding what is already on the calendar. */
export function planStudySessions(
  data: DayBoardData,
  options: { dueDate: string; totalMinutes: number; sessionMinutes?: number; maxSessions?: number },
  now = new Date()
): PlannedSession[] {
  const today = getLocalDateKey(now, data.timezone);
  const daysUntil = getDayDistance(options.dueDate, today);
  if (daysUntil < 0) return [];

  const sessionMinutes = options.sessionMinutes ?? 50;
  const wanted = Math.max(1, Math.min(options.maxSessions ?? 4, Math.ceil(options.totalMinutes / sessionMinutes)));
  const candidates: string[] = [];
  for (let offset = 0; offset < Math.max(daysUntil, 1); offset += 1) candidates.push(addDays(today, offset));

  const count = Math.min(wanted, candidates.length);
  const chosenDays = Array.from({ length: count }, (_, index) => candidates[Math.min(candidates.length - 1, Math.round(((index + 0.5) * candidates.length) / count - 0.5))]);
  const planned: Slot[] = [];

  for (const day of [...new Set(chosenDays)]) {
    const from = day === today ? Math.max(DAY_START, roundUp(nowMinutes(now, data.timezone) + 30)) : DAY_START;
    const slot = pickSlot(data, day, sessionMinutes, from, planned);
    if (slot) planned.push(slot);
  }

  return planned.map((slot) => ({ date: slot.date, startTime: timeFromMinutes(slot.start), endTime: timeFromMinutes(slot.end) }));
}

export interface FreeTimeSuggestion {
  slot: Slot;
  workKey: string;
  taskId?: string;
  title: string;
  minutes: number;
}

/** The best remaining opening today, paired with the most pressing piece of open work. */
export function suggestFreeTime(data: DayBoardData, now = new Date()): FreeTimeSuggestion | null {
  const today = getLocalDateKey(now, data.timezone);
  const from = roundUp(nowMinutes(now, data.timezone) + 15);
  if (from >= DAY_END - 30) return null;

  const slots = findFreeSlots(data, today, { from: Math.max(from, DAY_START), minLength: 40 });
  if (slots.length === 0) return null;
  const slot = slots.reduce((best, item) => (item.end - item.start > best.end - best.start ? item : best));

  const scheduledToday = new Set(getAgenda(data, today).map((item) => item.linkedTaskId).filter(Boolean));
  const work = getWorkItems(data, now).find((item) => !item.done && !(item.kind === "task" && scheduledToday.has(item.id)));
  if (!work) return null;

  const minutes = Math.min(slot.end - slot.start, Math.max(30, Math.min(work.estimatedMinutes || 45, 90)));
  return { slot: { ...slot, end: slot.start + minutes }, workKey: work.key, taskId: work.kind === "task" ? work.id : undefined, title: work.title, minutes };
}

function step(title: string, minutes?: number): TaskStep {
  return { id: crypto.randomUUID(), title, done: false, minutes };
}

/** A sensible first breakdown for a large piece of work. The assistant can replace it with a tailored one. */
export function defaultSteps(kind: "exam" | "paper" | "project" | "lab" | "general", totalMinutes: number): TaskStep[] {
  const part = (share: number) => Math.max(15, Math.round((totalMinutes * share) / 5) * 5);
  if (kind === "exam") return [step("Review notes and key concepts", part(0.3)), step("Work through practice problems", part(0.4)), step("Timed past paper, then fix weak spots", part(0.3))];
  if (kind === "paper") return [step("Research and outline", part(0.25)), step("Write the first draft", part(0.5)), step("Revise and proofread", part(0.25))];
  if (kind === "project") return [step("Plan the pieces", part(0.2)), step("Build the main part", part(0.55)), step("Test, polish and submit", part(0.25))];
  if (kind === "lab") return [step("Organise data and results", part(0.35)), step("Write up method and analysis", part(0.45)), step("Check and submit", part(0.2))];
  if (totalMinutes < 90) return [];
  const chunks = Math.min(4, Math.ceil(totalMinutes / 50));
  return Array.from({ length: chunks }, (_, index) => step(`Part ${index + 1} of ${chunks}`, Math.round(totalMinutes / chunks / 5) * 5));
}
