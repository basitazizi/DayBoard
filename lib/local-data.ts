"use client";

import { useEffect, useMemo, useState } from "react";
import type { Assignment, CalendarEvent, DayBoardData, Exam, Habit, HabitLog, Note, Task } from "@/types/dayboard";
import { formatTime, getLocalDateKey } from "./date-utils";
import { seedData } from "./seed-data";
import { calculateHabitStreak, calculateHabitWeekPattern } from "./streaks";
import { supabase } from "./supabase";

export const DAYBOARD_AUTH_CHANGED_EVENT = "dayboard:auth-changed";

type DbTask = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Task["priority"];
  status: Task["status"];
  estimated_minutes: number | null;
  progress_percent: number | null;
  auto_rollover: boolean | null;
  category: string | null;
  created_at: string;
  completed_at: string | null;
};

type DbEvent = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean | null;
  category: CalendarEvent["category"];
  location: string | null;
  description: string | null;
  repeat_type: CalendarEvent["repeatType"];
  repeat_days: number[] | null;
  priority: Task["priority"];
};

type DbCourse = {
  id: string;
  code: string;
  name: string;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
};

type DbAssignment = {
  id: string;
  course_id: string | null;
  title: string;
  assignment_type: Assignment["assignmentType"];
  due_date: string | null;
  due_time: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  grade_weight: number | null;
  difficulty: number | null;
  status: Assignment["status"];
};

type DbExam = {
  id: string;
  course_id: string | null;
  title: string;
  exam_date: string;
  exam_time: string | null;
  grade_weight: number | null;
  study_minutes_goal: number | null;
  study_minutes_completed: number | null;
  importance_score: number | null;
};

type DbHabit = {
  id: string;
  name: string;
  icon: Habit["icon"] | null;
  schedule_type: Habit["scheduleType"];
  target_days: number[] | null;
  target_times_per_week: number | null;
};

type DbHabitLog = {
  id: string;
  habit_id: string;
  log_date: string;
  completed: boolean | null;
  completed_at: string | null;
};

type DbNote = {
  id: string;
  title: string;
  content: string | null;
  pinned: boolean | null;
  category: string | null;
  updated_at: string;
};

function timeValue(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

function isUuid(value?: string) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

function priorityValue(value: string | null | undefined): Task["priority"] {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") return value;
  return "medium";
}

function taskStatusValue(value: string | null | undefined): Task["status"] {
  if (value === "not_started" || value === "in_progress" || value === "paused" || value === "completed" || value === "overdue" || value === "cancelled") return value;
  return "not_started";
}

function eventCategoryValue(value: string | null | undefined): CalendarEvent["category"] {
  if (value === "school" || value === "work" || value === "personal" || value === "gym" || value === "study" || value === "appointment" || value === "deadline" || value === "social" || value === "other") return value;
  return "other";
}

function assignmentTypeValue(value: string | null | undefined): Assignment["assignmentType"] {
  if (value === "homework" || value === "quiz" || value === "project" || value === "lab" || value === "paper" || value === "midterm" || value === "final" || value === "other") return value;
  return "homework";
}

function assignmentStatusValue(value: string | null | undefined): Assignment["status"] {
  if (value === "not_started" || value === "in_progress" || value === "submitted" || value === "graded") return value;
  return "not_started";
}

function habitIconValue(value: string | null | undefined): Habit["icon"] {
  if (value === "dumbbell" || value === "book" || value === "droplet" || value === "leaf" || value === "target") return value;
  return "target";
}

function habitScheduleValue(value: string | null | undefined): Habit["scheduleType"] {
  if (value === "daily" || value === "scheduled" || value === "weekly") return value;
  return "daily";
}

function formatCourseTime(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) return "To be announced";
  return `${formatTime(timeValue(startTime))}-${formatTime(timeValue(endTime))}`;
}

