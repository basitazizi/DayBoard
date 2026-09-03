export type LocalBriefKind = "day" | "next" | "focus" | "school" | "tomorrow";

export type LocalBriefTask = { id: string; title: string; dueDate: string | null; dueTime: string | null; priority: string | null; status: string | null; estimatedMinutes: number };
export type LocalBriefAssignment = { title: string; course: string | null; dueDate: string | null; dueTime: string | null; status: string | null; estimatedMinutes: number; gradeWeight: number | null; difficulty: number | null };
export type LocalBriefFacts = {
  today: string; tomorrow: string; localTime: string; tasks: LocalBriefTask[];
  events: Array<{ title: string; date: string; startTime: string | null; endTime: string | null; allDay: boolean }>;
  assignments: LocalBriefAssignment[];
  exams: Array<{ title: string; course: string | null; date: string; time: string | null }>;
  habits: { total: number; completed: number; remaining: string[] } | null;
  focusedMinutes: number | null;
  focusedMinutesWeek: number | null;
  notes: Array<{ title: string; content: string | null; pinned: boolean; updatedAt: string | null }>;
};
export type LocalBrief = { lines: string[]; recommendation: string | null; recommendedTaskId: string | null; focusMinutes: number | null; spokenText: string; warnings: string[] };

const focusOptions = [15, 25, 30, 45, 50, 60] as const;

