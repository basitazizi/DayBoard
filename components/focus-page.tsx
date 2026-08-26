"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, Square } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getFocusRemaining } from "@/lib/focus-session";
import { useDayBoardData } from "@/lib/local-data";
import type { FocusHistoryItem, FocusSession } from "@/types/focus";

const focusOptions = [15, 25, 30, 45, 50, 60, 90];
const breakOptions = [5, 10, 15, 20];

function formatCountdown(total: number) {
  const safe = Math.max(0, total);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function formatFocused(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function localSession(): FocusSession | null {
  try { return JSON.parse(localStorage.getItem("dayboard-focus-session") ?? "null") as FocusSession | null; } catch { return null; }
}

export function FocusPage() {
  const searchParams = useSearchParams();
  const store = useDayBoardData();
  const requestedTask = store.data.tasks.find((task) => task.id === searchParams.get("task"));
  const [session, setSession] = useState<FocusSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [history, setHistory] = useState<FocusHistoryItem[]>([]);
  const [now, setNow] = useState(new Date());
  const [reason, setReason] = useState("");
  const [taskId, setTaskId] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(50);
  const [breakMinutes, setBreakMinutes] = useState(10);
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

  if (loadingSession) {
    return <main className="flex min-h-dvh items-center justify-center bg-white text-sm text-[#666]">Loading focus session…</main>;
  }

  if (session && session.status !== "completed") {
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const isBreak = session.phase === "break";
    const isBreakComplete = isBreak && !session.ends_at;
    return (
      <main className="focus-screen relative flex min-h-dvh flex-col items-center justify-center bg-white px-5 py-8 text-center text-[#111111]">
        <div className="absolute right-5 top-5 text-sm font-medium sm:right-8 sm:top-7">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
        <Link href="/" className="absolute left-5 top-5 inline-flex items-center gap-2 text-sm text-[#666] sm:left-8 sm:top-7"><ArrowLeft className="h-4 w-4" /> Exit</Link>
        <div className="mb-5 text-sm font-semibold tracking-[0.24em]">{session.status === "paused" ? "PAUSED" : isBreakComplete ? "BREAK COMPLETE" : isBreak ? "BREAK" : "FOCUS"}</div>
        <h1 className="max-w-2xl text-2xl font-semibold sm:text-3xl">{isBreak ? "Stand up. Drink water. Rest your eyes." : session.focus_reason}</h1>
        {session.task_id ? <div className="mt-2 text-sm text-[#666]">Linked task</div> : null}
        <div className="relative my-7 h-[min(78vw,440px)] w-[min(78vw,440px)]">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-label={`${formatCountdown(remaining)} remaining`}>
            <circle className="focus-ring-track" cx="50" cy="50" r={radius} fill="none" strokeWidth="2" />
            <circle className="focus-ring-progress" cx="50" cy="50" r={radius} fill="none" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[clamp(3.4rem,12vw,7rem)] font-semibold leading-none tabular-nums">{formatCountdown(remaining)}</div>
            <div className="mt-3 text-sm text-[#666]">of {Math.ceil(phaseDuration / 60)} minutes</div>
          </div>
        </div>
        {isBreakComplete ? (
          <button onClick={nextSession} className="rounded-lg bg-black px-7 py-3 font-medium text-white"><Play className="mr-2 inline h-4 w-4" />Start Next Session</button>
        ) : isBreak ? (
          <div className="flex gap-3"><button onClick={nextSession} className="rounded-lg border border-[#dcdcdc] px-6 py-3 font-medium">Skip Break</button><button onClick={() => setFinishConfirmOpen(true)} className="rounded-lg bg-black px-6 py-3 font-medium text-white">End Focus</button></div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row"><button onClick={pauseOrResume} className="rounded-lg bg-black px-7 py-3 font-medium text-white">{session.status === "paused" ? <Play className="mr-2 inline h-4 w-4" /> : <Pause className="mr-2 inline h-4 w-4" />}{session.status === "paused" ? "Resume" : "Pause"}</button><button onClick={() => setFinishConfirmOpen(true)} className="rounded-lg border border-[#dcdcdc] px-7 py-3 font-medium"><Square className="mr-2 inline h-4 w-4" />Finish Session</button></div>
        )}
        <div className="mt-7 text-sm text-[#666]">Session {session.session_number} of {session.long_break_after} · Next break: {Math.ceil(session.break_duration / 60)} min{session.music !== "none" ? ` · ${session.music}` : ""}</div>
        {notice ? <div className="mt-4 max-w-md text-sm text-[#666]">{notice}</div> : null}
        {finishConfirmOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="presentation" onMouseDown={() => setFinishConfirmOpen(false)}><div className="card w-full max-w-sm p-6 text-left" role="dialog" aria-modal="true" aria-labelledby="finish-focus-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="finish-focus-title" className="text-xl font-semibold">Finish this focus session?</h2><p className="mt-2 text-sm text-[#666]">Your actual focused time will be saved.</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setFinishConfirmOpen(false)} className="rounded-lg border border-[#dcdcdc] px-4 py-2 font-medium">Cancel</button><button onClick={() => { setFinishConfirmOpen(false); void finish(); }} className="rounded-lg bg-black px-4 py-2 font-medium text-white">Finish</button></div></div></div> : null}
      </main>
    );
  }

  const today = new Date().toDateString();
  const todayHistory = history.filter((item) => new Date(item.created_at).toDateString() === today);
  const totalToday = todayHistory.reduce((sum, item) => sum + item.focused_seconds, 0);
  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-[#111111] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between"><Link href="/" className="inline-flex items-center gap-2 text-sm text-[#666]"><ArrowLeft className="h-4 w-4" />Dashboard</Link><div className="text-sm font-medium">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div>
        <div className="mt-10"><div className="text-sm font-semibold tracking-[0.2em]">FOCUS</div><h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Start a distraction-free session.</h1></div>
        <form onSubmit={begin} className="mt-8 card grid gap-5 p-5 sm:p-7">
          <label><span className="text-sm font-medium">What are you focusing on?</span><input required value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-lg border border-[#dcdcdc] px-3 py-3 outline-none focus:border-black" placeholder="Study Linear Algebra" /></label>
          <label><span className="text-sm font-medium">Optional linked task</span><select value={taskId} onChange={(e) => { setTaskId(e.target.value); const task = store.data.tasks.find((item) => item.id === e.target.value); if (task) setReason(task.title); }} className="mt-2 w-full rounded-lg border border-[#dcdcdc] px-3 py-3"><option value="">None</option>{store.data.tasks.filter((task) => task.status !== "completed").map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <DurationField label="Focus Time" value={focusMinutes} options={focusOptions} onChange={setFocusMinutes} />
          <DurationField label="Break Time" value={breakMinutes} options={breakOptions} onChange={setBreakMinutes} />
          <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Break Frequency" value={breakFrequency} onChange={setBreakFrequency} options={[1,2,3,4].map((n) => [n, n === 1 ? "After every session" : `After ${n} sessions`] as [number,string])} /><DurationField label="Long Break" value={longBreakMinutes} options={[15,20,25,30]} onChange={setLongBreakMinutes} /></div>
          <SelectField label="Long break after" value={longBreakAfter} onChange={setLongBreakAfter} options={[2,3,4,5].map((n) => [n, `${n} sessions`] as [number,string])} />
          <div className="grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-medium">Music / Focus Sound</span><select value={music} onChange={(e) => setMusic(e.target.value)} className="mt-2 w-full rounded-lg border border-[#dcdcdc] px-3 py-3"><option value="none">None</option><option value="rain">Rain</option><option value="brown-noise">Brown Noise</option><option value="white-noise">White Noise</option><option value="ambient">Ambient</option></select></label><label><span className="text-sm font-medium">Music URL</span><input type="url" value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} className="mt-2 w-full rounded-lg border border-[#dcdcdc] px-3 py-3" placeholder="https://…" /></label></div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} className="h-5 w-5 accent-black" /> Automatically start after breaks</label>
          <button className="mt-1 rounded-lg bg-black px-6 py-3.5 font-semibold text-white"><Play className="mr-2 inline h-4 w-4" />Start Focus</button>
          {notice ? <p className="text-sm text-[#666]">{notice}</p> : null}
        </form>
        <section className="mt-8 border-t border-[#e5e5e5] pt-7"><div className="flex items-end justify-between"><div><div className="text-sm font-semibold uppercase tracking-wider">Today</div><div className="mt-2 text-2xl font-semibold">{formatFocused(totalToday)} Focused</div></div><div className="text-sm text-[#666]">{todayHistory.length} Sessions</div></div><div className="mt-5 space-y-3">{todayHistory.slice(0,5).map((item) => <div key={item.id} className="flex justify-between border-b border-[#e5e5e5] pb-3"><span>{item.focus_reason}</span><span className="text-[#666]">{formatFocused(item.focused_seconds)}</span></div>)}</div></section>
      </div>
    </main>
  );
}

function DurationField({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (value: number) => void }) {
  const custom = !options.includes(value);
  return <label><span className="text-sm font-medium">{label}</span><div className="mt-2 flex gap-2"><select value={custom ? "custom" : value} onChange={(e) => e.target.value !== "custom" && onChange(Number(e.target.value))} className="min-w-0 flex-1 rounded-lg border border-[#dcdcdc] px-3 py-3">{options.map((n) => <option key={n} value={n}>{n} min</option>)}<option value="custom">Custom</option></select>{custom ? <input type="number" min="1" value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value)))} className="w-24 rounded-lg border border-[#dcdcdc] px-3" aria-label={`Custom ${label} minutes`} /> : <button type="button" onClick={() => onChange(options[0] + 1)} className="rounded-lg border border-[#dcdcdc] px-3 text-sm">Custom</button>}</div></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: number; options: [number,string][]; onChange: (value: number) => void }) {
  return <label><span className="text-sm font-medium">{label}</span><select value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full rounded-lg border border-[#dcdcdc] px-3 py-3">{options.map(([key,text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
