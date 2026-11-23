"use client";

import type { DayBoardData } from "@/types/dayboard";
import { getAgenda, timeRangeLabel } from "./agenda";
import { addDays, getLocalDateKey } from "./date-utils";

/**
 * Reminders for the Android app. Instead of checking while the app is open (like the website does),
 * DayBoard hands the next few days of reminders to Android, which delivers them even when the app is closed
 * or the phone has restarted. They are rebuilt every time the schedule or reminder settings change.
 */

/** How far ahead to schedule. Opening the app tops it up again. */
const DAYS_AHEAD = 7;
/** Android caps how many alarms one app may hold; stay well under it. */
const MAX_SCHEDULED = 64;

type Plugin = typeof import("@capacitor/local-notifications").LocalNotifications;
// Wrapped in an object on purpose: a Capacitor plugin is a proxy that answers to any method name,
// including `then`, so returning it bare from an async function makes JavaScript treat it as a promise and fail.
let pluginPromise: Promise<{ plugin: Plugin } | null> | null = null;

/** The native plugin, or null on the website. Loaded lazily so it never runs during server rendering. */
/** Never `await` or return the plugin itself from an async function; unwrap `.plugin` where it is used. */
function nativePlugin(): Promise<{ plugin: Plugin } | null> {
  pluginPromise ??= (async () => {
    if (typeof window === "undefined") return null;
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return { plugin: LocalNotifications };
  })().catch(() => null);
  return pluginPromise;
}

/** True when running inside the DayBoard Android app. */
export function isNativeApp() {
  if (typeof window === "undefined") return false;
  const scope = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(scope.Capacitor?.isNativePlatform?.());
}

export type NativePermission = "granted" | "denied" | "prompt";

export async function nativeNotificationPermission(request: boolean): Promise<NativePermission> {
  const plugin = (await nativePlugin())?.plugin;
  if (!plugin) return "denied";
  const status = request ? await plugin.requestPermissions() : await plugin.checkPermissions();
  return status.display === "granted" ? "granted" : status.display === "denied" ? "denied" : "prompt";
}

/** Milliseconds offset of `timezone` from UTC at the given instant. */
function zoneOffset(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
}

/** The real moment that `minutes` past midnight on `dateKey` happens in `timezone`. */
function instantFor(dateKey: string, minutes: number, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, 0, minutes);
  let instant = wallClock - zoneOffset(wallClock, timezone);
  // A second pass settles days when the clocks change.
  instant = wallClock - zoneOffset(instant, timezone);
  return instant;
}

/** Stable 31-bit id per reminder, as Android requires integer ids. */
function idFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2_147_483_647 || 1;
}

/** Replaces everything scheduled with the reminders for the coming days. Pass enabled=false to clear them. */
export async function syncNativeReminders(data: DayBoardData, options: { enabled: boolean; leadMinutes: number }) {
  const plugin = (await nativePlugin())?.plugin;
  if (!plugin) return;

  const pending = await plugin.getPending();
  if (pending.notifications.length) {
    await plugin.cancel({ notifications: pending.notifications.map((item) => ({ id: item.id })) });
  }
  if (!options.enabled) return;
  if ((await plugin.checkPermissions()).display !== "granted") return;

  const now = Date.now();
  const today = getLocalDateKey(new Date(now), data.timezone);
  const notifications = [];
  const handed = readHanded(now);
  const nextHanded: Handed = {};

  for (let offset = 0; offset < DAYS_AHEAD && notifications.length < MAX_SCHEDULED; offset += 1) {
    const dateKey = addDays(today, offset);
    for (const item of getAgenda(data, dateKey)) {
      if (item.done || item.allDay) continue;
      const at = item.start ?? item.due;
      if (at === undefined) continue;

      const startsAt = instantFor(dateKey, at, data.timezone);
      // Too close to bother, or already started.
      if (startsAt <= now + 60_000) continue;

      // This reminder already went off for this same time; don't send it twice.
      const previous = handed[item.key];
      if (previous && previous.startsAt === startsAt && previous.fireAt <= now) {
        nextHanded[item.key] = previous;
        continue;
      }

      // Added inside the reminder window (e.g. due in 10 minutes with a 10-minute lead): remind right away.
      const fireAt = Math.max(startsAt - options.leadMinutes * 60_000, now + 5_000);
      const minutesLeft = Math.round((startsAt - fireAt) / 60_000);
      nextHanded[item.key] = { startsAt, fireAt };

      const timing = `in ${minutesLeft} min`;
      notifications.push({
        id: idFor(item.key),
        title: item.start !== undefined ? `${item.title} starts ${timing}` : `${item.title} is due ${timing}`,
        body: [timeRangeLabel(item), item.detail].filter(Boolean).join(" · "),
        schedule: { at: new Date(fireAt), allowWhileIdle: true },
        // Exact alarms would make Android open its "Alarms & reminders" settings screen on every save.
        // A reminder arriving a minute or two late is fine for "starts in 10 min".
        isExactNotification: false,
        smallIcon: "ic_stat_dayboard",
        iconColor: "#0d0d0f"
      });
      if (notifications.length >= MAX_SCHEDULED) break;
    }
  }

  writeHanded(nextHanded);
  if (notifications.length) await plugin.schedule({ notifications });
}

/** Reminders already given to Android, by agenda key, so a rebuild never repeats one that has gone off. */
type Handed = Record<string, { startsAt: number; fireAt: number }>;
const HANDED_KEY = "dayboard:native-reminders";

function readHanded(now: number): Handed {
  try {
    const saved = JSON.parse(localStorage.getItem(HANDED_KEY) ?? "{}") as Handed;
    // Forget anything that has already started.
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => value.startsAt > now));
  } catch {
    return {};
  }
}

function writeHanded(handed: Handed) {
  try {
    localStorage.setItem(HANDED_KEY, JSON.stringify(handed));
  } catch {
    // Nothing to keep.
  }
}
