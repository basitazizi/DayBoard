"use client";

import { useEffect, useMemo, useState } from "react";
import type { Assignment, CalendarEvent, DayBoardData, Exam, Habit, Note, Task } from "@/types/dayboard";
import { formatTime } from "./date-utils";
import { seedData } from "./seed-data";
import { supabase } from "./supabase";

export const DAYBOARD_STORAGE_KEY = "dayboard.local.v2";
export const LEGACY_DAYBOARD_STORAGE_KEYS = ["dayboard.local.v1"];
export const DAYBOARD_LOCAL_RESET_EVENT = "dayboard:local-reset";

function isUuid(value?: string) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

async function insertForCurrentUser(table: string, payload: Record<string, unknown>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase.from(table).insert({ ...payload, user_id: user.id });
  if (error) {
    console.warn(`Could not sync ${table} to Supabase`, error.message);
  }
}

function readStoredData(): DayBoardData {
  if (typeof window === "undefined") return seedData;
  const raw = window.localStorage.getItem(DAYBOARD_STORAGE_KEY);
  if (!raw) return seedData;

  try {
    const stored = { ...seedData, ...JSON.parse(raw) } as DayBoardData;
    const storedCourseIds = new Set(stored.courses.map((course) => course.id));
    const missingSeedCourses = seedData.courses.filter((course) => !storedCourseIds.has(course.id));

    return {
      ...stored,
      courses: [...stored.courses, ...missingSeedCourses]
    };
  } catch {
    return seedData;
  }
}

export function useDayBoardData() {
  const [data, setData] = useState<DayBoardData>(seedData);
  const [hydrated, setHydrated] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());

  useEffect(() => {
    setData(readStoredData());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DAYBOARD_STORAGE_KEY, JSON.stringify(data));
    setLastSynced(new Date());
  }, [data, hydrated]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DAYBOARD_STORAGE_KEY) return;
      setData(readStoredData());
      setLastSynced(new Date());
    };

    const onLocalReset = () => {
      setData(seedData);
      setLastSynced(new Date());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(DAYBOARD_LOCAL_RESET_EVENT, onLocalReset);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DAYBOARD_LOCAL_RESET_EVENT, onLocalReset);
    };
  }, []);

  return useMemo(
    () => ({
      data,
      lastSynced,
      addTask: (task: Omit<Task, "id" | "createdAt" | "actualMinutes" | "progressPercent" | "status">) => {
        void insertForCurrentUser("tasks", {
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
        });

        setData((current) => ({
          ...current,
          tasks: [
            {
              ...task,
              id: `task-${crypto.randomUUID()}`,
              createdAt: new Date().toISOString(),
              actualMinutes: 0,
              progressPercent: 0,
              status: "not_started"
            },
            ...current.tasks
          ]
        }));
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
      },
      deleteTask: (taskId: string) => {
        setData((current) => ({
          ...current,
          tasks: current.tasks.filter((task) => task.id !== taskId)
        }));
      },
      addEvent: (event: Omit<CalendarEvent, "id">) => {
        void insertForCurrentUser("events", {
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
          linked_task_id: isUuid(event.linkedTaskId) ? event.linkedTaskId : null,
          priority: event.priority,
          status: "upcoming"
        });

        setData((current) => ({
          ...current,
          events: [{ ...event, id: `event-${crypto.randomUUID()}` }, ...current.events]
        }));
      },
      addAssignment: (assignment: Omit<Assignment, "id" | "actualMinutes" | "status">) => {
        void insertForCurrentUser("assignments", {
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
        });

        setData((current) => ({
          ...current,
          assignments: [
            {
              ...assignment,
              id: `assignment-${crypto.randomUUID()}`,
              actualMinutes: 0,
              status: "not_started"
            },
            ...current.assignments
          ],
          upcoming: [
            {
              id: `up-assignment-${crypto.randomUUID()}`,
              title: assignment.title,
              date: assignment.dueDate,
              timeLabel: assignment.dueTime ? `Due ${formatTime(assignment.dueTime)}` : "Due",
              kind: "assignment",
              importance: 70 + Math.min((assignment.gradeWeight ?? 0) * 2, 25)
            },
            ...current.upcoming
          ]
        }));
      },
      addExam: (exam: Omit<Exam, "id" | "studyMinutesCompleted" | "importanceScore">) => {
        void insertForCurrentUser("exams", {
          course_id: isUuid(exam.courseId) ? exam.courseId : null,
          title: exam.title,
          exam_date: exam.examDate,
          exam_time: exam.examTime,
          grade_weight: exam.gradeWeight,
          study_minutes_goal: exam.studyMinutesGoal,
          study_minutes_completed: 0,
          importance_score: 80 + Math.min(exam.gradeWeight ?? 0, 20)
        });

        setData((current) => ({
          ...current,
          exams: [
            {
              ...exam,
              id: `exam-${crypto.randomUUID()}`,
              studyMinutesCompleted: 0,
              importanceScore: 80 + Math.min(exam.gradeWeight ?? 0, 20)
            },
            ...current.exams
          ],
          upcoming: [
            {
              id: `up-exam-${crypto.randomUUID()}`,
              title: exam.title,
              date: exam.examDate,
              timeLabel: exam.examTime ? formatTime(exam.examTime) : "Exam",
              kind: "exam",
              importance: 90 + Math.min(exam.gradeWeight ?? 0, 10)
            },
            ...current.upcoming
          ]
        }));
      },
      addHabit: (habit: Omit<Habit, "id" | "weekPattern" | "streak" | "completedToday">) => {
        void insertForCurrentUser("habits", {
          name: habit.name,
          icon: habit.icon,
          schedule_type: habit.scheduleType,
          target_days: habit.targetDays,
          target_times_per_week: habit.targetTimesPerWeek,
          is_active: true
        });

        setData((current) => ({
          ...current,
          habits: [
            ...current.habits,
            {
              ...habit,
              id: `habit-${crypto.randomUUID()}`,
              weekPattern: [false, false, false, false, false, false, false],
              streak: 0,
              completedToday: false
            }
          ]
        }));
      },
      toggleHabit: (habitId: string) => {
        setData((current) => ({
          ...current,
          habits: current.habits.map((habit: Habit) =>
            habit.id === habitId
              ? {
                  ...habit,
                  completedToday: !habit.completedToday,
                  weekPattern: habit.weekPattern.map((done, index) =>
                    index === new Date().getDay() ? !habit.completedToday : done
                  )
                }
              : habit
          )
        }));
      },
      addNote: (note: Omit<Note, "id" | "updatedAt">) => {
        void insertForCurrentUser("notes", {
          title: note.title,
          content: note.content,
          pinned: note.pinned,
          category: note.category
        });

        setData((current) => ({
          ...current,
          notes: [
            {
              ...note,
              id: `note-${crypto.randomUUID()}`,
              updatedAt: new Date().toISOString()
            },
            ...current.notes.map((item) => (note.pinned ? { ...item, pinned: false } : item))
          ]
        }));
      },
      resetData: () => setData(seedData)
    }),
    [data, hydrated, lastSynced]
  );
}
