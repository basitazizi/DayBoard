"use client";

import { useEffect, useState } from "react";
import type { DayBoardData } from "@/types/dayboard";
import { getAgenda, timeRangeLabel } from "./agenda";
import { addDays, getLocalDateKey, timeFromMinutes } from "./date-utils";
import type { DraftChange, DraftItem, DraftKind } from "./drafts";
import { answerLocally, type AssistantReply } from "./local-assistant";
import { findFreeSlots } from "./planner";
import { supabase } from "./supabase";
import { getCourseGrade, getWorkItems } from "./work";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResult extends AssistantReply {
  changes?: DraftChange[];
  source: "cloud" | "device";
  error?: string;
}

let statusPromise: Promise<boolean> | null = null;

function fetchStatus() {
  statusPromise ??= fetch("/api/assistant")
    .then((response) => (response.ok ? response.json() : { enabled: false }))
    .then((body: { enabled?: boolean }) => Boolean(body.enabled))
    .catch(() => false);
  return statusPromise;
}

/** Whether the cloud assistant is configured on this deployment. */
export function useAssistantStatus() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void fetchStatus().then((value) => {
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}

/** A compact snapshot of the person's data for the assistant to reason over. */
export function buildAssistantContext(data: DayBoardData, options: { includeNotes?: boolean } = {}, now = new Date()) {
  const today = getLocalDateKey(now, data.timezone);
  const horizon = addDays(today, 21);
  const work = getWorkItems(data, now);
  const days = Array.from({ length: 8 }, (_, index) => addDays(today, index));

  return JSON.stringify({
    today,
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: data.timezone }).format(now),
    local_time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: data.timezone }).format(now),
    timezone: data.timezone,
    classes: data.courses.map((course) => ({ id: course.id, code: course.code, name: course.name, days: course.days, time: course.time, grade_percent: getCourseGrade(data, course.id).percent })),
    open_work: work
      .filter((item) => !item.done)
      .slice(0, 40)
      .map((item) => ({ id: item.id, target: item.kind, title: item.title, due_date: item.dueDate ?? null, due_time: item.dueTime ?? null, class: item.courseId ? item.courseLabel : null, estimated_minutes: item.estimatedMinutes, progress_percent: item.progress, steps: item.steps.map((step) => ({ title: step.title, done: step.done })) })),
    events: data.events
      .filter((event) => (event.date >= today && event.date <= horizon) || (event.repeatType && event.repeatType !== "never"))
      .slice(0, 60)
      .map((event) => ({ id: event.id, target: "event", title: event.title, date: event.date, start: event.startTime, end: event.endTime, repeat: event.repeatType ?? "never", category: event.category })),
    exams: data.exams.filter((exam) => exam.examDate >= today).map((exam) => ({ id: exam.id, target: "exam", title: exam.title, date: exam.examDate, time: exam.examTime || null, class: data.courses.find((course) => course.id === exam.courseId)?.name ?? null, grade_weight: exam.gradeWeight ?? null })),
    schedule_next_8_days: days.map((date) => ({ date, items: getAgenda(data, date).map((item) => `${timeRangeLabel(item)} ${item.title}`) })),
    free_today: findFreeSlots(data, today, { from: Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15, minLength: 30 }).map((slot) => `${timeFromMinutes(slot.start)}-${timeFromMinutes(slot.end)}`),
    habits: data.habits.map((habit) => ({ name: habit.name, done_today: habit.completedToday, streak_days: habit.streak })),
    notes: options.includeNotes ? data.notes.slice(0, 12).map((note) => ({ title: note.title, category: note.category, content: note.content.slice(0, 600) })) : undefined
  });
}

