import type { Assignment, CalendarEvent, Course, DayBoardData, Exam, SourceMeta, SyncedField, Tone } from "../../types/dayboard";
import { matchCourse, titleSimilarity, type CanvasItem } from "./classify";
import type { CanvasSettings, CourseMap } from "./settings";

/**
 * The Canvas sync engine. `planSync` is pure: given the feed and the student's current data it decides
 * what to create, update, keep or remove. Guest mode applies the plan to local data (`applyPlanToData`);
 * signed-in mode applies the same plan to the database on the server.
 *
 * Rules (the student is always in charge):
 *  - New Canvas item → created, if its course and type are switched on and it isn't too far in the past.
 *  - Changed Canvas item → only the fields the student hasn't edited are updated.
 *  - Status, score, steps, time spent and the student's own notes are never changed by sync.
 *  - Hidden items stay hidden.
 *  - Gone from Canvas → kept (and flagged) if the student touched it; otherwise deleted if still upcoming.
 *  - Already added by hand → linked to Canvas instead of duplicated.
 */

export type SyncKind = "assignment" | "exam" | "event";

/** Where an item's class comes from: an existing DayBoard class, one to create for a Canvas course, or none. */
export type CourseRef = { courseId: string } | { newCourse: string } | null;

export interface PlannedCreate {
  kind: SyncKind;
  item: CanvasItem;
  course: CourseRef;
  hash: string;
}

export interface SyncPatch {
  title?: string;
  date?: string;
  time?: string;
  endTime?: string;
  course?: CourseRef;
  assignmentType?: Assignment["assignmentType"];
  notes?: string;
}

export interface PlannedUpdate {
  kind: SyncKind;
  id: string;
  patch: SyncPatch;
  externalUrl: string;
  hash: string;
  dateChanged: boolean;
  /** It had been flagged "No longer in Canvas" and is back. */
  restored: boolean;
}

export interface PlannedLink {
  kind: SyncKind;
  id: string;
  item: CanvasItem;
  hash: string;
}

export interface SyncPlan {
  /** Canvas course names to create as new DayBoard classes. */
  newCourses: string[];
  create: PlannedCreate[];
  update: PlannedUpdate[];
  link: PlannedLink[];
  markRemoved: { kind: SyncKind; id: string }[];
  remove: { kind: SyncKind; id: string }[];
  /** Exams whose date moved, so their study plan should be redone. */
  replanExams: string[];
}

export interface SyncInput {
  items: CanvasItem[];
  data: Pick<DayBoardData, "assignments" | "exams" | "events" | "courses">;
  settings: CanvasSettings;
  courseMap: CourseMap;
  /** YYYY-MM-DD in the student's timezone. */
  today: string;
}

