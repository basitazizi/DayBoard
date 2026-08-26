"use client";

import Link from "next/link";
import { Brain, LoaderCircle, Play, Volume2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

const choices = [
  { id: "day", label: "Brief My Day" },
  { id: "next", label: "What's Next?" },
  { id: "focus", label: "What Should I Focus On?" },
  { id: "school", label: "School Summary" },
  { id: "tomorrow", label: "Tomorrow Preview" }
] as const;

type Brief = {
  lines: string[];
  recommendation: string | null;
  recommendedTaskId: string | null;
  focusMinutes: number | null;
  spokenText: string;
  fallback: boolean;
};

export function AiBriefPanel({ open, onClose, session }: { open: boolean; onClose: () => void; session: Session | null }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);

  useEffect(() => {
    setTtsSupported("speechSynthesis" in window);
    if (!open) window.speechSynthesis?.cancel();
    return () => window.speechSynthesis?.cancel();
  }, [open]);

  if (!open) return null;

  async function requestBrief(kind: string) {
    if (!session?.access_token) {
      setError("Sign in to create a brief from your DayBoard data.");
      return;
    }
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      const response = await fetch("/api/ai-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI Brief is unavailable right now.");
      setBrief(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI Brief is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  function listen() {
    if (!brief || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(brief.spokenText);
    speech.rate = 0.95;
    window.speechSynthesis.speak(speech);
  }

  const focusHref = brief?.recommendedTaskId ? `/focus?task=${encodeURIComponent(brief.recommendedTaskId)}` : "/focus";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/20 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ai-brief-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="w-full max-w-xl rounded-2xl border border-[#dcdcdc] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.14)] sm:p-7">
        <div className="flex items-start justify-between gap-5">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6" strokeWidth={1.8} />
            <div>
              <h2 id="ai-brief-title" className="text-xl font-semibold">AI Brief</h2>
              <p className="mt-1 text-sm text-[#666]">A short brief using only your DayBoard data.</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dedede]" aria-label="Close AI Brief"><X className="h-4 w-4" /></button>
        </div>

        {!session ? (
          <div className="mt-6 rounded-xl border border-[#e0e0e0] p-5">
            <p className="text-sm text-[#555]">Sign in so the brief can securely read your own DayBoard records.</p>
            <Link href="/login" className="mt-4 inline-flex rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white">Sign In</Link>
          </div>
        ) : !brief && !loading ? (
          <div className="mt-6 grid gap-2">
            {choices.map((choice) => <button key={choice.id} onClick={() => void requestBrief(choice.id)} className="flex w-full items-center justify-between rounded-xl border border-[#dedede] px-4 py-3.5 text-left text-sm font-medium hover:bg-[#fafafa]"><span>{choice.label}</span><span aria-hidden="true">→</span></button>)}
          </div>
        ) : null}

        {loading ? <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[#666]"><LoaderCircle className="h-5 w-5 animate-spin" />Reading your DayBoard…</div> : null}
        {error ? <div className="mt-6 rounded-xl border border-[#e0e0e0] p-4 text-sm"><p>{error}</p><button onClick={() => { setError(null); setBrief(null); }} className="mt-3 font-semibold">Try again</button></div> : null}

        {brief ? (
          <div className="mt-6">
            {brief.fallback ? <div className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-[#666]">Factual fallback</div> : null}
            <div className="space-y-3 text-[1.02rem] leading-7">{brief.lines.map((line, index) => <p key={index}>{line}</p>)}</div>
            {brief.recommendation ? <div className="mt-5 rounded-xl border border-[#dcdcdc] p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#666]">Recommended</div><p className="mt-2 font-medium leading-6">{brief.recommendation}</p></div> : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={listen} disabled={!ttsSupported} className="inline-flex items-center gap-2 rounded-lg border border-[#dcdcdc] px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><Volume2 className="h-4 w-4" />Listen</button>
              <Link href={focusHref} onClick={onClose} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white"><Play className="h-4 w-4" />Start Focus{brief.focusMinutes ? ` · ${brief.focusMinutes}m` : ""}</Link>
              <button onClick={() => { window.speechSynthesis?.cancel(); setBrief(null); }} className="rounded-lg border border-[#dcdcdc] px-4 py-2.5 text-sm font-semibold">Another brief</button>
              <button onClick={onClose} className="px-3 py-2.5 text-sm font-semibold">Close</button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
