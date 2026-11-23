"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CanvasItem } from "@/lib/canvas/classify";
import { maskFeedUrl } from "@/lib/canvas/feed-url";
import { cleanupOrphanStudyPlans, IMPORTED_PLAN_NOTE, planImportedExams } from "@/lib/canvas/plan-exams";
import { DEFAULT_CANVAS_SETTINGS, normalizeCanvasSettings, normalizeCourseMap, type CanvasSettings, type CourseMap } from "@/lib/canvas/settings";
import { describePlan, planSync } from "@/lib/canvas/sync";
import { getLocalDateKey, localTimezone } from "@/lib/date-utils";
import { withHiddenImports } from "@/lib/local-data";
import { supabase } from "@/lib/supabase";
import { useApp } from "./app-context";

/**
 * Canvas import, on the device side. Guests keep the connection on this device and sync here;
 * signed-in students keep it on their account and the server syncs (and once a day on its own).
 */

const GUEST_KEY = "dayboard:canvas";
const AUTO_SYNC_EVERY_MS = 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 1000;

export interface CanvasStatus {
  connected: boolean;
  /** Masked link, e.g. "school.instructure.com/feeds/calendars/user_ab12••••.ics". */
  feed?: string;
  lastSyncedAt?: string | null;
  lastStatus?: "never" | "ok" | "error" | "broken";
  lastError?: string | null;
  settings: CanvasSettings;
  courseMap: CourseMap;
}

export interface CanvasPreview {
  items: CanvasItem[];
  summary: { courses: { name: string; assignments: number; exams: number; events: number }[]; assignments: number; exams: number; events: number };
}

interface GuestConnection {
  feedUrl: string;
  settings: CanvasSettings;
  courseMap: CourseMap;
  lastSyncedAt?: string;
  lastStatus?: CanvasStatus["lastStatus"];
  lastError?: string | null;
}

interface CanvasValue {
  status: CanvasStatus | null;
  busy: boolean;
  /** The Canvas panel (connect / manage), shared by Settings, More and School. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  preview: (feedUrl: string) => Promise<{ preview?: CanvasPreview; error?: string }>;
  connect: (feedUrl: string, settings: CanvasSettings, courseMap: CourseMap, preview?: CanvasPreview) => Promise<string>;
  syncNow: (options?: { auto?: boolean; force?: boolean }) => Promise<string>;
  saveSettings: (settings: CanvasSettings, courseMap?: CourseMap) => Promise<void>;
  disconnect: (keepItems: boolean) => Promise<number>;
}

const CanvasContext = createContext<CanvasValue | null>(null);

function readGuest(): GuestConnection | null {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null") as Partial<GuestConnection> | null;
    if (!raw || typeof raw.feedUrl !== "string") return null;
    return { ...raw, feedUrl: raw.feedUrl, settings: normalizeCanvasSettings(raw.settings), courseMap: normalizeCourseMap(raw.courseMap) };
  } catch {
    return null;
  }
}

function writeGuest(value: GuestConnection | null) {
  try {
    if (value) localStorage.setItem(GUEST_KEY, JSON.stringify(value));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // Storage blocked: the connection lasts for this visit only.
  }
}

function guestStatus(guest: GuestConnection | null): CanvasStatus {
  if (!guest) return { connected: false, settings: DEFAULT_CANVAS_SETTINGS, courseMap: {} };
  return { connected: true, feed: maskFeedUrl(guest.feedUrl), lastSyncedAt: guest.lastSyncedAt ?? null, lastStatus: guest.lastStatus ?? "never", lastError: guest.lastError ?? null, settings: guest.settings, courseMap: guest.courseMap };
}

async function call(action: string, body: Record<string, unknown> = {}, signedIn: boolean) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signedIn) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch("/api/canvas", { method: "POST", headers, body: JSON.stringify({ action, timezone: localTimezone(), ...body }) });
  const json = (await response.json().catch(() => ({}))) as Record<string, any>;
  return { ok: response.ok, status: response.status, json };
}

export function CanvasProvider({ children }: { children: ReactNode }) {
  const { store, auth, showToast } = useApp();
  const signedIn = Boolean(auth.user);
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const storeRef = useRef(store);
  storeRef.current = store;
  const lastManual = useRef(0);
  const autoRan = useRef<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!signedIn) {
      setStatus(guestStatus(readGuest()));
      return;
    }
    const result = await call("status", {}, true);
    if (result.ok && result.json.connected) setStatus({ ...(result.json as CanvasStatus), settings: normalizeCanvasSettings(result.json.settings), courseMap: normalizeCourseMap(result.json.courseMap) });
    else setStatus({ connected: false, settings: DEFAULT_CANVAS_SETTINGS, courseMap: {} });
  }, [signedIn]);

  useEffect(() => {
    if (auth.loading) return;
    void loadStatus();
  }, [auth.loading, loadStatus]);

  /** Guest sync: read the feed through the server, compare with this device's data, apply. */
  const guestSync = useCallback(async (guest: GuestConnection, items?: CanvasItem[]): Promise<string> => {
    let feedItems = items;
    if (!feedItems) {
      const result = await call("read", { feedUrl: guest.feedUrl, importNotes: guest.settings.importNotes }, false);
      if (!result.ok) {
        const next: GuestConnection = { ...guest, lastStatus: result.json.broken ? "broken" : "error", lastError: result.json.error ?? "Couldn't reach Canvas — will retry." };
        writeGuest(next);
        setStatus(guestStatus(next));
        return next.lastError!;
      }
      feedItems = result.json.items as CanvasItem[];
    }
    const current = storeRef.current;
    const settings = { ...guest.settings, timezone: localTimezone() };
    const plan = planSync({ items: feedItems, data: withHiddenImports(current.data), settings, courseMap: guest.courseMap, today: getLocalDateKey(new Date(), current.data.timezone) });
    current.applyCanvasPlan(plan, settings);
    const next: GuestConnection = { ...guest, settings, lastSyncedAt: new Date().toISOString(), lastStatus: "ok", lastError: null };
    writeGuest(next);
    setStatus(guestStatus(next));
    return describePlan(plan);
  }, []);