/** Small stable hash (FNV-1a) of the Canvas values we keep, to notice changes between syncs. */
export function hashItem(item: CanvasItem): string {
  const text = JSON.stringify([item.title, item.date, item.time, item.endTime, item.allDay, item.courseName, item.assignmentType, item.url, item.note]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function addDaysKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

interface Existing {
  kind: SyncKind;
  id: string;
  title: string;
  date: string;
  time: string;
  endTime: string;
  courseId: string;
  assignmentType?: Assignment["assignmentType"];
  notes: string;
  /** The student did something with it: changed status, score, steps or time spent. */
  touched: boolean;
  meta?: SourceMeta;
}

function existingRecords(data: SyncInput["data"]): Existing[] {
  return [
    ...data.assignments.map<Existing>((item) => ({
      kind: "assignment",
      id: item.id,
      title: item.title,
      date: item.dueDate,
      time: item.dueTime,
      endTime: "",
      courseId: item.courseId,
      assignmentType: item.assignmentType,
      notes: item.notes ?? "",
      touched: item.status !== "not_started" || item.score !== undefined || (item.steps?.length ?? 0) > 0 || item.actualMinutes > 0,
      meta: item.sourceMeta
    })),
    ...data.exams.map<Existing>((item) => ({
      kind: "exam",
      id: item.id,
      title: item.title,
      date: item.examDate,
      time: item.examTime,
      endTime: "",
      courseId: item.courseId,
      notes: item.notes ?? "",
      touched: item.score !== undefined || item.studyMinutesCompleted > 0,
      meta: item.sourceMeta
    })),
    ...data.events.map<Existing>((item) => ({
      kind: "event",
      id: item.id,
      title: item.title,
      date: item.date,
      time: item.allDay ? "" : item.startTime,
      endTime: item.allDay ? "" : item.endTime,
      courseId: "",
      notes: item.description ?? "",
      touched: false,
      meta: item.sourceMeta
    }))
  ];
}

function typeEnabled(item: CanvasItem, settings: CanvasSettings) {
  if (item.kind === "exam") return settings.types.exams;
  if (item.kind === "event") return settings.types.events;
  return item.assignmentType === "quiz" ? settings.types.quizzes : settings.types.assignments;
}

/** The class a Canvas item belongs to, following the student's course choices. `undefined` = skip this course. */
export function resolveCourse(courseName: string, courses: Course[], courseMap: CourseMap): CourseRef | undefined {
  if (!courseName) return null;
  const mapping = courseMap[courseName];
  if (mapping?.mode === "skip") return undefined;
  if (mapping?.mode === "existing" && courses.some((course) => course.id === mapping.courseId)) return { courseId: mapping.courseId };
  if (mapping?.mode === "new") {
    // Created on an earlier sync? Recognise it by name or code instead of making another one.
    const created = courses.find((course) => course.name === courseName) ?? matchCourse(courseName, courses);
    return created ? { courseId: created.id } : { newCourse: courseName };
  }
  const match = matchCourse(courseName, courses);
  return match ? { courseId: match.id } : { newCourse: courseName };
}

const sameRef = (ref: CourseRef, courseId: string) => (ref && "courseId" in ref ? ref.courseId === courseId : !ref && !courseId);

export function planSync(input: SyncInput): SyncPlan {
  const { items, data, settings, courseMap, today } = input;
  const plan: SyncPlan = { newCourses: [], create: [], update: [], link: [], markRemoved: [], remove: [], replanExams: [] };
  const records = existingRecords(data);
  const byExternalId = new Map<string, Existing>();
  for (const record of records) if (record.meta?.source === "canvas") byExternalId.set(record.meta.externalId, record);
  const manual = records.filter((record) => !record.meta && record.kind !== "event");
  const claimed = new Set<string>();
  const cutoff = addDaysKey(today, -settings.pastDays);
  const feedIds = new Set(items.map((item) => item.externalId));

  const needCourse = (ref: CourseRef) => {
    if (ref && "newCourse" in ref && !plan.newCourses.includes(ref.newCourse)) plan.newCourses.push(ref.newCourse);
  };

  for (const item of items) {
    const hash = hashItem(item);
    const existing = byExternalId.get(item.externalId);

    if (existing) {
      const meta = existing.meta!;
      if (meta.hidden) continue;
      if (meta.hash === hash && !meta.removedFromSource) continue;

      const edited = new Set<SyncedField>(meta.editedFields);
      const patch: SyncPatch = {};
      if (!edited.has("title") && item.title !== existing.title) patch.title = item.title;
      if (!edited.has("dueDate") && item.date !== existing.date) patch.date = item.date;
      if (!edited.has("dueTime") && item.time !== existing.time) patch.time = item.time;
      if (existing.kind === "event" && !edited.has("endTime") && item.endTime !== existing.endTime) patch.endTime = item.endTime;
      if (existing.kind === "assignment" && !edited.has("assignmentType") && item.assignmentType !== existing.assignmentType) patch.assignmentType = item.assignmentType;
      if (!edited.has("notes") && item.note !== existing.notes) patch.notes = item.note;
      if (existing.kind !== "event" && !edited.has("courseId")) {
        const ref = resolveCourse(item.courseName, data.courses, courseMap);
        if (ref !== undefined && !sameRef(ref, existing.courseId)) {
          patch.course = ref;
          needCourse(ref);
        }
      }
      const dateChanged = Boolean(meta.hash) && (patch.date !== undefined || patch.time !== undefined);
      plan.update.push({ kind: existing.kind, id: existing.id, patch, externalUrl: item.url, hash, dateChanged, restored: meta.removedFromSource });
      if (dateChanged && existing.kind === "exam") plan.replanExams.push(existing.id);
      continue;
    }

    if (!typeEnabled(item, settings)) continue;
    if (item.date < cutoff) continue;
    const course = item.kind === "event" ? null : resolveCourse(item.courseName, data.courses, courseMap);
    if (course === undefined) continue;

    // Already added by hand? Link it instead of making a duplicate.
    if (item.kind !== "event") {
      const twin = manual.find(
        (record) =>
          !claimed.has(record.id) &&
          record.kind === item.kind &&
          record.date === item.date &&
          (course && "courseId" in course ? record.courseId === course.courseId || !record.courseId : !record.courseId) &&
          titleSimilarity(record.title, item.title) >= 0.6
      );
      if (twin) {
        claimed.add(twin.id);
        plan.link.push({ kind: twin.kind, id: twin.id, item, hash });
        continue;
      }
    }

    needCourse(course);
    plan.create.push({ kind: item.kind, item, course, hash });
  }

  // Items that are no longer in the feed.
  for (const record of records) {
    const meta = record.meta;
    if (meta?.source !== "canvas" || meta.removedFromSource || feedIds.has(meta.externalId)) continue;
    if (record.touched || meta.editedFields.length > 0) plan.markRemoved.push({ kind: record.kind, id: record.id });
    else if (record.date >= today) plan.remove.push({ kind: record.kind, id: record.id });
  }

  return plan;
}

export function emptyPlan(plan: SyncPlan) {
  return !plan.newCourses.length && !plan.create.length && !plan.update.length && !plan.link.length && !plan.markRemoved.length && !plan.remove.length;
}

/** What the student sees after a sync: "3 new, 2 updated". */
export function describePlan(plan: SyncPlan) {
  const parts = [
    plan.create.length ? `${plan.create.length} new` : "",
    plan.update.length ? `${plan.update.length} updated` : "",
    plan.link.length ? `${plan.link.length} linked` : "",
    plan.remove.length ? `${plan.remove.length} removed` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Everything is up to date";
}

/* ------------------------------------------------------------------ */
/* Building DayBoard items from Canvas items (shared by both appliers) */
/* ------------------------------------------------------------------ */

const TONES: Tone[] = ["teal", "blue", "amber", "rose", "green", "accent"];

/** "CHEM 201-01: General Chemistry (Fall 2026)" → code "CHEM 201". */
export function courseFromCanvasName(name: string, index: number): Omit<Course, "id"> {
  const code = name.match(/\b([A-Za-z]{2,5})[\s-]?(\d{2,4}[A-Za-z]?)\b/);
  // "BIO 110 Intro to Biology" → "Intro to Biology"; "CHEM 201-01: General Chemistry (Fall 2026)" → "General Chemistry (Fall 2026)".
  const withoutCode = name.replace(/^\s*[A-Za-z]{2,5}[\s-]?\d{2,4}[A-Za-z]?(-\d+)?\s*[:\-–]?\s*/, "").trim();
  return {
    code: code ? `${code[1].toUpperCase()} ${code[2].toUpperCase()}` : name.split(/\s+/).slice(0, 2).join(" ").toUpperCase().slice(0, 12),
    name: (withoutCode.length >= 3 ? withoutCode : name).slice(0, 120),
    days: "To be announced",
    time: "To be announced",
    room: "TBA",
    color: TONES[index % TONES.length]
  };
}

export function newMeta(item: CanvasItem, hash: string, editedFields: SyncedField[] = []): SourceMeta {
  return { source: "canvas", externalId: item.externalId, externalUrl: item.url || undefined, hash, editedFields, removedFromSource: false, hidden: false, dateChanged: false };
}

function minutesFor(type: Assignment["assignmentType"], settings: CanvasSettings) {
  if (type === "quiz" || type === "lab" || type === "paper" || type === "project") return settings.minutes[type];
  return settings.minutes.homework;
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function buildAssignment(item: CanvasItem, courseId: string, settings: CanvasSettings, hash: string): Omit<Assignment, "id"> {
  return {
    courseId,
    title: item.title,
    assignmentType: item.assignmentType,
    dueDate: item.date,
    dueTime: item.time,
    estimatedMinutes: minutesFor(item.assignmentType, settings),
    actualMinutes: 0,
    difficulty: 3,
    status: "not_started",
    steps: [],
    notes: item.note || undefined,
    sourceMeta: newMeta(item, hash)
  };
}

export function buildExam(item: CanvasItem, courseId: string, settings: CanvasSettings, hash: string): Omit<Exam, "id"> {
  return {
    courseId,
    title: item.title,
    examDate: item.date,
    examTime: item.time,
    studyMinutesGoal: settings.minutes.exam,
    studyMinutesCompleted: 0,
    importanceScore: 80,
    notes: item.note || undefined,
    planStudy: settings.autoStudyPlans,
    sourceMeta: newMeta(item, hash)
  };
}

export function buildEvent(item: CanvasItem, hash: string): Omit<CalendarEvent, "id"> {
  const start = item.time || "09:00";
  return {
    title: item.title,
    date: item.date,
    startTime: start,
    endTime: item.endTime && item.endTime > start ? item.endTime : addMinutes(start, 60),
    allDay: item.allDay,
    category: "school",
    priority: "medium",
    description: item.note || undefined,
    repeatType: "never",
    sourceMeta: newMeta(item, hash)
  };
}

/* ------------------------------------------------------------------ */
/* Guest mode: apply a plan to local data                              */
/* ------------------------------------------------------------------ */

export function applyPlanToData<T extends Pick<DayBoardData, "assignments" | "exams" | "events" | "courses">>(data: T, plan: SyncPlan, settings: CanvasSettings, makeId: (prefix: string) => string): T {
  const courses = [...data.courses];
  const createdCourseIds = new Map<string, string>();
  for (const name of plan.newCourses) {
    const id = makeId("course");
    courses.push({ id, ...courseFromCanvasName(name, courses.length) });
    createdCourseIds.set(name, id);
  }
  const courseIdOf = (ref: CourseRef | undefined) => (!ref ? "" : "courseId" in ref ? ref.courseId : createdCourseIds.get(ref.newCourse) ?? "");

  let assignments = [...data.assignments];
  let exams = [...data.exams];
  let events = [...data.events];

  for (const entry of plan.create) {
    const courseId = courseIdOf(entry.course);
    if (entry.kind === "assignment") assignments.push({ id: makeId("assignment"), ...buildAssignment(entry.item, courseId, settings, entry.hash) });
    else if (entry.kind === "exam") exams.push({ id: makeId("exam"), ...buildExam(entry.item, courseId, settings, entry.hash) });
    else events.push({ id: makeId("event"), ...buildEvent(entry.item, entry.hash) });
  }

  // A hand-added twin keeps the student's title; everything else follows Canvas from now on.
  for (const entry of plan.link) {
    const meta = newMeta(entry.item, entry.hash, ["title"]);
    if (entry.kind === "assignment") assignments = assignments.map((item) => (item.id === entry.id ? { ...item, sourceMeta: meta, notes: item.notes || entry.item.note || undefined } : item));
    if (entry.kind === "exam") exams = exams.map((item) => (item.id === entry.id ? { ...item, sourceMeta: meta, notes: item.notes || entry.item.note || undefined } : item));
  }

  for (const entry of plan.update) {
    const { patch } = entry;
    const meta = (current?: SourceMeta): SourceMeta | undefined =>
      current && { ...current, hash: entry.hash, externalUrl: entry.externalUrl || current.externalUrl, removedFromSource: false, dateChanged: current.dateChanged || entry.dateChanged };
    if (entry.kind === "assignment") {
      assignments = assignments.map((item) =>
        item.id !== entry.id
          ? item
          : {
              ...item,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.date !== undefined && { dueDate: patch.date }),
              ...(patch.time !== undefined && { dueTime: patch.time }),
              ...(patch.assignmentType !== undefined && { assignmentType: patch.assignmentType }),
              ...(patch.notes !== undefined && { notes: patch.notes || undefined }),
              ...(patch.course !== undefined && { courseId: courseIdOf(patch.course) }),
              sourceMeta: meta(item.sourceMeta)
            }
      );
    } else if (entry.kind === "exam") {
      exams = exams.map((item) =>
        item.id !== entry.id
          ? item
          : {
              ...item,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.date !== undefined && { examDate: patch.date }),
              ...(patch.time !== undefined && { examTime: patch.time }),
              ...(patch.notes !== undefined && { notes: patch.notes || undefined }),
              ...(patch.course !== undefined && { courseId: courseIdOf(patch.course) }),
              sourceMeta: meta(item.sourceMeta)
            }
      );
    } else {
      events = events.map((item) =>
        item.id !== entry.id
          ? item
          : {
              ...item,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.date !== undefined && { date: patch.date }),
              ...(patch.time !== undefined && (patch.time ? { startTime: patch.time, allDay: false } : { allDay: true })),
              ...(patch.endTime !== undefined && patch.endTime && { endTime: patch.endTime }),
              ...(patch.notes !== undefined && { description: patch.notes || undefined }),
              sourceMeta: meta(item.sourceMeta)
            }
      );
    }
  }

  const flag = <I extends { id: string; sourceMeta?: SourceMeta }>(list: I[], kind: SyncKind) =>
    list.map((item) => (plan.markRemoved.some((entry) => entry.kind === kind && entry.id === item.id) && item.sourceMeta ? { ...item, sourceMeta: { ...item.sourceMeta, removedFromSource: true } } : item));
  const drop = <I extends { id: string }>(list: I[], kind: SyncKind) => list.filter((item) => !plan.remove.some((entry) => entry.kind === kind && entry.id === item.id));

  return {
    ...data,
    courses,
    assignments: drop(flag(assignments, "assignment"), "assignment"),
    exams: drop(flag(exams, "exam"), "exam"),
    events: drop(flag(events, "event"), "event")
  };
}