function mapTask(row: DbTask): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    dueDate: row.due_date ?? undefined,
    dueTime: row.due_time ? timeValue(row.due_time) : undefined,
    priority: priorityValue(row.priority),
    status: taskStatusValue(row.status),
    estimatedMinutes: row.estimated_minutes ?? 0,
    actualMinutes: 0,
    category: row.category ?? "Personal",
    progressPercent: row.progress_percent ?? 0,
    autoRollover: row.auto_rollover ?? true,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined
  };
}

function mapEvent(row: DbEvent): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    startTime: row.start_time ? timeValue(row.start_time) : "09:00",
    endTime: row.end_time ? timeValue(row.end_time) : "10:00",
    allDay: row.all_day ?? false,
    category: eventCategoryValue(row.category),
    location: row.location ?? undefined,
    description: row.description ?? undefined,
    priority: priorityValue(row.priority),
    repeatType: row.repeat_type ?? "never",
    repeatDays: row.repeat_days ?? undefined
  };
}

function mapAssignment(row: DbAssignment): Assignment {
  return {
    id: row.id,
    courseId: row.course_id ?? "",
    title: row.title,
    assignmentType: assignmentTypeValue(row.assignment_type),
    dueDate: row.due_date ?? "",
    dueTime: row.due_time ? timeValue(row.due_time) : "",
    estimatedMinutes: row.estimated_minutes ?? 0,
    actualMinutes: row.actual_minutes ?? 0,
    gradeWeight: row.grade_weight ?? undefined,
    difficulty: row.difficulty ?? 3,
    status: assignmentStatusValue(row.status)
  };
}

function mapHabitLog(row: DbHabitLog): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.log_date,
    completed: row.completed ?? false,
    completedAt: row.completed_at ?? undefined
  };
}

function applyHabitLogState(habits: Habit[], logs: HabitLog[], timezone: string) {
  const today = getLocalDateKey(new Date(), timezone);

  return habits.map((habit) => ({
    ...habit,
    weekPattern: calculateHabitWeekPattern(habit, logs, today),
    streak: calculateHabitStreak(habit, logs, today),
    completedToday: logs.some((log) => log.habitId === habit.id && log.date === today && log.completed)
  }));
}

function buildUpcoming(assignments: Assignment[], exams: Exam[]) {
  return [
    ...assignments
      .filter((assignment) => assignment.dueDate && assignment.status !== "submitted" && assignment.status !== "graded")
      .map((assignment) => ({
        id: `up-assignment-${assignment.id}`,
        title: assignment.title,
        date: assignment.dueDate,
        timeLabel: assignment.dueTime ? `Due ${formatTime(assignment.dueTime)}` : "Due",
        kind: "assignment" as const,
        importance: 70 + Math.min((assignment.gradeWeight ?? 0) * 2, 25)
      })),
    ...exams.map((exam) => ({
      id: `up-exam-${exam.id}`,
      title: exam.title,
      date: exam.examDate,
      timeLabel: exam.examTime ? formatTime(exam.examTime) : "Exam",
      kind: "exam" as const,
      importance: 90 + Math.min(exam.gradeWeight ?? 0, 10)
    }))
  ].sort((a, b) => a.date.localeCompare(b.date) || b.importance - a.importance);
}

