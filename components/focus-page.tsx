"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipForward, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_HISTORY_CHANGED_EVENT, saveGuestFocusSession } from "@/lib/focus-history";
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
  const [breakFrequency, setBreakFrequency] = useState(1);
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

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function persist(next: FocusSession) {
    setSession(next);
    localStorage.setItem("dayboard-focus-session", JSON.stringify(next));
    if (next.user_id === "local") return;
    const { error } = await supabase.from("focus_sessions").update(next).eq("id", next.id).eq("user_id", next.user_id);
    if (error) setNotice("Saved on this device; shared sync is temporarily unavailable.");
  }

  async function begin(event: FormEvent) {
    event.preventDefault();
    const title = reason.trim() || requestedTask?.title || "";
    if (!title || focusMinutes <= 0 || breakMinutes <= 0 || longBreakMinutes <= 0) {
      setNotice("Add a focus reason and valid positive durations.");
      return;
    }
    setNotice(null);
    const started = new Date();
    const draft = {
      user_id: "local",
      task_id: taskId || null,
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
    if (!session) return;
    if (session.status === "paused") {
      const remaining = session.remaining_seconds ?? session.focus_duration;
      await persist({ ...session, status: session.phase === "focus" ? "focusing" : "break", paused_at: null, segment_started_at: new Date().toISOString(), ends_at: new Date(Date.now() + remaining * 1000).toISOString(), remaining_seconds: null, updated_at: new Date().toISOString() });
      void audioRef.current?.play().catch(() => undefined);
      void audioContextRef.current?.resume();
    } else {
      const remaining = getFocusRemaining(session);
      const elapsed = session.phase === "focus" ? Math.max(0, Math.floor((Date.now() - new Date(session.segment_started_at).getTime()) / 1000)) : 0;
      audioRef.current?.pause();
      void audioContextRef.current?.suspend();
      await persist({ ...session, status: "paused", paused_at: new Date().toISOString(), remaining_seconds: remaining, ends_at: null, focused_seconds: session.focused_seconds + elapsed, updated_at: new Date().toISOString() });
    }
  }

  async function finish() {
    if (!session) return;
    audioRef.current?.pause();
    noiseRef.current?.stop();
    void audioContextRef.current?.close();
    const remaining = getFocusRemaining(session);
    const additional = session.phase === "focus" && session.status !== "paused" ? Math.max(0, Math.floor((Date.now() - new Date(session.segment_started_at).getTime()) / 1000)) : 0;
    const focused = session.focused_seconds + additional;
    const ended = new Date().toISOString();
    const completed = { ...session, status: "completed" as const, ends_at: ended, focused_seconds: focused, remaining_seconds: 0, updated_at: ended };
    await persist(completed);
    if (session.user_id !== "local" && focused > 0) {
      await supabase.from("task_sessions").upsert({ user_id: session.user_id, task_id: session.task_id, focus_session_id: session.id, start_time: session.created_at, end_time: ended, duration: focused, type: "focus" }, { onConflict: "focus_session_id" });
    }
    localStorage.removeItem("dayboard-focus-session");
    setHistory((items) => [{ id: session.id, focus_reason: session.focus_reason, focused_seconds: focused, created_at: session.created_at }, ...items]);
    if (session.user_id === "local" && focused > 0) saveGuestFocusSession({ id: session.id, reason: session.focus_reason, startedAt: session.created_at, focusedSeconds: focused });
    else window.dispatchEvent(new Event(FOCUS_HISTORY_CHANGED_EVENT));
    const linkedTask = store.data.tasks.find((task) => task.id === session.task_id);
    if (linkedTask && linkedTask.status !== "completed" && !linkedTask.steps?.length && linkedTask.estimatedMinutes > 0 && focused > 0) {
      store.updateTask(linkedTask.id, { progressPercent: Math.min(95, Math.round(linkedTask.progressPercent + (focused / 60 / linkedTask.estimatedMinutes) * 100)) });
    }
    setSession(null);
  }

  async function startBreak() {
    if (!session) return;
    const long = session.session_number % session.long_break_after === 0;
    if (!long && session.session_number % session.break_frequency !== 0) {
      await nextSession();
      return;
    }
    const duration = long ? session.long_break_duration : session.break_duration;
    const completedSegment = Math.max(0, Math.floor((Date.now() - new Date(session.segment_started_at).getTime()) / 1000));
    await persist({ ...session, phase: "break", status: "break", segment_started_at: new Date().toISOString(), ends_at: new Date(Date.now() + duration * 1000).toISOString(), remaining_seconds: null, focused_seconds: session.focused_seconds + completedSegment, updated_at: new Date().toISOString() });
  }

  async function nextSession() {
    if (!session) return;
    const justCompletedFocus = session.phase === "focus" && getFocusRemaining(session) === 0;
    const completedSegment = justCompletedFocus ? Math.max(0, Math.floor((Date.now() - new Date(session.segment_started_at).getTime()) / 1000)) : 0;
    await persist({ ...session, phase: "focus", status: "focusing", session_number: session.session_number + 1, segment_started_at: new Date().toISOString(), ends_at: new Date(Date.now() + session.focus_duration * 1000).toISOString(), remaining_seconds: null, focused_seconds: session.focused_seconds + completedSegment, updated_at: new Date().toISOString() });
  }

  const remaining = getFocusRemaining(session);
  const phaseDuration = session?.phase === "break" ? (session.session_number % session.long_break_after === 0 ? session.long_break_duration : session.break_duration) : session?.focus_duration ?? 1;
  const progress = Math.min(1, Math.max(0, remaining / Math.max(phaseDuration, 1)));

  useEffect(() => {
    if (!session || session.status === "paused" || remaining > 0 || (session.phase === "break" && !session.ends_at)) return;
    if (session.phase === "focus") {
      void startBreak();
    } else if (session.auto_start) {
      void nextSession();
    } else {
      void persist({ ...session, status: "break", ends_at: null, remaining_seconds: 0, updated_at: new Date().toISOString() });
    }
  }, [remaining, session?.id, session?.status]);

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
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const isBreak = session.phase === "break";
    const isBreakComplete = isBreak && !session.ends_at;
    const linkedTask = store.data.tasks.find((task) => task.id === session.task_id);
    const stateLabel = session.status === "paused" ? "Paused" : isBreakComplete ? "Break finished" : isBreak ? "Break" : "Focusing";

    return (
      <Page title="Focus" subtitle="One task, no distractions">
        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <section className="flex min-h-[560px] flex-col items-center justify-center gap-5 rounded-card bg-[radial-gradient(circle_at_50%_35%,#2a2468,#14161c_72%)] px-5 py-8 text-center text-white shadow-card">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
              {stateLabel} · session {session.session_number}
            </span>
            <div className="relative h-[min(70vw,320px)] w-[min(70vw,320px)]">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" role="img" aria-label={`${formatCountdown(remaining)} remaining`}>
                <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="4" className="stroke-white/15" />
                <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} className="stroke-[#8f7cff] transition-[stroke-dashoffset] duration-700 ease-linear" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[clamp(3.2rem,15vw,5.25rem)] font-bold leading-none tracking-[-0.04em] tabular-nums">{formatCountdown(remaining)}</div>
                <div className="mt-2 text-sm text-[#b9b4e8]">of {Math.ceil(phaseDuration / 60)}:00</div>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold">{isBreak ? "Stand up. Drink water. Rest your eyes." : session.focus_reason}</h2>
              {linkedTask && !isBreak ? <p className="text-[#b9b4e8]">{linkedTask.steps?.length ? `Step ${Math.min(linkedTask.steps.filter((step) => step.done).length + 1, linkedTask.steps.length)} of ${linkedTask.steps.length}` : "Linked task"}</p> : null}
            </div>
            {isBreakComplete ? (
              <Button variant="hero" size="lg" onClick={nextSession} icon={<Play className="h-4 w-4" />}>
                Start next session
              </Button>
            ) : isBreak ? (
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="heroGhost" size="lg" onClick={nextSession}>
                  Skip break
                </Button>
                <Button variant="hero" size="lg" onClick={() => setFinishConfirmOpen(true)}>
                  End focus
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button type="button" aria-label="Finish session" onClick={() => setFinishConfirmOpen(true)} className="grid h-14 w-14 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                  <Square className="h-5 w-5" />
                </button>
                <button type="button" aria-label={session.status === "paused" ? "Resume" : "Pause"} onClick={pauseOrResume} className="grid h-[76px] w-[76px] place-items-center rounded-full bg-white text-[#14161c]">
                  {session.status === "paused" ? <Play className="h-7 w-7" fill="currentColor" /> : <Pause className="h-7 w-7" fill="currentColor" />}
                </button>
                <button type="button" aria-label="Skip to break" onClick={() => void startBreak()} className="grid h-14 w-14 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>
            )}
            {notice ? <p className="max-w-md text-sm text-[#b9b4e8]">{notice}</p> : null}
          </section>

          <div className="grid content-start gap-5">
            <Card>
              <CardHeader title="This session" />
              <Row first className="py-2.5 text-sm">
                <span className="flex-1 text-ink-2">Focus length</span>
                <span className="font-semibold">{Math.round(session.focus_duration / 60)} min</span>
              </Row>
              <Row className="py-2.5 text-sm">
                <span className="flex-1 text-ink-2">Break</span>
                <span className="font-semibold">{Math.round(session.break_duration / 60)} min</span>
              </Row>
              <Row className="py-2.5 text-sm">
                <span className="flex-1 text-ink-2">Long break after</span>
                <span className="font-semibold">{session.long_break_after} sessions</span>
              </Row>
              <Row className="py-2.5 text-sm">
                <span className="flex-1 text-ink-2">Sound</span>
                <span className="font-semibold capitalize">{session.music_url ? "Your music" : session.music.replace("-", " ")}</span>
              </Row>
            </Card>
            {todayCard}
          </div>
        </div>

        <Sheet open={finishConfirmOpen} onClose={() => setFinishConfirmOpen(false)} title="Finish this focus session?" description="Your focused time is saved and the linked task is updated.">
          <div className="flex gap-3">
            <Button full onClick={() => setFinishConfirmOpen(false)}>
              Keep going
            </Button>
            <Button
              full
              variant="primary"
              onClick={() => {
                setFinishConfirmOpen(false);
                void finish();
              }}
            >
              Finish
            </Button>
          </div>
        </Sheet>
      </Page>
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
            <Field label="Link to a task (optional)" hint="Finishing the session updates the task's progress.">
              <SelectInput
                value={taskId}
                onChange={(event) => {
                  setTaskId(event.target.value);
                  const task = store.data.tasks.find((item) => item.id === event.target.value);
                  if (task) {
                    setReason(task.title);
                    if (task.estimatedMinutes > 0) setFocusMinutes(task.estimatedMinutes <= 20 ? 15 : task.estimatedMinutes <= 35 ? 25 : task.estimatedMinutes <= 60 ? 45 : 50);
                  }
                }}
              >
                <option value="">None</option>
                {openTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </SelectInput>
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
                <SelectField label="Take a break" value={breakFrequency} onChange={setBreakFrequency} options={[1, 2, 3, 4].map((n) => [n, n === 1 ? "After every session" : `After ${n} sessions`] as [number, string])} />
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
  const custom = !options.includes(value);
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented label={`${label} minutes`} value={custom ? "custom" : String(value)} onChange={(next) => onChange(next === "custom" ? options[0] + 1 : Number(next))} options={[...options.map((option) => ({ value: String(option), label: `${option} min` })), { value: "custom", label: "Custom" }]} />
        {custom ? <TextInput type="number" min={1} max={240} value={value} onChange={(event) => onChange(Math.max(1, Number(event.target.value)))} aria-label={`Custom ${label} minutes`} className="h-10 w-24" /> : null}
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