  const syncNow = useCallback(
    async (options: { auto?: boolean; force?: boolean } = {}) => {
      if (!options.auto) {
        if (Date.now() - lastManual.current < MANUAL_COOLDOWN_MS) return "Synced less than a minute ago.";
        lastManual.current = Date.now();
      }
      setBusy(true);
      try {
        if (!signedIn) {
          const guest = readGuest();
          return guest ? await guestSync(guest) : "Canvas isn't connected.";
        }
        const result = await call("sync", { force: options.force === true }, true);
        if (result.json.connected) setStatus({ ...(result.json as CanvasStatus), settings: normalizeCanvasSettings(result.json.settings), courseMap: normalizeCourseMap(result.json.courseMap) });
        if (result.json.outcome?.status === "ok") await storeRef.current.refresh();
        return (result.json.outcome?.message as string) ?? (result.json.error as string) ?? "Couldn't reach Canvas — will retry.";
      } catch {
        return "Couldn't reach Canvas — will retry.";
      } finally {
        setBusy(false);
      }
    },
    [signedIn, guestSync]
  );

  const preview = useCallback(
    async (feedUrl: string) => {
      setBusy(true);
      try {
        const result = await call(signedIn ? "preview" : "read", { feedUrl, importNotes: true }, signedIn);
        if (!result.ok) return { error: (result.json.error as string) ?? "Couldn't reach Canvas. Try again in a moment." };
        return { preview: result.json as CanvasPreview };
      } catch {
        return { error: "Couldn't reach Canvas. Check your connection and try again." };
      } finally {
        setBusy(false);
      }
    },
    [signedIn]
  );

  const connect = useCallback(
    async (feedUrl: string, settings: CanvasSettings, courseMap: CourseMap, previewed?: CanvasPreview) => {
      setBusy(true);
      try {
        if (!signedIn) {
          const guest: GuestConnection = { feedUrl: feedUrl.trim(), settings, courseMap };
          writeGuest(guest);
          // The preview already holds the feed; re-read only if notes were switched off (the preview included them).
          const items = previewed && settings.importNotes ? previewed.items : undefined;
          return await guestSync(guest, items);
        }
        const result = await call("connect", { feedUrl: feedUrl.trim(), settings, courseMap }, true);
        if (!result.ok) return (result.json.error as string) ?? "Couldn't connect. Try again.";
        setStatus({ ...(result.json as CanvasStatus), settings: normalizeCanvasSettings(result.json.settings), courseMap: normalizeCourseMap(result.json.courseMap) });
        await storeRef.current.refresh();
        return (result.json.outcome?.message as string) ?? "Connected.";
      } finally {
        setBusy(false);
      }
    },
    [signedIn, guestSync]
  );

