import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCanvasFeed, type CanvasItem } from "@/lib/canvas/classify";
import { ASSIGNMENT_FIELD_MAP, editedFieldsFor, withEdited } from "@/lib/canvas/rows";
import { DEFAULT_CANVAS_SETTINGS, type CanvasSettings, type CourseMap } from "@/lib/canvas/settings";
import { applyPlanToData, emptyPlan, planSync } from "@/lib/canvas/sync";
import type { Assignment, Course, DayBoardData } from "@/types/dayboard";

const FEED = readFileSync(new URL("../fixtures/canvas-feed.ics", import.meta.url), "utf8");
const TZ = "America/Los_Angeles";
const TODAY = "2026-11-23";
const ITEMS = readCanvasFeed(FEED, TZ, { importNotes: true });

type Data = Pick<DayBoardData, "assignments" | "exams" | "events" | "courses">;

const CHEM: Course = { id: "chem", code: "CHEM 201", name: "Chemistry", days: "Mon, Wed", time: "", room: "" };
const empty = (courses: Course[] = [CHEM]): Data => ({ courses, assignments: [], exams: [], events: [] });

let counter = 0;
const makeId = (prefix: string) => `${prefix}-${++counter}`;

function sync(data: Data, options: { items?: CanvasItem[]; settings?: CanvasSettings; courseMap?: CourseMap; today?: string } = {}) {
  const settings = options.settings ?? DEFAULT_CANVAS_SETTINGS;
  const plan = planSync({ items: options.items ?? ITEMS, data, settings, courseMap: options.courseMap ?? {}, today: options.today ?? TODAY });
  return { plan, data: applyPlanToData(data, plan, settings, makeId) };
}

const find = (data: Data, externalId: string) =>
  [...data.assignments, ...data.exams, ...data.events].find((item) => item.sourceMeta?.externalId === externalId);

/** What the store does when the student edits an imported assignment. */
function editAssignment(data: Data, id: string, patch: Partial<Assignment>): Data {
  return {
    ...data,
    assignments: data.assignments.map((item) => {
      if (item.id !== id) return item;
      const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => item[key as keyof Assignment] !== value));
      return { ...item, ...patch, sourceMeta: withEdited(item.sourceMeta, editedFieldsFor(changed, ASSIGNMENT_FIELD_MAP)) };
    })
  };
}

const withItem = (externalId: string, change: Partial<CanvasItem>) => ITEMS.map((item) => (item.externalId === externalId ? { ...item, ...change } : item));

describe("First sync", () => {
  const { plan, data } = sync(empty());

  it("creates assignments and exams, but not old items or (by default) calendar events", () => {
    expect(data.assignments.map((item) => item.title).sort()).toEqual(["Chapter 5 Quiz", "Final Exam Practice Quiz", "Final Project", "Lab 4 report: titration", "Problem Set 7, part A; graphs"]);
    expect(data.exams.map((item) => item.title)).toEqual(["Midterm Exam"]);
    expect(data.events).toHaveLength(0); // calendar events are off by default
    expect(find(data, "event-assignment-1005")).toBeUndefined(); // Essay 1 is >14 days in the past
    expect(plan.create).toHaveLength(6);
  });

  it("matches existing classes and creates the missing ones", () => {
    expect(find(data, "event-assignment-1001")).toMatchObject({ courseId: "chem" });
    expect(data.courses.map((course) => course.code).sort()).toEqual(["BIO 110", "CHEM 201", "ENG 220"]);
    const bio = data.courses.find((course) => course.code === "BIO 110")!;
    expect(find(data, "event-assignment-1003")).toMatchObject({ courseId: bio.id });
    expect(find(data, "event-assignment-1006")).toMatchObject({ courseId: "" }); // no course in Canvas
  });

  it("keeps only the necessary fields and sensible defaults", () => {
    const lab = find(data, "event-assignment-1001") as Assignment;
    expect(lab).toMatchObject({ assignmentType: "lab", estimatedMinutes: 90, status: "not_started", dueDate: "2026-11-24", dueTime: "23:59", steps: [] });
    expect(lab.notes).toContain("titration results");
    expect(lab.sourceMeta).toMatchObject({ source: "canvas", externalUrl: "https://school.instructure.com/courses/11/assignments/1001", editedFields: [], hidden: false });
    const quiz = find(data, "event-assignment-1002") as Assignment;
    expect(quiz).toMatchObject({ estimatedMinutes: 30, dueTime: "" }); // all-day: no time
    expect(find(data, "event-assignment-1003")).toMatchObject({ studyMinutesGoal: 240, planStudy: true, examTime: "07:00" });
    expect(find(data, "event-assignment-1004")).toMatchObject({ estimatedMinutes: 240 });
  });

  it("follows the student's choices: types, course mapping and skipped courses", () => {
    const settings: CanvasSettings = { ...DEFAULT_CANVAS_SETTINGS, types: { assignments: true, quizzes: false, exams: false, events: true } };
    const courseMap: CourseMap = { "ENG 220 English Literature": { mode: "skip" }, "BIO 110 Intro to Biology": { mode: "existing", courseId: "chem" } };
    const result = sync(empty(), { settings, courseMap });
    expect(result.data.exams).toHaveLength(0);
    expect(result.data.assignments.some((item) => item.assignmentType === "quiz")).toBe(false);
    expect(find(result.data, "event-assignment-1004")).toBeUndefined(); // ENG skipped
    expect(find(result.data, "event-calendar-event-55")).toMatchObject({ startTime: "14:00", endTime: "15:00", category: "school" });
    expect(result.data.courses.map((course) => course.code)).toEqual(["CHEM 201"]); // BIO mapped into Chemistry, ENG skipped
  });
});