function formatTime(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

function minuteValue(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function dayDistance(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86_400_000) : null;
}

function scoreTask(task: LocalBriefTask, today: string) {
  const priorities: Record<string, number> = { critical: 400, high: 300, medium: 200, low: 100 };
  let score = priorities[task.priority ?? ""] ?? 150;
  const days = task.dueDate ? dayDistance(today, task.dueDate) : null;
  if (days !== null) {
    if (days < 0) score += 2_000 + Math.min(Math.abs(days), 30) * 10;
    else if (days === 0) score += 1_000;
    else if (days === 1) score += 700;
    else if (days <= 7) score += 350 - days * 25;
  }
  if (task.status === "in_progress") score += 80;
  if (task.estimatedMinutes > 0 && task.estimatedMinutes <= 60) score += 30;
  return score;
}

function scoreAssignment(assignment: LocalBriefAssignment, today: string) {
  let score = 120 + Math.min((assignment.gradeWeight ?? 0) * 8, 240) + (assignment.difficulty ?? 3) * 25;
  const days = assignment.dueDate ? dayDistance(today, assignment.dueDate) : null;
  if (days !== null) {
    if (days < 0) score += 1_500 + Math.min(Math.abs(days), 30) * 10;
    else if (days === 0) score += 900;
    else if (days === 1) score += 650;
    else if (days <= 7) score += 300 - days * 25;
  }
  if (assignment.estimatedMinutes > 90) score += 50;
  return score;
}

function chooseTask(tasks: LocalBriefTask[], today: string) {
  return [...tasks].filter((task) => !["completed", "cancelled"].includes(task.status ?? "")).sort((a, b) => scoreTask(b, today) - scoreTask(a, today) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0] ?? null;
}

function chooseAssignment(assignments: LocalBriefAssignment[], today: string) {
  return [...assignments].sort((a, b) => scoreAssignment(b, today) - scoreAssignment(a, today) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0] ?? null;
}

function chooseMinutes(item: { estimatedMinutes: number } | null) {
  if (!item) return null;
  const target = Math.max(15, Math.min(item.estimatedMinutes || 25, 60));
  return focusOptions.find((minutes) => minutes >= target) ?? 60;
}

function taskReason(task: LocalBriefTask, today: string, tomorrow: string) {
  if (task.dueDate && task.dueDate < today) return "It is overdue and should be addressed first.";
  if (task.dueDate === today) return "It is due today.";
  if (task.dueDate === tomorrow) return "It is due tomorrow.";
  if (task.priority === "critical") return "It is marked critical.";
  if (task.priority === "high") return "It is marked high priority.";
  if (task.status === "in_progress") return "It is already in progress.";
  return "It ranks highest from your current priorities and deadlines.";
}

function assignmentReason(assignment: LocalBriefAssignment, today: string, tomorrow: string) {
  if (assignment.dueDate && assignment.dueDate < today) return "It is overdue.";
  if (assignment.dueDate === today) return "It is due today.";
  if (assignment.dueDate === tomorrow) return "It is due tomorrow.";
  if ((assignment.gradeWeight ?? 0) >= 15) return "It has a high grade weight.";
  if ((assignment.difficulty ?? 0) >= 4) return "It is marked high difficulty.";
  return "It is the highest-risk school item.";
}

function itemDateText(date: string | null, today: string, tomorrow: string) {
  if (!date) return "no date";
  if (date < today) return "overdue";
  if (date === today) return "today";
  if (date === tomorrow) return "tomorrow";
  return date;
}

export function createLocalBrief(kind: LocalBriefKind, facts: LocalBriefFacts, warnings: string[] = []): LocalBrief {
  const lines: string[] = [];
  const todayEvents = facts.events.filter((event) => event.date === facts.today);
  const tomorrowEvents = facts.events.filter((event) => event.date === facts.tomorrow);
  const currentMinutes = minuteValue(facts.localTime) ?? 0;
  const night = currentMinutes < 360 || currentMinutes >= 1_080;
  const nextEvent = todayEvents.find((event) => !event.allDay && (minuteValue(event.startTime) ?? -1) >= currentMinutes) ?? null;
  const task = chooseTask(facts.tasks, facts.today);
  const assignment = chooseAssignment(facts.assignments, facts.today);
  const focusTarget = task && (!assignment || scoreTask(task, facts.today) >= scoreAssignment(assignment, facts.today)) ? task : assignment;
  const overdue = facts.tasks.filter((item) => item.dueDate && item.dueDate < facts.today && !["completed", "cancelled"].includes(item.status ?? ""));
  const overdueAssignments = facts.assignments.filter((item) => item.dueDate && item.dueDate < facts.today);
  const dueToday = [...facts.tasks, ...facts.assignments].filter((item) => item.dueDate === facts.today);
  const pinnedNote = facts.notes.find((note) => note.pinned) ?? facts.notes[0] ?? null;

  if (kind === "day") {
    lines.push(`${night ? "Tonight" : "Today"} you have ${todayEvents.length} calendar event${todayEvents.length === 1 ? "" : "s"} and ${dueToday.length} due item${dueToday.length === 1 ? "" : "s"}.`);
    if (nextEvent) lines.push(`Your next event is ${nextEvent.title}${nextEvent.startTime ? ` at ${formatTime(nextEvent.startTime)}` : ""}.`);
    if (overdue.length) lines.push(`${overdue.length} task${overdue.length === 1 ? " is" : "s are"} overdue.`);
    if (overdueAssignments.length) lines.push(`${overdueAssignments.length} assignment${overdueAssignments.length === 1 ? " is" : "s are"} overdue.`);
    if (facts.habits) lines.push(`You have completed ${facts.habits.completed} of ${facts.habits.total} active habits today.`);
    if (pinnedNote) lines.push(`Pinned context: ${pinnedNote.title}.`);
  } else if (kind === "next") {
    if (nextEvent) {
      lines.push(`Next: ${nextEvent.title}${nextEvent.startTime ? ` at ${formatTime(nextEvent.startTime)}` : ""}.`);
      const gap = (minuteValue(nextEvent.startTime) ?? currentMinutes) - currentMinutes;
      if (gap >= 15) lines.push(`You have about ${gap >= 60 ? `${Math.floor(gap / 60)}h${gap % 60 ? ` ${gap % 60}m` : ""}` : `${gap} minutes`} before it starts.`);
    } else lines.push("You have no later timed calendar event today.");
    if (task) lines.push(`Your highest-ranked open task is ${task.title}.`);
    if (assignment) lines.push(`Top school item: ${assignment.title}, ${itemDateText(assignment.dueDate, facts.today, facts.tomorrow)}.`);
  } else if (kind === "focus") {
    if (focusTarget && "id" in focusTarget) { lines.push(`${focusTarget.title} is the best current focus target.`); lines.push(taskReason(focusTarget, facts.today, facts.tomorrow)); }
    else if (focusTarget) { lines.push(`${focusTarget.title} is the best current focus target.`); lines.push(assignmentReason(focusTarget, facts.today, facts.tomorrow)); }
    else lines.push("You have no open task available for a focus recommendation.");
    if (facts.focusedMinutes !== null) lines.push(`${facts.focusedMinutes} focused minute${facts.focusedMinutes === 1 ? " is" : "s are"} recorded today.`);
    if (facts.habits?.remaining.length) lines.push(`Habits still open: ${facts.habits.remaining.slice(0, 3).join(", ")}.`);
  } else if (kind === "school") {
    lines.push(`You have ${facts.assignments.length} active assignment${facts.assignments.length === 1 ? "" : "s"} and ${facts.exams.length} upcoming exam${facts.exams.length === 1 ? "" : "s"}.`);
    const assignment = [...facts.assignments].filter((item) => item.dueDate).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0];
    const exam = [...facts.exams].sort((a, b) => a.date.localeCompare(b.date))[0];
    if (assignment) lines.push(`${assignment.title}${assignment.course ? ` for ${assignment.course}` : ""} is due ${assignment.dueDate}${assignment.dueTime ? ` at ${formatTime(assignment.dueTime)}` : ""}.`);
    if (exam) lines.push(`Your next exam is ${exam.title}${exam.course ? ` for ${exam.course}` : ""} on ${exam.date}${exam.time ? ` at ${formatTime(exam.time)}` : ""}.`);
    if (assignment) lines.push(assignmentReason(assignment, facts.today, facts.tomorrow));
  } else {
    lines.push(`You have ${tomorrowEvents.length} calendar event${tomorrowEvents.length === 1 ? "" : "s"} tomorrow.`);
    const dueTomorrow = [...facts.tasks, ...facts.assignments].filter((item) => item.dueDate === facts.tomorrow);
    lines.push(dueTomorrow.length ? `${dueTomorrow.length} item${dueTomorrow.length === 1 ? " is" : "s are"} due tomorrow.` : "Nothing is currently marked due tomorrow.");
    const firstEvent = tomorrowEvents.find((event) => !event.allDay && event.startTime);
    if (firstEvent) lines.push(`The first timed event is ${firstEvent.title} at ${formatTime(firstEvent.startTime)}.`);
  }

  if (facts.focusedMinutesWeek !== null && facts.focusedMinutesWeek > 0 && lines.length < 4) lines.push(`${facts.focusedMinutesWeek} focus minutes are logged this week.`);
  const focusMinutes = chooseMinutes(focusTarget);
  const recommendation = focusTarget ? `Start a ${focusMinutes}-minute focus session on ${focusTarget.title}.` : null;
  const spokenText = [...lines, recommendation ? `Recommended: ${recommendation}` : ""].filter(Boolean).join(" ");
  return { lines: lines.slice(0, 5), recommendation, recommendedTaskId: focusTarget && "id" in focusTarget ? focusTarget.id : null, focusMinutes, spokenText, warnings };
}
