export type FocusStatus = "focusing" | "paused" | "break" | "completed";
export type FocusViewState = "setup" | FocusStatus;

export interface FocusSession {
  id: string;
  user_id: string;
  task_id: string | null;
  focus_reason: string;
  started_at: string;
  segment_started_at: string;
  ends_at: string | null;
  focus_duration: number;
  break_duration: number;
  long_break_duration: number;
  break_frequency: number;
  long_break_after: number;
  session_number: number;
  status: FocusStatus;
  phase: "focus" | "break";
  paused_at: string | null;
  remaining_seconds: number | null;
  focused_seconds: number;
  music: string;
  music_url: string | null;
  auto_start: boolean;
  created_at: string;
  updated_at: string;
}

export interface FocusHistoryItem {
  id: string;
  focus_reason: string;
  focused_seconds: number;
  created_at: string;
}
