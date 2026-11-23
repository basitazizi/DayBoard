import type { Assignment, DayBoardData, Task, TaskStep, Tone } from "@/types/dayboard";
import { courseOf, courseTone } from "./agenda";
import { formatShortTime, getDayDistance, getLocalDateKey, getRelativeDayLabel } from "./date-utils";
import { getTaskPriority } from "./task-priority";

/** A task or an assignment, shown as one kind of thing in lists. */
export interface WorkItem {
  key: string;
  kind: "task" | "assignment";
  id: string;
  title: string;
  detail: string;
  dueDate?: string;
  dueTime?: string;
  dueLabel: string;
  overdue: boolean;
  dueToday: boolean;
  done: boolean;
  inProgress: boolean;
  estimatedMinutes: number;
  progress: number;
  steps: TaskStep[];
  courseId?: string;
  courseLabel: string;
  tone: Tone;
  urgency: Tone;
  score: number;
  reason: string;
  /** Imported from Canvas. */
  imported?: boolean;
}

function assignmentAsTask(assignment: Assignment): Task {
  const heavy = (assignment.gradeWeight ?? 0) >= 15 || assignment.difficulty >= 4;
  return {
    id: assignment.id,
    title: assignment.title,
    dueDate: assignment.dueDate || undefined,
    dueTime: assignment.dueTime || undefined,
    priority: heavy ? "high" : "medium",
    status: assignment.status === "in_progress" ? "in_progress" : assignment.status === "not_started" ? "not_started" : "completed",
    estimatedMinutes: assignment.estimatedMinutes,
    actualMinutes: assignment.actualMinutes,
    category: "School",
    progressPercent: assignment.status === "in_progress" ? 50 : 0,
    autoRollover: false,
    createdAt: ""
  };
}

function dueLabel(dueDate: string | undefined, dueTime: string | undefined, today: string) {
  if (!dueDate) return "No date";
  const distance = getDayDistance(dueDate, today);
  const time = dueTime ? ` ${formatShortTime(dueTime)}` : "";
  if (distance < 0) return distance === -1 ? "Yesterday" : `${Math.abs(distance)} days late`;
  if (distance === 0) return dueTime && dueTime >= "18:00" ? `Tonight${time}` : `Today${time}`;
  if (distance === 1) return `Tomorrow${time}`;
  if (distance < 7) return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${dueDate}T12:00:00`)) + time;
  return getRelativeDayLabel(dueDate, today);
}

function urgencyTone(distance: number | null, done: boolean): Tone {
  if (done) return "neutral";
  if (distance === null) return "neutral";
  if (distance <= 0) return "rose";
  if (distance <= 2) return "amber";
  return "green";
}

function describeTask(task: Task) {
  const steps = task.steps ?? [];
  if (steps.length > 0) return `${steps.filter((item) => item.done).length} of ${steps.length} steps`;
  if (task.estimatedMinutes > 0) return `About ${task.estimatedMinutes >= 60 ? `${Math.round((task.estimatedMinutes / 60) * 10) / 10}h` : `${task.estimatedMinutes} min`}`;
  return task.description?.trim() || "";
}

/** All open and finished work, most pressing first. */
export function getWorkItems(data: DayBoardData, now = new Date()): WorkItem[] {
  const today = getLocalDateKey(now, data.timezone);
  const items: WorkItem[] = [];

  for (const task of data.tasks) {
    if (task.status === "cancelled") continue;
    const priority = getTaskPriority(task, now);
    const distance = task.dueDate ? getDayDistance(task.dueDate, today) : null;
    const done = task.status === "completed";
    const course = courseOf(data, task.courseId);
    items.push({
      key: `task-${task.id}`,
      kind: "task",
      id: task.id,
      title: task.title,
      detail: describeTask(task),
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      dueLabel: done ? "Done" : dueLabel(task.dueDate, task.dueTime, today),
      overdue: !done && distance !== null && distance < 0,
      dueToday: distance === 0,
      done,
      inProgress: task.status === "in_progress",
      estimatedMinutes: task.estimatedMinutes,
      progress: done ? 100 : task.progressPercent,
      steps: task.steps ?? [],
      courseId: task.courseId,
      courseLabel: course?.name ?? task.category,
      tone: courseTone(data, task.courseId, "neutral"),
      urgency: urgencyTone(distance, done),
      score: priority.score,
      reason: priority.reason
    });
  }

  for (const assignment of data.assignments) {
    const needle = assignment.title.toLowerCase();
    const duplicate = data.tasks.some((task) => task.dueDate === assignment.dueDate && task.title.toLowerCase().includes(needle) && /created from/i.test(task.description ?? ""));
    if (duplicate) continue;
    const asTask = assignmentAsTask(assignment);
    const priority = getTaskPriority(asTask, now);
    const distance = assignment.dueDate ? getDayDistance(assignment.dueDate, today) : null;
    const done = assignment.status === "submitted" || assignment.status === "graded";
    const course = courseOf(data, assignment.courseId);
    items.push({
      key: `assignment-${assignment.id}`,
      kind: "assignment",
      id: assignment.id,
      title: assignment.title,
      detail: [assignment.assignmentType !== "other" ? assignment.assignmentType[0].toUpperCase() + assignment.assignmentType.slice(1) : "", assignment.gradeWeight ? `${assignment.gradeWeight}% of grade` : "", assignment.estimatedMinutes ? `${assignment.estimatedMinutes} min` : ""].filter(Boolean).join(" · "),
      dueDate: assignment.dueDate || undefined,
      dueTime: assignment.dueTime || undefined,
      dueLabel: done ? (assignment.score !== undefined ? `Graded ${assignment.score}%` : "Submitted") : dueLabel(assignment.dueDate || undefined, assignment.dueTime || undefined, today),
      overdue: !done && distance !== null && distance < 0,
      dueToday: distance === 0,
      done,
      inProgress: assignment.status === "in_progress",
      estimatedMinutes: assignment.estimatedMinutes,
      progress: done ? 100 : assignment.steps?.length ? Math.round(assignment.steps.filter((step) => step.done).length / assignment.steps.length * 100) : assignment.status === "in_progress" ? 50 : 0,
      steps: assignment.steps ?? [],
      courseId: assignment.courseId || undefined,
      courseLabel: course?.name ?? "School",
      tone: courseTone(data, assignment.courseId, "neutral"),
      urgency: urgencyTone(distance, done),
      score: priority.score + Math.min((assignment.gradeWeight ?? 0) * 2, 40),
      reason: priority.reason,
      imported: Boolean(assignment.sourceMeta)
    });
  }

  return items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
  });
}

export interface CourseGrade {
  percent: number | null;
  gradedCount: number;
}

/** Weighted average of the scores entered for a class. Items without a weight count as 5%. */
export function getCourseGrade(data: DayBoardData, courseId: string): CourseGrade {
  const scored = [
    ...data.assignments.filter((item) => item.courseId === courseId && item.score !== undefined).map((item) => ({ score: item.score!, weight: item.gradeWeight })),
    ...data.exams.filter((item) => item.courseId === courseId && item.score !== undefined).map((item) => ({ score: item.score!, weight: item.gradeWeight }))
  ];
  if (scored.length === 0) return { percent: null, gradedCount: 0 };
  const totalWeight = scored.reduce((sum, item) => sum + (item.weight && item.weight > 0 ? item.weight : 5), 0);
  const weighted = scored.reduce((sum, item) => sum + item.score * (item.weight && item.weight > 0 ? item.weight : 5), 0);
  return { percent: Math.round((weighted / totalWeight) * 10) / 10, gradedCount: scored.length };
}
