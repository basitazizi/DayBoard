"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type DayBoardTheme = "day" | "night";

type ThemeContextValue = {
  theme: DayBoardTheme;
  setTheme: (theme: DayBoardTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({ theme: "day", setTheme: () => undefined });

function applyTheme(theme: DayBoardTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
  localStorage.setItem("dayboard-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<DayBoardTheme>("day");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("dayboard-theme");
    const initial = saved === "night" ? "night" : "day";
    setThemeState(initial);
    applyTheme(initial);

    async function loadForUser(id: string | null) {
      setUserId(id);
      if (!id) return;
      const { data: settings } = await supabase.from("user_settings").select("theme").eq("user_id", id).maybeSingle();
      if (settings?.theme === "day" || settings?.theme === "night") {
        setThemeState(settings.theme);
        applyTheme(settings.theme);
      }
    }

    void supabase.auth.getUser().then(({ data }) => loadForUser(data.user?.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void loadForUser(session?.user.id ?? null); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`dayboard-theme-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` }, (payload) => {
        const next = (payload.new as { theme?: string }).theme;
        if (next === "day" || next === "night") {
          setThemeState(next);
          applyTheme(next);
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  function setTheme(theme: DayBoardTheme) {
    setThemeState(theme);
    applyTheme(theme);
    if (!userId) return;
    void supabase.from("user_settings").upsert({ user_id: userId, theme, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
