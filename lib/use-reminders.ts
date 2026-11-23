"use client";

import { useEffect, useRef } from "react";
import type { DayBoardData } from "@/types/dayboard";
import { getAgenda, timeRangeLabel } from "./agenda";
import { getLocalDateKey, nowMinutes } from "./date-utils";
import { isNativeApp, syncNativeReminders } from "./native-reminders";

const SENT_KEY = "dayboard:reminders-sent";

function readSent(today: string): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as { date?: string; keys?: string[] };
    return new Set(saved.date === today ? saved.keys ?? [] : []);
  } catch {
    return new Set();
  }
}

function writeSent(today: string, keys: Set<string>) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ date: today, keys: [...keys] }));
  } catch {
    // Nothing to keep.
  }
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Reminds the person shortly before things start or are due.
 * In the Android app, reminders are scheduled with the phone and arrive even when DayBoard is closed.
 * On the website, they fire while DayBoard is open: a system notification when allowed, the in-app toast otherwise.
 */
export function useReminders(data: DayBoardData, options: { enabled: boolean; leadMinutes: number; hydrated: boolean; toast: (message: string) => void }) {
  const latest = useRef({ data, ...options });
  latest.current = { data, ...options };

  // Android app: hand upcoming reminders to the phone so they arrive even when DayBoard is closed.
  useEffect(() => {
    if (!options.hydrated || !isNativeApp()) return;
    const timer = window.setTimeout(() => {
      syncNativeReminders(data, { enabled: options.enabled, leadMinutes: options.leadMinutes }).catch(() => {
        // Scheduling failed (e.g. permission revoked); the next change tries again.
      });
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [data, options.enabled, options.leadMinutes, options.hydrated]);

  // Website: check while the page is open.
  useEffect(() => {
    if (!options.enabled || !options.hydrated || isNativeApp()) return;

    function check() {
      const { data: current, leadMinutes, toast } = latest.current;
      const now = new Date();
      const today = getLocalDateKey(now, current.timezone);
      const minutes = nowMinutes(now, current.timezone);
      const sent = readSent(today);
      let changed = false;

      for (const item of getAgenda(current, today)) {
        if (item.done || item.allDay) continue;
        const at = item.start ?? item.due;
        if (at === undefined) continue;
        const startsIn = at - minutes;
        if (startsIn > leadMinutes || startsIn < -2 || sent.has(item.key)) continue;

        sent.add(item.key);
        changed = true;
        const timing = startsIn <= 0 ? "now" : `in ${startsIn} min`;
        const title = item.start !== undefined ? `${item.title} starts ${timing}` : `${item.title} is due ${timing}`;
        const body = [timeRangeLabel(item), item.detail].filter(Boolean).join(" · ");

        if (notificationsSupported() && Notification.permission === "granted") {
          try {
            new Notification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: item.key });
            continue;
          } catch {
            // Some phones only allow notifications from a service worker; fall back to the toast.
          }
        }
        toast(title);
      }
      if (changed) writeSent(today, sent);
    }

    check();
    const interval = window.setInterval(check, 30_000);
    return () => window.clearInterval(interval);
  }, [options.enabled, options.hydrated]);
}
