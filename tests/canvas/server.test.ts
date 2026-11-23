import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DNS is mocked so tests never touch the network: every host resolves to a public address
// unless a test says otherwise.
const lookup = vi.fn(async (_host: string, _options?: unknown) => [{ address: "93.184.216.34", family: 4 }]);
vi.mock("node:dns/promises", () => ({ lookup: (host: string, options?: unknown) => lookup(host, options) }));

const { fetchCanvasFeed, isPrivateAddress } = await import("@/lib/canvas/fetch-feed");
const { maskFeedUrl, validateFeedUrl } = await import("@/lib/canvas/feed-url");
const { applyPlanToDatabase } = await import("@/lib/canvas/server-sync");
const { readCanvasFeed } = await import("@/lib/canvas/classify");
const { planSync } = await import("@/lib/canvas/sync");
const { DEFAULT_CANVAS_SETTINGS } = await import("@/lib/canvas/settings");

const FEED = readFileSync(new URL("../fixtures/canvas-feed.ics", import.meta.url), "utf8");
const GOOD = "https://school.instructure.com/feeds/calendars/user_AbC123xyz.ics";

describe("Feed link checks", () => {
  it("accepts Canvas feed links on any school domain", () => {
    expect(validateFeedUrl(GOOD).ok).toBe(true);
    expect(validateFeedUrl("https://canvas.school.edu/feeds/calendars/user_9f8e7d.ics").ok).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["http://school.instructure.com/feeds/calendars/user_a.ics", "https://school.instructure.com/courses/1", "https://x.com/feeds/calendars/user_a.ics?x=1/../", "https://u:p@school.edu/feeds/calendars/user_a.ics", "not a link", "https://school.edu:8443/feeds/calendars/user_a.ics"]) {
      expect(validateFeedUrl(bad).ok, bad).toBe(false);
    }
  });

  it("masks the secret part", () => {
    expect(maskFeedUrl(GOOD)).toBe("school.instructure.com/feeds/calendars/user_AbC1••••.ics");
  });

  it("knows private and local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("Fetching a feed safely", () => {
  beforeEach(() => lookup.mockImplementation(async () => [{ address: "93.184.216.34", family: 4 }]));
  afterEach(() => vi.unstubAllGlobals());

  it("downloads and returns the calendar with its ETag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(FEED, { status: 200, headers: { etag: '"v1"' } })));
    const result = await fetchCanvasFeed(GOOD);
    expect(result).toMatchObject({ status: "ok", etag: '"v1"' });
  });

  it("sends the ETag back and handles 304 Not Modified", async () => {
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["If-None-Match"]).toBe('"v1"');
      return new Response(null, { status: 304 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchCanvasFeed(GOOD, { etag: '"v1"' })).toEqual({ status: "not_modified" });
  });

  it("refuses hosts that resolve to private addresses (SSRF)", async () => {
    lookup.mockImplementation(async () => [{ address: "10.0.0.5", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchCanvasFeed(GOOD)).status).toBe("broken");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows at most 2 redirects and re-checks each one", async () => {
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    vi.stubGlobal("fetch", vi.fn(async () => redirect("https://cdn.instructure.com/next.ics")));
    expect((await fetchCanvasFeed(GOOD)).status).toBe("error"); // too many redirects

    vi.stubGlobal("fetch", vi.fn(async () => redirect("http://cdn.instructure.com/plain.ics")));
    expect((await fetchCanvasFeed(GOOD)).status).toBe("error"); // insecure redirect
  });

  it("marks the link broken on 401/404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect((await fetchCanvasFeed(GOOD)).status).toBe("broken");
  });

  it("refuses feeds over 5 MB", async () => {
    const big = `BEGIN:VCALENDAR\n${"X".repeat(5 * 1024 * 1024 + 10)}`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(big, { status: 200 })));
    expect((await fetchCanvasFeed(GOOD)).status).toBe("error");
  });

  it("never puts the feed link in an error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`failed ${GOOD}`); }));
    const result = await fetchCanvasFeed(GOOD);
    expect(JSON.stringify(result)).not.toContain("user_AbC123xyz");
  });
});

