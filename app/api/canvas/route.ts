import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readCanvasFeed, summarizeItems } from "@/lib/canvas/classify";
import { maskFeedUrl, validateFeedUrl } from "@/lib/canvas/feed-url";
import { fetchCanvasFeed } from "@/lib/canvas/fetch-feed";
import { normalizeCanvasSettings, normalizeCourseMap } from "@/lib/canvas/settings";
import { adminClient, removeUntouchedImports, settingsWithTimezone, syncConnection, type ConnectionRow } from "@/lib/canvas/server-sync";

/**
 * Canvas calendar feed import.
 * The browser can't download the feed itself (Canvas doesn't allow it), so this route does it safely.
 *
 * Guest mode (no account):   { action: "read", feedUrl, timezone, importNotes }  → the parsed items
 * Signed in (Bearer token):  "preview" | "connect" | "sync" | "status" | "settings" | "disconnect"
 *
 * The feed link is a secret like a password: it's never logged, and once saved it's never sent back.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const SYNC_COOLDOWN_MS = 60_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function userIdFrom(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  return error || !data.user ? null : data.user.id;
}

function statusOf(connection: ConnectionRow | null) {
  if (!connection) return { connected: false as const };
  return {
    connected: true as const,
    feed: maskFeedUrl(connection.feed_url),
    lastSyncedAt: connection.last_synced_at,
    lastStatus: connection.last_status,
    lastError: connection.last_error,
    settings: normalizeCanvasSettings(connection.settings),
    courseMap: normalizeCourseMap(connection.course_map)
  };
}

/** Download + read a feed, for previews and guest syncs. */
async function readFeed(feedUrl: unknown, timezone: unknown, importNotes: unknown) {
  if (typeof feedUrl !== "string" || feedUrl.length > 2000) return { error: "Paste your Canvas Calendar Feed link.", status: 400 };
  const checked = validateFeedUrl(feedUrl);
  if (!checked.ok) return { error: checked.error, status: 400 };
  const feed = await fetchCanvasFeed(feedUrl);
  if (feed.status === "broken") return { error: feed.error, status: 400, broken: true };
  if (feed.status !== "ok") return { error: "error" in feed ? feed.error : "Couldn't reach Canvas — will retry.", status: 502 };
  const zone = typeof timezone === "string" && timezone.length < 64 ? timezone : "UTC";
  try {
    const items = readCanvasFeed(feed.text, zone, { importNotes: importNotes !== false });
    return { items, summary: summarizeItems(items) };
  } catch {
    return { error: "Couldn't read that Canvas calendar.", status: 502 };
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const action = body.action;

  // Guest mode: just read the feed. The browser compares it with the data on the device.
  if (action === "read") {
    const result = await readFeed(body.feedUrl, body.timezone, body.importNotes);
    return "error" in result ? json({ error: result.error, broken: result.broken ?? false }, result.status) : json(result);
  }

  const userId = await userIdFrom(request);
  if (!userId) return json({ error: "Please sign in again.", code: "signed_out" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "Canvas import isn't set up on this site yet.", code: "not_configured" }, 503);

  const { data: existing } = await db.from("canvas_connections").select("*").eq("user_id", userId).maybeSingle();
  const connection = (existing as ConnectionRow | null) ?? null;

  switch (action) {
    case "status":
      return json(statusOf(connection));

    case "preview": {
      const result = await readFeed(body.feedUrl, body.timezone, body.importNotes);
      return "error" in result ? json({ error: result.error, broken: result.broken ?? false }, result.status) : json(result);
    }

    case "connect": {
      if (typeof body.feedUrl !== "string") return json({ error: "Paste your Canvas Calendar Feed link." }, 400);
      const checked = validateFeedUrl(body.feedUrl);
      if (!checked.ok) return json({ error: checked.error }, 400);
      const settings = settingsWithTimezone(body.settings, body.timezone);
      const courseMap = normalizeCourseMap(body.courseMap);
      const row = {
        user_id: userId,
        feed_url: checked.url.toString(),
        feed_host: checked.url.host,
        settings,
        course_map: courseMap,
        last_status: "never",
        last_error: null,
        etag: null,
        last_modified: null,
        updated_at: new Date().toISOString()
      };
      const { error } = await db.from("canvas_connections").upsert(row, { onConflict: "user_id" });
      if (error) return json({ error: "Couldn't save the connection. Has the Canvas database setup been run?" }, 500);
      const outcome = await syncConnection(db, { ...row, last_synced_at: null, last_status: "never" } as ConnectionRow, { force: true });
      const { data: saved } = await db.from("canvas_connections").select("*").eq("user_id", userId).maybeSingle();
      return json({ outcome: { status: outcome.status, message: outcome.message }, ...statusOf(saved as ConnectionRow | null) });
    }

    case "sync": {
      if (!connection) return json({ error: "Canvas isn't connected." }, 404);
      if (connection.last_status === "broken") return json({ outcome: { status: "broken", message: connection.last_error }, ...statusOf(connection) });
      const last = connection.last_synced_at ? Date.parse(connection.last_synced_at) : 0;
      if (Date.now() - last < SYNC_COOLDOWN_MS) return json({ outcome: { status: "unchanged", message: "Synced less than a minute ago." }, ...statusOf(connection) });
      // Keep the student's current timezone so due times stay right after travel or daylight-saving changes.
      const settings = settingsWithTimezone(connection.settings, body.timezone);
      const outcome = await syncConnection(db, { ...connection, settings }, { force: body.force === true });
      if (typeof body.timezone === "string") await db.from("canvas_connections").update({ settings }).eq("user_id", userId);
      const { data: saved } = await db.from("canvas_connections").select("*").eq("user_id", userId).maybeSingle();
      return json({ outcome: { status: outcome.status, message: outcome.message }, ...statusOf(saved as ConnectionRow | null) });
    }

    case "settings": {
      if (!connection) return json({ error: "Canvas isn't connected." }, 404);
      const settings = settingsWithTimezone(body.settings, body.timezone ?? normalizeCanvasSettings(connection.settings).timezone);
      const update: Record<string, unknown> = { settings, updated_at: new Date().toISOString(), etag: null, last_modified: null };
      if (body.courseMap !== undefined) update.course_map = normalizeCourseMap(body.courseMap);
      await db.from("canvas_connections").update(update).eq("user_id", userId);
      const { data: saved } = await db.from("canvas_connections").select("*").eq("user_id", userId).maybeSingle();
      return json(statusOf(saved as ConnectionRow | null));
    }

    case "disconnect": {
      const removed = body.keepItems === false ? await removeUntouchedImports(db, userId) : 0;
      await db.from("canvas_connections").delete().eq("user_id", userId);
      return json({ connected: false, removed });
    }

    default:
      return json({ error: "Unknown action." }, 400);
  }
}
