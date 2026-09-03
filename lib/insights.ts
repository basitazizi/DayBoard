import type { Assignment, DayBoardData, Exam, Task } from "@/types/dayboard";
import { addDays, getDayDistance, getLocalDateKey, getWeekDays } from "./date-utils";

export type FocusSessionSummary = {
  startedAt: string | null;
  focusedSeconds: number | null;
};

export type InsightSummary = {
  activeTasks: Task[];
  completedTasks: Task[];
  overdueTasks: Task[];
  dueTodayTasks: Task[];
  completedDueTodayTasks: Task[];
  activeAssignments: Assignment[];
  overdueAssignments: Assignment[];
  dueSoonAssignments: Assignment[];
  upcomingExams: Exam[];
  todayEvents: number;
  habitCompleted: number;
  habitTotal: number;
  taskCompletionRate: number;
  dueTodayCompletionRate: number;
  habitCompletionRate: number | null;
  focusedMinutesToday: number;
  focusedMinutesWeek: number;
  workloadMinutesToday: number;
  workloadMinutesWeek: number;
  workloadLabel: "Light" | "Balanced" | "Heavy";
  focusScore: number;
  focusScoreLabel: "Clear" | "Stable" | "Needs attention" | "At risk";
  weekWorkloadPoints: number[];
  weekWorkloadLabels: string[];
  topRisks: string[];
  suggestions: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isActiveTask(task: Task) {
  return task.status !== "completed" && task.status !== "cancelled";
}

function isActiveAssignment(assignment: Assignment) {
  return assignment.status !== "submitted" && assignment.status !== "graded";
}

function taskMinutes(task: Task) {
  return Math.max(0, task.estimatedMinutes || 0);
}

function assignmentMinutes(assignment: Assignment) {
  return Math.max(0, assignment.estimatedMinutes || 0);
}

function taskRisk(task: Task, today: string) {
  const distance = task.dueDate ? getDayDistance(task.dueDate, today) : 99;
  const priority = { critical: 70, high: 50, medium: 30, low: 15 }[task.priority];
  const deadline = distance < 0 ? 90 : distance === 0 ? 70 : distance === 1 ? 50 : distance <= 3 ? 30 : 10;
  return priority + deadline + (task.status === "in_progress" ? 10 : 0);
}

function assignmentRisk(assignment: Assignment, today: string) {
  const distance = getDayDistance(assignment.dueDate, today);
  const deadline = distance < 0 ? 100 : distance === 0 ? 75 : distance === 1 ? 55 : distance <= 3 ? 35 : 10;
  return deadline + Math.min((assignment.gradeWeight ?? 0) * 2, 60) + assignment.difficulty * 8;
}

function focusMinutesForDate(focusSessions: FocusSessionSummary[], dateKey: string, timezone: string) {
  return Math.floor(
    focusSessions
      .filter((session) => session.startedAt && getLocalDateKey(new Date(session.startedAt), timezone) === dateKey)
      .reduce((sum, session) => sum + (session.focusedSeconds ?? 0), 0) / 60
  );
}

export function getInsightSummary(data: DayBoardData, focusSessions: FocusSessionSummary[] = [], now = new Date()): InsightSummary {
  const today = getLocalDateKey(now, data.timezone);
  const tomorrow = addDays(today, 1);
  const weekDays = getWeekDays(today);
  const weekEnd = weekDays[6] ?? addDays(today, 6);

  const completedTasks = data.tasks.filter((task) => task.status === "completed");
  const activeTasks = data.tasks.filter(isActiveTask);
  const overdueTasks = activeTasks.filter((task) => task.dueDate && task.dueDate < today);
  const dueTodayTasks = data.tasks.filter((task) => task.dueDate === today && task.status !== "cancelled");
  const completedDueTodayTasks = dueTodayTasks.filter((task) => task.status === "completed");
  const activeAssignments = data.assignments.filter(isActiveAssignment);
  const overdueAssignments = activeAssignments.filter((assignment) => assignment.dueDate < today);
  const dueSoonAssignments = activeAssignments.filter((assignment) => assignment.dueDate >= today && assignment.dueDate <= addDays(today, 7));
  const upcomingExams = data.exams.filter((exam) => exam.examDate >= today).sort((a, b) => a.examDate.localeCompare(b.examDate));
  const habitCompleted = data.habits.filter((habit) => habit.completedToday).length;
  const habitTotal = data.habits.length;
  const taskTotal = data.tasks.filter((task) => task.status !== "cancelled").length;
  const taskCompletionRate = taskTotal > 0 ? completedTasks.length / taskTotal : 1;
  const dueTodayCompletionRate = dueTodayTasks.length > 0 ? completedDueTodayTasks.length / dueTodayTasks.length : 1;
  const habitCompletionRate = habitTotal > 0 ? habitCompleted / habitTotal : null;
  const focusedMinutesToday = focusMinutesForDate(focusSessions, today, data.timezone);
  const focusedMinutesWeek = weekDays.reduce((sum, dateKey) => sum + focusMinutesForDate(focusSessions, dateKey, data.timezone), 0);
  const todayEvents = data.events.filter((event) => event.date === today).length;
  const workloadMinutesToday =
    activeTasks.filter((task) => task.dueDate === today || task.dueDate === tomorrow).reduce((sum, task) => sum + taskMinutes(task), 0) +
    activeAssignments.filter((assignment) => assignment.dueDate === today || assignment.dueDate === tomorrow).reduce((sum, assignment) => sum + assignmentMinutes(assignment), 0);
  const workloadMinutesWeek =
    activeTasks.filter((task) => task.dueDate && task.dueDate >= today && task.dueDate <= weekEnd).reduce((sum, task) => sum + taskMinutes(task), 0) +
    activeAssignments.filter((assignment) => assignment.dueDate >= today && assignment.dueDate <= weekEnd).reduce((sum, assignment) => sum + assignmentMinutes(assignment), 0);
  const workloadLabel = workloadMinutesToday >= 300 ? "Heavy" : workloadMinutesToday >= 120 ? "Balanced" : "Light";
  const habitScore = habitCompletionRate ?? 1;
  const overduePenalty = Math.min(35, overdueTasks.length * 10 + overdueAssignments.length * 12);
  const workloadPenalty = workloadMinutesToday >= 420 ? 12 : workloadMinutesToday >= 300 ? 6 : 0;
  const focusScore = clamp(
    Math.round(
      taskCompletionRate * 25 +
        dueTodayCompletionRate * 25 +
        habitScore * 20 +
        clamp(focusedMinutesToday / 60, 0, 1) * 15 +
        (overdueTasks.length === 0 && overdueAssignments.length === 0 ? 15 : 0) -
        overduePenalty -
        workloadPenalty
    ),
    0,
    100
  );
  const focusScoreLabel = focusScore >= 80 ? "Clear" : focusScore >= 60 ? "Stable" : focusScore >= 40 ? "Needs attention" : "At risk";
  const rawDailyLoads = weekDays.map((dateKey) => {
    const taskLoad = activeTasks.filter((task) => task.dueDate === dateKey).reduce((sum, task) => sum + taskMinutes(task), 0);
    const assignmentLoad = activeAssignments.filter((assignment) => assignment.dueDate === dateKey).reduce((sum, assignment) => sum + assignmentMinutes(assignment), 0);
    const examLoad = data.exams.filter((exam) => exam.examDate === dateKey).length * 120;
    return taskLoad + assignmentLoad + examLoad;
  });
  const maxDailyLoad = Math.max(120, ...rawDailyLoads);
  const weekWorkloadPoints = rawDailyLoads.map((minutes) => clamp(Math.round((minutes / maxDailyLoad) * 100), 0, 100));
  const weekWorkloadLabels = weekDays.map((dateKey) => new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${dateKey}T12:00:00`)).toUpperCase());
  const riskTasks = activeTasks.map((task) => ({ label: task.title, risk: taskRisk(task, today) }));
  const riskAssignments = activeAssignments.map((assignment) => ({ label: assignment.title, risk: assignmentRisk(assignment, today) }));
  const topRisks = [...riskTasks, ...riskAssignments]
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 4)
    .map((item) => item.label);
  const suggestions = [
    overdueTasks.length || overdueAssignments.length ? "Clear overdue items before adding new work." : "",
    workloadMinutesToday >= 300 ? "Move or split one large item so today's workload is realistic." : "",
    dueSoonAssignments.length ? `Start the earliest school item: ${dueSoonAssignments[0].title}.` : "",
    habitTotal > 0 && habitCompleted < habitTotal ? `Finish ${habitTotal - habitCompleted} habit${habitTotal - habitCompleted === 1 ? "" : "s"} today.` : "",
    activeTasks.length > 0 && focusedMinutesToday < 25 ? `Run one focus session on ${[...activeTasks].sort((a, b) => taskRisk(b, today) - taskRisk(a, today))[0].title}.` : ""
  ].filter(Boolean);

  return {
    activeTasks,
    completedTasks,
    overdueTasks,
    dueTodayTasks,
    completedDueTodayTasks,
    activeAssignments,
    overdueAssignments,
    dueSoonAssignments,
    upcomingExams,
    todayEvents,
    habitCompleted,
    habitTotal,
    taskCompletionRate,
    dueTodayCompletionRate,
    habitCompletionRate,
    focusedMinutesToday,
    focusedMinutesWeek,
    workloadMinutesToday,
    workloadMinutesWeek,
    workloadLabel,
    focusScore,
    focusScoreLabel,
    weekWorkloadPoints,
    weekWorkloadLabels,
    topRisks,
    suggestions
  };
}
