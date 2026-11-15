"use client";

import { useCallback, useEffect, useState } from "react";
import type { FocusSessionSummary } from "./insights";
import { supabase } from "./supabase";

export const GUEST_FOCUS_HISTORY_KEY = "dayboard:focus-history";
export const FOCUS_HISTORY_CHANGED_EVENT = "dayboard:focus-history-changed";

export interface FocusHistoryEntry extends FocusSessionSummary {
  id: string;
  reason: string;
}

function readGuestHistory(): FocusHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_FOCUS_HISTORY_KEY) ?? "[]") as FocusHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Records a finished session for people who are not signed in. */
export function saveGuestFocusSession(entry: FocusHistoryEntry) {
  try {
    localStorage.setItem(GUEST_FOCUS_HISTORY_KEY, JSON.stringify([entry, ...readGuestHistory().filter((item) => item.id !== entry.id)].slice(0, 300)));
  } catch {
    // Storage unavailable; history simply is not kept.
  }
  window.dispatchEvent(new Event(FOCUS_HISTORY_CHANGED_EVENT));
}

/** Completed focus sessions, newest first: from the account when signed in, otherwise from this device. */
export function useFocusHistory() {
  const [sessions, setSessions] = useState<FocusHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession();
    const userId = auth.session?.user.id;
    if (!userId) {
      setSessions(readGuestHistory());
      setLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from("focus_sessions")
      .select("id,focus_reason,started_at,focused_seconds")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(400);
    if (!error) setSessions((data ?? []).map((row) => ({ id: row.id, reason: row.focus_reason ?? "Focus", startedAt: row.started_at ?? null, focusedSeconds: row.focused_seconds ?? 0 })));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(FOCUS_HISTORY_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FOCUS_HISTORY_CHANGED_EVENT, onChange);
  }, [refresh]);

  return { sessions, loaded, refresh };
}
