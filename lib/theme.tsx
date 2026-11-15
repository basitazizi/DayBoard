"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type DayBoardTheme = "day" | "night";
export type ThemeMode = DayBoardTheme | "auto";
export type AccentColor = "violet" | "teal" | "blue" | "rose" | "amber";
export type TextSize = "small" | "default" | "large" | "xlarge";

export interface Prefs {
  accent: AccentColor;
  textSize: TextSize;
  showHabits: boolean;
  showFocus: boolean;
  showNotes: boolean;
  confirmBeforeAdding: boolean;
  autoPlanStudy: boolean;
  voiceInput: boolean;
  focusGoalMinutes: number;
}

export const DEFAULT_PREFS: Prefs = {
  accent: "violet",
  textSize: "default",
  showHabits: true,
  showFocus: true,
  showNotes: true,
  confirmBeforeAdding: true,
  autoPlanStudy: true,
  voiceInput: true,
  focusGoalMinutes: 120
};

type ThemeContextValue = {
  theme: DayBoardTheme;
  mode: ThemeMode;
  setTheme: (theme: DayBoardTheme) => void;
  setMode: (mode: ThemeMode) => void;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
};

const THEME_KEY = "dayboard-theme";
const MODE_KEY = "dayboard-theme-mode";
const PREFS_KEY = "dayboard:prefs";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "day",
  mode: "day",
  setTheme: () => undefined,
  setMode: () => undefined,
  prefs: DEFAULT_PREFS,
  setPrefs: () => undefined
});

function systemTheme(): DayBoardTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

function applyTheme(theme: DayBoardTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "night" ? "#0f1116" : "#f4f3ee");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable; the theme still applies for this visit.
  }
}

function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  if (prefs.accent === "violet") delete root.dataset.accent;
  else root.dataset.accent = prefs.accent;
  if (prefs.textSize === "default") delete root.dataset.text;
  else root.dataset.text = prefs.textSize;
}

function readPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<DayBoardTheme>("day");
  const [mode, setModeState] = useState<ThemeMode>("day");
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const savedMode = localStorage.getItem(MODE_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    const initialMode: ThemeMode = savedMode === "auto" ? "auto" : savedTheme === "night" ? "night" : "day";
    const initialTheme = initialMode === "auto" ? systemTheme() : initialMode;
    setModeState(initialMode);
    setThemeState(initialTheme);
    applyTheme(initialTheme);

    const initialPrefs = readPrefs();
    setPrefsState(initialPrefs);
    applyPrefs(initialPrefs);

    async function loadForUser(id: string | null) {
      setUserId(id);
      if (!id || localStorage.getItem(MODE_KEY) === "auto") return;
      const { data: settings } = await supabase.from("user_settings").select("theme").eq("user_id", id).maybeSingle();
      if (settings?.theme === "day" || settings?.theme === "night") {
        setThemeState(settings.theme);
        setModeState(settings.theme);
        applyTheme(settings.theme);
      }
    }

    void supabase.auth.getSession().then(({ data }) => loadForUser(data.session?.user.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForUser(session?.user.id ?? null);
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (localStorage.getItem(MODE_KEY) !== "auto") return;
      const next = systemTheme();
      setThemeState(next);
      applyTheme(next);
    };
    media.addEventListener("change", onSystemChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFS_KEY || event.key === null) {
        const next = readPrefs(); setPrefsState(next); applyPrefs(next);
      }
      if (event.key === MODE_KEY || event.key === THEME_KEY || event.key === null) {
        const saved = localStorage.getItem(MODE_KEY);
        const nextMode: ThemeMode = saved === "auto" || saved === "night" ? saved : "day";
        const resolved = nextMode === "auto" ? systemTheme() : nextMode;
        setModeState(nextMode); setThemeState(resolved); applyTheme(resolved);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listener.subscription.unsubscribe();
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`dayboard-theme-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` }, (payload) => {
        const next = (payload.new as { theme?: string }).theme;
        if ((next === "day" || next === "night") && localStorage.getItem(MODE_KEY) !== "auto") {
          setThemeState(next);
          setModeState(next);
          applyTheme(next);
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  function setMode(next: ThemeMode) {
    const resolved = next === "auto" ? systemTheme() : next;
    setModeState(next);
    setThemeState(resolved);
    applyTheme(resolved);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Ignore storage failures.
    }
    if (!userId || next === "auto") return;
    void supabase.from("user_settings").upsert({ user_id: userId, theme: resolved, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }

  function setPrefs(patch: Partial<Prefs>) {
    setPrefsState((current) => {
      const next = { ...current, ...patch };
      applyPrefs(next);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, mode, setTheme: setMode, setMode, prefs, setPrefs }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
