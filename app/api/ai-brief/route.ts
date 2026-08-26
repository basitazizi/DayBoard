import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createLocalBrief, type LocalBriefFacts, type LocalBriefKind, type LocalBriefTask } from "@/lib/dayboard-intelligence";

export const runtime = "nodejs";

const briefKinds: LocalBriefKind[] = ["day", "next", "focus", "school", "tomorrow"];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function dateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function nextDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function safeTimezone(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return "America/Los_Angeles";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return "America/Los_Angeles";
  }
}

function optionalData(name: string, result: { data: unknown[] | null; error: { message: string } | null }, warnings: string[]) {
  if (!result.error) return result.data ?? [];
  console.warn(`AI Brief skipped ${name}: ${result.error.message}`);
  warnings.push(`${name} data is temporarily unavailable.`);
  return [];
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in to use AI Brief." }, 401);

  let body: { kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!briefKinds.includes(body.kind as LocalBriefKind)) return json({ error: "Unknown brief type." }, 400);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: "Supabase is not configured." }, 500);

  const token = authorization.slice(7);
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Your session has expired. Please sign in again." }, 401);

  const userId = authData.user.id;
  const timezone = safeTimezone(authData.user.user_metadata?.timezone);
  const now = new Date();
  const today = dateKey(now, timezone);
  const tomorrow = nextDateKey(today);
  const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);

  const [tasksResult, eventsResult, assignmentsResult, examsResult, coursesResult, habitsResult, logsResult, focusResult] = await Promise.all([
    supabase.from("tasks").select("id,title,due_date,due_time,priority,status,estimated_minutes").eq("user_id", userId).neq("status", "completed").neq("status", "cancelled").order("due_date", { ascending: true, nullsFirst: false }).limit(50),
    supabase.from("events").select("title,event_date,start_time,end_time,all_day").eq("user_id", userId).gte("event_date", today).lte("event_date", tomorrow).order("event_date").order("start_time").limit(50),
    supabase.from("assignments").select("title,course_id,due_date,due_time,status").eq("user_id", userId).neq("status", "submitted").neq("status", "graded").order("due_date", { ascending: true, nullsFirst: false }).limit(50),
    supabase.from("exams").select("title,course_id,exam_date,exam_time").eq("user_id", userId).gte("exam_date", today).order("exam_date").limit(30),
    supabase.from("courses").select("id,code,name").eq("user_id", userId).limit(30),
    supabase.from("habits").select("id,name").eq("user_id", userId).eq("is_active", true).limit(50),
    supabase.from("habit_logs").select("habit_id").eq("user_id", userId).eq("log_date", today).eq("completed", true).limit(100),
    supabase.from("focus_sessions").select("started_at,focused_seconds").eq("user_id", userId).order("started_at", { ascending: false }).limit(100)
  ]);

  if (tasksResult.error || eventsResult.error) {
    if (tasksResult.error) console.warn(`AI Brief could not read tasks: ${tasksResult.error.message}`);
    if (eventsResult.error) console.warn(`AI Brief could not read events: ${eventsResult.error.message}`);
    return json({ error: "DayBoard could not load your tasks or calendar. Check their Supabase access policies." }, 500);
  }

  const warnings: string[] = [];
  const assignments = optionalData("Assignments", assignmentsResult, warnings) as any[];
  const exams = optionalData("Exams", examsResult, warnings) as any[];
  const courses = optionalData("Courses", coursesResult, warnings) as any[];
  const habits = optionalData("Habits", habitsResult, warnings) as any[];
  const habitLogs = optionalData("Habit history", logsResult, warnings) as any[];
  const focusSessions = optionalData("Focus history", focusResult, warnings) as any[];
  const courseMap = new Map(courses.map((course) => [course.id, `${course.code} - ${course.name}`]));
  const completedHabitIds = new Set(habitLogs.map((log) => log.habit_id));

  const tasks: LocalBriefTask[] = (tasksResult.data ?? []).map((task: any) => ({
    id: task.id,
    title: task.title,
    dueDate: task.due_date,
    dueTime: task.due_time?.slice(0, 5) ?? null,
    priority: task.priority,
    status: task.status,
    estimatedMinutes: task.estimated_minutes ?? 0
  }));
  const facts: LocalBriefFacts = {
    today,
    tomorrow,
    localTime,
    tasks,
    events: (eventsResult.data ?? []).map((event: any) => ({ title: event.title, date: event.event_date, startTime: event.start_time?.slice(0, 5) ?? null, endTime: event.end_time?.slice(0, 5) ?? null, allDay: event.all_day ?? false })),
    assignments: assignments.map((item) => ({ title: item.title, course: courseMap.get(item.course_id) ?? null, dueDate: item.due_date, dueTime: item.due_time?.slice(0, 5) ?? null, status: item.status })),
    exams: exams.map((exam) => ({ title: exam.title, course: courseMap.get(exam.course_id) ?? null, date: exam.exam_date, time: exam.exam_time?.slice(0, 5) ?? null })),
    habits: habitsResult.error || logsResult.error ? null : { total: habits.length, completed: completedHabitIds.size, remaining: habits.filter((habit) => !completedHabitIds.has(habit.id)).map((habit) => habit.name) },
    focusedMinutes: focusResult.error ? null : Math.floor(focusSessions.filter((session) => dateKey(new Date(session.started_at), timezone) === today).reduce((sum, session) => sum + (session.focused_seconds ?? 0), 0) / 60)
  };

  return json(createLocalBrief(body.kind as LocalBriefKind, facts, warnings));
}
