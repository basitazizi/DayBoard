"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { DAYBOARD_AUTH_CHANGED_EVENT } from "./local-data";
import { supabase } from "./supabase";

const GUEST_DISPLAY_NAME_KEY = "dayboard:guest-display-name";

function metadataDisplayName(user: User | null) {
  const value = user?.user_metadata?.display_name;
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function notifyLocalDataAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DAYBOARD_AUTH_CHANGED_EVENT));
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    setGuestDisplayName(window.localStorage.getItem(GUEST_DISPLAY_NAME_KEY)?.trim().slice(0, 80) ?? "");

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
      notifyLocalDataAuthChanged();
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
      displayName: user ? metadataDisplayName(user) : guestDisplayName,
      loading,
      saveDisplayName: async (value: string) => {
        const displayName = value.trim().slice(0, 80);

        if (!user) {
          if (displayName) window.localStorage.setItem(GUEST_DISPLAY_NAME_KEY, displayName);
          else window.localStorage.removeItem(GUEST_DISPLAY_NAME_KEY);
          setGuestDisplayName(displayName);
          return { error: null };
        }

        const result = await supabase.auth.updateUser({ data: { display_name: displayName } });
        if (result.data.user) setUser(result.data.user);
        return { error: result.error };
      },
      signOut: async () => {
        const result = await supabase.auth.signOut();
        notifyLocalDataAuthChanged();
        return result;
      }
    }),
    [guestDisplayName, loading, session, user]
  );
}
