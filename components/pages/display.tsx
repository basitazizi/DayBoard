"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCountdown, getAgenda, getUpNext, timeRangeLabel } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import { addDays, formatDisplayDate, formatDuration, formatShortTime, getDayDistance, getLocalDateKey, timeFromMinutes } from "@/lib/date-utils";
import { focusSeries } from "@/lib/findings";
import { useFocusHistory } from "@/lib/focus-history";
import { getWorkItems } from "@/lib/work";
import type { Tone } from "@/types/dayboard";
import { AppProvider, useApp } from "../app-context";

const BAR: Record<Tone, string> = { accent: "bg-[#8f7cff]", teal: "bg-[#3fc7b6]", blue: "bg-[#6aa5f5]", amber: "bg-[#ffc861]", rose: "bg-[#ff7a9a]", green: "bg-[#5dd48a]", neutral: "bg-[#8f93a8]" };

/** Wall display: large, glanceable and button-free, for an always-on screen. Always dark. */
export function DisplayPage() {
  return (
    <AppProvider>
      <DisplayView />
    </AppProvider>
  );
}

function Tile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[26px] border border-white/10 bg-white/[0.06] p-6 xl:p-7", className)}>
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8f93a8] xl:text-sm">{label}</div>
      {children}
    </div>
  );
}

function DisplayView() {
  const { store } = useApp();
  const { sessions } = useFocusHistory();
  const [now, setNow] = useState(() => new Date());
  const data = store.data;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(interval);
  }, []);

  const today = getLocalDateKey(now, data.timezone);
  const agenda = useMemo(() => getAgenda(data, today).filter((item) => !item.done), [data, today]);
  const upNext = useMemo(() => getUpNext(data, now), [data, now]);
  const dueSoon = useMemo(() => getWorkItems(data, now).filter((item) => !item.done && item.dueDate && item.dueDate <= addDays(today, 7)).slice(0, 4), [data, now, today]);
  const exam = data.exams.filter((entry) => entry.examDate >= today && entry.score === undefined).sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  const habitsDone = data.habits.filter((habit) => habit.completedToday).length;
  const focusToday = focusSeries(sessions, data.timezone, 1, now)[0]?.minutes ?? 0;
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: data.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(now);
  const [time, meridiem] = clock.split(/\s+/);

  return (
    <main className="flex min-h-dvh flex-col gap-8 bg-[radial-gradient(circle_at_20%_0%,#272060,#0d0f15_60%)] p-6 text-white sm:p-10 lg:h-dvh lg:flex-row lg:gap-12 lg:p-14" style={{ colorScheme: "dark" }}>
      <div className="flex min-w-0 flex-[1.25] flex-col justify-between gap-7">
        <div>
          <div className="text-sm font-bold uppercase tracking-[0.14em] text-[#8f93a8]">{formatDisplayDate(now, data.timezone)}</div>
          <div className="text-[clamp(5rem,15vw,12rem)] font-bold leading-none tracking-[-0.05em] tabular-nums">
            {time}
            <span className="ml-3 text-[0.28em] tracking-normal text-[#8f93a8]">{meridiem}</span>
          </div>
        </div>

        <div className="rounded-[26px] bg-gradient-to-r from-[#4b3be8] to-[#8a5cf6] p-6 xl:p-8">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/75 xl:text-sm">
            {upNext ? (upNext.happeningNow ? "Happening now" : `Up next · ${upNext.dayOffset ? "tomorrow" : `in ${formatCountdown(upNext.startsIn)}`}`) : "Up next"}
          </div>
          <div className="mb-1 mt-2 text-3xl font-bold tracking-[-0.02em] xl:text-[44px] xl:leading-tight">{upNext ? upNext.item.title : store.hydrated ? "Nothing scheduled" : "Loading…"}</div>
          <div className="text-lg text-white/85 xl:text-2xl">{upNext ? [timeRangeLabel(upNext.item), upNext.item.detail].filter(Boolean).join(" · ") : "Your schedule is clear."}</div>
        </div>

        <div className="grid grid-cols-3 gap-5 xl:gap-7">
          <Tile label="Habits">
            <div className="mt-2 text-4xl font-bold leading-none xl:text-5xl">
              {habitsDone} <span className="text-xl text-[#a9adc0] xl:text-2xl">of {data.habits.length}</span>
            </div>
            <div className="mt-1 text-base text-[#a9adc0] xl:text-lg">{data.habits.length === 0 ? "None set up" : habitsDone === data.habits.length ? "All done" : "done today"}</div>
          </Tile>
          <Tile label="Focus today">
            <div className="mt-2 text-4xl font-bold leading-none xl:text-5xl">{formatDuration(focusToday)}</div>
            <div className="mt-1 text-base text-[#a9adc0] xl:text-lg">focused</div>
          </Tile>
          <Tile label={exam ? exam.title : "Next exam"}>
            <div className="mt-2 text-4xl font-bold leading-none text-[#ffc861] xl:text-5xl">
              {exam ? getDayDistance(exam.examDate, today) : "–"} {exam ? <span className="text-xl xl:text-2xl">days</span> : null}
            </div>
            <div className="mt-1 text-base text-[#a9adc0] xl:text-lg">{exam ? "until the exam" : "None scheduled"}</div>
          </Tile>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col rounded-[26px] border border-white/10 bg-white/[0.06] p-6 xl:p-8">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8f93a8] xl:text-sm">Today</div>
        {agenda.length ? (
          agenda.slice(0, 7).map((item, index) => (
            <div key={item.key} className={cn("flex items-center gap-5 py-3.5 text-xl xl:text-2xl", index > 0 && "border-t border-white/10")}>
              <span className="w-24 shrink-0 font-semibold tabular-nums text-[#a9adc0] xl:w-28">{item.allDay ? "All day" : item.start !== undefined ? formatShortTime(timeFromMinutes(item.start)) : item.due !== undefined ? formatShortTime(timeFromMinutes(item.due)) : "Today"}</span>
              <span className={cn("h-8 w-1.5 shrink-0 rounded-full", BAR[item.tone])} />
              <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
            </div>
          ))
        ) : (
          <div className="py-4 text-xl text-[#a9adc0]">Nothing on the schedule.</div>
        )}
        <div className="flex-1" />
        {dueSoon.length ? (
          <>
            <div className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.14em] text-[#8f93a8] xl:text-sm">Due soon</div>
            {dueSoon.map((item, index) => (
              <div key={item.key} className={cn("flex items-center gap-4 py-3 text-lg xl:text-[22px]", index > 0 && "border-t border-white/10")}>
                <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
                <span className={cn("shrink-0 font-semibold", item.urgency === "rose" ? "text-[#ff7a9a]" : "text-[#a9adc0]")}>{item.dueLabel}</span>
              </div>
            ))}
          </>
        ) : null}
        <Link href="/" className="mt-4 self-end text-xs text-white/25 hover:text-white/70">
          Exit display
        </Link>
      </div>
    </main>
  );
}
