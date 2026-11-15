import type { Assignment, DayBoardData, EventCategory, Habit, TaskPriority } from "@/types/dayboard";
import { addDays, getLocalDateKey, minutesFromTime, timeFromMinutes } from "./date-utils";
import type { DayBoardStore } from "./local-data";
import { defaultSteps, planStudySessions } from "./planner";

export type DraftKind = "task" | "event" | "assignment" | "exam" | "habit" | "note" | "class";

/** Something the assistant or Quick Add proposes to create. Nothing is saved until the person confirms. */
export interface DraftItem {
  id: string;
  kind: DraftKind;
  title: string;
  date?: string;
  time?: string;
  endTime?: string;
  courseId?: string;
  minutes?: number;
  priority?: TaskPriority;
  notes?: string;
  location?: string;
  days?: string;
  gradeWeight?: number;
  assignmentType?: Assignment["assignmentType"];
  planStudy?: boolean;
  selected: boolean;
}

/** A proposed change to something that already exists. */
export interface DraftChange {
  id: string;
  action: "reschedule" | "complete" | "delete";
  target: "task" | "event" | "assignment" | "exam";
  targetId: string;
  title: string;
  date?: string;
  time?: string;
  selected: boolean;
}

export const DRAFT_LABEL: Record<DraftKind, string> = {
  task: "Task",
  event: "Event",
  assignment: "Assignment",
  exam: "Exam",
  habit: "Habit",
  note: "Note",
  class: "Class"
};

export function guessEventCategory(title: string): EventCategory {
  const text = title.toLowerCase();
  if (/\b(gym|workout|run|lift|practice|training|yoga|swim)\b/.test(text)) return "gym";
  if (/\b(dentist|doctor|appointment|checkup|haircut|therapy|advis)/.test(text)) return "appointment";
  if (/\b(meeting|shift|work|interview|standup)\b/.test(text)) return "work";
  if (/\b(class|lecture|seminar|lab|office hours|tutorial)\b/.test(text)) return "school";
  if (/\b(study|revise|revision|review)\b/.test(text)) return "study";
  if (/\b(party|dinner|lunch|coffee|birthday|date|hangout|movie)\b/.test(text)) return "social";
  return "personal";
}

function guessHabitIcon(title: string): Habit["icon"] {
  const text = title.toLowerCase();
  if (/\b(gym|workout|run|lift|exercise|stretch|walk|pushup)/.test(text)) return "dumbbell";
  if (/\b(read|study|flashcard|review|journal|write)/.test(text)) return "book";
  if (/\b(water|drink|hydrate)/.test(text)) return "droplet";
  if (/\b(meditat|sleep|breath|outside|vegetable|eat)/.test(text)) return "leaf";
  return "target";
}

function stepKind(title: string, kind: DraftKind, assignmentType?: Assignment["assignmentType"]) {
  if (kind === "exam") return "exam" as const;
  if (assignmentType === "paper" || /\b(essay|paper|report)\b/i.test(title)) return "paper" as const;
  if (assignmentType === "project" || /\bproject\b/i.test(title)) return "project" as const;
  if (assignmentType === "lab" || /\blab (report|write-?up)\b/i.test(title)) return "lab" as const;
  return "general" as const;
}

export interface ApplyResult {
  added: number;
  changed: number;
  plannedSessions: number;
  undo: () => void;
}

