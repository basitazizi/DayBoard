const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function getLocalDateKey(date = new Date(), timezone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function todayKey() {
  return DATE_KEY_FORMATTER.format(new Date());
}

export function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDisplayDate(date: Date, timezone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric"
  })
    .format(date)
    .toUpperCase();
}

export function formatMobileDate(date: Date, timezone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
}

export function formatMonthYear(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(`${dateKey}T12:00:00`));
}

export function formatClock(date: Date, timezone = "America/Los_Angeles", showSeconds = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: showSeconds ? "2-digit" : undefined,
    hour12: true
  }).format(date);
}

export function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatShortTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return minutes === 0 ? `${hour} ${suffix}` : `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

export function getDayDistance(dateKey: string, baseKey = todayKey()) {
  const date = new Date(`${dateKey}T12:00:00`).getTime();
  const base = new Date(`${baseKey}T12:00:00`).getTime();
  return Math.round((date - base) / 86_400_000);
}

export function getRelativeDayLabel(dateKey: string, baseKey = todayKey()) {
  const distance = getDayDistance(dateKey, baseKey);
  if (distance === 0) return "Today";
  if (distance === 1) return "Tomorrow";
  if (distance === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateKey}T12:00:00`));
}

export function getMonthGrid(monthDateKey: string) {
  const anchor = new Date(`${monthDateKey}T12:00:00`);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      dateKey: date.toISOString().slice(0, 10),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === anchor.getMonth()
    };
  });
}

export function getWeekDays(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const item = new Date(start);
    item.setDate(start.getDate() + index);
    return item.toISOString().slice(0, 10);
  });
}
