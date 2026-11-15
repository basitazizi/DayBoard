"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSupabaseAuth } from "@/lib/auth";
import type { DraftKind } from "@/lib/drafts";
import { useDayBoardData, type DayBoardStore } from "@/lib/local-data";

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
}

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useDayBoardData();
  const auth = useSupabaseAuth();
  const [now, setNow] = useState(() => new Date());
  const [quickAdd, setQuickAdd] = useState<AppValue["quickAdd"]>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

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

  const value = useMemo(
    () => ({ store, auth, now, quickAdd, openQuickAdd, closeQuickAdd, toast, showToast, dismissToast }),
    [store, auth, now, quickAdd, openQuickAdd, closeQuickAdd, toast, showToast, dismissToast]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
