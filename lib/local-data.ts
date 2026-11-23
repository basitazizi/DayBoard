"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Assignment, CalendarEvent, Course, DayBoardData, Exam, Habit, HabitLog, Note, SourceMeta, Task } from "@/types/dayboard";
import { ASSIGNMENT_FIELD_MAP, EVENT_FIELD_MAP, EXAM_FIELD_MAP, editedFieldsFor, metaToRow, withEdited } from "./canvas/rows";
import { applyPlanToData, type SyncPlan } from "./canvas/sync";
import type { CanvasSettings } from "./canvas/settings";
import { courseTimeLabel, isUuid, mapAssignment, mapCourse, mapEvent, mapExam, mapTask, oneOf, TONES, type Row } from "./db-rows";
import { formatTime, getLocalDateKey, localTimezone } from "./date-utils";
import { seedData } from "./seed-data";
import { calculateHabitStreak, calculateHabitWeekPattern } from "./streaks";
import { supabase } from "./supabase";

export const DAYBOARD_AUTH_CHANGED_EVENT = "dayboard:auth-changed";
export const GUEST_DATA_KEY = "dayboard:guest-data:v2";

/** Columns added by the DayBoard 2.0 migration. Writes retry without them if the migration has not been run yet. */
const SOURCE_COLS = ["source", "external_id", "external_url", "source_hash", "edited_fields", "removed_from_source", "hidden", "source_date_changed"];
const OPTIONAL_COLUMNS: Record<string, string[]> = {
  tasks: ["steps", "course_id"],
  events: ["auto_planned", ...SOURCE_COLS],
  courses: ["color"],
  assignments: ["score", "notes", ...SOURCE_COLS],
  exams: ["score", "notes", "plan_study", "study_planned_for", ...SOURCE_COLS]
};

const HABIT_ICONS = ["dumbbell", "book", "droplet", "leaf", "target"] as const;
const HABIT_SCHEDULES = ["daily", "scheduled", "weekly"] as const;

function mapHabit(row: Row): Habit {
  return {
    id: row.id,
    name: row.name,
    icon: oneOf(row.icon, HABIT_ICONS, "target"),
    scheduleType: oneOf(row.schedule_type, HABIT_SCHEDULES, "daily"),
    targetDays: row.target_days ?? [0, 1, 2, 3, 4, 5, 6],
    targetTimesPerWeek: row.target_times_per_week ?? undefined,
    weekPattern: [false, false, false, false, false, false, false],
    streak: 0,
    completedToday: false
  };
}

function mapHabitLog(row: Row): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.log_date,
    completed: row.completed ?? false,
    completedAt: row.completed_at ?? undefined
  };
}

function mapNote(row: Row): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? "",
    pinned: row.pinned ?? false,
    category: row.category ?? "Quick",
    updatedAt: row.updated_at
  };
}

function taskToDb(task: Partial<Task>): Row {
  const row: Row = {};
  if ("title" in task) row.title = task.title;
  if ("description" in task) row.description = task.description ?? "";
  if ("dueDate" in task) row.due_date = task.dueDate || null;
  if ("dueTime" in task) row.due_time = task.dueTime || null;
  if ("priority" in task) row.priority = task.priority;
  if ("status" in task) row.status = task.status;
  if ("estimatedMinutes" in task) row.estimated_minutes = task.estimatedMinutes;
  if ("category" in task) row.category = task.category;
  if ("progressPercent" in task) row.progress_percent = task.progressPercent;
  if ("autoRollover" in task) row.auto_rollover = task.autoRollover;
  if ("completedAt" in task) row.completed_at = task.completedAt ?? null;
  if ("steps" in task) row.steps = task.steps ?? [];
  if ("courseId" in task) row.course_id = isUuid(task.courseId) ? task.courseId : null;
  return row;
}

function eventToDb(event: Partial<CalendarEvent>, linkedTaskId?: string | null): Row {
  return {
    title: event.title,
    event_date: event.date,
    start_time: event.startTime,
    end_time: event.endTime,
    all_day: event.allDay ?? false,
    category: event.category,
    location: event.location ?? null,
    description: event.description ?? null,
    repeat_type: event.repeatType ?? "never",
    repeat_days: event.repeatDays ?? null,
    linked_task_id: isUuid(linkedTaskId) ? linkedTaskId : null,
    auto_planned: event.autoPlanned ?? false,
    priority: event.priority,
    status: "upcoming",
    ...(event.sourceMeta ? metaToRow(event.sourceMeta) : {})
  };
}

/** Fields an edit changed, compared with the item before the edit (for imported items). */
function changedKeys<T extends object>(before: T, after: Partial<T>): Partial<T> {
  const diff: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) if (after[key] !== before[key]) diff[key] = after[key];
  return diff;
}

