import type { Habit, HabitLog } from "@/types/dayboard";
import { addDays, getLocalDateKey } from "./date-utils";

function weekday(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).getDay();
}

function isRequiredDay(habit: Pick<Habit, "scheduleType" | "targetDays">, dateKey: string) {
  if (habit.scheduleType === "weekly") return true;
  if (habit.scheduleType === "daily") return true;
  return habit.targetDays.includes(weekday(dateKey));
}

function previousRequiredDay(habit: Pick<Habit, "scheduleType" | "targetDays">, dateKey: string) {
  let cursor = addDays(dateKey, -1);
  for (let attempts = 0; attempts < 14; attempts += 1) {
    if (isRequiredDay(habit, cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

export function calculateHabitStreak(habit: Pick<Habit, "id" | "scheduleType" | "targetDays">, logs: HabitLog[], currentDate = getLocalDateKey()) {
  const completedDates = new Set(
    logs
      .filter((log) => log.habitId === habit.id && log.completed)
      .map((log) => log.date)
  );

  let cursor = isRequiredDay(habit, currentDate) ? currentDate : previousRequiredDay(habit, currentDate);

  if (!completedDates.has(cursor) && cursor === currentDate) {
    cursor = previousRequiredDay(habit, cursor);
  }

  let streak = 0;
  for (let attempts = 0; attempts < 366; attempts += 1) {
    if (!isRequiredDay(habit, cursor)) {
      cursor = previousRequiredDay(habit, cursor);
      continue;
    }

    if (!completedDates.has(cursor)) break;
    streak += 1;
    cursor = previousRequiredDay(habit, cursor);
  }

  return streak;
}

export function calculateHabitWeekPattern(habit: Pick<Habit, "id">, logs: HabitLog[], currentDate = getLocalDateKey()) {
  const current = new Date(`${currentDate}T12:00:00`);
  const weekStart = new Date(current);
  weekStart.setDate(current.getDate() - current.getDay());
  const completedDates = new Set(logs.filter((log) => log.habitId === habit.id && log.completed).map((log) => log.date));

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return completedDates.has(day.toISOString().slice(0, 10));
  });
}
