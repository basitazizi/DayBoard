import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignmentTypeFor, isExamTitle, matchCourse, readCanvasFeed, splitSummary, summarizeItems, toPlainNote } from "@/lib/canvas/classify";
import { parseIcs, parseIcsDate, unescapeText, unfoldLines } from "@/lib/canvas/ics";
import type { Course } from "@/types/dayboard";

const FEED = readFileSync(new URL("../fixtures/canvas-feed.ics", import.meta.url), "utf8");
const TZ = "America/Los_Angeles";

describe("iCalendar reading", () => {
  it("unfolds folded lines (CRLF and LF)", () => {
    expect(unfoldLines("DESCRIPTION:Hello\r\n  world\r\nSUMMARY:x")).toEqual(["DESCRIPTION:Hello world", "SUMMARY:x"]);
    expect(unfoldLines("A:one\n\ttwo")).toEqual(["A:onetwo"]);
  });

  it("unescapes text", () => {
    expect(unescapeText("a\\, b\\; c\\nd\\\\e")).toBe("a, b; c\nd\\e");
  });

  it("reads UTC, TZID, all-day and floating times into the student's timezone", () => {
    expect(parseIcsDate("20261125T075900Z", {}, TZ)).toEqual({ date: "2026-11-24", time: "23:59", allDay: false });
    expect(parseIcsDate("20261203T100000", { TZID: "America/New_York" }, TZ)).toEqual({ date: "2026-12-03", time: "07:00", allDay: false });
    expect(parseIcsDate("20261127", { VALUE: "DATE" }, TZ)).toEqual({ date: "2026-11-27", time: "", allDay: true });
    expect(parseIcsDate("20261130T235900", {}, TZ)).toEqual({ date: "2026-11-30", time: "23:59", allDay: false });
    // Unknown (e.g. Windows-style) zone names fall back to the student's local time.
    expect(parseIcsDate("20261130T080000", { TZID: "Pacific Standard Time" }, TZ)).toEqual({ date: "2026-11-30", time: "08:00", allDay: false });
  });

  it("handles daylight-saving changes", () => {
    // 2026-03-08 is the US spring-forward day: 10:00 UTC = 03:00 PDT.
    expect(parseIcsDate("20260308T100000Z", {}, TZ)).toEqual({ date: "2026-03-08", time: "03:00", allDay: false });
    // The same UTC time in a student's zone across the date line.
    expect(parseIcsDate("20261125T075900Z", {}, "Asia/Kabul")).toEqual({ date: "2026-11-25", time: "12:29", allDay: false });
  });

  it("parses every event in the sample feed and ignores nested alarms", () => {
    const events = parseIcs(FEED, TZ);
    expect(events).toHaveLength(8);
    const midterm = events.find((event) => event.uid === "event-assignment-1003")!;
    expect(midterm.description).not.toMatch(/alarm/i);
    const lab = events.find((event) => event.uid === "event-assignment-1001")!;
    expect(lab.description).toContain("including error analysis; use the lab template");
    expect(lab.url).toBe("https://school.instructure.com/courses/11/assignments/1001");
  });
});

describe("Classifying Canvas items", () => {
  const items = readCanvasFeed(FEED, TZ, { importNotes: true });
  const byId = (id: string) => items.find((item) => item.externalId === id)!;

  it("splits the course out of the title", () => {
    expect(splitSummary("Lab 4 report: titration [CHEM 201-01 General Chemistry (Fall 2026)]")).toEqual({ title: "Lab 4 report: titration", courseName: "CHEM 201-01 General Chemistry (Fall 2026)" });
    expect(splitSummary("Problem Set 7, part A; graphs")).toEqual({ title: "Problem Set 7, part A; graphs", courseName: "" });
  });

  it("classifies assignments, quizzes, exams, projects and events", () => {
    expect(byId("event-assignment-1001")).toMatchObject({ kind: "assignment", assignmentType: "lab", date: "2026-11-24", time: "23:59" });
    expect(byId("event-assignment-1002")).toMatchObject({ kind: "assignment", assignmentType: "quiz", allDay: true, time: "" });
    expect(byId("event-assignment-1003")).toMatchObject({ kind: "exam", title: "Midterm Exam", courseName: "BIO 110 Intro to Biology", date: "2026-12-03", time: "07:00" });
    expect(byId("event-assignment-1004")).toMatchObject({ kind: "assignment", assignmentType: "project" });
    expect(byId("event-calendar-event-55")).toMatchObject({ kind: "event", time: "14:00", endTime: "15:00" });
    expect(byId("event-assignment-1007")).toMatchObject({ kind: "assignment", assignmentType: "quiz" });
    expect(byId("event-assignment-1006")).toMatchObject({ title: "Problem Set 7, part A; graphs", courseName: "" });
  });

  it("knows exams from final projects", () => {
    expect(isExamTitle("Final Exam")).toBe(true);
    expect(isExamTitle("Final")).toBe(true);
    expect(isExamTitle("Unit 3 Test")).toBe(true);
    expect(isExamTitle("Final Project")).toBe(false);
    expect(isExamTitle("Final paper draft")).toBe(false);
    expect(isExamTitle("Testing lab")).toBe(false);
    expect(assignmentTypeFor("Persuasive essay")).toBe("paper");
  });

  it("keeps only a short, useful plain-text note", () => {
    expect(byId("event-assignment-1001").note).toBe("Write up your titration results, including error analysis; use the lab template.\nSubmit as PDF.");
    expect(byId("event-assignment-1003").note).toBe("Covers chapters 1–6. Bring a calculator & a pencil.");
    expect(byId("event-assignment-1002").note).toBe("");
    expect(byId("event-assignment-1006").note).toBe(""); // "See Canvas" is boilerplate
    const long = toPlainNote(`<p>${"word ".repeat(200)}</p>`, "x");
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.endsWith("…")).toBe(true);
    expect(readCanvasFeed(FEED, TZ, { importNotes: false }).every((item) => item.note === "")).toBe(true);
  });

  it("summarises the feed for the preview", () => {
    const summary = summarizeItems(items);
    expect(summary.courses.map((course) => course.name)).toEqual(["BIO 110 Intro to Biology", "CHEM 201-01 General Chemistry (Fall 2026)", "ENG 220 English Literature", "No course"]);
    expect(summary).toMatchObject({ assignments: 6, exams: 1, events: 1 });
  });

  it("matches Canvas courses to DayBoard classes by code or name", () => {
    const courses: Course[] = [
      { id: "c1", code: "CHEM 201", name: "Chemistry", days: "", time: "", room: "" },
      { id: "c2", code: "BIO", name: "Intro to Biology", days: "", time: "", room: "" },
      { id: "c3", code: "MATH 152", name: "Calculus II", days: "", time: "", room: "" }
    ];
    expect(matchCourse("CHEM 201-01 General Chemistry (Fall 2026)", courses)?.id).toBe("c1");
    expect(matchCourse("BIO 110 Intro to Biology", courses)?.id).toBe("c2");
    expect(matchCourse("ENG 220 English Literature", courses)).toBeNull();
  });
});
