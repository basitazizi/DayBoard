/**
 * Dev helper: turns the sample Canvas feed into guest-mode data for checking the UI by hand.
 *   npx vite-node --config vitest.config.ts tests/fixtures/make-demo.ts > demo.json
 * Paste the two values into localStorage ("dayboard:guest-data:v2" and "dayboard:canvas"), then reload.
 */
import { readFileSync } from "node:fs";
import { readCanvasFeed } from "@/lib/canvas/classify";
import { DEFAULT_CANVAS_SETTINGS } from "@/lib/canvas/settings";
import { applyPlanToData, planSync } from "@/lib/canvas/sync";
import type { DayBoardData } from "@/types/dayboard";

const feed = readFileSync(new URL("./canvas-feed.ics", import.meta.url), "utf8");
const items = readCanvasFeed(feed, "America/Los_Angeles", { importNotes: true });
const base: Pick<DayBoardData, "courses" | "assignments" | "exams" | "events"> = {
  courses: [{ id: "course-chem", code: "CHEM 201", name: "Chemistry", days: "Mon, Wed", time: "To be announced", room: "TBA", color: "teal" }],
  assignments: [],
  exams: [],
  events: []
};
const plan = planSync({ items, data: base, settings: DEFAULT_CANVAS_SETTINGS, courseMap: {}, today: "2026-11-23" });
let n = 0;
const data = applyPlanToData(base, plan, DEFAULT_CANVAS_SETTINGS, (prefix) => `${prefix}-demo-${++n}`);

// Show the notes: one item Canvas moved, one the student kept after Canvas removed it.
data.assignments = data.assignments.map((item) =>
  item.sourceMeta?.externalId === "event-assignment-1001" ? { ...item, sourceMeta: { ...item.sourceMeta, dateChanged: true } } : item.sourceMeta?.externalId === "event-assignment-1004" ? { ...item, status: "in_progress" as const, sourceMeta: { ...item.sourceMeta, removedFromSource: true } } : item
);

const guest = { displayName: "Student", tasks: [], events: data.events, habits: [], notes: [], courses: data.courses, assignments: data.assignments, exams: data.exams, habitLogs: [] };
const connection = { feedUrl: "https://school.instructure.com/feeds/calendars/user_DemoToken123.ics", settings: DEFAULT_CANVAS_SETTINGS, courseMap: {}, lastSyncedAt: new Date(Date.now() - 12 * 60000).toISOString(), lastStatus: "ok" };
process.stdout.write(JSON.stringify({ guest, connection }));
