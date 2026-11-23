// Server only: used by /api/canvas and the daily cron job. Needs the Supabase service role key.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assignmentInsertRow, eventInsertRow, examInsertRow, mapAssignment, mapCourse, mapEvent, mapExam, type Row } from "../db-rows";
import { readCanvasFeed } from "./classify";
import { fetchCanvasFeed } from "./fetch-feed";
import { instantToLocal } from "./ics";
import { normalizeCanvasSettings, normalizeCourseMap, type CanvasSettings, type CourseMap } from "./settings";
import { buildAssignment, buildEvent, buildExam, courseFromCanvasName, describePlan, newMeta, planSync, type CourseRef, type SyncKind, type SyncPlan } from "./sync";

const TABLE: Record<SyncKind, "assignments" | "exams" | "events"> = { assignment: "assignments", exam: "exams", event: "events" };

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export interface ConnectionRow {
  user_id: string;
  feed_url: string;
  feed_host: string | null;
  last_synced_at: string | null;
  last_status: "never" | "ok" | "error" | "broken";
  last_error: string | null;
  etag: string | null;
  last_modified: string | null;
  settings: unknown;
  course_map: unknown;
}

export interface SyncOutcome {
  status: "ok" | "unchanged" | "error" | "broken";
  message: string;
  plan?: SyncPlan;
}

