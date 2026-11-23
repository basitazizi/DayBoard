import { NextResponse } from "next/server";
import { normalizeCanvasSettings } from "@/lib/canvas/settings";
import { adminClient, syncConnection, type ConnectionRow } from "@/lib/canvas/server-sync";

/**
 * Daily Canvas sync for signed-in students (Vercel Cron, see vercel.json).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else is refused.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const STALE_MS = 20 * 60 * 60 * 1000;
const TIME_BUDGET_MS = 50_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = adminClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const started = Date.now();
  const staleBefore = new Date(started - STALE_MS).toISOString();
  const { data, error } = await db
    .from("canvas_connections")
    .select("*")
    .neq("last_status", "broken")
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) return NextResponse.json({ error: "Could not read connections" }, { status: 500 });

  const counts = { synced: 0, unchanged: 0, failed: 0, skipped: 0 };
  for (const connection of (data ?? []) as ConnectionRow[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    if (!normalizeCanvasSettings(connection.settings).autoSync) {
      counts.skipped += 1;
      continue;
    }
    const outcome = await syncConnection(db, connection);
    if (outcome.status === "ok") counts.synced += 1;
    else if (outcome.status === "unchanged") counts.unchanged += 1;
    else counts.failed += 1;
  }
  return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
}
