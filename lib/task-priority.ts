import type { PriorityResult, Task } from "@/types/dayboard";
import { getDayDistance } from "./date-utils";

const manualPriorityScore: Record<Task["priority"], number> = {
  low: 10,
  medium: 25,
  high: 50,
  critical: 80
};

export function getTaskPriority(task: Task, now = new Date()): PriorityResult {
  const nowKey = now.toISOString().slice(0, 10);
  const dueDistance = task.dueDate ? getDayDistance(task.dueDate, nowKey) : 30;
  const remainingMinutes = Math.max(task.estimatedMinutes - task.actualMinutes, 0);

  let deadlineScore = 0;
  if (dueDistance < 0) deadlineScore = 100;
  else if (dueDistance === 0) deadlineScore = 70;
  else if (dueDistance === 1) deadlineScore = 50;
  else if (dueDistance <= 3) deadlineScore = 30;
  else if (dueDistance <= 7) deadlineScore = 15;

  const statusBonus = task.status === "in_progress" ? 35 : task.status === "paused" ? 20 : 0;
  const overdueBonus = task.status === "overdue" || dueDistance < 0 ? 100 : 0;
  const score = manualPriorityScore[task.priority] + deadlineScore + statusBonus + overdueBonus;

  if (task.status === "completed") {
    return {
      score,
      urgency: "safe",
      displayStatus: "green",
      reason: "Completed"
    };
  }

  if (task.status === "in_progress") {
    return {
      score,
      urgency: dueDistance <= 0 ? "high_risk" : "attention",
      displayStatus: "blue",
      reason: "Currently in progress"
    };
  }

  if (dueDistance < 0 || task.status === "overdue") {
    return {
      score,
      urgency: "critical",
      displayStatus: "red",
      reason: "Overdue"
    };
  }

  if (dueDistance === 0 && remainingMinutes >= 75) {
    return {
      score,
      urgency: "high_risk",
      displayStatus: "red",
      reason: "Due today with significant work remaining"
    };
  }

  if (dueDistance <= 1 && task.priority === "critical") {
    return {
      score,
      urgency: "high_risk",
      displayStatus: "red",
      reason: "Critical and due soon"
    };
  }

  if (dueDistance <= 1 || task.priority === "high") {
    return {
      score,
      urgency: "attention",
      displayStatus: "gray",
      reason: "Needs attention soon"
    };
  }

  return {
    score,
    urgency: "safe",
    displayStatus: "gray",
    reason: "Flexible"
  };
}

export function sortRelevantTasks(tasks: Task[], now = new Date()) {
  return [...tasks].sort((a, b) => {
    const aPriority = getTaskPriority(a, now);
    const bPriority = getTaskPriority(b, now);

    if (a.status === "completed" && b.status !== "completed") return 1;
    if (b.status === "completed" && a.status !== "completed") return -1;
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (b.status === "overdue" && a.status !== "overdue") return 1;
    if (a.status === "in_progress" && b.status !== "in_progress") return -1;
    if (b.status === "in_progress" && a.status !== "in_progress") return 1;
    if (bPriority.score !== aPriority.score) return bPriority.score - aPriority.score;
    return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
  });
}
