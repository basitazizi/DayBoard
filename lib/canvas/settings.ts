/** The student's choices for Canvas import. Stored per account (server) or per device (guest). */
export interface CanvasSettings {
  types: { assignments: boolean; quizzes: boolean; exams: boolean; events: boolean };
  importNotes: boolean;
  autoStudyPlans: boolean;
  /** Default estimated minutes by type; `exam` is the study goal. */
  minutes: { homework: number; quiz: number; lab: number; paper: number; project: number; exam: number };
  /** Don't import items more than this many days in the past. */
  pastDays: number;
  autoSync: boolean;
  /** The student's timezone, so the server (and daily sync) read due times correctly. */
  timezone?: string;
}

/** How one Canvas course maps onto DayBoard: an existing class, a new class, or not imported. */
export type CourseMapping = { mode: "existing"; courseId: string } | { mode: "new" } | { mode: "skip" };
export type CourseMap = Record<string, CourseMapping>;

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  types: { assignments: true, quizzes: true, exams: true, events: false },
  importNotes: true,
  autoStudyPlans: true,
  minutes: { homework: 60, quiz: 30, lab: 90, paper: 180, project: 240, exam: 240 },
  pastDays: 14,
  autoSync: true
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Fills gaps and clamps values, so stored settings from any version are safe to use. */
export function normalizeCanvasSettings(raw: unknown): CanvasSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<CanvasSettings>;
  const types = (value.types ?? {}) as Partial<CanvasSettings["types"]>;
  const minutes = (value.minutes ?? {}) as Partial<CanvasSettings["minutes"]>;
  const d = DEFAULT_CANVAS_SETTINGS;
  return {
    types: {
      assignments: bool(types.assignments, d.types.assignments),
      quizzes: bool(types.quizzes, d.types.quizzes),
      exams: bool(types.exams, d.types.exams),
      events: bool(types.events, d.types.events)
    },
    importNotes: bool(value.importNotes, d.importNotes),
    autoStudyPlans: bool(value.autoStudyPlans, d.autoStudyPlans),
    minutes: {
      homework: clamp(minutes.homework, 5, 1440, d.minutes.homework),
      quiz: clamp(minutes.quiz, 5, 1440, d.minutes.quiz),
      lab: clamp(minutes.lab, 5, 1440, d.minutes.lab),
      paper: clamp(minutes.paper, 5, 1440, d.minutes.paper),
      project: clamp(minutes.project, 5, 1440, d.minutes.project),
      exam: clamp(minutes.exam, 15, 3000, d.minutes.exam)
    },
    pastDays: clamp(value.pastDays, 0, 365, d.pastDays),
    autoSync: bool(value.autoSync, d.autoSync),
    timezone: typeof value.timezone === "string" && value.timezone.length < 64 ? value.timezone : undefined
  };
}

export function normalizeCourseMap(raw: unknown): CourseMap {
  const map: CourseMap = {};
  if (!raw || typeof raw !== "object") return map;
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || name.length > 200) continue;
    const mapping = entry as Partial<{ mode: string; courseId: string }>;
    if (mapping.mode === "existing" && typeof mapping.courseId === "string") map[name] = { mode: "existing", courseId: mapping.courseId };
    else if (mapping.mode === "new") map[name] = { mode: "new" };
    else if (mapping.mode === "skip") map[name] = { mode: "skip" };
  }
  return map;
}