async function getCurrentUserId() {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function loadSupabaseData(userId: string | null): Promise<DayBoardData> {
  if (!userId) return seedData;

  const [tasksResult, eventsResult, coursesResult, assignmentsResult, examsResult, habitsResult, habitLogsResult, notesResult] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("events").select("*").eq("user_id", userId).order("event_date", { ascending: true }),
    supabase.from("courses").select("*").eq("user_id", userId).order("code", { ascending: true }),
    supabase.from("assignments").select("*").eq("user_id", userId).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("exams").select("*").eq("user_id", userId).order("exam_date", { ascending: true }),
    supabase.from("habits").select("*").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }),
    supabase.from("habit_logs").select("*").eq("user_id", userId).order("log_date", { ascending: false }),
    supabase.from("notes").select("*").eq("user_id", userId).order("updated_at", { ascending: false })
  ]);

  for (const result of [tasksResult, eventsResult, coursesResult, assignmentsResult, examsResult, habitsResult, habitLogsResult, notesResult]) {
    if (result.error) throw result.error;
  }

  const tasks = ((tasksResult.data ?? []) as DbTask[]).map(mapTask);
  const events = ((eventsResult.data ?? []) as DbEvent[]).map(mapEvent);
  const dbCourses = (coursesResult.data ?? []) as DbCourse[];
  const courses =
    dbCourses.length > 0
      ? dbCourses.map((course) => ({
          id: course.id,
          code: course.code,
          name: course.name,
          days: course.days ?? "To be announced",
          time: formatCourseTime(course.start_time, course.end_time),
          room: course.room ?? "TBA"
        }))
      : seedData.courses;
  const assignments = ((assignmentsResult.data ?? []) as DbAssignment[]).map(mapAssignment);
  const exams = ((examsResult.data ?? []) as DbExam[]).map((exam) => ({
    id: exam.id,
    courseId: exam.course_id ?? "",
    title: exam.title,
    examDate: exam.exam_date,
    examTime: exam.exam_time ? timeValue(exam.exam_time) : "",
    gradeWeight: exam.grade_weight ?? undefined,
    studyMinutesGoal: exam.study_minutes_goal ?? 0,
    studyMinutesCompleted: exam.study_minutes_completed ?? 0,
    importanceScore: exam.importance_score ?? 0
  }));
  const habitLogs = ((habitLogsResult.data ?? []) as DbHabitLog[]).map(mapHabitLog);
  const habits = applyHabitLogState(((habitsResult.data ?? []) as DbHabit[]).map((habit) => ({
    id: habit.id,
    name: habit.name,
    icon: habitIconValue(habit.icon),
    scheduleType: habitScheduleValue(habit.schedule_type),
    targetDays: habit.target_days ?? [0, 1, 2, 3, 4, 5, 6],
    targetTimesPerWeek: habit.target_times_per_week ?? undefined,
    weekPattern: [false, false, false, false, false, false, false],
    streak: 0,
    completedToday: false
  })), habitLogs, seedData.timezone);
  const notes = ((notesResult.data ?? []) as DbNote[]).map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content ?? "",
    pinned: note.pinned ?? false,
    category: note.category ?? "Quick",
    updatedAt: note.updated_at
  }));

  return {
    ...seedData,
    tasks,
    events,
    courses,
    assignments,
    exams,
    habits,
    notes,
    habitLogs,
    upcoming: buildUpcoming(assignments, exams)
  };
}

async function insertForCurrentUser<T>(table: string, payload: Record<string, unknown>, mapper: (row: T) => unknown) {
  const userId = await getCurrentUserId();

  if (!userId) return null;

  const { data, error } = await supabase.from(table).insert({ ...payload, user_id: userId }).select("*").single();
  if (error) {
    console.warn(`Could not sync ${table} to Supabase`, error.message);
    return null;
  }

  return mapper(data as T);
}