describe("Repeat syncs", () => {
  it("never creates duplicates", () => {
    const first = sync(empty()).data;
    const second = sync(first);
    expect(emptyPlan(second.plan)).toBe(true);
    expect(second.data.assignments).toHaveLength(first.assignments.length);
    expect(second.data.courses).toHaveLength(first.courses.length);
  });

  it("names new classes without repeating the code, and recognises them next time", () => {
    const courseMap: CourseMap = { "BIO 110 Intro to Biology": { mode: "new" }, "ENG 220 English Literature": { mode: "new" } };
    const first = sync(empty(), { courseMap }).data;
    expect(first.courses.find((course) => course.code === "BIO 110")?.name).toBe("Intro to Biology");
    const second = sync(first, { courseMap, items: withItem("event-assignment-1004", { title: "Final Project v2" }) });
    expect(second.plan.newCourses).toEqual([]);
    expect(second.data.courses).toHaveLength(first.courses.length);
  });

  it("updates Canvas changes on fields the student hasn't edited", () => {
    const first = sync(empty()).data;
    const second = sync(first, { items: withItem("event-assignment-1001", { title: "Lab 4 report (revised)", date: "2026-11-26" }) });
    expect(find(second.data, "event-assignment-1001")).toMatchObject({ title: "Lab 4 report (revised)", dueDate: "2026-11-26" });
    expect(find(second.data, "event-assignment-1001")!.sourceMeta!.dateChanged).toBe(true);
  });

  it("never overwrites the student's edits", () => {
    const first = sync(empty()).data;
    const lab = find(first, "event-assignment-1001")!;
    const edited = editAssignment(first, lab.id, { title: "My lab", estimatedMinutes: 45, notes: "Ask Sam about Q3" });
    expect(find(edited, "event-assignment-1001")!.sourceMeta!.editedFields.sort()).toEqual(["estimatedMinutes", "notes", "title"]);

    const second = sync(edited, { items: withItem("event-assignment-1001", { title: "Lab 4 (renamed)", date: "2026-11-28", note: "New instructions from Canvas" }) });
    expect(find(second.data, "event-assignment-1001")).toMatchObject({ title: "My lab", estimatedMinutes: 45, notes: "Ask Sam about Q3", dueDate: "2026-11-28" });
  });

  it("never changes status, score, steps or time spent", () => {
    const first = sync(empty()).data;
    const lab = find(first, "event-assignment-1001")!;
    const worked: Data = {
      ...first,
      assignments: first.assignments.map((item) => (item.id === lab.id ? { ...item, status: "submitted", score: 92, actualMinutes: 50, steps: [{ id: "s1", title: "Draft", done: true }] } : item))
    };
    const second = sync(worked, { items: withItem("event-assignment-1001", { title: "Lab 4 v2", date: "2026-11-30" }) });
    expect(find(second.data, "event-assignment-1001")).toMatchObject({ status: "submitted", score: 92, actualMinutes: 50, steps: [{ id: "s1", title: "Draft", done: true }], title: "Lab 4 v2" });
  });

  it("re-plans study time when an exam moves", () => {
    const first = sync(empty()).data;
    const second = sync(first, { items: withItem("event-assignment-1003", { date: "2026-12-05" }) });
    const exam = first.exams[0];
    expect(second.plan.replanExams).toEqual([exam.id]);
    expect(second.data.exams[0]).toMatchObject({ examDate: "2026-12-05" });
  });
});