/** Saves confirmed drafts through the store and returns a way to take them back. */
export function applyDrafts(store: DayBoardStore, items: DraftItem[], changes: DraftChange[] = [], options: { autoPlan?: boolean } = {}): ApplyResult {
  const data: DayBoardData = store.data;
  const today = getLocalDateKey(new Date(), data.timezone);
  const undoSteps: Array<() => void> = [];
  let added = 0;
  let changed = 0;
  let plannedSessions = 0;

  for (const item of items.filter((draft) => draft.selected && draft.title.trim())) {
    const title = item.title.trim();
    added += 1;

    if (item.kind === "task") {
      const minutes = item.minutes ?? 30;
      const id = store.addTask({
        title,
        description: item.notes ?? "",
        dueDate: item.date,
        dueTime: item.time,
        priority: item.priority ?? "medium",
        estimatedMinutes: minutes,
        category: item.courseId ? "School" : "Personal",
        autoRollover: true,
        courseId: item.courseId,
        steps: minutes >= 60 ? defaultSteps(stepKind(title, "task"), minutes) : []
      });
      undoSteps.push(() => store.deleteTask(id));
    } else if (item.kind === "event") {
      const startTime = item.time ?? "09:00";
      const endTime = item.endTime ?? timeFromMinutes(minutesFromTime(startTime) + (item.minutes ?? 60));
      const id = store.addEvent({
        title,
        date: item.date ?? today,
        startTime,
        endTime,
        allDay: !item.time,
        category: guessEventCategory(title),
        location: item.location,
        description: item.notes,
        priority: item.priority ?? "medium",
        repeatType: "never"
      });
      undoSteps.push(() => store.deleteEvent(id));
    } else if (item.kind === "assignment") {
      const minutes = item.minutes ?? 60;
      const id = store.addAssignment({
        courseId: item.courseId ?? "",
        title,
        assignmentType: item.assignmentType ?? "homework",
        dueDate: item.date ?? today,
        dueTime: item.time ?? "23:59",
        estimatedMinutes: minutes,
        gradeWeight: item.gradeWeight,
        difficulty: 3
      });
      undoSteps.push(() => store.deleteAssignment(id));
    } else if (item.kind === "exam") {
      const date = item.date ?? addDays(today, 7);
      const studyMinutes = item.minutes ?? 150;
      const examId = store.addExam({ courseId: item.courseId ?? "", title, examDate: date, examTime: item.time ?? "", gradeWeight: item.gradeWeight, studyMinutesGoal: studyMinutes });
      undoSteps.push(() => store.deleteExam(examId));

      if (item.planStudy ?? options.autoPlan ?? true) {
        const taskId = store.addTask({
          title: `Prepare for ${title}`,
          description: "Study plan created by DayBoard.",
          dueDate: date,
          dueTime: item.time,
          priority: "high",
          estimatedMinutes: studyMinutes,
          category: "School",
          autoRollover: false,
          courseId: item.courseId,
          steps: defaultSteps("exam", studyMinutes)
        });
        undoSteps.push(() => store.deleteTask(taskId));
        for (const session of planStudySessions(data, { dueDate: date, totalMinutes: studyMinutes })) {
          plannedSessions += 1;
          const eventId = store.addEvent({
            title: `Study: ${title}`,
            date: session.date,
            startTime: session.startTime,
            endTime: session.endTime,
            category: "study",
            priority: "high",
            repeatType: "never",
            linkedTaskId: taskId,
            autoPlanned: true
          });
          undoSteps.push(() => store.deleteEvent(eventId));
        }
      }
    } else if (item.kind === "habit") {
      const id = store.addHabit({ name: title, icon: guessHabitIcon(title), scheduleType: "daily", targetDays: [0, 1, 2, 3, 4, 5, 6] });
      undoSteps.push(() => store.deleteHabit(id));
    } else if (item.kind === "note") {
      const course = data.courses.find((entry) => entry.id === item.courseId);
      const id = store.addNote({ title, content: item.notes ?? "", pinned: false, category: course?.name ?? "Quick" });
      undoSteps.push(() => store.deleteNote(id));
    } else if (item.kind === "class") {
      const code = title.split(/\s+/).slice(0, 2).join(" ").toUpperCase().slice(0, 12);
      const id = store.addCourse({ code, name: title, days: item.days ?? "", startTime: item.time, endTime: item.endTime, room: item.location ?? "" });
      undoSteps.push(() => store.deleteCourse(id));
    }
  }

  for (const change of changes.filter((entry) => entry.selected)) {
    if (change.target === "task") {
      const task = data.tasks.find((entry) => entry.id === change.targetId);
      if (!task) continue;
      changed += 1;
      if (change.action === "complete") {
        store.updateTaskStatus(task.id, "completed");
        undoSteps.push(() => store.updateTaskStatus(task.id, task.status));
      } else if (change.action === "delete") {
        store.deleteTask(task.id);
      } else {
        store.updateTask(task.id, { dueDate: change.date ?? task.dueDate, dueTime: change.time ?? task.dueTime });
        undoSteps.push(() => store.updateTask(task.id, { dueDate: task.dueDate, dueTime: task.dueTime }));
      }
    } else if (change.target === "event") {
      const event = data.events.find((entry) => entry.id === change.targetId);
      if (!event) continue;
      changed += 1;
      if (change.action === "delete" || change.action === "complete") {
        store.deleteEvent(event.id);
      } else {
        const { id: _id, ...rest } = event;
        const length = minutesFromTime(event.endTime) - minutesFromTime(event.startTime);
        const startTime = change.time ?? event.startTime;
        store.updateEvent(event.id, { ...rest, date: change.date ?? event.date, startTime, endTime: timeFromMinutes(minutesFromTime(startTime) + Math.max(length, 15)) });
        undoSteps.push(() => store.updateEvent(event.id, rest));
      }
    } else if (change.target === "assignment") {
      const assignment = data.assignments.find((entry) => entry.id === change.targetId);
      if (!assignment) continue;
      changed += 1;
      if (change.action === "complete") {
        store.updateAssignment(assignment.id, { status: "submitted" });
        undoSteps.push(() => store.updateAssignment(assignment.id, { status: assignment.status }));
      } else if (change.action === "delete") {
        store.deleteAssignment(assignment.id);
      } else {
        store.updateAssignment(assignment.id, { dueDate: change.date ?? assignment.dueDate, dueTime: change.time ?? assignment.dueTime });
        undoSteps.push(() => store.updateAssignment(assignment.id, { dueDate: assignment.dueDate, dueTime: assignment.dueTime }));
      }
    } else if (change.target === "exam") {
      const exam = data.exams.find((entry) => entry.id === change.targetId);
      if (!exam) continue;
      changed += 1;
      if (change.action === "delete") {
        store.deleteExam(exam.id);
      } else if (change.action === "reschedule") {
        store.updateExam(exam.id, { examDate: change.date ?? exam.examDate, examTime: change.time ?? exam.examTime });
        undoSteps.push(() => store.updateExam(exam.id, { examDate: exam.examDate, examTime: exam.examTime }));
      }
    }
  }

  return { added, changed, plannedSessions, undo: () => undoSteps.reverse().forEach((step) => step()) };
}

export function describeResult(result: ApplyResult) {
  const parts: string[] = [];
  if (result.added) parts.push(`Added ${result.added} item${result.added === 1 ? "" : "s"}`);
  if (result.changed) parts.push(`${result.added ? "updated" : "Updated"} ${result.changed}`);
  if (result.plannedSessions) parts.push(`planned ${result.plannedSessions} study session${result.plannedSessions === 1 ? "" : "s"}`);
  return parts.length ? `${parts.join(", ")}.` : "Nothing to add.";
}
