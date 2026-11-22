"use client";

import { CalendarPlus, Hourglass, Plus, Quote, SlidersHorizontal, Sparkles, Timer } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { formatCountdown, getAgenda, getUpNext, timeRangeLabel } from "@/lib/agenda";
import { getBrief } from "@/lib/brief";
import { addDays, formatDuration, formatMobileDate, getDayDistance, getLocalDateKey } from "@/lib/date-utils";
import { focusSeries } from "@/lib/findings";
import { useFocusHistory } from "@/lib/focus-history";
import { suggestFreeTime } from "@/lib/planner";
import { useTheme } from "@/lib/theme";
import { getGreeting } from "@/lib/time-logic";
import { getWorkItems } from "@/lib/work";
import { isBirthday, QUOTES, WIDGETS, type WidgetId } from "@/lib/personalize";
import { cn } from "@/lib/cn";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { AgendaRow, BoldText, FreeTimeCard, kindIcon } from "../shared";
import { Button, Card, CardHeader, Chip, EmptyState, IconTile, Label, ProgressBar, Ring, Row } from "../ui";

export function DashboardPage() {
  const { store, auth, now, openQuickAdd, celebrate } = useApp();
  const { prefs, profile } = useTheme();
  const { sessions } = useFocusHistory();
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);

  const agenda = useMemo(() => getAgenda(data, today), [data, today]);
  const upNext = useMemo(() => getUpNext(data, now), [data, now]);
  const brief = useMemo(() => getBrief(data, now), [data, now]);
  const freeTime = useMemo(() => suggestFreeTime(data, now), [data, now]);
  const work = useMemo(() => getWorkItems(data, now), [data, now]);
  const focusToday = focusSeries(sessions, data.timezone, 1, now)[0]?.minutes ?? 0;

  const comingUp = useMemo(() => {
    const horizon = addDays(today, 14);
    const dated = work
      .filter((item) => !item.done && item.dueDate && item.dueDate <= horizon)
      .map((item) => ({
        key: item.key,
        title: item.title,
        detail: item.courseLabel,
        date: item.dueDate!,
        label: item.dueLabel,
        tone: item.urgency,
        kind: item.kind as "task" | "assignment" | "exam"
      }));
    const exams = data.exams
      .filter((exam) => exam.examDate >= today && exam.examDate <= horizon && exam.score === undefined)
      .map((exam) => {
        const days = getDayDistance(exam.examDate, today);
        return {
          key: `exam-${exam.id}`,
          title: exam.title,
          detail: data.courses.find((course) => course.id === exam.courseId)?.name ?? "Exam",
          date: exam.examDate,
          label: days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
          tone: days <= 2 ? ("rose" as const) : ("amber" as const),
          kind: "exam" as const
        };
      });
    return [...dated, ...exams].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [work, data.exams, data.courses, today]);

  const firstName = auth.displayName.trim().split(/\s+/)[0];
  const habitsDone = data.habits.filter((habit) => habit.completedToday).length;
  const nextHabit = data.habits.find((habit) => !habit.completedToday);
  const plannedCount = agenda.filter((item) => item.planned).length;
  const isEmpty = data.tasks.length + data.events.length + data.courses.length + data.assignments.length + data.exams.length + data.habits.length === 0;

  const birthday = isBirthday(profile, today);
  const dayOfYear = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${today.slice(0, 4)}-01-01T12:00:00Z`)) / 86_400_000);
  const countdownDays = prefs.countdown?.date ? getDayDistance(prefs.countdown.date, today) : null;

  // A little celebration on the person's birthday, once per day.
  useEffect(() => {
    if (!birthday) return;
    try {
      if (sessionStorage.getItem("dayboard:birthday-shown") === today) return;
      sessionStorage.setItem("dayboard:birthday-shown", today);
    } catch {
      // Storage unavailable; celebrate anyway.
    }
    const timer = window.setTimeout(celebrate, 600);
    return () => window.clearTimeout(timer);
  }, [birthday, today, celebrate]);

  /** Every widget the dashboard can show. A widget returns nothing when it has nothing useful to say. */
  const render: Record<WidgetId, () => ReactNode> = {
    upNext: () => (
      <section className="hero-gradient flex items-center gap-5 rounded-card p-5 text-white shadow-card sm:p-7">
        <div className="min-w-0 flex-1">
          {upNext ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/75">
                {upNext.happeningNow ? "Happening now" : `Up next · ${upNext.dayOffset ? "tomorrow" : `starts in ${formatCountdown(upNext.startsIn)}`}`}
              </div>
              <h2 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">{upNext.item.title}</h2>
              <p className="mt-1.5 text-white/85">{[timeRangeLabel(upNext.item), upNext.item.detail].filter(Boolean).join(" · ")}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Button variant="hero" href={upNext.item.linkedTaskId ? `/focus?task=${upNext.item.linkedTaskId}` : "/focus"} icon={<Timer className="h-[17px] w-[17px]" />}>
                  Start focus
                </Button>
                <Button variant="heroGhost" href="/calendar">
                  Open calendar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/75">{isEmpty ? "Welcome to DayBoard" : "Nothing scheduled next"}</div>
              <h2 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">{isEmpty ? "Tell me what's on your plate" : "Your schedule is clear"}</h2>
              <p className="mt-1.5 text-white/85">{isEmpty ? "Type, say or photograph anything. For example: “Chem exam Friday 9am”." : "A good time to get ahead, or to rest."}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Button variant="hero" onClick={() => openQuickAdd()} icon={<Plus className="h-[17px] w-[17px]" />}>
                  Add something
                </Button>
                <Button variant="heroGhost" href="/focus" icon={<Timer className="h-[17px] w-[17px]" />}>
                  Start focus
                </Button>
              </div>
            </>
          )}
        </div>
        {upNext && !upNext.happeningNow && !upNext.dayOffset && upNext.startsIn <= 180 ? (
          <Ring value={100 - Math.min(100, (upNext.startsIn / 180) * 100)} size={120} stroke={11} tone="white" trackClass="stroke-white/25" className="hidden sm:block">
            <div>
              <div className="text-[30px] font-bold leading-none">{upNext.startsIn < 60 ? upNext.startsIn : Math.floor(upNext.startsIn / 60)}</div>
              <div className="text-xs text-white/75">{upNext.startsIn < 60 ? "minutes" : `h ${upNext.startsIn % 60}m`}</div>
            </div>
          </Ring>
        ) : null}
      </section>
    ),
    plan: () => (
      <Card>
        <CardHeader
          title="Today's plan"
          action={
            <div className="flex items-center gap-2">
              {agenda.length ? (
                <Chip>
                  {agenda.length} item{agenda.length === 1 ? "" : "s"}
                </Chip>
              ) : null}
              {plannedCount ? (
                <Chip tone="accent" icon={<Sparkles className="h-3 w-3" />}>
                  {plannedCount} planned for you
                </Chip>
              ) : null}
            </div>
          }
        />
        {agenda.length ? (
          agenda.map((item, index) => <AgendaRow key={item.key} item={item} first={index === 0} />)
        ) : (
          <EmptyState
            icon={<CalendarPlus className="h-6 w-6" />}
            title="Nothing planned for today"
            body="Add an event, a task or a class and it will show up here in order."
            action={
              <Button variant="primary" onClick={() => openQuickAdd()} icon={<Plus className="h-4 w-4" />}>
                Add something
              </Button>
            }
          />
        )}
      </Card>
    ),
    brief: () => (
      <Card ai>
        <div className="mb-2.5 flex items-center gap-3">
          <IconTile tone="accent" solid>
            <Sparkles className="h-[19px] w-[19px]" />
          </IconTile>
          <div>
            <h2 className="font-semibold">{now.getHours() < 12 ? "Morning brief" : now.getHours() < 17 ? "Afternoon brief" : "Evening brief"}</h2>
            <div className="text-[13px] text-ink-3">From your assistant</div>
          </div>
        </div>
        <p className="leading-relaxed">
          {brief.sentences.map((sentence, index) => (
            <span key={index}>
              <BoldText text={sentence} />{" "}
            </span>
          ))}
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button size="sm" href={`/assistant?q=${encodeURIComponent("What should I work on next?")}`}>
            What should I do next?
          </Button>
          <Button size="sm" href={`/assistant?q=${encodeURIComponent("What's due this week?")}`}>
            What&apos;s due this week?
          </Button>
        </div>
      </Card>
    ),
    freeTime: () => (freeTime ? <FreeTimeCard suggestion={freeTime} /> : null),
    habits: () => (
      <Card className="h-full">
        <Label>Habits today</Label>
        {data.habits.length ? (
          <div className="mt-3 flex items-center gap-3">
            <Ring value={(habitsDone / data.habits.length) * 100} size={60} stroke={8} tone="green">
              <span className="text-[13px] font-bold">
                {habitsDone}/{data.habits.length}
              </span>
            </Ring>
            <div className="min-w-0">
              <div className="truncate font-semibold">{nextHabit ? `${data.habits.length - habitsDone} to go` : "All done"}</div>
              <div className="truncate text-[13px] text-ink-2">{nextHabit ? nextHabit.name : "Nice work"}</div>
            </div>
          </div>
        ) : (
          <Button size="sm" className="mt-3" href="/habits">
            Add a habit
          </Button>
        )}
      </Card>
    ),
    focus: () => (
      <Card className="h-full">
        <Label>Focus today</Label>
        <div className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.03em]">{formatDuration(focusToday)}</div>
        <ProgressBar value={(focusToday / prefs.focusGoalMinutes) * 100} className="mt-2.5" label="Focus goal progress" />
        <div className="mt-1.5 text-[13px] text-ink-2">Goal {formatDuration(prefs.focusGoalMinutes)}</div>
      </Card>
    ),
    comingUp: () => (
      <Card>
        <CardHeader
          title="Coming up"
          action={
            <Button size="sm" variant="ghost" href="/calendar">
              View calendar
            </Button>
          }
        />
        {comingUp.length ? (
          comingUp.map((item, index) => (
            <Row key={item.key} first={index === 0}>
              <IconTile tone={item.kind === "exam" ? "amber" : "accent"}>{kindIcon(item.kind)}</IconTile>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{item.title}</div>
                <div className="truncate text-[13px] text-ink-2">{item.detail}</div>
              </div>
              <Chip tone={item.tone}>{item.label}</Chip>
            </Row>
          ))
        ) : (
          <p className="py-3 text-sm text-ink-2">No deadlines in the next two weeks.</p>
        )}
      </Card>
    ),
    note: () => {
      if (!data.notes.length) return null;
      return (
        <Card>
          <CardHeader
            title="Pinned note"
            action={
              <Button size="sm" variant="ghost" href="/notes">
                All notes
              </Button>
            }
          />
          {(() => {
            const note = data.notes.find((entry) => entry.pinned) ?? data.notes[0];
            return (
              <>
                <div className="font-semibold">{note.title}</div>
                <p className="line-clamp-2 mt-1 text-sm text-ink-2">{note.content || "Empty note"}</p>
              </>
            );
          })()}
        </Card>
      );
    },
    countdown: () => (
      <Card className="h-full">
        <Label>{prefs.countdown?.title || "Countdown"}</Label>
        {prefs.countdown && countdownDays !== null ? (
          <>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[34px] font-bold leading-none tracking-[-0.03em] text-accent">{Math.abs(countdownDays)}</span>
              <span className="text-sm font-semibold text-ink-2">day{Math.abs(countdownDays) === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-2">
              <Hourglass className="h-3.5 w-3.5" />
              {countdownDays > 0 ? "to go" : countdownDays === 0 ? "It's today!" : "ago"}
            </div>
          </>
        ) : (
          <Button size="sm" className="mt-3" href="/settings?tab=dashboard">
            Set a countdown
          </Button>
        )}
      </Card>
    ),
    quote: () => (
      <Card ai className="h-full">
        <Quote className="h-5 w-5 text-accent" />
        <p className="mt-2 font-semibold leading-snug">{QUOTES[dayOfYear % QUOTES.length]}</p>
      </Card>
    )
  };

  /** Renders one column. Two small widgets next to each other share a row. */
  function column(name: "main" | "side") {
    const items = prefs.widgets
      .filter((slot) => slot.column === name && slot.visible)
      .map((slot) => ({ id: slot.id, small: Boolean(WIDGETS[slot.id].small), node: render[slot.id]() }))
      .filter((entry) => entry.node);
    const cells: ReactNode[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const pair = items[index].small && items[index + 1]?.small;
      cells.push(
        <div key={items[index].id} className={pair ? "col-span-1" : "col-span-2"}>
          {items[index].node}
        </div>
      );
      if (pair) {
        cells.push(
          <div key={items[index + 1].id} className="col-span-1">
            {items[index + 1].node}
          </div>
        );
        index += 1;
      }
    }
    return cells;
  }

  const main = column("main");
  const side = column("side");
  const title = birthday ? `Happy birthday${firstName ? `, ${firstName}` : ""}!` : `${getGreeting(now).greeting}${firstName ? `, ${firstName}` : ""}`;
  const subtitle = [formatMobileDate(now, data.timezone), profile.motto ? `“${profile.motto}”` : ""].filter(Boolean).join(" · ");

  return (
    <Page title={title} subtitle={subtitle}>
      <div className={cn("grid gap-5", main.length && side.length && "lg:grid-cols-[1.55fr_1fr]")}>
        {main.length ? <div className="grid grid-cols-2 content-start gap-5">{main}</div> : null}
        {side.length ? <div className="grid grid-cols-2 content-start gap-5">{side}</div> : null}
        {!main.length && !side.length ? (
          <Card>
            <EmptyState
              icon={<SlidersHorizontal className="h-6 w-6" />}
              title="Your dashboard is empty"
              body="Every card is hidden. Turn some back on in Settings."
              action={
                <Button variant="primary" href="/settings?tab=dashboard">
                  Customize dashboard
                </Button>
              }
            />
          </Card>
        ) : null}
      </div>
      <div className="mt-5 flex justify-center">
        <Button size="sm" variant="ghost" href="/settings?tab=dashboard" icon={<SlidersHorizontal className="h-4 w-4" />}>
          Customize this dashboard
        </Button>
      </div>
    </Page>
  );
}
