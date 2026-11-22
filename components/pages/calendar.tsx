"use client";

import { useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent, useEffect } from "react";
import { getAgenda, type AgendaItem } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import { addDays, formatMonthYear, formatShortTime, getLocalDateKey, getMonthGrid, getRelativeDayLabel, getWeekDays, timeFromMinutes, weekdayLabels, weekdayOf } from "@/lib/date-utils";
import { suggestFreeTime } from "@/lib/planner";
import type { CalendarEvent, CalendarView, EventCategory } from "@/types/dayboard";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { AgendaRow, FreeTimeCard } from "../shared";
import { Button, Card, Chip, EmptyState, Field, IconButton, Label, Segmented, SelectInput, Sheet, TextInput, TONE } from "../ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORIES: EventCategory[] = ["personal", "school", "study", "work", "gym", "appointment", "social", "deadline", "other"];
const REPEATS: Array<[NonNullable<CalendarEvent["repeatType"]>, string]> = [
  ["never", "Does not repeat"],
  ["daily", "Every day"],
  ["weekdays", "Every weekday"],
  ["weekly", "Every week"],
  ["biweekly", "Every two weeks"],
  ["monthly", "Every month"]
];

function monthStart(dateKey: string, offset: number) {
  const date = new Date(`${dateKey.slice(0, 7)}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function longDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

export function CalendarPage() {
  const { store, now, openQuickAdd } = useApp();
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  const [view, setView] = useState<CalendarView>("month");
  const [selected, setSelected] = useState(today);
  const linkedDate = useSearchParams().get("date");
  useEffect(() => {
    if (linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate)) setSelected(linkedDate);
  }, [linkedDate]);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const selectedAgenda = useMemo(() => getAgenda(data, selected), [data, selected]);
  const freeTime = useMemo(() => (selected === today ? suggestFreeTime(data, now) : null), [data, now, selected, today]);

  function shift(direction: number) {
    if (view === "month") setSelected(monthStart(selected, direction));
    else setSelected(addDays(selected, direction * (view === "week" ? 7 : 1)));
  }

  function openItem(item: AgendaItem) {
    if (item.kind !== "event" && item.kind !== "study") return;
    const event = data.events.find((entry) => entry.id === item.sourceId);
    if (event) setEditing(event);
  }

  const heading = view === "month" ? formatMonthYear(selected) : view === "week" ? `Week of ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${getWeekDays(selected)[0]}T12:00:00`))}` : longDate(selected);

  return (
    <Page title="Calendar" subtitle="Classes, tasks, exams and habits in one place" fill>
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_340px]">
        <Card className="flex min-h-0 flex-col p-0 sm:p-0">
          <div className="flex flex-wrap items-center gap-2.5 p-4 sm:p-5">
            <h2 className="mr-1 whitespace-nowrap text-lg font-bold tracking-[-0.01em] sm:text-xl">{heading}</h2>
            <IconButton label="Previous" tone="soft" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <IconButton label="Next" tone="soft" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
            <Button size="sm" onClick={() => setSelected(today)}>
              Today
            </Button>
            <div className="ml-auto flex items-center gap-2.5">
              <Segmented
                label="Calendar view"
                value={view}
                onChange={setView}
                options={[
                  { value: "month", label: "Month" },
                  { value: "week", label: "Week" },
                  { value: "day", label: "Day" }
                ]}
              />
              <Button variant="primary" size="sm" className="h-10" onClick={() => openQuickAdd({ mode: "form", kind: "event", date: selected })} icon={<Plus className="h-4 w-4" />}>
                Event
              </Button>
            </div>
          </div>

          {view === "month" ? <MonthGrid selected={selected} today={today} onSelect={setSelected} /> : null}
          {view === "week" ? <WeekGrid selected={selected} today={today} onSelect={setSelected} onOpen={openItem} /> : null}
          {view === "day" ? (
            <div className="border-t border-line px-4 pb-4 sm:px-5">
              {selectedAgenda.length ? selectedAgenda.map((item, index) => <AgendaRow key={item.key} item={item} first={index === 0} onOpen={item.kind === "event" || item.kind === "study" ? () => openItem(item) : undefined} />) : <EmptyState icon={<CalendarPlus className="h-6 w-6" />} title="Nothing scheduled" body="This day is completely open." />}
            </div>
          ) : null}
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <Label>{selected === today ? "Today" : getRelativeDayLabel(selected, today)}</Label>
            <div className="mb-2 mt-1 text-[26px] font-bold leading-tight tracking-[-0.03em]">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${selected}T12:00:00`))}</div>
            {selectedAgenda.length ? (
              selectedAgenda.map((item, index) => <AgendaRow key={item.key} item={item} first={index === 0} compact onOpen={item.kind === "event" || item.kind === "study" ? () => openItem(item) : undefined} />)
            ) : (
              <p className="py-3 text-sm text-ink-2">Nothing scheduled.</p>
            )}
            <Button size="sm" className="mt-2" onClick={() => openQuickAdd({ mode: "form", kind: "event", date: selected })} icon={<Plus className="h-4 w-4" />}>
              Add to this day
            </Button>
          </Card>
          {freeTime ? <FreeTimeCard suggestion={freeTime} /> : null}
        </div>
      </div>

      {editing ? <EventSheet event={editing} onClose={() => setEditing(null)} /> : null}
    </Page>
  );
}

function MonthGrid({ selected, today, onSelect }: { selected: string; today: string; onSelect: (date: string) => void }) {
  const { store } = useApp();
  const grid = useMemo(() => {
    const cells = getMonthGrid(selected);
    return cells.slice(35).some((cell) => cell.isCurrentMonth) ? cells : cells.slice(0, 35);
  }, [selected]);
  const agendaByDay = useMemo(() => new Map(grid.map((cell) => [cell.dateKey, getAgenda(store.data, cell.dateKey)])), [grid, store.data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-line">
      <div className="grid grid-cols-7">
        {weekdayLabels().map((day) => (
          <div key={day} className="px-2 pt-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3 sm:px-3">
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${grid.length / 7}, minmax(64px, 1fr))` }}>
        {grid.map((cell, index) => {
          const items = agendaByDay.get(cell.dateKey) ?? [];
          const isToday = cell.dateKey === today;
          const isSelected = cell.dateKey === selected;
          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelect(cell.dateKey)}
              aria-label={`${longDate(cell.dateKey)}, ${items.length} item${items.length === 1 ? "" : "s"}`}
              aria-pressed={isSelected}
              className={cn("flex min-h-0 flex-col gap-1 overflow-hidden border-t border-line p-1.5 text-left transition-colors sm:p-2", index % 7 !== 0 && "border-l", isSelected ? "bg-accent-soft/60" : "hover:bg-surface-2")}
            >
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold", isToday ? "bg-accent text-on-accent" : cell.isCurrentMonth ? "" : "text-ink-3")}>{cell.day}</span>
              <span className="hidden min-h-0 flex-col gap-1 md:flex">
                {items.slice(0, 2).map((item) => (
                  <span key={item.key} className={cn("truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold", TONE[item.tone].soft, TONE[item.tone].text, item.done && "line-through opacity-60")}>
                    {item.title}
                  </span>
                ))}
                {items.length > 2 ? <span className="px-1.5 text-[11.5px] font-semibold text-ink-3">+{items.length - 2} more</span> : null}
              </span>
              <span className="flex flex-wrap gap-1 md:hidden">
                {items.slice(0, 4).map((item) => (
                  <span key={item.key} className={cn("h-1.5 w-1.5 rounded-full", TONE[item.tone].solid)} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ selected, today, onSelect, onOpen }: { selected: string; today: string; onSelect: (date: string) => void; onOpen: (item: AgendaItem) => void }) {
  const { store } = useApp();
  const days = getWeekDays(selected);
  return (
    <div className="thin-scrollbar grid min-h-0 flex-1 auto-cols-[minmax(140px,1fr)] grid-flow-col overflow-x-auto border-t border-line">
      {days.map((day, index) => {
        const items = getAgenda(store.data, day);
        return (
          <div key={day} className={cn("flex min-w-0 flex-col gap-1.5 p-2.5", index > 0 && "border-l border-line", day === selected && "bg-accent-soft/40")}>
            <button type="button" onClick={() => onSelect(day)} className="flex items-center gap-2 text-left">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{WEEKDAYS[weekdayOf(day)]}</span>
              <span className={cn("grid h-7 w-7 place-items-center rounded-full text-[13px] font-semibold", day === today && "bg-accent text-on-accent")}>{Number(day.slice(8))}</span>
            </button>
            {items.map((item) => (
              <button key={item.key} type="button" onClick={() => onOpen(item)} className={cn("rounded-lg px-2 py-1.5 text-left", TONE[item.tone].soft, TONE[item.tone].text, item.done && "opacity-60")}>
                <span className="block truncate text-xs font-bold">{item.title}</span>
                <span className="block truncate text-[11px] font-medium opacity-80">{item.allDay ? "All day" : item.start !== undefined ? formatShortTime(timeFromMinutes(item.start)) : "Due"}</span>
              </button>
            ))}
            {items.length === 0 ? <span className="px-1 text-xs text-ink-3">Free</span> : null}
          </div>
        );
      })}
    </div>
  );
}


function EventSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const { store, showToast } = useApp();
  const [draft, setDraft] = useState(event);
  const set = (patch: Partial<CalendarEvent>) => setDraft((current) => ({ ...current, ...patch }));

  function save(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!draft.title.trim()) return;
    const { id: _id, ...rest } = draft;
    store.updateEvent(event.id, { ...rest, title: draft.title.trim(), endTime: draft.endTime < draft.startTime ? draft.startTime : draft.endTime });
    onClose();
  }

  function remove() {
    const { id: _id, ...rest } = event;
    store.deleteEvent(event.id);
    showToast(`Deleted ${event.title}.`, () => store.addEvent(rest));
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Edit event">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {event.autoPlanned ? (
          <div className="sm:col-span-2">
            <Chip tone="accent">Planned for you by DayBoard</Chip>
          </div>
        ) : null}
        <Field label="Title" className="sm:col-span-2">
          <TextInput value={draft.title} onChange={(change) => set({ title: change.target.value })} required />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={draft.date} onChange={(change) => set({ date: change.target.value })} required />
        </Field>
        <Field label="Category">
          <SelectInput value={draft.category} onChange={(change) => set({ category: change.target.value as EventCategory })}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category[0].toUpperCase() + category.slice(1)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Starts">
          <TextInput type="time" value={draft.startTime} onChange={(change) => set({ startTime: change.target.value, allDay: false })} />
        </Field>
        <Field label="Ends">
          <TextInput type="time" value={draft.endTime} onChange={(change) => set({ endTime: change.target.value, allDay: false })} />
        </Field>
        <Field label="Location">
          <TextInput value={draft.location ?? ""} onChange={(change) => set({ location: change.target.value })} />
        </Field>
        <Field label="Repeat">
          <SelectInput value={draft.repeatType ?? "never"} onChange={(change) => set({ repeatType: change.target.value as CalendarEvent["repeatType"] })}>
            {REPEATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="mt-2 flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" full>
            Save changes
          </Button>
          <Button variant="danger" onClick={remove} icon={<Trash2 className="h-4 w-4" />}>
            Delete
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
