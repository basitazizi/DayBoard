import type { CalendarEvent } from "@/types/dayboard";
import { minutesFromTime } from "./date-utils";

export function getEventStatus(event: CalendarEvent, now = new Date()) {
  const currentKey = now.toISOString().slice(0, 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (event.date !== currentKey) {
    return event.date < currentKey ? "finished" : "upcoming";
  }

  const start = minutesFromTime(event.startTime);
  const end = minutesFromTime(event.endTime);

  if (currentMinutes < start) return "upcoming";
  if (currentMinutes <= end) return "active";
  return "finished";
}

export function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return minutesFromTime(a.startTime) - minutesFromTime(b.startTime);
  });
}

export function getEventsForDate(events: CalendarEvent[], dateKey: string) {
  return sortEvents(events.filter((event) => event.date === dateKey));
}

export function detectConflict(newEvent: CalendarEvent, events: CalendarEvent[]) {
  const start = minutesFromTime(newEvent.startTime);
  const end = minutesFromTime(newEvent.endTime);

  return events.find((event) => {
    if (event.id === newEvent.id || event.date !== newEvent.date) return false;
    return start < minutesFromTime(event.endTime) && end > minutesFromTime(event.startTime);
  });
}

export function currentTimeTopPercent(now = new Date(), startHour = 6, endHour = 23) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const start = startHour * 60;
  const end = endHour * 60;
  return Math.min(Math.max(((currentMinutes - start) / (end - start)) * 100, 0), 100);
}
