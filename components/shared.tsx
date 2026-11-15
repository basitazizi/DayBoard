"use client";

import { BookOpen, CalendarDays, CheckSquare, FileText, GraduationCap, School, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { timeRangeLabel, type AgendaItem, type AgendaKind } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import { formatShortTime, getLocalDateKey, timeFromMinutes } from "@/lib/date-utils";
import type { DayBoardStore } from "@/lib/local-data";
import type { FreeTimeSuggestion } from "@/lib/planner";
import type { WorkItem } from "@/lib/work";
import { useApp } from "./app-context";
import { Button, Card, Checkbox, Chip, Stripe } from "./ui";

export const KIND_LABEL: Record<AgendaKind, string> = { event: "Event", class: "Class", study: "Study", task: "Task", assignment: "Assignment", exam: "Exam" };

export function kindIcon(kind: AgendaKind | "note", className = "h-5 w-5"): ReactNode {
  if (kind === "class") return <School className={className} />;
  if (kind === "study") return <BookOpen className={className} />;
  if (kind === "task") return <CheckSquare className={className} />;
  if (kind === "assignment" || kind === "note") return <FileText className={className} />;
  if (kind === "exam") return <GraduationCap className={className} />;
  return <CalendarDays className={className} />;
}

/** Marks a task or assignment done, or reopens it. */
export function toggleWork(store: DayBoardStore, item: Pick<WorkItem, "kind" | "id" | "done">) {
  if (item.kind === "task") store.updateTaskStatus(item.id, item.done ? "not_started" : "completed");
  else store.updateAssignment(item.id, { status: item.done ? "not_started" : "submitted" });
}

/** Renders text where **double asterisks** mark bold phrases. */
export function BoldText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") ? (
          <strong key={index} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

export function AgendaRow({ item, first, onOpen, compact }: { item: AgendaItem; first?: boolean; onOpen?: () => void; compact?: boolean }) {
  const { store } = useApp();
  const checkable = item.kind === "task" || item.kind === "assignment";
  const timeText = item.allDay ? "All day" : item.start !== undefined ? formatShortTime(timeFromMinutes(item.start)) : item.due !== undefined ? formatShortTime(timeFromMinutes(item.due)) : "Any time";

  return (
    <div className={cn("flex items-center gap-3 py-3", !first && "border-t border-line")}>
      <div className={cn("shrink-0 text-[13px] font-semibold tabular-nums", compact ? "w-[58px]" : "w-[70px]")}>
        {timeText}
        {item.start === undefined && item.due !== undefined ? <span className="block text-[11px] font-medium text-ink-3">due</span> : null}
      </div>
      <Stripe tone={item.tone} />
      <button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <span className={cn("block truncate font-semibold", item.done && "text-ink-3 line-through")}>{item.title}</span>
        <span className="block truncate text-[13px] text-ink-2">{[item.start !== undefined && item.end !== undefined ? timeRangeLabel(item) : "", item.detail].filter(Boolean).join(" · ")}</span>
      </button>
      {item.planned ? (
        <Chip tone="accent" icon={<Sparkles className="h-3 w-3" />} className={compact ? "hidden" : "hidden sm:inline-flex"}>
          Planned for you
        </Chip>
      ) : (
        <Chip tone={item.tone} className={compact ? "hidden" : "hidden sm:inline-flex"}>
          {KIND_LABEL[item.kind]}
        </Chip>
      )}
      {checkable ? <Checkbox checked={item.done} onChange={() => toggleWork(store, { kind: item.kind as "task" | "assignment", id: item.sourceId, done: item.done })} label={`Mark ${item.title} done`} /> : <span className="w-6 shrink-0" aria-hidden />}
    </div>
  );
}

/** "You're free 4:30 – 6:00. Use it for X?" with one tap to put it on the calendar. */
export function FreeTimeCard({ suggestion, className }: { suggestion: FreeTimeSuggestion; className?: string }) {
  const { store, showToast } = useApp();

  function schedule() {
    const today = getLocalDateKey(new Date(), store.data.timezone);
    const id = store.addEvent({
      title: suggestion.title,
      date: today,
      startTime: timeFromMinutes(suggestion.slot.start),
      endTime: timeFromMinutes(suggestion.slot.end),
      category: "study",
      priority: "medium",
      repeatType: "never",
      linkedTaskId: suggestion.taskId,
      autoPlanned: true
    });
    showToast(`Scheduled ${suggestion.minutes} minutes for ${suggestion.title}.`, () => store.deleteEvent(id));
  }

  return (
    <Card ai className={className}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-accent">
        <Sparkles className="h-4 w-4" />
        Free time found
      </div>
      <p className="mb-3 mt-2 leading-relaxed">
        You&apos;re free{" "}
        <strong className="font-semibold">
          {formatShortTime(timeFromMinutes(suggestion.slot.start))} – {formatShortTime(timeFromMinutes(suggestion.slot.end))}
        </strong>
        . Use it for {suggestion.title}?
      </p>
      <Button variant="primary" size="sm" onClick={schedule}>
        Schedule it
      </Button>
    </Card>
  );
}
