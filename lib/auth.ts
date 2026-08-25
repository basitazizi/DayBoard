"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

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
      signOut: () => supabase.auth.signOut()
    }),
    [loading, session, user]
  );
}