const KINDS: DraftKind[] = ["task", "event", "assignment", "exam", "habit", "note", "class"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(value: unknown, limit = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : undefined;
}

/** Never trust model output: keep only well-formed fields and ids that exist. */
export function sanitizeItems(raw: unknown, data: DayBoardData): DraftItem[] {
  if (!Array.isArray(raw)) return [];
  const courseIds = new Set(data.courses.map((course) => course.id));
  const drafts: DraftItem[] = [];
  for (const entry of raw) {
    const item = entry as Record<string, unknown>;
    const title = text(item?.title);
    if (!title || !KINDS.includes(item.kind as DraftKind)) continue;
    const minutes = typeof item.minutes === "number" && item.minutes > 0 && item.minutes <= 1200 ? Math.round(item.minutes) : undefined;
    const weight = typeof item.grade_weight === "number" && item.grade_weight > 0 && item.grade_weight <= 100 ? item.grade_weight : undefined;
    drafts.push({
      id: crypto.randomUUID(),
      kind: item.kind as DraftKind,
      title,
      date: typeof item.date === "string" && DATE.test(item.date) ? item.date : undefined,
      time: typeof item.time === "string" && TIME.test(item.time) ? item.time : undefined,
      endTime: typeof item.end_time === "string" && TIME.test(item.end_time) ? item.end_time : undefined,
      courseId: typeof item.course_id === "string" && courseIds.has(item.course_id) ? item.course_id : undefined,
      minutes,
      priority: ["low", "medium", "high", "critical"].includes(item.priority as string) ? (item.priority as DraftItem["priority"]) : undefined,
      notes: text(item.notes, 4000),
      location: text(item.location),
      days: text(item.days, 60),
      gradeWeight: weight,
      assignmentType: ["homework", "quiz", "project", "lab", "paper", "midterm", "final", "other"].includes(item.assignment_type as string) ? (item.assignment_type as DraftItem["assignmentType"]) : undefined,
      planStudy: typeof item.plan_study === "boolean" ? item.plan_study : item.kind === "exam" ? true : undefined,
      selected: true
    });
  }
  return drafts;
}

export function sanitizeChanges(raw: unknown, data: DayBoardData): DraftChange[] {
  if (!Array.isArray(raw)) return [];
  const known: Record<string, Map<string, string>> = {
    task: new Map(data.tasks.map((item) => [item.id, item.title])),
    event: new Map(data.events.map((item) => [item.id, item.title])),
    assignment: new Map(data.assignments.map((item) => [item.id, item.title])),
    exam: new Map(data.exams.map((item) => [item.id, item.title]))
  };
  const changes: DraftChange[] = [];
  for (const entry of raw) {
    const change = entry as Record<string, unknown>;
    const target = change?.target as string;
    const targetId = change?.target_id as string;
    if (!known[target]?.has(targetId) || !["reschedule", "complete", "delete"].includes(change.action as string)) continue;
    changes.push({
      id: crypto.randomUUID(),
      action: change.action as DraftChange["action"],
      target: target as DraftChange["target"],
      targetId,
      title: known[target].get(targetId) ?? "Item",
      date: typeof change.date === "string" && DATE.test(change.date) ? change.date : undefined,
      time: typeof change.time === "string" && TIME.test(change.time) ? change.time : undefined,
      selected: true
    });
  }
  return changes;
}

export interface AssistantImage {
  mediaType: "image/jpeg";
  data: string;
}

/** Shrinks a photo in the browser so uploads stay small and fast. */
export async function prepareImage(file: File, maxSide = 1568): Promise<AssistantImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { mediaType: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

interface AskOptions {
  mode?: "chat" | "extract";
  image?: AssistantImage;
  includeNotes?: boolean;
  cloudEnabled: boolean;
}

/**
 * Asks the assistant. Uses the cloud model when it is configured and the person is signed in,
 * and falls back to the on-device assistant otherwise or when the request fails.
 */
export async function askAssistant(turns: ChatTurn[], data: DayBoardData, options: AskOptions): Promise<AssistantResult> {
  const question = turns[turns.length - 1]?.content ?? "";
  const local = (error?: string): AssistantResult => ({ ...answerLocally(question, data), source: "device", error });

  if (!options.cloudEnabled) {
    if (options.image) return { text: "Reading photos needs the full assistant, which is not switched on for this site yet.", source: "device", needsCloud: true };
    return local();
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    if (options.image) return { text: "Sign in to add things from a photo.", source: "device", needsCloud: true };
    const reply = local();
    return reply.needsCloud ? { ...reply, text: `${reply.text} Sign in to ask anything.` } : reply;
  }

  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: options.mode ?? "chat", messages: turns, image: options.image, context: buildAssistantContext(data, { includeNotes: options.includeNotes }) })
    });
    const body = (await response.json().catch(() => ({}))) as { reply?: string; items?: unknown; changes?: unknown; error?: string };
    if (!response.ok) {
      if (options.image) return { text: body.error ?? "The photo could not be read. Please try again.", source: "device", error: body.error };
      return local(body.error ?? "The full assistant is unavailable, so this answer came from your device.");
    }
    return { text: body.reply || "Done.", drafts: sanitizeItems(body.items, data), changes: sanitizeChanges(body.changes, data), source: "cloud" };
  } catch {
    if (options.image) return { text: "Could not reach the assistant. Check your connection and try again.", source: "device" };
    return local("You appear to be offline, so this answer came from your device.");
  }
}
