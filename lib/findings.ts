import type { DayBoardData, Tone } from "@/types/dayboard";
import { addDays, getDayDistance, getLocalDateKey, weekdayOf } from "./date-utils";
import type { FocusSessionSummary } from "./insights";
import { getCourseGrade, getWorkItems } from "./work";

export interface Finding {
  id: string;
  tone: Tone;
  icon: "school" | "moon" | "sun" | "flame" | "alert" | "target" | "calendar";
  title: string;
  body: string;
  action?: { label: string; href: string };
}

function focusByDate(sessions: FocusSessionSummary[], timezone: string) {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    if (!session.startedAt) continue;
    const key = getLocalDateKey(new Date(session.startedAt), timezone);
    totals.set(key, (totals.get(key) ?? 0) + (session.focusedSeconds ?? 0) / 60);
  }
  return totals;
}

/** Minutes of focus for each of the last `days` days, oldest first. */
export function focusSeries(sessions: FocusSessionSummary[], timezone: string, days: number, now = new Date()) {
  const today = getLocalDateKey(now, timezone);
  const totals = focusByDate(sessions, timezone);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - days + 1);
    return { date, minutes: Math.round(totals.get(date) ?? 0) };
  });
}

/** Plain-language observations, each backed by the person's own data. Returns nothing it cannot support. */
export function getFindings(data: DayBoardData, sessions: FocusSessionSummary[], now = new Date()): Finding[] {
  const findings: Finding[] = [];
  const today = getLocalDateKey(now, data.timezone);
  const work = getWorkItems(data, now);
  const open = work.filter((item) => !item.done);

  const overdue = open.filter((item) => item.overdue);
  if (overdue.length > 0) {
    findings.push({
      id: "overdue",
      tone: "rose",
      icon: "alert",
      title: overdue.length === 1 ? "One item is overdue" : `${overdue.length} items are overdue`,
      body: `${overdue[0].title}${overdue.length > 1 ? ` and ${overdue.length - 1} more` : ""}. Clearing these first keeps new work from piling on top.`,
      action: { label: "Open tasks", href: "/tasks" }
    });
  }

  const nextExam = data.exams.filter((exam) => exam.examDate >= today && exam.score === undefined).sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  if (nextExam) {
    const days = getDayDistance(nextExam.examDate, today);
    const sessionsPlanned = data.events.filter((event) => event.category === "study" && event.date >= today && event.date <= nextExam.examDate && event.title.toLowerCase().includes(nextExam.title.toLowerCase())).length;
    if (days <= 7 && sessionsPlanned === 0) {
      findings.push({
        id: "exam-unplanned",
        tone: "amber",
        icon: "school",
        title: `${nextExam.title} is in ${days} day${days === 1 ? "" : "s"}`,
        body: "No study sessions are on your calendar for it yet. Planning them now spreads the work out.",
        action: { label: "Open School", href: "/school" }
      });
    }
  }

  const graded = data.courses.map((course) => ({ course, grade: getCourseGrade(data, course.id).percent })).filter((entry) => entry.grade !== null) as Array<{ course: DayBoardData["courses"][number]; grade: number }>;
  if (graded.length >= 2) {
    const lowest = graded.reduce((low, entry) => (entry.grade < low.grade ? entry : low));
    const average = graded.reduce((sum, entry) => sum + entry.grade, 0) / graded.length;
    if (average - lowest.grade >= 4) {
      findings.push({
        id: "lowest-course",
        tone: "amber",
        icon: "school",
        title: `${lowest.course.name} is your lowest grade`,
        body: `It sits at ${lowest.grade}%, ${Math.round(average - lowest.grade)} points under your average. A little extra time here moves your overall result the most.`,
        action: { label: "Open School", href: "/school" }
      });
    }
  }

  const timed = sessions.filter((session) => session.startedAt && (session.focusedSeconds ?? 0) >= 300);
  if (timed.length >= 5) {
    const buckets = { morning: 0, afternoon: 0, evening: 0 };
    for (const session of timed) {
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: data.timezone, hour: "2-digit", hour12: false }).format(new Date(session.startedAt!))) % 24;
      if (hour < 12) buckets.morning += 1;
      else if (hour < 17) buckets.afternoon += 1;
      else buckets.evening += 1;
    }
    const [best, count] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
    const share = Math.round((count / timed.length) * 100);
    if (share >= 50) {
      findings.push({
        id: "best-time",
        tone: "accent",
        icon: best === "evening" ? "moon" : "sun",
        title: `You focus best in the ${best}`,
        body: `${share}% of your focus sessions happen then. Put your hardest work in that window.`,
        action: { label: "Start a session", href: "/focus" }
      });
    }
  }

  const series = focusSeries(sessions, data.timezone, 28, now);
  const weekdayMinutes = series.filter((day) => ![0, 6].includes(weekdayOf(day.date)));
  const weekendMinutes = series.filter((day) => [0, 6].includes(weekdayOf(day.date)));
  const weekdayAverage = weekdayMinutes.reduce((sum, day) => sum + day.minutes, 0) / Math.max(weekdayMinutes.length, 1);
  const weekendAverage = weekendMinutes.reduce((sum, day) => sum + day.minutes, 0) / Math.max(weekendMinutes.length, 1);
  if (weekdayAverage >= 30 && weekendAverage < weekdayAverage * 0.4) {
    findings.push({
      id: "weekend-dip",
      tone: "green",
      icon: "flame",
      title: "Weekends go quiet",
      body: `You average ${Math.round(weekdayAverage)} minutes of focus on weekdays and ${Math.round(weekendAverage)} at weekends. One short weekend session keeps momentum.`,
      action: { label: "Open calendar", href: "/calendar" }
    });
  }

  const fortnight = Array.from({ length: 14 }, (_, index) => addDays(today, -index - 1));
  const missed = data.habits
    .map((habit) => {
      const required = fortnight.filter((date) => habit.scheduleType !== "scheduled" || habit.targetDays.includes(weekdayOf(date)));
      const done = required.filter((date) => data.habitLogs.some((log) => log.habitId === habit.id && log.date === date && log.completed)).length;
      return { habit, required: required.length, rate: required.length ? done / required.length : 1 };
    })
    // Only habits that have existed for at least a week, judged by their first check-in.
    .filter((entry) => data.habitLogs.some((log) => log.habitId === entry.habit.id && log.date <= addDays(today, -7)))
    .filter((entry) => entry.habit.scheduleType !== "weekly" && entry.required >= 5 && entry.rate < 0.5)
    .sort((a, b) => a.rate - b.rate)[0];
  if (missed) {
    findings.push({
      id: "habit-missed",
      tone: "teal",
      icon: "target",
      title: `${missed.habit.name} is slipping`,
      body: `Done on ${Math.round(missed.rate * 100)}% of days over the last two weeks. Try tying it to something you already do every day.`,
      action: { label: "Open habits", href: "/habits" }
    });
  }

  const week = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const loads = week.map((date) => ({ date, minutes: open.filter((item) => item.dueDate === date).reduce((sum, item) => sum + (item.estimatedMinutes || 30), 0) }));
  const heaviest = loads.reduce((top, day) => (day.minutes > top.minutes ? day : top));
  if (heaviest.minutes >= 240) {
    findings.push({
      id: "heavy-day",
      tone: "blue",
      icon: "calendar",
      title: `${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${heaviest.date}T12:00:00`))} is overloaded`,
      body: `About ${Math.round(heaviest.minutes / 60)} hours of work is due that day. Starting one item early would even it out.`,
      action: { label: "Open tasks", href: "/tasks" }
    });
  }

  return findings.slice(0, 6);
}
