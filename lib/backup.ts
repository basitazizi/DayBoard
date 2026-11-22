import type { DayBoardData } from "@/types/dayboard";
import type { Prefs, Profile } from "./personalize";

import { GUEST_DATA_KEY } from "./local-data";

export interface Backup {
  app: "DayBoard";
  version: 1;
  exportedAt: string;
  data: Omit<DayBoardData, "upcoming">;
  prefs: Prefs;
  profile: Profile;
}

/** Saves everything as a JSON file the person can keep. */
export function downloadBackup(data: DayBoardData, prefs: Prefs, profile: Profile) {
  const { upcoming: _upcoming, ...rest } = data;
  const backup: Backup = { app: "DayBoard", version: 1, exportedAt: new Date().toISOString(), data: rest, prefs, profile };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dayboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LISTS = ["tasks", "events", "courses", "assignments", "exams", "habits", "habitLogs", "notes"] as const;

/** Reads a backup file and checks it is really a DayBoard backup. */
export async function readBackup(file: File): Promise<Backup> {
  if (file.size > 20_000_000) throw new Error("That file is too large to be a DayBoard backup.");
  let parsed: Partial<Backup>;
  try {
    parsed = JSON.parse(await file.text()) as Partial<Backup>;
  } catch {
    throw new Error("That file is not a DayBoard backup.");
  }
  if (parsed.app !== "DayBoard" || !parsed.data || typeof parsed.data !== "object") throw new Error("That file is not a DayBoard backup.");
  for (const list of LISTS) {
    const value = (parsed.data as unknown as Record<string, unknown>)[list];
    if (value !== undefined && !Array.isArray(value)) throw new Error("That backup is damaged and cannot be restored.");
  }
  return parsed as Backup;
}

/**
 * Restores a backup into this device's storage. For a guest it becomes their data straight away.
 * For a signed-in person, the app then offers to add it to their account, the same way it does for guest data.
 */
export function stageBackup(backup: Backup) {
  const data = backup.data as unknown as Record<string, unknown>;
  const staged: Record<string, unknown> = {};
  for (const list of LISTS) staged[list] = Array.isArray(data[list]) ? data[list] : [];
  staged.displayName = typeof data.displayName === "string" ? data.displayName : "";
  window.localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(staged));
}

export function countBackupItems(backup: Backup) {
  const data = backup.data as unknown as Record<string, unknown[] | undefined>;
  return ["tasks", "events", "courses", "assignments", "exams", "habits", "notes"].reduce((sum, list) => sum + (data[list]?.length ?? 0), 0);
}