export function useDayBoardData() {
  const [data, setData] = useState<DayBoardData>(seedData);
  const [hydrated, setHydrated] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());
  const [userId, setUserId] = useState<string | null>(null);

  async function refresh() {
    const currentUserId = await getCurrentUserId();
    setUserId(currentUserId);

    try {
      const nextData = await loadSupabaseData(currentUserId);
      setData(nextData);
    } catch (error) {
      console.warn("Could not load DayBoard data from Supabase", error);
      setData(seedData);
    } finally {
      setLastSynced(new Date());
      setHydrated(true);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onAuthChanged = () => {
      void refresh();
    };

    window.addEventListener(DAYBOARD_AUTH_CHANGED_EVENT, onAuthChanged);

    return () => {
      window.removeEventListener(DAYBOARD_AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const tables = ["tasks", "events", "courses", "assignments", "exams", "habits", "habit_logs", "notes"];
    const channel = supabase.channel(`dayboard-user-${userId}`);

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${userId}`
        },
        () => {
          void refresh();
        }
      );
    }

    channel.subscribe((status, error) => {
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && error) {
        console.warn("Supabase realtime connection issue", error);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return useMemo(
    () => ({
      data,
      lastSynced,
      addTask: (task: Omit<Task, "id" | "createdAt" | "actualMinutes" | "progressPercent" | "status">) => {
        const optimisticTask: Task = {
          ...task,
          id: `task-${crypto.randomUUID()}`,
          createdAt: new Date().toISOString(),
          actualMinutes: 0,
          progressPercent: 0,
          status: "not_started"
        };

        setData((current) => ({
          ...current,
          tasks: [optimisticTask, ...current.tasks]
        }));

        void insertForCurrentUser<DbTask>(
          "tasks",
          {
            title: task.title,
            description: task.description,
            due_date: task.dueDate,
            due_time: task.dueTime,
            priority: task.priority,
            status: "not_started",
            estimated_minutes: task.estimatedMinutes,
            category: task.category,
            progress_percent: 0,
            auto_rollover: task.autoRollover,
            created_by: "user"
          },
          mapTask
        ).then((savedTask) => {
          if (!savedTask) return;
          setData((current) => ({
            ...current,
            tasks: current.tasks.map((item) => (item.id === optimisticTask.id ? (savedTask as Task) : item))
          }));
        });
      },
      updateTaskStatus: (taskId: string, status: Task["status"]) => {
        setData((current) => ({
          ...current,
          tasks: current.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status,
                  completedAt: status === "completed" ? new Date().toISOString() : task.completedAt,
                  progressPercent: status === "completed" ? 100 : task.progressPercent
                }
              : task
          )
        }));

        void supabase
          .from("tasks")
          .update({
            status,
            completed_at: status === "completed" ? new Date().toISOString() : null,
            progress_percent: status === "completed" ? 100 : undefined
          })
          .eq("id", taskId)
          .then(({ error }) => {
            if (error) console.warn("Could not update task in Supabase", error.message);
          });
      },
      deleteTask: (taskId: string) => {
        setData((current) => ({
          ...current,
          tasks: current.tasks.filter((task) => task.id !== taskId)
        }));

        void supabase
          .from("tasks")
          .delete()
          .eq("id", taskId)
          .then(({ error }) => {
            if (error) console.warn("Could not delete task in Supabase", error.message);
          });
      },
      addEvent: (event: Omit<CalendarEvent, "id">) => {
        const optimisticEvent = { ...event, id: `event-${crypto.randomUUID()}` };

        setData((current) => ({
          ...current,
          events: [optimisticEvent, ...current.events]
        }));

        void insertForCurrentUser<DbEvent>(
          "events",
          {
            title: event.title,
            event_date: event.date,
            start_time: event.startTime,
            end_time: event.endTime,
            all_day: event.allDay ?? false,
            category: event.category,
            location: event.location,
            description: event.description,
            repeat_type: event.repeatType ?? "never",
            repeat_days: event.repeatDays,
            linked_course_id: null,
            linked_task_id: null,
            priority: event.priority,
            status: "upcoming"
          },
          mapEvent
        ).then((savedEvent) => {
          if (!savedEvent) return;
          setData((current) => ({
            ...current,
            events: current.events.map((item) => (item.id === optimisticEvent.id ? (savedEvent as CalendarEvent) : item))
          }));
        });
      },
      updateEvent: (eventId: string, event: Omit<CalendarEvent, "id">) => {
        setData((current) => ({
          ...current,
          events: current.events.map((item) => (item.id === eventId ? { ...event, id: eventId } : item))
        }));

        void getCurrentUserId().then((currentUserId) => {
          if (!currentUserId) return;

          void supabase
            .from("events")
            .update({
              title: event.title,
              event_date: event.date,
              start_time: event.startTime,
              end_time: event.endTime,
              all_day: event.allDay ?? false,
              category: event.category,
              location: event.location,
              description: event.description,
              repeat_type: event.repeatType ?? "never",
              repeat_days: event.repeatDays,
              priority: event.priority,
              status: "upcoming"
            })
            .eq("id", eventId)
            .eq("user_id", currentUserId)
            .then(({ error }) => {
              if (error) console.warn("Could not update event in Supabase", error.message);
            });
        });
      },
      deleteEvent: (eventId: string) => {
        setData((current) => ({
          ...current,
          events: current.events.filter((event) => event.id !== eventId)
        }));

        void getCurrentUserId().then((currentUserId) => {
          if (!currentUserId) return;

          void supabase
            .from("events")
            .delete()
            .eq("id", eventId)
            .eq("user_id", currentUserId)
            .then(({ error }) => {
              if (error) console.warn("Could not delete event in Supabase", error.message);
            });
        });
      },
      addAssignment: (assignment: Omit<Assignment, "id" | "actualMinutes" | "status">) => {
        const optimisticAssignment: Assignment = {
          ...assignment,
          id: `assignment-${crypto.randomUUID()}`,
          actualMinutes: 0,
          status: "not_started"
        };

        setData((current) => {
          const assignments = [optimisticAssignment, ...current.assignments];
          return {
            ...current,
            assignments,
            upcoming: buildUpcoming(assignments, current.exams)
          };
        });

        void insertForCurrentUser<DbAssignment>(
          "assignments",
          {
            course_id: isUuid(assignment.courseId) ? assignment.courseId : null,
            title: assignment.title,
            assignment_type: assignment.assignmentType,
            due_date: assignment.dueDate,
            due_time: assignment.dueTime,
            estimated_minutes: assignment.estimatedMinutes,
            actual_minutes: 0,
            grade_weight: assignment.gradeWeight,
            difficulty: assignment.difficulty,
            status: "not_started"
          },
          mapAssignment
        ).then((savedAssignment) => {
          if (!savedAssignment) return;
          setData((current) => {
            const assignments = current.assignments.map((item) => (item.id === optimisticAssignment.id ? (savedAssignment as Assignment) : item));
            return {
              ...current,
              assignments,
              upcoming: buildUpcoming(assignments, current.exams)
            };
          });
        });
      },
      addExam: (exam: Omit<Exam, "id" | "studyMinutesCompleted" | "importanceScore">) => {
        const optimisticExam: Exam = {
          ...exam,
          id: `exam-${crypto.randomUUID()}`,
          studyMinutesCompleted: 0,
          importanceScore: 80 + Math.min(exam.gradeWeight ?? 0, 20)
        };

        setData((current) => {
          const exams = [optimisticExam, ...current.exams];
          return {
            ...current,
            exams,
            upcoming: buildUpcoming(current.assignments, exams)
          };
        });

        void insertForCurrentUser<DbExam>(
          "exams",
          {
            course_id: isUuid(exam.courseId) ? exam.courseId : null,
            title: exam.title,
            exam_date: exam.examDate,
            exam_time: exam.examTime,
            grade_weight: exam.gradeWeight,
            study_minutes_goal: exam.studyMinutesGoal,
            study_minutes_completed: 0,
            importance_score: 80 + Math.min(exam.gradeWeight ?? 0, 20)
          },
          (row) => ({
            id: row.id,
            courseId: row.course_id ?? "",
            title: row.title,
            examDate: row.exam_date,
            examTime: row.exam_time ? timeValue(row.exam_time) : "",
            gradeWeight: row.grade_weight ?? undefined,
            studyMinutesGoal: row.study_minutes_goal ?? 0,
            studyMinutesCompleted: row.study_minutes_completed ?? 0,
            importanceScore: row.importance_score ?? 0
          })
        ).then((savedExam) => {
          if (!savedExam) return;
          setData((current) => {
            const exams = current.exams.map((item) => (item.id === optimisticExam.id ? (savedExam as Exam) : item));
            return {
              ...current,
              exams,
              upcoming: buildUpcoming(current.assignments, exams)
            };
          });
        });
      },
      addHabit: (habit: Omit<Habit, "id" | "weekPattern" | "streak" | "completedToday">) => {
        const optimisticHabit: Habit = {
          ...habit,
          id: `habit-${crypto.randomUUID()}`,
          weekPattern: [false, false, false, false, false, false, false],
          streak: 0,
          completedToday: false
        };

        setData((current) => ({
          ...current,
          habits: [...current.habits, optimisticHabit]
        }));

        void insertForCurrentUser<DbHabit>(
          "habits",
          {
            name: habit.name,
            icon: habit.icon,
            schedule_type: habit.scheduleType,
            target_days: habit.targetDays,
            target_times_per_week: habit.targetTimesPerWeek,
            is_active: true
          },
          (row) => ({
            id: row.id,
            name: row.name,
            icon: habitIconValue(row.icon),
            scheduleType: habitScheduleValue(row.schedule_type),
            targetDays: row.target_days ?? [0, 1, 2, 3, 4, 5, 6],
            targetTimesPerWeek: row.target_times_per_week ?? undefined,
            weekPattern: [false, false, false, false, false, false, false],
            streak: 0,
            completedToday: false
          })
        ).then((savedHabit) => {
          if (!savedHabit) return;
          setData((current) => ({
            ...current,
            habits: current.habits.map((item) => (item.id === optimisticHabit.id ? (savedHabit as Habit) : item))
          }));
        });
      },
      toggleHabit: (habitId: string) => {
        const today = getLocalDateKey(new Date(), data.timezone);
        const habit = data.habits.find((item) => item.id === habitId);
        if (!habit) return;

        const existingLog = data.habitLogs.find((log) => log.habitId === habitId && log.date === today);
        const nextCompleted = !(existingLog?.completed ?? false);
        const optimisticLog: HabitLog = existingLog
          ? {
              ...existingLog,
              completed: nextCompleted,
              completedAt: nextCompleted ? new Date().toISOString() : undefined
            }
          : {
              id: `habit-log-${crypto.randomUUID()}`,
              habitId,
              date: today,
              completed: true,
              completedAt: new Date().toISOString()
            };

        setData((current) => {
          const habitLogs = existingLog
            ? current.habitLogs.map((log) => (log.habitId === habitId && log.date === today ? optimisticLog : log))
            : [optimisticLog, ...current.habitLogs];

          return {
            ...current,
            habitLogs,
            habits: applyHabitLogState(current.habits, habitLogs, current.timezone)
          };
        });

        void getCurrentUserId().then((currentUserId) => {
          if (!currentUserId) return;

          void supabase
            .from("habit_logs")
            .upsert(
              {
                habit_id: habitId,
                user_id: currentUserId,
                log_date: today,
                completed: nextCompleted,
                completed_at: nextCompleted ? new Date().toISOString() : null
              },
              { onConflict: "habit_id,log_date" }
            )
            .then(({ error }) => {
              if (error) console.warn("Could not update habit log in Supabase", error.message);
            });
        });
      },
      addNote: (note: Omit<Note, "id" | "updatedAt">) => {
        const optimisticNote = {
          ...note,
          id: `note-${crypto.randomUUID()}`,
          updatedAt: new Date().toISOString()
        };

        setData((current) => ({
          ...current,
          notes: [optimisticNote, ...current.notes.map((item) => (note.pinned ? { ...item, pinned: false } : item))]
        }));

        void insertForCurrentUser<DbNote>(
          "notes",
          {
            title: note.title,
            content: note.content,
            pinned: note.pinned,
            category: note.category
          },
          (row) => ({
            id: row.id,
            title: row.title,
            content: row.content ?? "",
            pinned: row.pinned ?? false,
            category: row.category ?? "Quick",
            updatedAt: row.updated_at
          })
        ).then((savedNote) => {
          if (!savedNote) return;
          setData((current) => ({
            ...current,
            notes: current.notes.map((item) => (item.id === optimisticNote.id ? (savedNote as Note) : item))
          }));
        });
      },
      resetData: () => setData(seedData),
      refresh
    }),
    [data, hydrated, lastSynced, userId]
  );
}
