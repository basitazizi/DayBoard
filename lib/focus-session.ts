"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { FocusSession } from "@/types/focus";

const ACTIVE_STATUSES = ["focusing", "focus", "paused", "break", "break_complete"];

export function getFocusRemaining(session: FocusSession | null, at = Date.now()) {
  if (!session) return 0;
  if (session.status === "paused") return Math.max(0, session.remaining_seconds ?? 0);
  if (!session.ends_at) return 0;
  return Math.max(0, Math.ceil((new Date(session.ends_at).getTime() - at) / 1000));
}

function normalizeSession(row: Record<string, unknown>): FocusSession {
  const status = row.status === "focus" ? "focusing" : row.status === "break_complete" ? "break" : row.status;
  return { ...row, status } as FocusSession;
}

export function useActiveFocusSession() {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("focus_sessions")
      .select("*")
      .eq("user_id", auth.user.id)
      .in("status", ACTIVE_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) setSession(data ? normalizeSession(data) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        setLoading(false);
        return;
      }
      void refresh();
      channel = supabase
        .channel(`active-focus-${data.user.id}-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "focus_sessions", filter: `user_id=eq.${data.user.id}` }, () => void refresh())
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { session, loading, refresh };
}
