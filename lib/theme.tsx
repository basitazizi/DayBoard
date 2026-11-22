"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { setDatePrefs } from "./date-utils";
import { DEFAULT_PREFS, DEFAULT_PROFILE, normalizePrefs, normalizeProfile, type Prefs, type Profile } from "./personalize";
import { supabase } from "./supabase";

export type { AccentColor, Backdrop, Density, FontChoice, Prefs, Profile, TextSize } from "./personalize";
export { DEFAULT_PREFS } from "./personalize";

export type DayBoardTheme = "day" | "night";
export type ThemeMode = DayBoardTheme | "auto";

type ThemeContextValue = {
  theme: DayBoardTheme;
  mode: ThemeMode;
  setTheme: (theme: DayBoardTheme) => void;
  setMode: (mode: ThemeMode) => void;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  profile: Profile;
  setProfile: (patch: Partial<Profile>) => void;
  /** A large background photo. Kept on this device only. */
  wallpaper: string;
  setWallpaper: (dataUrl: string) => void;
  resetCustomization: () => void;
  /** Whether personalisation is saved to the account (false until the database has the columns for it). */
  syncing: boolean;
};

const THEME_KEY = "dayboard-theme";
const MODE_KEY = "dayboard-theme-mode";
const PREFS_KEY = "dayboard:prefs";
const PROFILE_KEY = "dayboard:profile";
const WALLPAPER_KEY = "dayboard:wallpaper";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "day",
  mode: "day",
  setTheme: () => undefined,
  setMode: () => undefined,
  prefs: DEFAULT_PREFS,
  setPrefs: () => undefined,
  profile: DEFAULT_PROFILE,
  setProfile: () => undefined,
  wallpaper: "",
  setWallpaper: () => undefined,
  resetCustomization: () => undefined,
  syncing: false
});

function systemTheme(): DayBoardTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked; the change still applies for this visit.
  }
}

function read<T>(key: string, normalize: (raw: unknown) => T): T {
  try {
    return normalize(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return normalize(null);
  }
}

function applyTheme(theme: DayBoardTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "night" ? "#0f1116" : "#f4f3ee");
  store(THEME_KEY, theme);
}

const CUSTOM_ACCENT_VARS = ["--accent", "--accent-strong", "--accent-soft", "--accent-line", "--on-accent", "--hero-from", "--hero-to"];

/** Puts every look-and-feel preference onto the page root, where the stylesheet picks them up. */
function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  const set = (name: string, value: string, fallback: string) => {
    if (value === fallback) delete root.dataset[name];
    else root.dataset[name] = value;
  };
  set("accent", prefs.accent, "mono");
  set("text", prefs.textSize, "default");
  set("font", prefs.font, "modern");
  set("density", prefs.density, "comfortable");
  set("backdrop", prefs.backdrop, "plain");

  if (prefs.accent === "custom") {
    const hex = prefs.customAccent;
    const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
    const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
    root.style.setProperty("--accent", hex);
    root.style.setProperty("--accent-strong", `color-mix(in srgb, ${hex} 82%, #000)`);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${hex} 14%, var(--surface))`);
    root.style.setProperty("--accent-line", `color-mix(in srgb, ${hex} 32%, var(--surface))`);
    root.style.setProperty("--on-accent", light ? "#14161c" : "#ffffff");
    root.style.setProperty("--hero-from", `color-mix(in srgb, ${hex} 85%, #000)`);
    root.style.setProperty("--hero-to", `color-mix(in srgb, ${hex} 70%, #fff)`);
  } else {
    for (const name of CUSTOM_ACCENT_VARS) root.style.removeProperty(name);
  }
  setDatePrefs({ clock24: prefs.clock24, weekStart: prefs.weekStart });
}

function applyWallpaper(dataUrl: string) {
  if (dataUrl) document.documentElement.style.setProperty("--wallpaper", `url("${dataUrl}")`);
  else document.documentElement.style.removeProperty("--wallpaper");
}