  const saveSettings = useCallback(
    async (settings: CanvasSettings, courseMap?: CourseMap) => {
      if (!signedIn) {
        const guest = readGuest();
        if (!guest) return;
        const next = { ...guest, settings, courseMap: courseMap ?? guest.courseMap };
        writeGuest(next);
        setStatus(guestStatus(next));
        return;
      }
      const result = await call("settings", { settings, courseMap }, true);
      if (result.json.connected) setStatus({ ...(result.json as CanvasStatus), settings: normalizeCanvasSettings(result.json.settings), courseMap: normalizeCourseMap(result.json.courseMap) });
    },
    [signedIn]
  );

  const disconnect = useCallback(
    async (keepItems: boolean) => {
      setBusy(true);
      try {
        let removed = 0;
        if (!signedIn) {
          if (!keepItems) {
            // Remove imported items the student never touched.
            const data = withHiddenImports(storeRef.current.data);
            for (const item of data.assignments) if (item.sourceMeta && !item.sourceMeta.editedFields.length && item.status === "not_started" && item.score === undefined && !item.steps?.length) (storeRef.current.deleteAssignment(item.id), (removed += 1));
            for (const item of data.exams) if (item.sourceMeta && !item.sourceMeta.editedFields.length && item.score === undefined) (storeRef.current.deleteExam(item.id), (removed += 1));
            for (const item of data.events) if (item.sourceMeta && !item.sourceMeta.editedFields.length) (storeRef.current.deleteEvent(item.id), (removed += 1));
          }
          writeGuest(null);
        } else {
          const result = await call("disconnect", { keepItems }, true);
          removed = Number(result.json.removed ?? 0);
          await storeRef.current.refresh();
        }
        setStatus({ connected: false, settings: DEFAULT_CANVAS_SETTINGS, courseMap: {} });
        return removed;
      } finally {
        setBusy(false);
      }
    },
    [signedIn]
  );

  // On app open: sync in the background if it's been more than an hour.
  useEffect(() => {
    if (!status?.connected || !store.hydrated || !status.settings.autoSync || status.lastStatus === "broken") return;
    const key = `${signedIn}`;
    if (autoRan.current === key) return;
    autoRan.current = key;
    const last = status.lastSyncedAt ? Date.parse(status.lastSyncedAt) : 0;
    if (Date.now() - last < AUTO_SYNC_EVERY_MS) return;
    void syncNow({ auto: true });
  }, [status, store.hydrated, signedIn, syncNow]);

  // Imported exams that want a study plan get one (also after the daily server sync).
  const planning = useRef(false);
  useEffect(() => {
    if (!store.hydrated || planning.current) return;
    const examTitles = new Set(store.data.exams.map((exam) => `Prepare for ${exam.title}`));
    const orphanPlans = store.data.tasks.some((task) => task.description === IMPORTED_PLAN_NOTE && !examTitles.has(task.title));
    const needsPlan = store.data.exams.some((exam) => exam.sourceMeta && exam.planStudy !== false && exam.studyPlannedFor !== exam.examDate);
    if (!orphanPlans && !needsPlan) return;
    planning.current = true;
    try {
      if (orphanPlans) cleanupOrphanStudyPlans(store);
      const count = needsPlan ? planImportedExams(store) : 0;
      if (count) showToast(`Planned study time for ${count} imported exam${count === 1 ? "" : "s"}.`);
    } finally {
      planning.current = false;
    }
  }, [store, showToast]);

  const [panelOpen, setPanelOpen] = useState(false);
  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const value = useMemo(
    () => ({ status, busy, panelOpen, openPanel, closePanel, preview, connect, syncNow, saveSettings, disconnect }),
    [status, busy, panelOpen, openPanel, closePanel, preview, connect, syncNow, saveSettings, disconnect]
  );
  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export function useCanvas() {
  const value = useContext(CanvasContext);
  if (!value) throw new Error("useCanvas must be used inside CanvasProvider");
  return value;
}
