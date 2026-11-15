"use client";

import { AlertTriangle, BarChart3, CalendarDays, Flame, GraduationCap, Moon, Sparkles, Sun, Target } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, formatDuration, getLocalDateKey, weekdayOf } from "@/lib/date-utils";
import { focusSeries, getFindings, type Finding } from "@/lib/findings";
import { useFocusHistory } from "@/lib/focus-history";
import { useTheme } from "@/lib/theme";
import { getWorkItems } from "@/lib/work";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { Button, Card, CardHeader, EmptyState, IconTile, Label, ProgressBar, Segmented, TONE } from "../ui";

type Range = "7" | "30";

const FINDING_ICON: Record<Finding["icon"], ReactNode> = {
  school: <GraduationCap className="h-5 w-5" />,
  moon: <Moon className="h-5 w-5" />,
  sun: <Sun className="h-5 w-5" />,
  flame: <Flame className="h-5 w-5" />,
  alert: <AlertTriangle className="h-5 w-5" />,
  target: <Target className="h-5 w-5" />,
  calendar: <CalendarDays className="h-5 w-5" />
};

function Stat({ label, value, note, good }: { label: string; value: string; note: string; good?: boolean }) {
  return (
    <Card>
      <Label>{label}</Label>
      <div className="mb-1 mt-2 text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[30px]">{value}</div>
      <div className={cn("text-[13px]", good ? "font-semibold text-green" : "text-ink-2")}>{note}</div>
    </Card>
  );
}