/** All assignments/exams/events, hidden ones included (what Canvas sync works with). */
export function withHiddenImports<T extends DayBoardData>(data: T): T {
  const hidden = data.hiddenImports;
  if (!hidden) return data;
  return { ...data, assignments: [...data.assignments, ...hidden.assignments], exams: [...data.exams, ...hidden.exams], events: [...data.events, ...hidden.events], hiddenImports: undefined };
}

/** Moves hidden imported items out of the visible lists. */
function partitionHidden(data: DayBoardData): DayBoardData {
  const all = withHiddenImports(data);
  const isHidden = (item: { sourceMeta?: SourceMeta }) => item.sourceMeta?.hidden === true;
  return {
    ...all,
    assignments: all.assignments.filter((item) => !isHidden(item)),
    exams: all.exams.filter((item) => !isHidden(item)),
    events: all.events.filter((item) => !isHidden(item)),
    hiddenImports: { assignments: all.assignments.filter(isHidden), exams: all.exams.filter(isHidden), events: all.events.filter(isHidden) }
  };
}

function finalize(input: DayBoardData): DayBoardData {
  const data = partitionHidden(input);
  const today = getLocalDateKey(new Date(), data.timezone);
  const habits = data.habits.map((habit) => ({
    ...habit,
    weekPattern: calculateHabitWeekPattern(habit, data.habitLogs, today),
    streak: calculateHabitStreak(habit, data.habitLogs, today),
    completedToday: data.habitLogs.some((log) => log.habitId === habit.id && log.date === today && log.completed)
  }));
  const upcoming = [
    ...data.assignments
      .filter((assignment) => assignment.dueDate >= today && assignment.status !== "submitted" && assignment.status !== "graded")
      .map((assignment) => ({
        id: `up-assignment-${assignment.id}`,
        title: assignment.title,
        date: assignment.dueDate,
        timeLabel: assignment.dueTime ? `Due ${formatTime(assignment.dueTime)}` : "Due",
        kind: "assignment" as const,
        importance: 70 + Math.min((assignment.gradeWeight ?? 0) * 2, 25)
      })),
    ...data.exams
      .filter((exam) => exam.examDate >= today)
      .map((exam) => ({
        id: `up-exam-${exam.id}`,
        title: exam.title,
        date: exam.examDate,
        timeLabel: exam.examTime ? formatTime(exam.examTime) : "Exam",
        kind: "exam" as const,
        importance: 90 + Math.min(exam.gradeWeight ?? 0, 10)
      }))
  ].sort((a, b) => a.date.localeCompare(b.date) || b.importance - a.importance);
  return { ...data, habits, upcoming };
}

function emptyData(): DayBoardData {
  return { ...seedData, timezone: localTimezone() };
}

function loadGuestData(): DayBoardData {
  try {
    const raw = window.localStorage.getItem(GUEST_DATA_KEY);
    if (!raw) return emptyData();
    const saved = JSON.parse(raw) as Partial<DayBoardData>;
    return finalize({ ...emptyData(), ...saved, timezone: localTimezone() });
  } catch {
    return emptyData();
  }
}

function saveGuestData(data: DayBoardData) {
  try {
    const { upcoming: _upcoming, ...rest } = data;
    window.localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(rest));
  } catch {
    // Storage can be full or blocked; the session still works in memory.
  }
}

/** How many things are saved on this device from before the person signed in. */
export function countGuestItems() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUEST_DATA_KEY) ?? "null") as Partial<DayBoardData> | null;
    if (!saved) return 0;
    return (saved.tasks?.length ?? 0) + (saved.events?.length ?? 0) + (saved.courses?.length ?? 0) + (saved.assignments?.length ?? 0) + (saved.exams?.length ?? 0) + (saved.habits?.length ?? 0) + (saved.notes?.length ?? 0);
  } catch {
    return 0;
  }
}

