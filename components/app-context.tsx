"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSupabaseAuth } from "@/lib/auth";
import type { DraftKind } from "@/lib/drafts";
import { useDayBoardData, type DayBoardStore } from "@/lib/local-data";
import { useTheme } from "@/lib/theme";
import { useReminders } from "@/lib/use-reminders";

export type QuickAddMode = "type" | "speak" | "photo" | "form";

export interface QuickAddRequest {
  mode?: QuickAddMode;
  text?: string;
  kind?: DraftKind;
  date?: string;
  courseId?: string;
}

interface ToastState {
  id: number;
  message: string;
  undo?: () => void;
}

interface AppValue {
  store: DayBoardStore;
  auth: ReturnType<typeof useSupabaseAuth>;
  now: Date;
  quickAdd: (QuickAddRequest & { open: boolean; nonce: number }) | null;
  openQuickAdd: (request?: QuickAddRequest) => void;
  closeQuickAdd: () => void;
  toast: ToastState | null;
  showToast: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
  /** Bumps when confetti should play; the shell listens. */
  celebration: number;
  celebrate: () => void;
}

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useDayBoardData();
  const auth = useSupabaseAuth();
  // Clock and week-start settings change how dates are written, so every page re-renders when they change.
  const { prefs } = useTheme();
  const [now, setNow] = useState(() => new Date());
  const [quickAdd, setQuickAdd] = useState<AppValue["quickAdd"]>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [celebration, setCelebration] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const celebrateOn = useRef(prefs.celebrate);
  celebrateOn.current = prefs.celebrate;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const openQuickAdd = useCallback((request: QuickAddRequest = {}) => setQuickAdd({ ...request, open: true, nonce: Date.now() }), []);
  const closeQuickAdd = useCallback(() => setQuickAdd((current) => (current ? { ...current, open: false } : current)), []);
  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const showToast = useCallback((message: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 7000);
  }, []);
  useReminders(store.data, { enabled: prefs.reminders, leadMinutes: prefs.reminderLead, hydrated: store.hydrated, toast: showToast });

  const celebrate = useCallback(() => {
    if (celebrateOn.current) setCelebration(Date.now());
  }, []);

  const value = useMemo(
    () => ({ store, auth, now, quickAdd, openQuickAdd, closeQuickAdd, toast, showToast, dismissToast, celebration, celebrate }),
    // prefs.clock24 and prefs.weekStart are listed so date text refreshes when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, auth, now, quickAdd, openQuickAdd, closeQuickAdd, toast, showToast, dismissToast, celebration, celebrate, prefs.clock24, prefs.weekStart]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
