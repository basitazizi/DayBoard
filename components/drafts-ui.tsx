"use client";

import { CalendarDays, CheckSquare, ChevronDown, FileText, GraduationCap, Repeat, School, Sparkles, Target, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatShortTime, getRelativeDayLabel, todayKey } from "@/lib/date-utils";
import { DRAFT_LABEL, type DraftChange, type DraftItem, type DraftKind } from "@/lib/drafts";
import type { DayBoardData, Tone } from "@/types/dayboard";
import { Checkbox, Chip, Field, IconButton, IconTile, SelectInput, TextArea, TextInput, Toggle } from "./ui";

const KIND_TONE: Record<DraftKind, Tone> = { task: "accent", event: "green", assignment: "blue", exam: "amber", habit: "teal", note: "rose", class: "blue" };

const KIND_ICON: Record<DraftKind, ReactNode> = {
  task: <CheckSquare className="h-5 w-5" />,
  event: <CalendarDays className="h-5 w-5" />,
  assignment: <FileText className="h-5 w-5" />,
  exam: <GraduationCap className="h-5 w-5" />,
  habit: <Target className="h-5 w-5" />,
  note: <FileText className="h-5 w-5" />,
  class: <School className="h-5 w-5" />
};

function summary(item: DraftItem, data: DayBoardData) {
  const parts: string[] = [];
  if (item.date) parts.push(getRelativeDayLabel(item.date, todayKey()));
  if (item.time) parts.push(item.endTime ? `${formatShortTime(item.time)} – ${formatShortTime(item.endTime)}` : formatShortTime(item.time));
  if (item.kind === "class" && item.days) parts.push(item.days);
  const course = data.courses.find((entry) => entry.id === item.courseId);
  if (course) parts.push(course.name);
  if (item.minutes && (item.kind === "task" || item.kind === "assignment")) parts.push(`${item.minutes} min`);
  if (item.kind === "habit") parts.push("Every day");
  if (!parts.length) parts.push(item.kind === "note" ? "Saved to Notes" : item.kind === "task" ? "No date" : "Add a date");
  return parts.join(" · ");
}