export function clearGuestItems() {
  try {
    window.localStorage.removeItem(GUEST_DATA_KEY);
  } catch {
    // Nothing to clear.
  }
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

let lastLoadFailures: string[] = [];

async function loadSupabaseData(userId: string): Promise<DayBoardData> {
  const [tasks, events, courses, assignments, exams, habits, habitLogs, notes] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("events").select("*").eq("user_id", userId).order("event_date", { ascending: true }),
    supabase.from("courses").select("*").eq("user_id", userId).order("code", { ascending: true }),
    supabase.from("assignments").select("*").eq("user_id", userId).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("exams").select("*").eq("user_id", userId).order("exam_date", { ascending: true }),
    supabase.from("habits").select("*").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }),
    supabase.from("habit_logs").select("*").eq("user_id", userId).order("log_date", { ascending: false }),
    supabase.from("notes").select("*").eq("user_id", userId).order("updated_at", { ascending: false })
  ]);

  const failed: string[] = [];
  const named = { tasks, events, classes: courses, assignments, exams, habits, "habit check-ins": habitLogs, notes };
  for (const [name, result] of Object.entries(named)) {
    if (!result.error) continue;
    console.warn(`Could not load ${name} from Supabase`, result.error.message);
    failed.push(name);
  }
  if (failed.length === Object.keys(named).length) throw new Error("No DayBoard tables could be read.");
  lastLoadFailures = failed;

  return finalize({
    ...emptyData(),
    tasks: (tasks.data ?? []).map(mapTask),
    events: (events.data ?? []).map(mapEvent),
    courses: (courses.data ?? []).map((row, index) => mapCourse(row, index)),
    assignments: (assignments.data ?? []).map(mapAssignment),
    exams: (exams.data ?? []).map(mapExam),
    habits: (habits.data ?? []).map(mapHabit),
    habitLogs: (habitLogs.data ?? []).map(mapHabitLog),
    notes: (notes.data ?? []).map(mapNote)
  });
}

function isMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703" || /column .* does not exist|schema cache/i.test(error.message ?? "");
}

function withoutOptional(table: string, payload: Row) {
  const next = { ...payload };
  for (const key of OPTIONAL_COLUMNS[table] ?? []) delete next[key];
  return next;
}

export type DayBoardStore = ReturnType<typeof useDayBoardData>;