export function InsightsPage() {
  const { store, now } = useApp();
  const { prefs } = useTheme();
  const { sessions } = useFocusHistory();
  const data = store.data;
  const [range, setRange] = useState<Range>("7");
  const days = Number(range);
  const today = getLocalDateKey(now, data.timezone);
  const start = addDays(today, 1 - days);
  const previousStart = addDays(start, -days);

  const series = useMemo(() => focusSeries(sessions, data.timezone, days * 2, now), [sessions, data.timezone, days, now]);
  const current = series.slice(days);
  const focusMinutes = current.reduce((sum, day) => sum + day.minutes, 0);
  const previousMinutes = series.slice(0, days).reduce((sum, day) => sum + day.minutes, 0);
  const focusChange = previousMinutes > 0 ? Math.round(((focusMinutes - previousMinutes) / previousMinutes) * 100) : null;

  const finished = data.tasks.filter((task) => task.status === "completed" && task.completedAt && getLocalDateKey(new Date(task.completedAt), data.timezone) >= start);
  const finishedBefore = data.tasks.filter((task) => {
    if (task.status !== "completed" || !task.completedAt) return false;
    const key = getLocalDateKey(new Date(task.completedAt), data.timezone);
    return key >= previousStart && key < start;
  }).length;
  const withDue = finished.filter((task) => task.dueDate);
  const onTime = withDue.filter((task) => getLocalDateKey(new Date(task.completedAt!), data.timezone) <= task.dueDate!).length;

  const window = Array.from({ length: days }, (_, index) => addDays(start, index));
  const habitRequired = data.habits.reduce((sum, habit) => sum + window.filter((date) => habit.scheduleType !== "scheduled" || habit.targetDays.includes(weekdayOf(date))).length, 0);
  const habitDone = data.habitLogs.filter((log) => log.completed && log.date >= start && log.date <= today && data.habits.some((habit) => habit.id === log.habitId)).length;

  const findings = useMemo(() => getFindings(data, sessions, now), [data, sessions, now]);
  const workload = useMemo(() => {
    const open = getWorkItems(data, now).filter((item) => !item.done);
    const groups = new Map<string, { label: string; minutes: number; tone: (typeof open)[number]["tone"] }>();
    for (const item of open) {
      const key = item.courseId ?? item.courseLabel;
      const entry = groups.get(key) ?? { label: item.courseLabel, minutes: 0, tone: item.tone === "neutral" ? "accent" : item.tone };
      entry.minutes += item.estimatedMinutes || 30;
      groups.set(key, entry);
    }
    return [...groups.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6);
  }, [data, now]);

  const hasAnything = data.tasks.length + data.habits.length + data.assignments.length + data.exams.length + sessions.length > 0;
  const peak = Math.max(prefs.focusGoalMinutes, ...current.map((day) => day.minutes), 1);
  const best = current.reduce((top, day) => (day.minutes > top.minutes ? day : top), current[0]);
  const chartDays = days === 7 ? current : current.filter((_, index) => index % 1 === 0);

  return (
    <Page
      title="Insights"
      subtitle="What your week is telling you"
      toolbar={
        <Segmented
          label="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" }
          ]}
        />
      }
    >
      {!hasAnything ? (
        <Card>
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Insights appear as you use DayBoard" body="Finish a few tasks, check in on a habit or run a focus session, and this page starts telling you what it sees." action={<Button variant="primary" href="/focus">Start a focus session</Button>} />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-5 xl:grid-cols-4">
            <Stat label="Focus time" value={formatDuration(focusMinutes)} note={focusChange === null ? "No earlier period to compare" : `${focusChange >= 0 ? "↑" : "↓"} ${Math.abs(focusChange)}% vs the ${days} days before`} good={focusChange !== null && focusChange > 0} />
            <Stat label="Tasks finished" value={String(finished.length)} note={finished.length - finishedBefore === 0 ? "Same as before" : `${finished.length > finishedBefore ? "↑" : "↓"} ${Math.abs(finished.length - finishedBefore)} vs before`} good={finished.length > finishedBefore} />
            <Stat label="On-time rate" value={withDue.length ? `${Math.round((onTime / withDue.length) * 100)}%` : "–"} note={withDue.length ? `${withDue.length - onTime} late of ${withDue.length}` : "No dated tasks finished"} />
            <Stat label="Habit consistency" value={habitRequired ? `${Math.min(100, Math.round((habitDone / habitRequired) * 100))}%` : "–"} note={habitRequired ? `${habitDone} of ${habitRequired} check-ins` : "No habits yet"} />
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader title="Focus time by day" action={<span className="text-[13px] text-ink-2">Goal {formatDuration(prefs.focusGoalMinutes)} a day</span>} />
              <div className="flex h-44 items-end gap-1 sm:gap-2" role="img" aria-label={`Focus minutes for each of the last ${days} days. Best day: ${formatDuration(best.minutes)}.`}>
                {chartDays.map((day) => (
                  <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${day.date}: ${formatDuration(day.minutes)}`}>
                    {days === 7 ? <span className="text-xs font-semibold">{day.minutes ? formatDuration(day.minutes) : ""}</span> : null}
                    <span className={cn("w-full max-w-[46px] rounded-t-lg rounded-b-[3px]", day.minutes === 0 ? "bg-track" : day.date === best.date ? "bg-accent" : "bg-accent/35")} style={{ height: `${Math.max(day.minutes === 0 ? 2 : 6, (day.minutes / peak) * (days === 7 ? 78 : 96))}%` }} />
                    {days === 7 ? <span className={cn("text-xs font-semibold", day.date === today ? "text-accent" : "text-ink-3")}>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${day.date}T12:00:00`))}</span> : null}
                  </div>
                ))}
              </div>
              {days !== 7 ? (
                <div className="mt-2 flex justify-between text-xs font-semibold text-ink-3">
                  <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${start}T12:00:00`))}</span>
                  <span>Today</span>
                </div>
              ) : null}
            </Card>

            <Card>
              <CardHeader title="Open work by class" />
              {workload.length ? (
                <div className="grid gap-3.5">
                  {workload.map((entry) => (
                    <div key={entry.label}>
                      <div className="mb-1.5 flex items-center gap-2 text-sm">
                        <span className={cn("h-2.5 w-2.5 rounded-[3px]", TONE[entry.tone].solid)} />
                        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                        <span className="font-semibold">{formatDuration(entry.minutes)}</span>
                      </div>
                      <ProgressBar value={(entry.minutes / workload[0].minutes) * 100} tone={entry.tone} label={`${entry.label} open work`} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-sm text-ink-2">No open work. Everything is finished.</p>
              )}
            </Card>
          </div>

          <Label className="mb-2.5">What this means</Label>
          {findings.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {findings.map((finding) => (
                <Card ai key={finding.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <IconTile tone={finding.tone}>{FINDING_ICON[finding.icon]}</IconTile>
                    <h2 className="font-semibold leading-snug">{finding.title}</h2>
                  </div>
                  <p className="flex-1 text-ink-2">{finding.body}</p>
                  {finding.action ? (
                    <Button size="sm" href={finding.action.href} className="self-start">
                      {finding.action.label}
                    </Button>
                  ) : null}
                </Card>
              ))}
            </div>
          ) : (
            <Card ai className="flex items-center gap-3">
              <IconTile tone="accent" solid>
                <Sparkles className="h-5 w-5" />
              </IconTile>
              <p className="text-ink-2">Nothing stands out yet. Patterns show up after a week or two of tasks, habits and focus sessions.</p>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