describe("Items that disappear from Canvas", () => {
  const first = sync(empty()).data;
  const without = (...ids: string[]) => ITEMS.filter((item) => !ids.includes(item.externalId));

  it("deletes untouched upcoming items", () => {
    const result = sync(first, { items: without("event-assignment-1001") });
    expect(find(result.data, "event-assignment-1001")).toBeUndefined();
  });

  it("keeps items the student edited or worked on, flagged as no longer in Canvas", () => {
    const lab = find(first, "event-assignment-1001")!;
    const quiz = find(first, "event-assignment-1002")!;
    let data = editAssignment(first, lab.id, { title: "My lab" });
    data = { ...data, assignments: data.assignments.map((item) => (item.id === quiz.id ? { ...item, status: "in_progress" } : item)) };
    const result = sync(data, { items: without("event-assignment-1001", "event-assignment-1002") });
    expect(find(result.data, "event-assignment-1001")!.sourceMeta!.removedFromSource).toBe(true);
    expect(find(result.data, "event-assignment-1002")!.sourceMeta!.removedFromSource).toBe(true);
  });

  it("leaves untouched items from the past alone", () => {
    const later = sync(first, { items: without("event-assignment-1001"), today: "2026-12-01" });
    expect(find(later.data, "event-assignment-1001")).toBeDefined();
  });

  it("clears the flag if the item comes back", () => {
    const lab = find(first, "event-assignment-1001")!;
    const flagged = sync(editAssignment(first, lab.id, { title: "Mine" }), { items: without("event-assignment-1001") }).data;
    const back = sync(flagged).data;
    expect(find(back, "event-assignment-1001")!.sourceMeta!.removedFromSource).toBe(false);
  });
});

describe("Hidden items", () => {
  it("stay hidden and are never re-created or updated", () => {
    const first = sync(empty()).data;
    const hidden: Data = { ...first, assignments: first.assignments.map((item) => (item.sourceMeta?.externalId === "event-assignment-1004" ? { ...item, sourceMeta: { ...item.sourceMeta, hidden: true } } : item)) };
    const result = sync(hidden, { items: withItem("event-assignment-1004", { title: "Final Project (updated)" }) });
    expect(result.plan.create.some((entry) => entry.item.externalId === "event-assignment-1004")).toBe(false);
    expect(find(result.data, "event-assignment-1004")).toMatchObject({ title: "Final Project", sourceMeta: { hidden: true } });
  });
});

describe("Items already added by hand", () => {
  it("are linked instead of duplicated, keeping the student's title", () => {
    const manual: Assignment = { id: "mine", courseId: "chem", title: "lab 4 report", assignmentType: "lab", dueDate: "2026-11-24", dueTime: "23:00", estimatedMinutes: 60, actualMinutes: 0, difficulty: 3, status: "in_progress" };
    const result = sync({ ...empty(), assignments: [manual] });
    expect(result.plan.link).toHaveLength(1);
    const linked = result.data.assignments.filter((item) => item.dueDate === "2026-11-24");
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ id: "mine", title: "lab 4 report", status: "in_progress", sourceMeta: { externalId: "event-assignment-1001", editedFields: ["title"] } });
  });
});
