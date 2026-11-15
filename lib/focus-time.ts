import type { FocusSession } from "@/types/focus";

/** Only credit the running focus segment, capped at its deadline. */
export function focusSegmentSeconds(session: FocusSession, at = Date.now()) {
  if (session.phase !== "focus" || session.status !== "focusing" || !session.ends_at) return 0;
  return Math.max(0, Math.floor((Math.min(at, Date.parse(session.ends_at)) - Date.parse(session.segment_started_at)) / 1000));
}