export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<DayBoardTheme>("day");
  const [mode, setModeState] = useState<ThemeMode>("day");
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE);
  const [wallpaper, setWallpaperState] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const columnsReady = useRef(true);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ prefs: DEFAULT_PREFS, profile: DEFAULT_PROFILE });

  function adoptPrefs(next: Prefs) {
    latest.current.prefs = next;
    setPrefsState(next);
    applyPrefs(next);
    store(PREFS_KEY, JSON.stringify(next));
  }

  function adoptProfile(next: Profile) {
    latest.current.profile = next;
    setProfileState(next);
    store(PROFILE_KEY, JSON.stringify(next));
  }

  /** Saves personalisation to the account a moment after the last change. */
  function queueSync() {
    if (!userIdRef.current || !columnsReady.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const id = userIdRef.current;
      if (!id) return;
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: id, prefs: latest.current.prefs, profile: latest.current.profile, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) {
        columnsReady.current = false;
        setSyncing(false);
        console.warn("Personalisation is saved on this device only until the DayBoard 2.0 database setup is run.", error.message);
      }
    }, 800);
  }

  useEffect(() => {
    const savedMode = localStorage.getItem(MODE_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    const initialMode: ThemeMode = savedMode === "auto" ? "auto" : savedTheme === "night" ? "night" : "day";
    const initialTheme = initialMode === "auto" ? systemTheme() : initialMode;
    setModeState(initialMode);
    setThemeState(initialTheme);
    applyTheme(initialTheme);

    adoptPrefs(read(PREFS_KEY, normalizePrefs));
    adoptProfile(read(PROFILE_KEY, normalizeProfile));
    try {
      const savedWallpaper = localStorage.getItem(WALLPAPER_KEY) ?? "";
      setWallpaperState(savedWallpaper);
      applyWallpaper(savedWallpaper);
    } catch {
      // No wallpaper.
    }

    async function loadForUser(id: string | null) {
      userIdRef.current = id;
      setUserId(id);
      if (!id) {
        setSyncing(false);
        return;
      }
      let result = await supabase.from("user_settings").select("theme, prefs, profile").eq("user_id", id).maybeSingle();
      if (result.error) {
        columnsReady.current = false;
        setSyncing(false);
        result = await supabase.from("user_settings").select("theme").eq("user_id", id).maybeSingle();
      } else {
        columnsReady.current = true;
        setSyncing(true);
      }
      const settings = result.data as { theme?: string; prefs?: unknown; profile?: unknown } | null;
      if ((settings?.theme === "day" || settings?.theme === "night") && localStorage.getItem(MODE_KEY) !== "auto") {
        setThemeState(settings.theme);
        setModeState(settings.theme);
        applyTheme(settings.theme);
      }
      if (columnsReady.current) {
        // The account's saved look wins; if it has none yet, this device's look is saved to it.
        if (settings?.prefs) adoptPrefs(normalizePrefs(settings.prefs));
        if (settings?.profile) adoptProfile(normalizeProfile(settings.profile));
        if (!settings?.prefs || !settings?.profile) queueSync();
      }
    }

    void supabase.auth.getSession().then(({ data }) => loadForUser(data.session?.user.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) !== userIdRef.current) void loadForUser(session?.user.id ?? null);
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (localStorage.getItem(MODE_KEY) !== "auto") return;
      const next = systemTheme();
      setThemeState(next);
      applyTheme(next);
    };
    media.addEventListener("change", onSystemChange);

    // Keeps other open tabs in step.
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFS_KEY || event.key === null) {
        const next = read(PREFS_KEY, normalizePrefs);
        latest.current.prefs = next;
        setPrefsState(next);
        applyPrefs(next);
      }
      if (event.key === PROFILE_KEY || event.key === null) {
        const next = read(PROFILE_KEY, normalizeProfile);
        latest.current.profile = next;
        setProfileState(next);
      }
      if (event.key === WALLPAPER_KEY || event.key === null) {
        const next = localStorage.getItem(WALLPAPER_KEY) ?? "";
        setWallpaperState(next);
        applyWallpaper(next);
      }
      if (event.key === MODE_KEY || event.key === THEME_KEY || event.key === null) {
        const saved = localStorage.getItem(MODE_KEY);
        const nextMode: ThemeMode = saved === "auto" || saved === "night" ? saved : "day";
        const resolved = nextMode === "auto" ? systemTheme() : nextMode;
        setModeState(nextMode);
        setThemeState(resolved);
        applyTheme(resolved);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listener.subscription.unsubscribe();
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
      window.clearTimeout(saveTimer.current);
    };
    // Runs once on start-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changes made on another signed-in device arrive here.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`dayboard-theme-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as { theme?: string; prefs?: unknown; profile?: unknown };
        if ((row.theme === "day" || row.theme === "night") && localStorage.getItem(MODE_KEY) !== "auto") {
          setThemeState(row.theme);
          setModeState(row.theme);
          applyTheme(row.theme);
        }
        if (row.prefs && JSON.stringify(normalizePrefs(row.prefs)) !== JSON.stringify(latest.current.prefs)) adoptPrefs(normalizePrefs(row.prefs));
        if (row.profile && JSON.stringify(normalizeProfile(row.profile)) !== JSON.stringify(latest.current.profile)) adoptProfile(normalizeProfile(row.profile));
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
    store(MODE_KEY, next);
    if (!userId || next === "auto") return;
    void supabase.from("user_settings").upsert({ user_id: userId, theme: resolved, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }

  function setPrefs(patch: Partial<Prefs>) {
    adoptPrefs(normalizePrefs({ ...latest.current.prefs, ...patch }));
    queueSync();
  }

  function setProfile(patch: Partial<Profile>) {
    adoptProfile(normalizeProfile({ ...latest.current.profile, ...patch }));
    queueSync();
  }

  function setWallpaper(dataUrl: string) {
    setWallpaperState(dataUrl);
    applyWallpaper(dataUrl);
    store(WALLPAPER_KEY, dataUrl || null);
  }

  function resetCustomization() {
    adoptPrefs({ ...DEFAULT_PREFS, autoPlanStudy: latest.current.prefs.autoPlanStudy, voiceInput: latest.current.prefs.voiceInput, focusGoalMinutes: latest.current.prefs.focusGoalMinutes });
    setWallpaper("");
    queueSync();
  }

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme: setMode, setMode, prefs, setPrefs, profile, setProfile, wallpaper, setWallpaper, resetCustomization, syncing }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