/** A tiny stand-in for the Supabase client that records what the sync writes. */
function fakeDb() {
  const ops: { table: string; type: string; payload?: unknown; filters: [string, unknown][] }[] = [];
  let ids = 0;
  const from = (table: string) => {
    const op = { table, type: "select", payload: undefined as unknown, filters: [] as [string, unknown][] };
    const chain: Record<string, unknown> = {
      insert: (payload: unknown) => ((op.type = "insert"), (op.payload = payload), ops.push(op), chain),
      update: (payload: unknown) => ((op.type = "update"), (op.payload = payload), ops.push(op), chain),
      delete: () => ((op.type = "delete"), ops.push(op), chain),
      select: () => chain,
      eq: (key: string, value: unknown) => (op.filters.push([key, value]), chain),
      in: (key: string, value: unknown) => (op.filters.push([key, value]), chain),
      single: async () => ({ data: { id: `db-${++ids}` }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
    };
    return chain;
  };
  return { db: { from } as never, ops };
}

describe("Signed-in mode: writing a sync to the database", () => {
  it("creates classes and items for the right user, with Canvas fields", async () => {
    const items = readCanvasFeed(FEED, "America/Los_Angeles", { importNotes: true });
    const plan = planSync({ items, data: { courses: [], assignments: [], exams: [], events: [] }, settings: DEFAULT_CANVAS_SETTINGS, courseMap: {}, today: "2026-11-23" });
    const { db, ops } = fakeDb();
    await applyPlanToDatabase(db, "user-1", plan, DEFAULT_CANVAS_SETTINGS, 0);

    const courseInserts = ops.filter((op) => op.table === "courses" && op.type === "insert");
    expect(courseInserts).toHaveLength(3);
    const assignments = ops.find((op) => op.table === "assignments" && op.type === "insert")!.payload as Record<string, unknown>[];
    expect(assignments).toHaveLength(5);
    expect(assignments.every((row) => row.user_id === "user-1" && row.source === "canvas" && typeof row.external_id === "string")).toBe(true);
    const lab = assignments.find((row) => row.external_id === "event-assignment-1001")!;
    expect(lab).toMatchObject({ title: "Lab 4 report: titration", due_date: "2026-11-24", due_time: "23:59", status: "not_started", assignment_type: "lab", edited_fields: [] });
    const exams = ops.find((op) => op.table === "exams" && op.type === "insert")!.payload as Record<string, unknown>[];
    expect(exams[0]).toMatchObject({ title: "Midterm Exam", plan_study: true, study_minutes_goal: 240 });
  });

  it("only ever updates its own user's rows, and never status or score", async () => {
    const items = readCanvasFeed(FEED, "America/Los_Angeles", { importNotes: true });
    const existing = {
      id: "a1",
      courseId: "",
      title: "Old title",
      assignmentType: "lab" as const,
      dueDate: "2026-11-20",
      dueTime: "23:59",
      estimatedMinutes: 90,
      actualMinutes: 0,
      difficulty: 3,
      status: "submitted" as const,
      score: 88,
      sourceMeta: { source: "canvas" as const, externalId: "event-assignment-1001", hash: "old", editedFields: [], removedFromSource: false, hidden: false, dateChanged: false }
    };
    const plan = planSync({ items, data: { courses: [], assignments: [existing], exams: [], events: [] }, settings: DEFAULT_CANVAS_SETTINGS, courseMap: {}, today: "2026-11-23" });
    const { db, ops } = fakeDb();
    await applyPlanToDatabase(db, "user-1", plan, DEFAULT_CANVAS_SETTINGS, 0);
    const update = ops.find((op) => op.table === "assignments" && op.type === "update")!;
    expect(update.filters).toEqual([["id", "a1"], ["user_id", "user-1"]]);
    expect(update.payload).toMatchObject({ title: "Lab 4 report: titration", due_date: "2026-11-24", source_date_changed: true });
    expect(update.payload).not.toHaveProperty("status");
    expect(update.payload).not.toHaveProperty("score");
  });
});