export function useDayBoardData() {
  const [data, setData] = useState<DayBoardData>(seedData);
  const [hydrated, setHydrated] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());
  const [userId, setUserId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const dataRef = useRef(data);
  /** Optimistic id -> promise of the saved row id, so edits made right after creating an item still reach the server. */
  const pending = useRef(new Map<string, Promise<string | null>>());

  dataRef.current = data;

  async function refresh() {
    const currentUserId = await getCurrentUserId();
    userIdRef.current = currentUserId;
    setUserId(currentUserId);

    try {
      lastLoadFailures = [];
      setData(currentUserId ? await loadSupabaseData(currentUserId) : loadGuestData());
      setSyncError(lastLoadFailures.length ? `Some of your data could not be loaded (${lastLoadFailures.join(", ")}). The database setup may not have been run yet.` : null);
    } catch (error) {
      console.warn("Could not load DayBoard data from Supabase", error);
      setSyncError("Could not load your data. Check your connection and try again.");
    } finally {
      setLastSynced(new Date());
      setHydrated(true);
    }
  }

  useEffect(() => {
    void refresh();
    const onAuthChanged = () => void refresh();
    window.addEventListener(DAYBOARD_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(DAYBOARD_AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  useEffect(() => {
    if (hydrated && !userId) saveGuestData(data);
  }, [data, hydrated, userId]);

  useEffect(() => {
    if (!userId) return;

    const tables = ["tasks", "events", "courses", "assignments", "exams", "habits", "habit_logs", "notes"];
    const channel = supabase.channel(`dayboard-user-${userId}-${crypto.randomUUID()}`);
    let timer: number | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 400);
    };

    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, scheduleRefresh);
    }
    channel.subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return useMemo(() => {
    const mutate = (change: (current: DayBoardData) => DayBoardData) => setData((current) => finalize(change(current)));

    async function resolveId(id: string | undefined | null) {
      if (!id) return null;
      if (isUuid(id)) return id;
      return (await pending.current.get(id)) ?? null;
    }

    function remoteInsert(table: string, optimisticId: string, payload: Row, onSaved: (row: Row) => void) {
      const promise = (async () => {
        const currentUserId = userIdRef.current;
        if (!currentUserId) return null;
        const full = { ...payload, user_id: currentUserId };
        let result = await supabase.from(table).insert(full).select("*").single();
        if (isMissingColumn(result.error)) result = await supabase.from(table).insert(withoutOptional(table, full)).select("*").single();
        if (result.error || !result.data) {
          console.warn(`Could not save to ${table}`, result.error?.message);
          setSyncError("Some changes could not be saved to your account.");
          return null;
        }
        onSaved(result.data as Row);
        return (result.data as Row).id as string;
      })();
      pending.current.set(optimisticId, promise);
      return promise;
    }

    async function remoteUpdate(table: string, id: string, payload: Row) {
      const currentUserId = userIdRef.current;
      if (!currentUserId) return;
      const realId = await resolveId(id);
      if (!realId) return;
      let result = await supabase.from(table).update(payload).eq("id", realId).eq("user_id", currentUserId);
      if (isMissingColumn(result.error)) {
        const reduced = withoutOptional(table, payload);
        if (Object.keys(reduced).length === 0) return;
        result = await supabase.from(table).update(reduced).eq("id", realId).eq("user_id", currentUserId);
      }
      if (result.error) {
        console.warn(`Could not update ${table}`, result.error.message);
        setSyncError("Some changes could not be saved to your account.");
      }
    }

    async function remoteDelete(table: string, id: string) {
      const currentUserId = userIdRef.current;
      if (!currentUserId) return;
      const realId = await resolveId(id);
      if (!realId) return;
      const { error } = await supabase.from(table).delete().eq("id", realId).eq("user_id", currentUserId);
      if (error) {
        console.warn(`Could not delete from ${table}`, error.message);
        setSyncError("A deletion could not be saved to your account. Check your connection and retry.");
      }
    }

    const swap = <T extends { id: string }>(items: T[], optimisticId: string, saved: T) => items.map((item) => (item.id === optimisticId ? saved : item));

    const api = {
      data,
      hydrated,
      lastSynced,
      isGuest: !userId,
      syncError,
      clearSyncError: () => setSyncError(null),

      addTask: (task: Omit<Task, "id" | "createdAt" | "actualMinutes" | "progressPercent" | "status"> & { status?: Task["status"] }) => {
        const optimistic: Task = {
          ...task,
          id: `task-${crypto.randomUUID()}`,
          createdAt: new Date().toISOString(),
          actualMinutes: 0,
          progressPercent: 0,
          status: task.status ?? "not_started",
          steps: task.steps ?? []
        };
        mutate((current) => ({ ...current, tasks: [optimistic, ...current.tasks] }));
        void (async () => {
          const courseId = await resolveId(task.courseId);
          void remoteInsert("tasks", optimistic.id, { ...taskToDb({ ...optimistic, courseId: courseId ?? undefined }), created_by: "user" }, (row) =>
            mutate((current) => ({ ...current, tasks: swap(current.tasks, optimistic.id, { ...mapTask(row), courseId: mapTask(row).courseId ?? optimistic.courseId }) }))
          );
        })();
        return optimistic.id;
      },
      updateTask: (taskId: string, patch: Partial<Task>) => {
        const next = { ...patch };
        if (patch.steps) {
          const total = patch.steps.length;
          const done = patch.steps.filter((step) => step.done).length;
          if (total > 0) next.progressPercent = Math.round((done / total) * 100);
        }
        mutate((current) => ({ ...current, tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...next } : task)) }));
        void remoteUpdate("tasks", taskId, taskToDb(next));
      },
      updateTaskStatus: (taskId: string, status: Task["status"]) => {
        const completedAt = status === "completed" ? new Date().toISOString() : undefined;
        mutate((current) => ({
          ...current,
          tasks: current.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status,
                  completedAt,
                  progressPercent: status === "completed" ? 100 : task.progressPercent,
                  steps: status === "completed" ? task.steps?.map((step) => ({ ...step, done: true })) : task.steps
                }
              : task
          )
        }));
        const payload: Row = { status, completed_at: completedAt ?? null };
        if (status === "completed") payload.progress_percent = 100;
        void remoteUpdate("tasks", taskId, payload);
      },
      deleteTask: (taskId: string) => {
        mutate((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskId) }));
        void remoteDelete("tasks", taskId);
      },

      addEvent: (event: Omit<CalendarEvent, "id">) => {
        const optimistic: CalendarEvent = { ...event, id: `event-${crypto.randomUUID()}` };
        mutate((current) => ({ ...current, events: [optimistic, ...current.events] }));
        void (async () => {
          const linkedTaskId = await resolveId(event.linkedTaskId);
          void remoteInsert("events", optimistic.id, { ...eventToDb(event, linkedTaskId), linked_course_id: null }, (row) =>
            mutate((current) => ({ ...current, events: swap(current.events, optimistic.id, { ...mapEvent(row), linkedTaskId: mapEvent(row).linkedTaskId ?? event.linkedTaskId }) }))
          );
        })();
        return optimistic.id;
      },
      updateEvent: (eventId: string, event: Omit<CalendarEvent, "id">) => {
        // Imported from Canvas: remember which fields the student changed, so sync leaves them alone.
        const before = dataRef.current.events.find((item) => item.id === eventId);
        const next: Omit<CalendarEvent, "id"> =
          before?.sourceMeta && event.sourceMeta === before.sourceMeta ? { ...event, sourceMeta: withEdited(before.sourceMeta, editedFieldsFor(changedKeys(before, event), EVENT_FIELD_MAP)) } : event;
        mutate((current) => ({ ...current, events: current.events.map((item) => (item.id === eventId ? { ...next, id: eventId } : item)) }));
        void (async () => remoteUpdate("events", eventId, eventToDb(next, await resolveId(next.linkedTaskId))))();
      },
      deleteEvent: (eventId: string) => {
        mutate((current) => ({ ...current, events: current.events.filter((event) => event.id !== eventId) }));
        void remoteDelete("events", eventId);
      },

      addCourse: (course: Omit<Course, "id" | "time"> & { semester?: string }) => {
        const index = dataRef.current.courses.length;
        const optimistic: Course = {
          id: `course-${crypto.randomUUID()}`,
          code: course.code,
          name: course.name,
          days: course.days || "To be announced",
          time: courseTimeLabel(course.startTime, course.endTime),
          room: course.room || "TBA",
          startTime: course.startTime || undefined,
          endTime: course.endTime || undefined,
          color: course.color ?? TONES[index % TONES.length]
        };
        mutate((current) => ({ ...current, courses: [...current.courses, optimistic].sort((a, b) => a.code.localeCompare(b.code)) }));
        void remoteInsert(
          "courses",
          optimistic.id,
          {
            code: course.code,
            name: course.name,
            days: course.days || null,
            start_time: course.startTime || null,
            end_time: course.endTime || null,
            room: course.room || null,
            semester: course.semester || null,
            color: optimistic.color
          },
          (row) =>
            mutate((current) => ({
              ...current,
              courses: swap(current.courses, optimistic.id, { ...mapCourse(row), color: optimistic.color }),
              tasks: current.tasks.map((item) => (item.courseId === optimistic.id ? { ...item, courseId: row.id } : item)),
              assignments: current.assignments.map((item) => (item.courseId === optimistic.id ? { ...item, courseId: row.id } : item)),
              exams: current.exams.map((item) => (item.courseId === optimistic.id ? { ...item, courseId: row.id } : item))
            }))
        );
        return optimistic.id;
      },
      updateCourse: (courseId: string, patch: Partial<Pick<Course, "code" | "name" | "days" | "room" | "startTime" | "endTime" | "color">>) => {
        mutate((current) => ({
          ...current,
          courses: current.courses.map((course) => {
            if (course.id !== courseId) return course;
            const next = { ...course, ...patch };
            return { ...next, time: courseTimeLabel(next.startTime, next.endTime) };
          })
        }));
        const payload: Row = {};
        if ("code" in patch) payload.code = patch.code;
        if ("name" in patch) payload.name = patch.name;
        if ("days" in patch) payload.days = patch.days || null;
        if ("room" in patch) payload.room = patch.room || null;
        if ("startTime" in patch) payload.start_time = patch.startTime || null;
        if ("endTime" in patch) payload.end_time = patch.endTime || null;
        if ("color" in patch) payload.color = patch.color;
        void remoteUpdate("courses", courseId, payload);
      },
      deleteCourse: (courseId: string) => {
        mutate((current) => ({ ...current, courses: current.courses.filter((course) => course.id !== courseId) }));
        void remoteDelete("courses", courseId);
      },

      addAssignment: (assignment: Omit<Assignment, "id" | "actualMinutes" | "status">) => {
        const optimistic: Assignment = { ...assignment, id: `assignment-${crypto.randomUUID()}`, actualMinutes: 0, status: "not_started" };
        mutate((current) => ({ ...current, assignments: [optimistic, ...current.assignments] }));
        void (async () => {
          const courseId = await resolveId(assignment.courseId);
          void remoteInsert(
            "assignments",
            optimistic.id,
            {
              course_id: courseId,
              title: assignment.title,
              assignment_type: assignment.assignmentType,
              due_date: assignment.dueDate || null,
              due_time: assignment.dueTime || null,
              estimated_minutes: assignment.estimatedMinutes,
              actual_minutes: 0,
              grade_weight: assignment.gradeWeight ?? null,
              difficulty: assignment.difficulty,
              steps: assignment.steps ?? [],
              status: "not_started",
              ...(assignment.notes ? { notes: assignment.notes } : {}),
              ...(assignment.sourceMeta ? metaToRow(assignment.sourceMeta) : {})
            },
            (row) => mutate((current) => ({ ...current, assignments: swap(current.assignments, optimistic.id, mapAssignment(row)) }))
          );
        })();
        return optimistic.id;
      },
      updateAssignment: (
        assignmentId: string,
        patch: Partial<Pick<Assignment, "status" | "score" | "title" | "dueDate" | "dueTime" | "steps" | "courseId" | "assignmentType" | "estimatedMinutes" | "notes" | "sourceMeta">>
      ) => {
        const before = dataRef.current.assignments.find((item) => item.id === assignmentId);
        const next = { ...patch };
        // Imported from Canvas: an edit to a synced field means sync must leave that field alone from now on.
        if (before?.sourceMeta && !("sourceMeta" in patch)) {
          const meta = withEdited(before.sourceMeta, editedFieldsFor(changedKeys(before, patch), ASSIGNMENT_FIELD_MAP));
          if (meta !== before.sourceMeta) next.sourceMeta = meta;
        }
        mutate((current) => ({ ...current, assignments: current.assignments.map((item) => (item.id === assignmentId ? { ...item, ...next } : item)) }));
        const payload: Row = {};
        if ("status" in next) payload.status = next.status;
        if ("score" in next) payload.score = next.score ?? null;
        if ("title" in next) payload.title = next.title;
        if ("dueDate" in next) payload.due_date = next.dueDate || null;
        if ("dueTime" in next) payload.due_time = next.dueTime || null;
        if ("steps" in next) payload.steps = next.steps ?? [];
        if ("assignmentType" in next) payload.assignment_type = next.assignmentType;
        if ("estimatedMinutes" in next) payload.estimated_minutes = next.estimatedMinutes;
        if ("notes" in next) payload.notes = next.notes || null;
        if ("sourceMeta" in next) Object.assign(payload, metaToRow(next.sourceMeta));
        void (async () => {
          if ("courseId" in next) payload.course_id = (await resolveId(next.courseId)) ?? null;
          await remoteUpdate("assignments", assignmentId, payload);
        })();
      },
      deleteAssignment: (assignmentId: string) => {
        mutate((current) => ({ ...current, assignments: current.assignments.filter((item) => item.id !== assignmentId) }));
        void remoteDelete("assignments", assignmentId);
      },

      addExam: (exam: Omit<Exam, "id" | "studyMinutesCompleted" | "importanceScore">) => {
        const importanceScore = 80 + Math.min(exam.gradeWeight ?? 0, 20);
        const optimistic: Exam = { ...exam, id: `exam-${crypto.randomUUID()}`, studyMinutesCompleted: 0, importanceScore };
        mutate((current) => ({ ...current, exams: [optimistic, ...current.exams] }));
        void (async () => {
          const courseId = await resolveId(exam.courseId);
          void remoteInsert(
            "exams",
            optimistic.id,
            {
              course_id: courseId,
              title: exam.title,
              exam_date: exam.examDate,
              exam_time: exam.examTime || null,
              grade_weight: exam.gradeWeight ?? null,
              study_minutes_goal: exam.studyMinutesGoal,
              study_minutes_completed: 0,
              importance_score: importanceScore,
              ...(exam.notes ? { notes: exam.notes } : {}),
              ...(exam.planStudy !== undefined ? { plan_study: exam.planStudy } : {}),
              ...(exam.studyPlannedFor ? { study_planned_for: exam.studyPlannedFor } : {}),
              ...(exam.sourceMeta ? metaToRow(exam.sourceMeta) : {})
            },
            (row) => mutate((current) => ({ ...current, exams: swap(current.exams, optimistic.id, mapExam(row)) }))
          );
        })();
        return optimistic.id;
      },
      updateExam: (
        examId: string,
        patch: Partial<Pick<Exam, "score" | "title" | "examDate" | "examTime" | "courseId" | "notes" | "studyMinutesGoal" | "planStudy" | "studyPlannedFor" | "sourceMeta">>
      ) => {
        const before = dataRef.current.exams.find((item) => item.id === examId);
        const next = { ...patch };
        if (before?.sourceMeta && !("sourceMeta" in patch)) {
          const meta = withEdited(before.sourceMeta, editedFieldsFor(changedKeys(before, patch), EXAM_FIELD_MAP));
          if (meta !== before.sourceMeta) next.sourceMeta = meta;
        }
        mutate((current) => ({ ...current, exams: current.exams.map((item) => (item.id === examId ? { ...item, ...next } : item)) }));
        const payload: Row = {};
        if ("score" in next) payload.score = next.score ?? null;
        if ("title" in next) payload.title = next.title;
        if ("examDate" in next) payload.exam_date = next.examDate;
        if ("examTime" in next) payload.exam_time = next.examTime || null;
        if ("notes" in next) payload.notes = next.notes || null;
        if ("studyMinutesGoal" in next) payload.study_minutes_goal = next.studyMinutesGoal;
        if ("planStudy" in next) payload.plan_study = next.planStudy ?? true;
        if ("studyPlannedFor" in next) payload.study_planned_for = next.studyPlannedFor || null;
        if ("sourceMeta" in next) Object.assign(payload, metaToRow(next.sourceMeta));
        void (async () => {
          if ("courseId" in next) payload.course_id = (await resolveId(next.courseId)) ?? null;
          await remoteUpdate("exams", examId, payload);
        })();
      },
      deleteExam: (examId: string) => {
        mutate((current) => ({ ...current, exams: current.exams.filter((item) => item.id !== examId) }));
        void remoteDelete("exams", examId);
      },

      addHabit: (habit: Omit<Habit, "id" | "weekPattern" | "streak" | "completedToday">) => {
        const optimistic: Habit = { ...habit, id: `habit-${crypto.randomUUID()}`, weekPattern: [false, false, false, false, false, false, false], streak: 0, completedToday: false };
        mutate((current) => ({ ...current, habits: [...current.habits, optimistic] }));
        void remoteInsert(
          "habits",
          optimistic.id,
          { name: habit.name, icon: habit.icon, schedule_type: habit.scheduleType, target_days: habit.targetDays, target_times_per_week: habit.targetTimesPerWeek ?? null, is_active: true },
          (row) =>
            mutate((current) => ({
              ...current,
              habits: swap(current.habits, optimistic.id, mapHabit(row)),
              habitLogs: current.habitLogs.map((log) => (log.habitId === optimistic.id ? { ...log, habitId: row.id } : log))
            }))
        );
        return optimistic.id;
      },
      deleteHabit: (habitId: string) => {
        mutate((current) => ({ ...current, habits: current.habits.filter((habit) => habit.id !== habitId) }));
        void remoteUpdate("habits", habitId, { is_active: false });
      },
      toggleHabit: (habitId: string, dateKey?: string) => {
        const current = dataRef.current;
        const date = dateKey ?? getLocalDateKey(new Date(), current.timezone);
        const existing = current.habitLogs.find((log) => log.habitId === habitId && log.date === date);
        const completed = !(existing?.completed ?? false);
        const completedAt = completed ? new Date().toISOString() : undefined;
        const log: HabitLog = existing ? { ...existing, completed, completedAt } : { id: `habit-log-${crypto.randomUUID()}`, habitId, date, completed: true, completedAt };

        mutate((state) => ({
          ...state,
          habitLogs: existing ? state.habitLogs.map((item) => (item.habitId === habitId && item.date === date ? log : item)) : [log, ...state.habitLogs]
        }));

        void (async () => {
          const currentUserId = userIdRef.current;
          const realId = await resolveId(habitId);
          if (!currentUserId || !realId) return;
          const { error } = await supabase
            .from("habit_logs")
            .upsert({ habit_id: realId, user_id: currentUserId, log_date: date, completed, completed_at: completedAt ?? null }, { onConflict: "habit_id,log_date" });
          if (error) console.warn("Could not update habit log in Supabase", error.message);
        })();
      },

      addNote: (note: Omit<Note, "id" | "updatedAt">) => {
        const optimistic: Note = { ...note, id: `note-${crypto.randomUUID()}`, updatedAt: new Date().toISOString() };
        mutate((current) => ({ ...current, notes: [optimistic, ...current.notes] }));
        void remoteInsert("notes", optimistic.id, { title: note.title, content: note.content, pinned: note.pinned, category: note.category }, (row) =>
          mutate((current) => ({ ...current, notes: swap(current.notes, optimistic.id, mapNote(row)) }))
        );
        return optimistic.id;
      },
      updateNote: (noteId: string, patch: Partial<Pick<Note, "title" | "content" | "pinned" | "category">>) => {
        const updatedAt = new Date().toISOString();
        mutate((current) => ({ ...current, notes: current.notes.map((note) => (note.id === noteId ? { ...note, ...patch, updatedAt } : note)) }));
        void remoteUpdate("notes", noteId, { ...patch, updated_at: updatedAt });
      },
      deleteNote: (noteId: string) => {
        mutate((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== noteId) }));
        void remoteDelete("notes", noteId);
      },

      /** Guest mode: apply a Canvas sync plan to the data on this device. (Signed in, the server applies it.) */
      applyCanvasPlan: (plan: SyncPlan, settings: CanvasSettings) => {
        if (userIdRef.current) return;
        mutate((current) => applyPlanToData(withHiddenImports(current), plan, settings, (prefix) => `${prefix}-${crypto.randomUUID()}`));
      },
      /** Hide an imported item everywhere (it stays hidden on future syncs), or bring it back. */
      setImportHidden: (kind: "assignment" | "exam" | "event", id: string, hidden: boolean) => {
        const all = withHiddenImports(dataRef.current);
        const list = kind === "assignment" ? all.assignments : kind === "exam" ? all.exams : all.events;
        const item = list.find((entry) => entry.id === id);
        if (!item?.sourceMeta) return;
        const sourceMeta: SourceMeta = { ...item.sourceMeta, hidden };
        const swapMeta = <I extends { id: string; sourceMeta?: SourceMeta }>(items: I[]) => items.map((entry) => (entry.id === id ? { ...entry, sourceMeta } : entry));
        mutate((current) => {
          const merged = withHiddenImports(current);
          if (kind === "assignment") return { ...merged, assignments: swapMeta(merged.assignments) };
          if (kind === "exam") return { ...merged, exams: swapMeta(merged.exams) };
          return { ...merged, events: swapMeta(merged.events) };
        });
        void remoteUpdate(kind === "assignment" ? "assignments" : kind === "exam" ? "exams" : "events", id, { hidden });
      },

      /** Turn an assignment into an exam (keeps its Canvas link, notes and class). */
      convertAssignmentToExam: (assignmentId: string) => {
        const item = dataRef.current.assignments.find((entry) => entry.id === assignmentId);
        if (!item) return null;
        const meta: SourceMeta | undefined = item.sourceMeta && { ...item.sourceMeta, editedFields: [...item.sourceMeta.editedFields] };
        api.deleteAssignment(assignmentId);
        return api.addExam({ courseId: item.courseId, title: item.title, examDate: item.dueDate, examTime: item.dueTime, gradeWeight: item.gradeWeight, studyMinutesGoal: Math.max(item.estimatedMinutes, 120), notes: item.notes, planStudy: true, sourceMeta: meta });
      },
      /** Turn an exam into an assignment. */
      convertExamToAssignment: (examId: string) => {
        const item = dataRef.current.exams.find((entry) => entry.id === examId);
        if (!item) return null;
        const meta: SourceMeta | undefined = item.sourceMeta && { ...item.sourceMeta, editedFields: [...item.sourceMeta.editedFields] };
        api.deleteExam(examId);
        return api.addAssignment({ courseId: item.courseId, title: item.title, assignmentType: "homework", dueDate: item.examDate, dueTime: item.examTime, estimatedMinutes: 60, gradeWeight: item.gradeWeight, difficulty: 3, notes: item.notes, sourceMeta: meta });
      },

      resetData: () => {
        if (userIdRef.current) return;
        try {
          window.localStorage.removeItem(GUEST_DATA_KEY);
        } catch {
          // Nothing to clear.
        }
        setData(emptyData());
      },
      /** Copies everything saved on this device as a guest into the signed-in account, keeping the links between items. */
      importGuestData: () => {
        if (!userIdRef.current) return 0;
        const guest = loadGuestData();
        const courseIds = new Map<string, string>();
        const taskIds = new Map<string, string>();
        const habitIds = new Map<string, string>();
        let count = 0;

        for (const course of guest.courses) {
          courseIds.set(course.id, api.addCourse({ code: course.code, name: course.name, days: course.days === "To be announced" ? "" : course.days, room: course.room === "TBA" ? "" : course.room, startTime: course.startTime, endTime: course.endTime, color: course.color }));
          count += 1;
        }
        for (const task of guest.tasks) {
          const { id, createdAt: _createdAt, actualMinutes: _actualMinutes, progressPercent: _progressPercent, ...rest } = task;
          taskIds.set(id, api.addTask({ ...rest, courseId: task.courseId ? courseIds.get(task.courseId) : undefined }));
          count += 1;
        }
        for (const event of guest.events) {
          const { id: _id, ...rest } = event;
          api.addEvent({ ...rest, linkedTaskId: event.linkedTaskId ? taskIds.get(event.linkedTaskId) : undefined });
          count += 1;
        }
        for (const assignment of guest.assignments) {
          const { id: _id, actualMinutes: _actualMinutes, status, score, ...rest } = assignment;
          const newId = api.addAssignment({ ...rest, courseId: courseIds.get(assignment.courseId) ?? "" });
          if (status !== "not_started" || score !== undefined) api.updateAssignment(newId, { status, score });
          count += 1;
        }
        for (const exam of guest.exams) {
          const { id: _id, studyMinutesCompleted: _done, importanceScore: _importance, score, ...rest } = exam;
          const newId = api.addExam({ ...rest, courseId: courseIds.get(exam.courseId) ?? "" });
          if (score !== undefined) api.updateExam(newId, { score });
          count += 1;
        }
        for (const habit of guest.habits) {
          habitIds.set(habit.id, api.addHabit({ name: habit.name, icon: habit.icon, scheduleType: habit.scheduleType, targetDays: habit.targetDays, targetTimesPerWeek: habit.targetTimesPerWeek }));
          count += 1;
        }
        for (const log of guest.habitLogs) {
          const habitId = habitIds.get(log.habitId);
          if (habitId && log.completed) api.toggleHabit(habitId, log.date);
        }
        for (const note of guest.notes) {
          api.addNote({ title: note.title, content: note.content, pinned: note.pinned, category: note.category });
          count += 1;
        }
        clearGuestItems();
        return count;
      },
      refresh
    };
    return api;
  }, [data, hydrated, lastSynced, userId, syncError]);
}
