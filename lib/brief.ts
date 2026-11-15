import type { DayBoardData } from "@/types/dayboard";
import { getAgenda } from "./agenda";
import { formatShortTime, getDayDistance, getLocalDateKey, nowMinutes, timeFromMinutes } from "./date-utils";
import { suggestFreeTime } from "./planner";
import { getWorkItems } from "./work";

export interface Brief {
  /** Short sentences. Text wrapped in ** is shown in bold. */
  sentences: string[];
  empty: boolean;
}

/** The dashboard brief: the few things that matter right now, worked out on the device. */
export function getBrief(data: DayBoardData, now = new Date()): Brief {
  const today = getLocalDateKey(now, data.timezone);
  const current = nowMinutes(now, data.timezone);
  const sentences: string[] = [];
  const work = getWorkItems(data, now).filter((item) => !item.done);
  const agenda = getAgenda(data, today);

  const overdue = work.filter((item) => item.overdue);
  if (overdue.length) sentences.push(`**${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}** to clear first, starting with ${overdue[0].title}.`);

  const dueToday = work.filter((item) => item.dueToday);
  if (dueToday.length === 1) sentences.push(`**${dueToday[0].title}** is due ${dueToday[0].dueLabel.toLowerCase()}.`);
  else if (dueToday.length > 1) sentences.push(`**${dueToday.length} things are due today**, including ${dueToday[0].title}.`);

  const exam = data.exams.filter((item) => item.examDate >= today && item.score === undefined).sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  if (exam) {
    const days = getDayDistance(exam.examDate, today);
    if (days <= 10) {
      const sessions = data.events.filter((event) => event.category === "study" && event.date >= today && event.date <= exam.examDate).length;
      sentences.push(`**${exam.title} is ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}**${sessions ? `, with ${sessions} study session${sessions === 1 ? "" : "s"} planned` : ""}.`);
    }
  }

  const remaining = agenda.filter((item) => item.start !== undefined && item.start > current && !item.done);
  if (remaining.length && sentences.length < 3) sentences.push(`${remaining.length} more thing${remaining.length === 1 ? "" : "s"} on your schedule today.`);

  const free = suggestFreeTime(data, now);
  if (free && sentences.length < 3) sentences.push(`You're free from **${formatShortTime(timeFromMinutes(free.slot.start))}**, a good window for ${free.title}.`);

  const habitsLeft = data.habits.filter((habit) => !habit.completedToday).length;
  if (habitsLeft && sentences.length < 3) sentences.push(`${habitsLeft} habit${habitsLeft === 1 ? "" : "s"} left to check in.`);

  if (sentences.length === 0) {
    const anything = data.tasks.length + data.events.length + data.assignments.length + data.exams.length + data.habits.length > 0;
    return { sentences: [anything ? "Nothing urgent right now. A good moment to get ahead on something small." : "Add your classes and a few tasks, and I'll tell you what matters each day."], empty: !anything };
  }
  return { sentences: sentences.slice(0, 3), empty: false };
}
