"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { DAYBOARD_LOCAL_RESET_EVENT, DAYBOARD_STORAGE_KEY, LEGACY_DAYBOARD_STORAGE_KEYS } from "./local-data";
import { supabase } from "./supabase";

function clearLocalDayBoardData() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(DAYBOARD_STORAGE_KEY);
  for (const key of LEGACY_DAYBOARD_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(DAYBOARD_LOCAL_RESET_EVENT));
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return useMemo(
    () => ({
      session,
      user,
      loading,
      signOut: async () => {
        const result = await supabase.auth.signOut();
        clearLocalDayBoardData();
        return result;
      }
    }),
    [loading, session, user]
  );
}
