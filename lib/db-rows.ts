import type { Assignment, CalendarEvent, Course, Exam, Task, TaskStep, Tone } from "../types/dayboard";
import { metaFromRow, metaToRow } from "./canvas/rows";
import { formatTime } from "./date-utils";

/**
 * Database row ⇄ app object mapping, shared by the browser (lib/local-data.ts) and the server (Canvas sync).
 */

export type Row = Record<string, any>;

export const TONES: Tone[] = ["teal", "blue", "amber", "rose", "green", "accent"];

export function timeValue(value: string | null | undefined) {
  return value?.slice(0, 5) ?? "";
}

export function isUuid(value?: string | null) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const TASK_STATUSES = ["not_started", "in_progress", "paused", "completed", "overdue", "cancelled"] as const;
export const EVENT_CATEGORIES = ["school", "work", "personal", "gym", "study", "appointment", "deadline", "social", "other"] as const;
export const ASSIGNMENT_TYPES = ["homework", "quiz", "project", "lab", "paper", "midterm", "final", "other"] as const;
export const ASSIGNMENT_STATUSES = ["not_started", "in_progress", "submitted", "graded"] as const;
export const REPEAT_TYPES = ["never", "daily", "weekdays", "weekly", "biweekly", "monthly", "custom"] as const;

export function parseSteps(value: unknown): TaskStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step) => step && typeof step.title === "string")
    .map((step, index) => ({
      id: typeof step.id === "string" ? step.id : `step-${index}`,
      title: String(step.title).slice(0, 200),
      done: Boolean(step.done),
      minutes: typeof step.minutes === "number" ? step.minutes : undefined
    }));
}

export function mapTask(row: Row): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    dueDate: row.due_date ?? undefined,
    dueTime: row.due_time ? timeValue(row.due_time) : undefined,
    priority: oneOf(row.priority, PRIORITIES, "medium"),
    status: oneOf(row.status, TASK_STATUSES, "not_started"),
    estimatedMinutes: row.estimated_minutes ?? 0,
    actualMinutes: 0,
    category: row.category ?? "Personal",
    progressPercent: row.progress_percent ?? 0,
    autoRollover: row.auto_rollover ?? true,
    steps: parseSteps(row.steps),
    courseId: row.course_id ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined
  };
}

export function mapEvent(row: Row): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    startTime: row.start_time ? timeValue(row.start_time) : "09:00",
    endTime: row.end_time ? timeValue(row.end_time) : "10:00",
    allDay: row.all_day ?? false,
    category: oneOf(row.category, EVENT_CATEGORIES, "other"),
    location: row.location ?? undefined,
    description: row.description ?? undefined,
    priority: oneOf(row.priority, PRIORITIES, "medium"),
    linkedTaskId: row.linked_task_id ?? undefined,
    autoPlanned: row.auto_planned ?? false,
    repeatType: oneOf(row.repeat_type, REPEAT_TYPES, "never"),
    repeatDays: row.repeat_days ?? undefined,
    sourceMeta: metaFromRow(row)
  };
}

export function courseTimeLabel(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return "To be announced";
  return `${formatTime(timeValue(startTime))}-${formatTime(timeValue(endTime))}`;
}

export function mapCourse(row: Row, index = 0): Course {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    days: row.days ?? "To be announced",
    time: courseTimeLabel(row.start_time, row.end_time),
    room: row.room ?? "TBA",
    startTime: row.start_time ? timeValue(row.start_time) : undefined,
    endTime: row.end_time ? timeValue(row.end_time) : undefined,
    color: oneOf(row.color, TONES, TONES[index % TONES.length])
  };
}

export function mapAssignment(row: Row): Assignment {
  return {
    id: row.id,
    courseId: row.course_id ?? "",
    title: row.title,
    assignmentType: oneOf(row.assignment_type, ASSIGNMENT_TYPES, "homework"),
    dueDate: row.due_date ?? "",
    dueTime: row.due_time ? timeValue(row.due_time) : "",
    estimatedMinutes: row.estimated_minutes ?? 0,
    actualMinutes: row.actual_minutes ?? 0,
    gradeWeight: row.grade_weight ?? undefined,
    difficulty: row.difficulty ?? 3,
    steps: parseSteps(row.steps),
    score: typeof row.score === "number" ? row.score : row.score != null ? Number(row.score) : undefined,
    status: oneOf(row.status, ASSIGNMENT_STATUSES, "not_started"),
    notes: row.notes ?? undefined,
    sourceMeta: metaFromRow(row)
  };
}

export function mapExam(row: Row): Exam {
  return {
    id: row.id,
    courseId: row.course_id ?? "",
    title: row.title,
    examDate: row.exam_date,
    examTime: row.exam_time ? timeValue(row.exam_time) : "",
    gradeWeight: row.grade_weight ?? undefined,
    studyMinutesGoal: row.study_minutes_goal ?? 0,
    studyMinutesCompleted: row.study_minutes_completed ?? 0,
    importanceScore: row.importance_score ?? 0,
    score: row.score != null ? Number(row.score) : undefined,
    notes: row.notes ?? undefined,
    planStudy: row.plan_study ?? undefined,
    studyPlannedFor: row.study_planned_for ?? undefined,
    sourceMeta: metaFromRow(row)
  };
}

/** Insert payloads for Canvas-created items (course id already resolved to a real id or null). */
export function assignmentInsertRow(item: Omit<Assignment, "id">, courseId: string | null): Row {
  return {
    course_id: courseId,
    title: item.title,
    assignment_type: item.assignmentType,
    due_date: item.dueDate || null,
    due_time: item.dueTime || null,
    estimated_minutes: item.estimatedMinutes,
    actual_minutes: 0,
    difficulty: item.difficulty,
    steps: item.steps ?? [],
    status: item.status,
    notes: item.notes ?? null,
    ...metaToRow(item.sourceMeta)
  };
}

export function examInsertRow(item: Omit<Exam, "id">, courseId: string | null): Row {
  return {
    course_id: courseId,
    title: item.title,
    exam_date: item.examDate,
    exam_time: item.examTime || null,
    study_minutes_goal: item.studyMinutesGoal,
    study_minutes_completed: 0,
    importance_score: item.importanceScore,
    notes: item.notes ?? null,
    plan_study: item.planStudy ?? true,
    ...metaToRow(item.sourceMeta)
  };
}

export function eventInsertRow(item: Omit<CalendarEvent, "id">): Row {
  return {
    title: item.title,
    event_date: item.date,
    start_time: item.startTime,
    end_time: item.endTime,
    all_day: item.allDay ?? false,
    category: item.category,
    description: item.description ?? null,
    repeat_type: "never",
    priority: item.priority,
    auto_planned: false,
    status: "upcoming",
    ...metaToRow(item.sourceMeta)
  };
}
