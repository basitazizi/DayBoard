"use client";

import { BookOpen, Check, Droplets, Dumbbell, Flame, Leaf, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, getLocalDateKey, getWeekStart, weekdayOf } from "@/lib/date-utils";
import { getFindings } from "@/lib/findings";
import type { Habit, Tone } from "@/types/dayboard";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { Button, Card, CardHeader, EmptyState, IconTile, Label, Ring, TONE } from "../ui";

const ICONS: Record<Habit["icon"], ReactNode> = {
  dumbbell: <Dumbbell className="h-5 w-5" />,
  book: <BookOpen className="h-5 w-5" />,
  droplet: <Droplets className="h-5 w-5" />,
  leaf: <Leaf className="h-5 w-5" />,
  target: <Target className="h-5 w-5" />
};
const ICON_TONE: Record<Habit["icon"], Tone> = { dumbbell: "green", book: "accent", droplet: "blue", leaf: "teal", target: "amber" };
const HEAT = ["bg-track", "bg-green/30", "bg-green/60", "bg-green"];

export function HabitsPage() {
  const { store, now, openQuickAdd, showToast } = useApp();
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index - 6)), [today]);
  const done = useMemo(() => new Set(data.habitLogs.filter((log) => log.completed).map((log) => `${log.habitId}|${log.date}`)), [data.habitLogs]);

  const required = (habit: Habit, date: string) => habit.scheduleType !== "scheduled" || habit.targetDays.includes(weekdayOf(date));
  const weekRequired = data.habits.reduce((sum, habit) => sum + week.filter((date) => required(habit, date)).length, 0);
  const weekDone = data.habits.reduce((sum, habit) => sum + week.filter((date) => required(habit, date) && done.has(`${habit.id}|${date}`)).length, 0);
  const consistency = weekRequired ? Math.round((weekDone / weekRequired) * 100) : 0;

  const heatmap = useMemo(() => {
    const end = addDays(today, 6 - ((weekdayOf(today) - getWeekStart() + 7) % 7));
    return Array.from({ length: 35 }, (_, index) => {
      const date = addDays(end, index - 34);
      const count = data.habits.filter((habit) => done.has(`${habit.id}|${date}`)).length;
      const share = data.habits.length ? count / data.habits.length : 0;
      return { date, future: date > today, level: share === 0 ? 0 : share < 0.5 ? 1 : share < 1 ? 2 : 3, count };
    });
  }, [data.habits, done, today]);

  const pattern = useMemo(() => getFindings(data, [], now).find((finding) => finding.id === "habit-missed"), [data, now]);
  const bestStreak = Math.max(0, ...data.habits.map((habit) => habit.streak));

  return (
    <Page
      title="Habits"
      subtitle="Small things, done most days"
      toolbar={
        <Button variant="primary" className="ml-auto" onClick={() => openQuickAdd({ mode: "form", kind: "habit" })} icon={<Plus className="h-4 w-4" />}>
          Habit
        </Button>
      }
    >
      {data.habits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title="No habits yet"
            body="Add one, or just say it: “remind me to stretch every morning”."
            action={
              <Button variant="primary" onClick={() => openQuickAdd({ mode: "form", kind: "habit" })} icon={<Plus className="h-4 w-4" />}>
                Add a habit
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <Card>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="flex-1 text-base font-semibold">Last 7 days</h2>
              <div className="flex gap-1.5 sm:gap-2.5">
                {week.map((date) => (
                  <span key={date} className={cn("w-7 text-center text-[11px] font-bold uppercase sm:w-[30px]", date === today ? "text-accent" : "text-ink-3")}>
                    {"SMTWTFS"[weekdayOf(date)]}
                  </span>
                ))}
              </div>
              <span className="hidden w-[104px] sm:block" />
            </div>
            {data.habits.map((habit, index) => {
              const tone = ICON_TONE[habit.icon];
              return (
                <div key={habit.id} className={cn("flex flex-wrap items-center gap-3 py-3.5 sm:flex-nowrap", index > 0 && "border-t border-line")}>
                  <IconTile tone={tone}>{ICONS[habit.icon]}</IconTile>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{habit.name}</div>
                    <div className="flex items-center gap-1 text-[13px] text-ink-2">
                      {habit.streak > 0 ? <Flame className="h-3.5 w-3.5 text-amber" /> : null}
                      {habit.streak > 0 ? `${habit.streak} day streak` : habit.scheduleType === "weekly" ? `${habit.targetTimesPerWeek ?? 3} times a week` : "Start a streak today"}
                    </div>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2.5">
                    {week.map((date) => {
                      const isDone = done.has(`${habit.id}|${date}`);
                      const needed = required(habit, date);
                      return (
                        <button
                          key={date}
                          type="button"
                          aria-label={`${habit.name} on ${date}: ${isDone ? "done" : "not done"}`}
                          aria-pressed={isDone}
                          onClick={() => store.toggleHabit(habit.id, date)}
                          className={cn(
                            "grid h-7 w-7 place-items-center rounded-[9px] text-white transition-colors sm:h-[30px] sm:w-[30px]",
                            isDone ? TONE[tone].solid : date === today && needed ? cn("border-2 border-dashed bg-transparent", TONE[tone].border) : needed ? "bg-track hover:bg-line" : "bg-track/40"
                          )}
                        >
                          {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-[104px]">
                    <Button size="sm" full variant={habit.completedToday ? "secondary" : "primary"} onClick={() => store.toggleHabit(habit.id)}>
                      {habit.completedToday ? "Done today" : "Check in"}
                    </Button>
                    <button
                      type="button"
                      aria-label={`Delete ${habit.name}`}
                      className="text-ink-3 hover:text-rose"
                      onClick={() => {
                        store.deleteHabit(habit.id);
                        showToast(`Removed ${habit.name}.`);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>

          <div className="grid content-start gap-5">
            <Card className="flex items-center gap-5">
              <Ring value={consistency} size={104} stroke={11} tone="green">
                <span className="text-2xl font-bold tracking-[-0.02em]">{consistency}%</span>
              </Ring>
              <div className="min-w-0">
                <Label>Consistency, last 7 days</Label>
                <div className="mb-1 mt-1.5 text-lg font-semibold leading-snug">{consistency >= 80 ? "Strong week" : consistency >= 50 ? "Steady progress" : "Room to build"}</div>
                <div className="text-[13px] text-ink-2">
                  {weekDone} of {weekRequired} check-ins{bestStreak ? ` · best streak ${bestStreak} days` : ""}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Last 5 weeks"
                action={
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                    Less
                    {HEAT.map((className) => (
                      <span key={className} className={cn("h-3 w-3 rounded", className)} />
                    ))}
                    More
                  </span>
                }
              />
              <div className="grid max-w-[330px] grid-cols-7 gap-1.5" role="img" aria-label="Habit completion for the last five weeks">
                {heatmap.map((cell) => (
                  <span key={cell.date} title={`${cell.date}: ${cell.count} of ${data.habits.length} done`} className={cn("aspect-square rounded-[7px]", cell.future ? "bg-track/40" : HEAT[cell.level], cell.date === today && "ring-2 ring-accent ring-offset-1 ring-offset-surface")} />
                ))}
              </div>
            </Card>

            {pattern ? (
              <Card ai>
                <div className="flex items-center gap-2 text-[13px] font-semibold text-accent">
                  <Sparkles className="h-4 w-4" />
                  Pattern spotted
                </div>
                <p className="mt-2 leading-relaxed">
                  <strong className="font-semibold">{pattern.title}.</strong> {pattern.body}
                </p>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </Page>
  );
}
