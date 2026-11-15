"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, Coffee, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_HISTORY_CHANGED_EVENT, saveGuestFocusSession } from "@/lib/focus-history";
import { focusSegmentSeconds } from "@/lib/focus-time";
import { getFocusRemaining } from "@/lib/focus-session";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import type { FocusHistoryItem, FocusSession } from "@/types/focus";
import { useApp } from "./app-context";
import { Page } from "./app-shell";
import { Button, Card, CardHeader, Field, Notice, ProgressBar, Row, Segmented, SelectInput, Sheet, TextInput, Toggle } from "./ui";

const focusOptions = [15, 25, 45, 50, 60, 90];
const breakOptions = [5, 10, 15];

function formatCountdown(total: number) {
  const safe = Math.max(0, total);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function formatFocused(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 60)}h`;
}

function localSession(): FocusSession | null {
  try { return JSON.parse(localStorage.getItem("dayboard-focus-session") ?? "null") as FocusSession | null; } catch { return null; }
}

export function FocusPage() {
  const searchParams = useSearchParams();
  const { store } = useApp();
  const { prefs } = useTheme();
  const requestedTask = store.data.tasks.find((task) => task.id === searchParams.get("task"));
  const [session, setSession] = useState<FocusSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [history, setHistory] = useState<FocusHistoryItem[]>([]);
  const [now, setNow] = useState(new Date());
  const [reason, setReason] = useState("");
  const [taskId, setTaskId] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(25);
  const [totalRounds, setTotalRounds] = useState(4);
  const changing = useRef(false);
  const starting = useRef(false);
  const breakFrequency = 1;
  const [longBreakAfter, setLongBreakAfter] = useState(3);
  const [music, setMusic] = useState("none");
  const [musicUrl, setMusicUrl] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    if (!requestedTask) return;
    setTaskId(requestedTask.id);
    setReason(requestedTask.title);
  }, [requestedTask?.id]);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      const saved = localSession();
      const savedStatus = (saved as unknown as { status?: string } | null)?.status;
      setSession(saved ? { ...saved, status: savedStatus === "focus" ? "focusing" : savedStatus === "break_complete" ? "break" : saved.status } : null);
      const guestHistory = JSON.parse(localStorage.getItem("dayboard:focus-history") ?? "[]") as Array<{id: string; reason: string; startedAt: string; focusedSeconds: number}>;
      setHistory(guestHistory.map((item) => ({id: item.id, focus_reason: item.reason, focused_seconds: item.focusedSeconds, created_at: item.startedAt})));
      setLoadingSession(false);
      return;
    }
    const [active, recent] = await Promise.all([
      supabase.from("focus_sessions").select("*").eq("user_id", auth.user.id).in("status", ["focusing", "focus", "paused", "break", "break_complete"]).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("focus_sessions").select("id, focus_reason, focused_seconds, created_at").eq("user_id", auth.user.id).eq("status", "completed").order("created_at", { ascending: false }).limit(12)
    ]);
    if (!active.error) {
      const activeSession = active.data as (Record<string, unknown> & { status: string }) | null;
      setSession(activeSession ? ({ ...activeSession, status: activeSession.status === "focus" ? "focusing" : activeSession.status === "break_complete" ? "break" : activeSession.status } as unknown as FocusSession) : null);
    }
    if (!recent.error) setHistory((recent.data ?? []) as FocusHistoryItem[]);
    setLoadingSession(false);
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) return;
      channel = supabase.channel(`focus-${data.user.id}-${crypto.randomUUID()}`).on("postgres_changes", { event: "*", schema: "public", table: "focus_sessions", filter: `user_id=eq.${data.user.id}` }, () => void load()).subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const immersive = Boolean(session && session.status !== "completed");
  useEffect(() => {
    if (!immersive) return;
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    const previousOverflow = document.body.style.overflow;
    const previousDisplay = shell?.style.display ?? "";
    if (shell) { shell.inert = true; shell.style.display = "none"; }
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLButtonElement>('[aria-label="Focus session"] button')?.focus();
    return () => { if (shell) { shell.inert = false; shell.style.display = previousDisplay; } document.body.style.overflow = previousOverflow; };
  }, [immersive]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function persist(next: FocusSession) {
    setSession(next);
    localStorage.setItem("dayboard-focus-session", JSON.stringify(next));
    window.dispatchEvent(new Event("dayboard:focus-changed"));
    if (next.user_id === "local") return;
    const { error } = await supabase.from("focus_sessions").update(next).eq("id", next.id).eq("user_id", next.user_id);
    if (error) setNotice("Saved on this device; shared sync is temporarily unavailable.");
  }

  async function begin(event: FormEvent) {
    event.preventDefault();
    const title = reason.trim() || requestedTask?.title || "";
    if (starting.current) return;
    if (!title || ![focusMinutes, breakMinutes, longBreakMinutes].every((n) => Number.isInteger(n) && n >= 1 && n <= 240)) {
      setNotice("Add a focus reason and valid positive durations.");
      return;
    }
    starting.current = true;
    setNotice(null);
    const started = new Date();
    const draft = {
      user_id: "local",
      task_id: store.data.tasks.some((task) => task.id === taskId) ? taskId : null,
      focus_reason: title,
      started_at: started.toISOString(),
      segment_started_at: started.toISOString(),
      ends_at: new Date(started.getTime() + focusMinutes * 60_000).toISOString(),
      focus_duration: focusMinutes * 60,
      break_duration: breakMinutes * 60,
      long_break_duration: longBreakMinutes * 60,
      break_frequency: breakFrequency,
      long_break_after: longBreakAfter,
      session_number: 1,
      total_rounds: totalRounds,
      status: "focusing" as const,
      phase: "focus" as const,
      paused_at: null,
      remaining_seconds: null,
      focused_seconds: 0,
      music,
      music_url: musicUrl.trim() || null,
      auto_start: autoStart,
      created_at: started.toISOString(),
      updated_at: started.toISOString()
    };
    let next = { ...draft, id: crypto.randomUUID() } as FocusSession;
    setSession(next);
    localStorage.setItem("dayboard-focus-session", JSON.stringify(next));
    startSound(next);
    starting.current = false;
    const linked = store.data.tasks.find((task) => task.id === taskId);
    if (linked && linked.status === "not_started") store.updateTaskStatus(linked.id, "in_progress");

    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const remoteDraft = { ...draft, user_id: auth.user.id };
      const { data, error } = await supabase.from("focus_sessions").insert(remoteDraft).select("*").single();
      if (!error && data) {
        next = data as FocusSession;
        setSession(next);
        localStorage.setItem("dayboard-focus-session", JSON.stringify(next));
      }
      if (error?.code === "23505") {
        setNotice("Your active session is already open on another device.");
        await load();
        return;
      }
      if (error) setNotice("Session started locally; shared sync needs the Focus migration.");
    }
  }

  useEffect(() => () => {
    audioRef.current?.pause();
    noiseRef.current?.stop();
    void audioContextRef.current?.close();
  }, []);

  function startSound(active: FocusSession) {
    if (active.music_url) {
      audioRef.current = new Audio(active.music_url);
      audioRef.current.loop = true;
      void audioRef.current.play().catch(() => setNotice("Your browser blocked music autoplay. Use the music button to try again."));
    } else if (active.music !== "none") {
      try {
        const context = new AudioContext();
        const length = context.sampleRate * 3;
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const samples = buffer.getChannelData(0);
        let brown = 0;
        for (let index = 0; index < length; index += 1) {
          const white = Math.random() * 2 - 1;
          brown = (brown + 0.02 * white) / 1.02;
          samples[index] = active.music === "brown-noise" ? brown * 3.5 : white * 0.35;
        }
        const source = context.createBufferSource();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        filter.type = active.music === "rain" ? "highpass" : "lowpass";
        filter.frequency.value = active.music === "rain" ? 900 : active.music === "ambient" ? 500 : 1200;
        gain.gain.value = active.music === "white-noise" ? 0.12 : 0.2;
        source.buffer = buffer;
        source.loop = true;
        source.connect(filter).connect(gain).connect(context.destination);
        source.start();
        audioContextRef.current = context;
        noiseRef.current = source;
      } catch {
        setNotice("Focus sound is unavailable in this browser, but the timer will continue.");
      }
    }
  }

  async function pauseOrResume() {
    if (!session || changing.current || session.status === "completed") return;
    if (session.status === "paused") {
      const remaining = session.remaining_seconds ?? session.focus_duration;
      await persist({ ...session, status: session.phase === "focus" ? "focusing" : "break", paused_at: null, segment_started_at: new Date().toISOString(), ends_at: new Date(Date.now() + remaining * 1000).toISOString(), remaining_seconds: null, updated_at: new Date().toISOString() });
      void audioRef.current?.play().catch(() => undefined);
      void audioContextRef.current?.resume();
    } else {
      const remaining = getFocusRemaining(session);
      const elapsed = focusSegmentSeconds(session);
      audioRef.current?.pause();
      void audioContextRef.current?.suspend();
      await persist({ ...session, status: "paused", paused_at: new Date().toISOString(), remaining_seconds: remaining, ends_at: null, focused_seconds: session.focused_seconds + elapsed, updated_at: new Date().toISOString() });
    }
  }

  async function finish() {
    if (!session || changing.current) return;
    changing.current = true;
    audioRef.current?.pause();
    noiseRef.current?.stop();
    noiseRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    const additional = focusSegmentSeconds(session);
    const focused = session.focused_seconds + additional;
    const ended = new Date().toISOString();
    const completed = { ...session, status: "completed" as const, ends_at: ended, focused_seconds: focused, remaining_seconds: 0, updated_at: ended };
    setSession(null);
    setFinishConfirmOpen(false);
    await persist(completed);
    if (session.user_id !== "local" && focused > 0) {
      await supabase.from("task_sessions").upsert({ user_id: session.user_id, task_id: session.task_id, focus_session_id: session.id, start_time: session.created_at, end_time: ended, duration: focused, type: "focus" }, { onConflict: "focus_session_id" });
    }
    localStorage.removeItem("dayboard-focus-session");
    window.dispatchEvent(new Event("dayboard:focus-changed"));
    setHistory((items) => [{ id: session.id, focus_reason: session.focus_reason, focused_seconds: focused, created_at: session.created_at }, ...items]);
    if (session.user_id === "local" && focused > 0) saveGuestFocusSession({ id: session.id, reason: session.focus_reason, startedAt: session.created_at, focusedSeconds: focused });
    else window.dispatchEvent(new Event(FOCUS_HISTORY_CHANGED_EVENT));
    const linkedTask = store.data.tasks.find((task) => task.id === session.task_id);
    if (linkedTask && linkedTask.status !== "completed" && !linkedTask.steps?.length && linkedTask.estimatedMinutes > 0 && focused > 0) {
      store.updateTask(linkedTask.id, { progressPercent: Math.min(95, Math.round(linkedTask.progressPercent + (focused / 60 / linkedTask.estimatedMinutes) * 100)) });
    }
    setSession(null);
    changing.current = false;
  }

  async function startBreak(manual = false) {
    if (!session) return;
    if (!manual && session.session_number >= (session.total_rounds ?? 4)) { await finish(); return; }
    const long = session.session_number % session.long_break_after === 0;
    if (!manual && !long && session.session_number % session.break_frequency !== 0) {
      await nextSession();
      return;
    }
    const duration = long ? session.long_break_duration : session.break_duration;
    const completedSegment = focusSegmentSeconds(session);
    await persist({ ...session, total_rounds: manual ? Math.max(session.total_rounds ?? 4, session.session_number + 1) : session.total_rounds, phase: "break", status: "break", segment_started_at: new Date().toISOString(), ends_at: new Date(Date.now() + duration * 1000).toISOString(), remaining_seconds: null, focused_seconds: session.focused_seconds + completedSegment, updated_at: new Date().toISOString() });
  }

  async function nextSession() {
    if (!session) return;
    const completedSegment = focusSegmentSeconds(session);
    await persist({ ...session, phase: "focus", status: "focusing", session_number: session.session_number + 1, segment_started_at: new Date().toISOString(), ends_at: new Date(Date.now() + session.focus_duration * 1000).toISOString(), remaining_seconds: null, focused_seconds: session.focused_seconds + completedSegment, updated_at: new Date().toISOString() });
  }

  const remaining = getFocusRemaining(session, now.getTime());
  const phaseDuration = session?.phase === "break" ? (session.session_number % session.long_break_after === 0 ? session.long_break_duration : session.break_duration) : session?.focus_duration ?? 1;
  const progress = Math.min(1, Math.max(0, remaining / Math.max(phaseDuration, 1)));

  useEffect(() => {
    if (!session || changing.current || session.status === "completed" || session.status === "paused" || remaining > 0 || (session.phase === "break" && !session.ends_at)) return;
    if (session.phase === "focus") {
      void startBreak();
    } else if (session.auto_start) {
      void nextSession();
    } else {
      void persist({ ...session, status: "break", ends_at: null, remaining_seconds: 0, updated_at: new Date().toISOString() });
    }
  }, [remaining, session?.id, session?.status, session?.ends_at, session?.phase]);

  const today = new Date().toDateString();
  const todayHistory = history.filter((item) => new Date(item.created_at).toDateString() === today);
  const totalToday = todayHistory.reduce((sum, item) => sum + item.focused_seconds, 0);
  const goalSeconds = prefs.focusGoalMinutes * 60;
  const openTasks = store.data.tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");

  const todayCard = (
    <Card>
      <CardHeader title="Today" action={<span className="text-[13px] text-ink-2">Goal {formatFocused(goalSeconds)}</span>} />
      <div className="flex gap-7">
        <div>
          <div className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{formatFocused(totalToday)}</div>
          <div className="text-[13px] text-ink-2">focused</div>
        </div>
        <div>
          <div className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{todayHistory.length}</div>
          <div className="text-[13px] text-ink-2">session{todayHistory.length === 1 ? "" : "s"}</div>
        </div>
      </div>
      <ProgressBar value={(totalToday / goalSeconds) * 100} className="mt-4" label="Daily focus goal" />
      {todayHistory.length ? (
        <div className="mt-3">
          {todayHistory.slice(0, 4).map((item, index) => (
            <Row key={item.id} first={index === 0} className="py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.focus_reason}</span>
              <span className="text-ink-2">{formatFocused(item.focused_seconds)}</span>
            </Row>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-ink-2">Finished sessions show up here and update the linked task.</p>
      )}
    </Card>
  );

  if (loadingSession) {
    return (
      <Page title="Focus" subtitle="One task, no distractions">
        <Card className="grid h-64 place-items-center text-sm text-ink-2">Loading focus session…</Card>
      </Page>
    );
  }

  if (session && session.status !== "completed") {
    const isBreak = session.phase === "break";
    const isBreakComplete = isBreak && session.status !== "paused" && !session.ends_at;
    const stateLabel = session.status === "paused" ? "Paused" : isBreakComplete ? "Break finished" : isBreak ? "On a break" : "Focusing";
    const clock = new Intl.DateTimeFormat(undefined, { timeZone: store.data.timezone, hour: "numeric", minute: "2-digit" }).format(now);
    const date = new Intl.DateTimeFormat(undefined, { timeZone: store.data.timezone, weekday: "long", month: "short", day: "numeric" }).format(now);

    return createPortal(
      <section aria-label="Focus session" className="fixed inset-0 z-[60] grid h-dvh grid-rows-[auto_1fr_auto] overflow-y-auto bg-bg px-5 py-5 text-ink sm:px-10 sm:py-8">
        <header className="flex items-start justify-between gap-4 text-sm text-ink-2">
          <div><div className="font-medium">{date}</div><div className="mt-1 tabular-nums">{clock}</div></div>
          <div className="text-right"><div className="font-medium text-accent">{stateLabel}</div><div className="mt-1 text-xs">Round {session.session_number} of {session.total_rounds ?? 4}</div></div>
        </header>

        <div className="flex min-h-0 flex-col items-center justify-center py-8 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-3">{isBreak ? "Taking a break from" : "Focusing on"}</p>
          <h1 className="max-w-3xl break-words text-lg font-medium sm:text-2xl">{session.focus_reason}</h1>
          <div role="timer" aria-label="Time remaining" aria-live="off" className="my-5 text-[clamp(5rem,20vw,15rem)] font-light leading-none tracking-[-0.06em] tabular-nums sm:my-8">{formatCountdown(remaining)}</div>
          <div aria-hidden="true" className="h-1 w-36 overflow-hidden rounded-full bg-track sm:w-52"><div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${progress * 100}%` }} /></div>
          <p className="mt-4 text-sm text-ink-3">{isBreakComplete ? "Ready when you are." : isBreak ? "Rest your eyes. Take a breath." : session.status === "paused" ? "Continue when you?re ready." : `${Math.ceil(session.focus_duration / 60)} minutes of focus`}</p>
        </div>

        <footer className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isBreakComplete ? <Button variant="primary" size="lg" onClick={nextSession} icon={<Play className="h-4 w-4" />}>Start next session</Button> : <Button variant="primary" size="lg" onClick={pauseOrResume} icon={session.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}>{session.status === "paused" ? "Resume" : "Pause"}</Button>}
            {isBreak ? !isBreakComplete && <Button size="lg" onClick={nextSession}>Skip break</Button> : <Button size="lg" onClick={() => void startBreak(true)} icon={<Coffee className="h-4 w-4" />}>Take a break</Button>}
            <Button variant="ghost" size="lg" aria-label={isBreak ? "End focus" : "Finish session"} onClick={() => setFinishConfirmOpen(true)} icon={<Square className="h-4 w-4" />}>End focus</Button>
          </div>
          {notice ? <p role="status" className="max-w-md text-center text-xs text-ink-2">{notice}</p> : null}
        </footer>

        <Sheet open={finishConfirmOpen} onClose={() => setFinishConfirmOpen(false)} title="Finish this focus session?" description="Your focused time is saved to Insights.">
          <div className="flex gap-3">
            <Button full onClick={() => setFinishConfirmOpen(false)}>Keep going</Button>
            <Button full variant="primary" onClick={() => { setFinishConfirmOpen(false); void finish(); }}>Finish</Button>
          </div>
        </Sheet>
      </section>, document.body
    );
  }

  return (
    <Page title="Focus" subtitle="One task, no distractions">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <form onSubmit={begin} className="grid gap-4">
            <Field label="What are you focusing on?">
              <TextInput required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Study linear algebra" />
            </Field>
            <Field label="Task or assignment (optional)" hint="Choose what to focus on. Linked tasks receive progress updates.">
              <SelectInput
                value={taskId}
                onChange={(event) => {
                  setTaskId(event.target.value);
                  const task = store.data.tasks.find((item) => item.id === event.target.value) ?? store.data.assignments.find((item) => `assignment:${item.id}` === event.target.value);
                  if (task) {
                    setReason(task.title);
                    if (task.estimatedMinutes > 0) setFocusMinutes(task.estimatedMinutes <= 20 ? 15 : task.estimatedMinutes <= 35 ? 25 : task.estimatedMinutes <= 60 ? 45 : 50);
                  }
                }}
              >
                <option value="">None</option>
                {store.data.assignments.filter((item) => item.status !== "submitted" && item.status !== "graded").map((item) => <option key={item.id} value={`assignment:${item.id}`}>Assignment: {item.title}</option>)}
                {openTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Number of breaks" hint={`${totalRounds} focus rounds with ${totalRounds - 1} breaks, then the session ends automatically.`}>
              <TextInput type="number" min={0} max={24} value={totalRounds - 1} onChange={(event) => setTotalRounds(Math.min(25, Math.max(1, Math.floor(Number(event.target.value)) + 1)))} />
            </Field>
            <DurationField label="Focus" value={focusMinutes} options={focusOptions} onChange={setFocusMinutes} />
            <DurationField label="Break" value={breakMinutes} options={breakOptions} onChange={setBreakMinutes} />
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Sound</span>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                {[
                  ["none", "Silence"],
                  ["rain", "Rain"],
                  ["brown-noise", "Brown noise"],
                  ["white-noise", "White noise"],
                  ["ambient", "Ambient"]
                ].map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={music === value} onClick={() => setMusic(value)} className={cn("h-11 rounded-xl border px-3 text-sm font-semibold", music === value ? "border-accent bg-accent-soft/60 text-accent" : "border-line hover:bg-surface-2")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <details className="rounded-xl border border-line px-3.5 py-3">
              <summary className="cursor-pointer text-sm font-semibold">More options</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SelectField label="Long break after" value={longBreakAfter} onChange={setLongBreakAfter} options={[2, 3, 4, 5].map((n) => [n, `${n} sessions`] as [number, string])} />
                <SelectField label="Long break length" value={longBreakMinutes} onChange={setLongBreakMinutes} options={[15, 20, 25, 30].map((n) => [n, `${n} min`] as [number, string])} />
                <Field label="Music link (optional)">
                  <TextInput type="url" value={musicUrl} onChange={(event) => setMusicUrl(event.target.value)} placeholder="https://…" />
                </Field>
                <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
                  <Toggle checked={autoStart} onChange={setAutoStart} label="Start the next session automatically" />
                  Start the next session automatically
                </label>
              </div>
            </details>
            <Button type="submit" variant="primary" size="lg" icon={<Play className="h-4 w-4" fill="currentColor" />}>
              Start focus
            </Button>
            {notice ? <Notice tone="amber">{notice}</Notice> : null}
          </form>
        </Card>
        <div className="grid content-start gap-5">{todayCard}</div>
      </div>
    </Page>
  );
}

function DurationField({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (value: number) => void }) {
  const [customMode, setCustomMode] = useState(false);
  const custom = customMode || !options.includes(value);
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented label={`${label} minutes`} value={custom ? "custom" : String(value)} onChange={(next) => { setCustomMode(next === "custom"); if (next !== "custom") onChange(Number(next)); }} options={[...options.map((option) => ({ value: String(option), label: `${option} min` })), { value: "custom", label: "Custom" }]} />
        {custom ? <TextInput type="number" min={1} max={240} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={`Custom ${label} minutes`} className="h-10 w-24" /> : null}
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: number; options: [number, string][]; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <SelectInput value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}