function todayIn(timezone: string | undefined) {
  try {
    return instantToLocal(Date.now(), timezone || "UTC").date;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Everything the sync engine needs to know about the student's current items. */
async function loadUserData(db: SupabaseClient, userId: string) {
  const [courses, assignments, exams, events] = await Promise.all([
    db.from("courses").select("*").eq("user_id", userId),
    db.from("assignments").select("*").eq("user_id", userId),
    db.from("exams").select("*").eq("user_id", userId),
    db.from("events").select("*").eq("user_id", userId).eq("auto_planned", false)
  ]);
  const failed = [courses, assignments, exams, events].find((result) => result.error);
  if (failed?.error) throw new Error("load_failed");
  return {
    courses: (courses.data ?? []).map((row, index) => mapCourse(row as Row, index)),
    assignments: (assignments.data ?? []).map((row) => mapAssignment(row as Row)),
    exams: (exams.data ?? []).map((row) => mapExam(row as Row)),
    events: (events.data ?? []).map((row) => mapEvent(row as Row))
  };
}

/** Writes a sync plan to the database for one student. */
export async function applyPlanToDatabase(db: SupabaseClient, userId: string, plan: SyncPlan, settings: CanvasSettings, existingCourseCount: number) {
  const createdCourses = new Map<string, string>();
  for (const [index, name] of plan.newCourses.entries()) {
    const course = courseFromCanvasName(name, existingCourseCount + index);
    const { data, error } = await db.from("courses").insert({ user_id: userId, code: course.code, name: course.name, color: course.color }).select("id").single();
    if (error || !data) throw new Error("write_failed");
    createdCourses.set(name, data.id as string);
  }
  const courseIdOf = (ref: CourseRef | undefined) => (!ref ? null : "courseId" in ref ? ref.courseId : createdCourses.get(ref.newCourse) ?? null);

  const inserts: Record<SyncKind, Row[]> = { assignment: [], exam: [], event: [] };
  for (const entry of plan.create) {
    const courseId = courseIdOf(entry.course);
    if (entry.kind === "assignment") inserts.assignment.push({ user_id: userId, ...assignmentInsertRow(buildAssignment(entry.item, courseId ?? "", settings, entry.hash), courseId) });
    else if (entry.kind === "exam") inserts.exam.push({ user_id: userId, ...examInsertRow(buildExam(entry.item, courseId ?? "", settings, entry.hash), courseId) });
    else inserts.event.push({ user_id: userId, ...eventInsertRow(buildEvent(entry.item, entry.hash)) });
  }
  for (const kind of ["assignment", "exam", "event"] as SyncKind[]) {
    if (!inserts[kind].length) continue;
    const { error } = await db.from(TABLE[kind]).insert(inserts[kind]);
    if (error) throw new Error("write_failed");
  }

  for (const entry of plan.link) {
    const meta = newMeta(entry.item, entry.hash, ["title"]);
    await db
      .from(TABLE[entry.kind])
      .update({ source: "canvas", external_id: meta.externalId, external_url: meta.externalUrl ?? null, source_hash: meta.hash, edited_fields: meta.editedFields, removed_from_source: false })
      .eq("id", entry.id)
      .eq("user_id", userId);
  }

  for (const entry of plan.update) {
    const { patch } = entry;
    const row: Row = { source_hash: entry.hash, removed_from_source: false };
    if (entry.externalUrl) row.external_url = entry.externalUrl;
    if (entry.dateChanged) row.source_date_changed = true;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.course !== undefined && entry.kind !== "event") row.course_id = courseIdOf(patch.course);
    if (entry.kind === "assignment") {
      if (patch.date !== undefined) row.due_date = patch.date || null;
      if (patch.time !== undefined) row.due_time = patch.time || null;
      if (patch.assignmentType !== undefined) row.assignment_type = patch.assignmentType;
      if (patch.notes !== undefined) row.notes = patch.notes || null;
    } else if (entry.kind === "exam") {
      if (patch.date !== undefined) row.exam_date = patch.date;
      if (patch.time !== undefined) row.exam_time = patch.time || null;
      if (patch.notes !== undefined) row.notes = patch.notes || null;
    } else {
      if (patch.date !== undefined) row.event_date = patch.date;
      if (patch.time !== undefined) {
        if (patch.time) Object.assign(row, { start_time: patch.time, all_day: false });
        else row.all_day = true;
      }
      if (patch.endTime) row.end_time = patch.endTime;
      if (patch.notes !== undefined) row.description = patch.notes || null;
    }
    const { error } = await db.from(TABLE[entry.kind]).update(row).eq("id", entry.id).eq("user_id", userId);
    if (error) throw new Error("write_failed");
  }

  for (const entry of plan.markRemoved) {
    await db.from(TABLE[entry.kind]).update({ removed_from_source: true }).eq("id", entry.id).eq("user_id", userId);
  }
  for (const entry of plan.remove) {
    await db.from(TABLE[entry.kind]).delete().eq("id", entry.id).eq("user_id", userId).eq("source", "canvas");
  }
}

/**
 * Fetch the student's feed (with ETag caching), plan, apply, and record the outcome on the connection.
 * On any failure the student's existing data is left exactly as it was.
 */
export async function syncConnection(db: SupabaseClient, connection: ConnectionRow, options: { force?: boolean } = {}): Promise<SyncOutcome> {
  const settings = normalizeCanvasSettings(connection.settings);
  const courseMap: CourseMap = normalizeCourseMap(connection.course_map);
  const now = new Date().toISOString();
  const record = (fields: Partial<ConnectionRow>) => db.from("canvas_connections").update({ ...fields, updated_at: now }).eq("user_id", connection.user_id);

  const feed = await fetchCanvasFeed(connection.feed_url, options.force ? {} : { etag: connection.etag, lastModified: connection.last_modified });
  if (feed.status === "broken" || feed.status === "error") {
    await record({ last_status: feed.status, last_error: feed.error });
    return { status: feed.status, message: feed.error };
  }
  if (feed.status === "not_modified") {
    await record({ last_synced_at: now, last_status: "ok", last_error: null });
    return { status: "unchanged", message: "Everything is up to date" };
  }

  try {
    const items = readCanvasFeed(feed.text, settings.timezone || "UTC", { importNotes: settings.importNotes });
    const data = await loadUserData(db, connection.user_id);
    const plan = planSync({ items, data, settings, courseMap, today: todayIn(settings.timezone) });
    await applyPlanToDatabase(db, connection.user_id, plan, settings, data.courses.length);
    await record({ last_synced_at: now, last_status: "ok", last_error: null, etag: feed.etag ?? null, last_modified: feed.lastModified ?? null });
    return { status: "ok", message: describePlan(plan), plan };
  } catch {
    await record({ last_status: "error", last_error: "Couldn't finish syncing — will retry." });
    return { status: "error", message: "Couldn't finish syncing — will retry." };
  }
}

/** Remove imported items the student never touched (used when disconnecting without keeping them). */
export async function removeUntouchedImports(db: SupabaseClient, userId: string) {
  const data = await loadUserData(db, userId);
  const ids = {
    assignments: data.assignments.filter((item) => item.sourceMeta && !item.sourceMeta.editedFields.length && item.status === "not_started" && item.score === undefined && !item.steps?.length).map((item) => item.id),
    exams: data.exams.filter((item) => item.sourceMeta && !item.sourceMeta.editedFields.length && item.score === undefined).map((item) => item.id),
    events: data.events.filter((item) => item.sourceMeta && !item.sourceMeta.editedFields.length).map((item) => item.id)
  };
  for (const [table, list] of Object.entries(ids)) {
    if (list.length) await db.from(table).delete().in("id", list).eq("user_id", userId).eq("source", "canvas");
  }
  return ids.assignments.length + ids.exams.length + ids.events.length;
}

export function settingsWithTimezone(raw: unknown, timezone: unknown): CanvasSettings {
  const settings = normalizeCanvasSettings(raw);
  if (typeof timezone === "string" && timezone.length < 64) settings.timezone = timezone;
  return settings;
}
