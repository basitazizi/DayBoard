import type { DayBoardData } from "@/types/dayboard";
import { getAgenda, timeRangeLabel } from "./agenda";
import { addDays, formatShortTime, getDayDistance, getLocalDateKey, getRelativeDayLabel, timeFromMinutes } from "./date-utils";
import type { DraftChange, DraftItem } from "./drafts";
import { findFreeSlots, suggestFreeTime } from "./planner";
import { looksLikeAddRequest, parseQuickAdd } from "./quick-parse";
import { getCourseGrade, getWorkItems } from "./work";

export interface AssistantReply {
  text: string;
  drafts?: DraftItem[];
  changes?: DraftChange[];
  /** True when the question needs the cloud assistant and it is not available. */
  needsCloud?: boolean;
}

function list(lines: string[]) {
  return lines.map((line) => `• ${line}`).join("\n");
}

function dayName(dateKey: string, today: string) {
  return getRelativeDayLabel(dateKey, today);
}

/**
 * Answers from the person's own data without any network call.
 * Covers schedule, deadlines, priorities, free time, habits and grades, and turns "add ..." sentences into drafts.
 */
export function answerLocally(question: string, data: DayBoardData, now = new Date()): AssistantReply {
  const lower = question.trim().toLowerCase();
  const today = getLocalDateKey(now, data.timezone);
  const work = getWorkItems(data, now).filter((item) => !item.done);

  const action = /^(delete|remove|cancel)\b/.test(lower) ? "delete" : /^(complete|finish|mark done)\b/.test(lower) ? "complete" : null;
  if (action) {
    const title = lower.replace(/^(delete|remove|cancel|complete|finish|mark done)\s+(the\s+)?((task|assignment|event|exam)\s+)?/, "").replace(/^["']|["']$/g, "").trim();
    const candidates = [
      ...data.tasks.map((item) => ({...item, target: "task" as const})),
      ...data.assignments.map((item) => ({...item, target: "assignment" as const})),
      ...data.events.map((item) => ({...item, target: "event" as const})),
      ...data.exams.map((item) => ({...item, target: "exam" as const}))
    ];
    const matches = candidates.filter((item) => item.title.toLowerCase() === title);
    if (matches.length === 1) {
      const item = matches[0];
      if (action === "complete" && item.target !== "task" && item.target !== "assignment") return {text: "I can mark tasks and assignments complete. You can remove that event or exam instead."};
      return {text: `Review and confirm to ${action} ${item.title}.`, changes: [{id: crypto.randomUUID(), action, target: item.target, targetId: item.id, title: item.title, selected: true}]};
    }
    return {text: matches.length > 1 ? "Several items have that title. Open the item to choose which one to change." : "Which item? Use its exact title so I can find it."};
  }

  if (/\b(completed|finished|submitted)\b/.test(lower)) {
    const done = getWorkItems(data, now).filter((item) => item.done);
    return {text: done.length ? `Completed work:\n${list(done.map((item) => item.title))}` : "No completed work is recorded yet."};
  }

  if (/\b(due|deadline)s?\b.*\b(week|soon|coming up|upcoming)\b|\bwhat'?s due\b/.test(lower)) {
    const end = addDays(today, 7);
    const due = work.filter((item) => item.dueDate && item.dueDate <= end).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    const exams = data.exams.filter((exam) => exam.examDate >= today && exam.examDate <= end);
    if (due.length === 0 && exams.length === 0) return { text: "Nothing is due in the next 7 days." };
    return {
      text: [
        due.length ? `Due in the next 7 days:\n${list(due.slice(0, 8).map((item) => `${item.title} — ${item.dueLabel}${item.courseId ? ` (${item.courseLabel})` : ""}`))}` : "",
        exams.length ? `Exams:\n${list(exams.map((exam) => `${exam.title} — ${dayName(exam.examDate, today)}${exam.examTime ? ` at ${formatShortTime(exam.examTime)}` : ""}`))}` : ""
      ].filter(Boolean).join("\n\n")
    };
  }

  if (/\b(what should i|what do i|what to) (study|do|work on|focus on|start)|\bprioriti[sz]e\b|\bplan my (evening|day|night|afternoon)\b|\bwhat'?s next\b/.test(lower)) {
    if (work.length === 0) return { text: "You have no open work right now. Add a task or an assignment and I'll rank it for you." };
    const top = work.slice(0, 3);
    const free = suggestFreeTime(data, now);
    return {
      text: [
        `Start with ${top[0].title}. ${top[0].reason}.`,
        top.length > 1 ? `After that:\n${list(top.slice(1).map((item) => `${item.title} — ${item.dueLabel}`))}` : "",
        free ? `You're free from ${formatShortTime(timeFromMinutes(free.slot.start))}, which fits about ${free.minutes} minutes on it.` : ""
      ].filter(Boolean).join("\n\n")
    };
  }

  if (/\bfree\b.*\b(time|hour|slot)|\bwhen am i free\b|\bfind me\b/.test(lower)) {
    const tomorrow = /\btomorrow\b/.test(lower);
    const day = tomorrow ? addDays(today, 1) : today;
    const from = tomorrow ? undefined : Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
    const slots = findFreeSlots(data, day, { from, minLength: 45 });
    if (slots.length === 0) return { text: `No free stretch of 45 minutes or more ${tomorrow ? "tomorrow" : "left today"} between 8 AM and 9 PM.` };
    return { text: `Free ${tomorrow ? "tomorrow" : "today"}:\n${list(slots.slice(0, 5).map((slot) => `${formatShortTime(timeFromMinutes(slot.start))} – ${formatShortTime(timeFromMinutes(slot.end))}`))}` };
  }

  if (/\b(grade|grades|gpa|marks?)\b/.test(lower)) {
    const graded = data.courses.map((course) => ({ course, grade: getCourseGrade(data, course.id) })).filter((entry) => entry.grade.percent !== null);
    if (graded.length === 0) return { text: "No grades entered yet. Add a score to an assignment or exam on the School page and I'll track each class average." };
    return { text: `Current averages:\n${list(graded.map((entry) => `${entry.course.name} — ${entry.grade.percent}% from ${entry.grade.gradedCount} graded item${entry.grade.gradedCount === 1 ? "" : "s"}`))}` };
  }

  if (/\bhabits?\b|\bstreak/.test(lower)) {
    if (data.habits.length === 0) return { text: "You have no habits yet. Say something like “remind me to read every day” to add one." };
    return { text: `Habits today:\n${list(data.habits.map((habit) => `${habit.name} — ${habit.completedToday ? "done" : "not yet"}, ${habit.streak} day streak`))}` };
  }

  if (/\b(schedule|agenda|calendar|what'?s on|what do i have|my day|today|tomorrow)\b/.test(lower) && !looksLikeAddRequest(question)) {
    const tomorrow = /\btomorrow\b/.test(lower);
    const day = tomorrow ? addDays(today, 1) : today;
    const agenda = getAgenda(data, day).filter((item) => !item.done);
    if (agenda.length === 0) return { text: `Nothing is scheduled ${tomorrow ? "tomorrow" : "today"}.` };
    return { text: `${tomorrow ? "Tomorrow" : "Today"}:\n${list(agenda.map((item) => `${timeRangeLabel(item)} — ${item.title}`))}` };
  }

  if (/\bexams?\b|\bmidterm|\bfinals?\b/.test(lower) && !looksLikeAddRequest(question)) {
    const exams = data.exams.filter((exam) => exam.examDate >= today);
    if (exams.length === 0) return { text: "No upcoming exams on record." };
    return { text: `Upcoming exams:\n${list(exams.map((exam) => `${exam.title} — in ${getDayDistance(exam.examDate, today)} day${getDayDistance(exam.examDate, today) === 1 ? "" : "s"}`))}` };
  }

  if (looksLikeAddRequest(question)) {
    const drafts = parseQuickAdd(question, data, now);
    if (drafts.length > 0) return { text: `I understood ${drafts.length} item${drafts.length === 1 ? "" : "s"}. Check them and confirm.`, drafts };
  }

  return {
    needsCloud: true,
    text: "I can answer that kind of question once the full assistant is switched on. Right now I can tell you what's due, what to work on next, when you're free, your habits and grades, and I can add things when you describe them."
  };
}