export function DraftCard({ item, data, onChange, onRemove, startExpanded }: { item: DraftItem; data: DayBoardData; onChange: (patch: Partial<DraftItem>) => void; onRemove?: () => void; startExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(Boolean(startExpanded));
  const needsDate = (item.kind === "event" || item.kind === "exam" || item.kind === "assignment") && !item.date;
  const showCourse = item.kind === "task" || item.kind === "assignment" || item.kind === "exam" || item.kind === "note";

  return (
    <div className={cn("rounded-2xl border bg-surface transition-colors", item.selected ? "border-line" : "border-line opacity-55")}>
      <div className="flex items-center gap-3 p-3">
        <Checkbox checked={item.selected} onChange={() => onChange({ selected: !item.selected })} label={`Include ${item.title}`} />
        <IconTile tone={KIND_TONE[item.kind]}>{KIND_ICON[item.kind]}</IconTile>
        <button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <span className="block truncate font-semibold">{item.title || "Untitled"}</span>
          <span className={cn("block truncate text-[13px]", needsDate ? "font-semibold text-amber" : "text-ink-2")}>{summary(item, data)}</span>
        </button>
        <Chip tone={KIND_TONE[item.kind]} className="hidden sm:inline-flex">
          {DRAFT_LABEL[item.kind]}
        </Chip>
        <IconButton label={expanded ? "Hide details" : "Edit details"} onClick={() => setExpanded((value) => !value)}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </IconButton>
      </div>

      {item.kind === "exam" && item.selected ? (
        <div className="ai-surface mx-3 mb-3 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px]">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">Plan study sessions</span> in your free time before the exam
          </span>
          <Toggle checked={item.planStudy ?? true} onChange={(value) => onChange({ planStudy: value })} label="Plan study sessions" />
        </div>
      ) : null}

      {expanded ? (
        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
          <Field label="Type">
            <SelectInput value={item.kind} onChange={(event) => onChange({ kind: event.target.value as DraftKind })}>
              {(Object.keys(DRAFT_LABEL) as DraftKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {DRAFT_LABEL[kind]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={item.kind === "habit" ? "Habit" : item.kind === "class" ? "Class name" : "Title"}>
            <TextInput value={item.title} onChange={(event) => onChange({ title: event.target.value })} />
          </Field>

          {item.kind !== "habit" && item.kind !== "note" && item.kind !== "class" ? (
            <Field label={item.kind === "task" || item.kind === "assignment" ? "Due date" : "Date"}>
              <TextInput type="date" value={item.date ?? ""} onChange={(event) => onChange({ date: event.target.value || undefined })} />
            </Field>
          ) : null}
          {item.kind !== "habit" && item.kind !== "note" ? (
            <Field label={item.kind === "event" || item.kind === "class" ? "Starts" : item.kind === "exam" ? "Time" : "Due time"}>
              <TextInput type="time" value={item.time ?? ""} onChange={(event) => onChange({ time: event.target.value || undefined })} />
            </Field>
          ) : null}
          {item.kind === "event" || item.kind === "class" ? (
            <Field label="Ends">
              <TextInput type="time" value={item.endTime ?? ""} onChange={(event) => onChange({ endTime: event.target.value || undefined })} />
            </Field>
          ) : null}
          {item.kind === "class" ? (
            <Field label="Days" hint="For example: Mon, Wed">
              <TextInput value={item.days ?? ""} onChange={(event) => onChange({ days: event.target.value })} placeholder="Mon, Wed" />
            </Field>
          ) : null}
          {item.kind === "event" || item.kind === "class" ? (
            <Field label={item.kind === "class" ? "Room" : "Location"}>
              <TextInput value={item.location ?? ""} onChange={(event) => onChange({ location: event.target.value })} />
            </Field>
          ) : null}
          {showCourse && data.courses.length > 0 ? (
            <Field label="Class">
              <SelectInput value={item.courseId ?? ""} onChange={(event) => onChange({ courseId: event.target.value || undefined })}>
                <option value="">None</option>
                {data.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}
          {item.kind === "task" || item.kind === "assignment" || item.kind === "exam" ? (
            <Field label={item.kind === "exam" ? "Study time (minutes)" : "Time needed (minutes)"}>
              <TextInput type="number" min={5} step={5} value={item.minutes ?? ""} onChange={(event) => onChange({ minutes: event.target.value ? Number(event.target.value) : undefined })} placeholder={item.kind === "exam" ? "150" : item.kind === "task" ? "30" : "60"} />
            </Field>
          ) : null}
          {item.kind === "task" ? (
            <Field label="Priority">
              <SelectInput value={item.priority ?? "medium"} onChange={(event) => onChange({ priority: event.target.value as DraftItem["priority"] })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </SelectInput>
            </Field>
          ) : null}
          {item.kind === "assignment" || item.kind === "exam" ? (
            <Field label="Percent of grade">
              <TextInput type="number" min={0} max={100} value={item.gradeWeight ?? ""} onChange={(event) => onChange({ gradeWeight: event.target.value ? Number(event.target.value) : undefined })} placeholder="Optional" />
            </Field>
          ) : null}
          {item.kind === "note" || item.kind === "task" || item.kind === "event" ? (
            <Field label={item.kind === "note" ? "Note" : "Details"} className="sm:col-span-2">
              <TextArea value={item.notes ?? ""} onChange={(event) => onChange({ notes: event.target.value })} rows={item.kind === "note" ? 4 : 2} />
            </Field>
          ) : null}
          {onRemove ? (
            <div className="sm:col-span-2">
              <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose">
                <Trash2 className="h-4 w-4" />
                Remove this item
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const CHANGE_TEXT: Record<DraftChange["action"], string> = { reschedule: "Move", complete: "Mark done", delete: "Delete" };

export function ChangeCard({ change, onChange }: { change: DraftChange; onChange: (patch: Partial<DraftChange>) => void }) {
  const when = [change.date ? getRelativeDayLabel(change.date, todayKey()) : "", change.time ? formatShortTime(change.time) : ""].filter(Boolean).join(" at ");
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface p-3", !change.selected && "opacity-55")}>
      <Checkbox checked={change.selected} onChange={() => onChange({ selected: !change.selected })} label={`Include change to ${change.title}`} />
      <IconTile tone={change.action === "delete" ? "rose" : change.action === "complete" ? "green" : "accent"}>{change.action === "delete" ? <Trash2 className="h-5 w-5" /> : change.action === "complete" ? <CheckSquare className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}</IconTile>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{change.title}</div>
        <div className="truncate text-[13px] text-ink-2">
          {CHANGE_TEXT[change.action]}
          {change.action === "reschedule" && when ? ` to ${when}` : ""}
        </div>
      </div>
      <Chip tone={change.action === "delete" ? "rose" : "neutral"}>{CHANGE_TEXT[change.action]}</Chip>
    </div>
  );
}

export function DraftList({ items, changes = [], data, onItems, onChanges, startExpanded }: { items: DraftItem[]; changes?: DraftChange[]; data: DayBoardData; onItems: (items: DraftItem[]) => void; onChanges?: (changes: DraftChange[]) => void; startExpanded?: boolean }) {
  return (
    <div className="grid gap-2.5">
      {items.map((item) => (
        <DraftCard
          key={item.id}
          item={item}
          data={data}
          startExpanded={startExpanded}
          onChange={(patch) => onItems(items.map((entry) => (entry.id === item.id ? { ...entry, ...patch } : entry)))}
          onRemove={items.length > 1 ? () => onItems(items.filter((entry) => entry.id !== item.id)) : undefined}
        />
      ))}
      {changes.map((change) => (
        <ChangeCard key={change.id} change={change} onChange={(patch) => onChanges?.(changes.map((entry) => (entry.id === change.id ? { ...entry, ...patch } : entry)))} />
      ))}
    </div>
  );
}

export function countSelected(items: DraftItem[], changes: DraftChange[] = []) {
  return items.filter((item) => item.selected && item.title.trim()).length + changes.filter((change) => change.selected).length;
}
