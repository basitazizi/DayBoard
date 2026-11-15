"use client";

import { CheckSquare, Plus, Sparkles, Timer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, formatShortTime, getLocalDateKey, getRelativeDayLabel } from "@/lib/date-utils";
import { defaultSteps, planStudySessions } from "@/lib/planner";
import { getWorkItems, type WorkItem } from "@/lib/work";
import type { Assignment, TaskStep } from "@/types/dayboard";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { toggleWork } from "../shared";
import { Button, Card, Checkbox, Chip, EmptyState, Field, Label, ProgressBar, Segmented, SelectInput, Sheet, TextInput, TONE } from "../ui";

type Filter = "all" | "today" | "upcoming" | "progress" | "done";

function groupLabel(item: WorkItem, today: string) {
  if (item.done) return "Done";
  if (item.overdue) return "Overdue";
  if (!item.dueDate) return "No date";
  if (item.dueDate === today) return "Today";
  if (item.dueDate <= addDays(today, 7)) return "This week";
  return "Later";
}

const GROUP_ORDER = ["Overdue", "Today", "This week", "Later", "No date", "Done"];

export function TasksPage() {
  const { store, now, openQuickAdd } = useApp();
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const work = useMemo(() => getWorkItems(data, now), [data, now]);
  const counts = {
    all: work.filter((item) => !item.done).length,
    today: work.filter((item) => !item.done && (item.dueToday || item.overdue)).length,
    upcoming: work.filter((item) => !item.done && item.dueDate && item.dueDate > today).length,
    progress: work.filter((item) => !item.done && item.inProgress).length,
    done: work.filter((item) => item.done).length
  };
  const visible = work.filter((item) => {
    if (filter === "done") return item.done;
    if (item.done) return false;
    if (filter === "today") return item.dueToday || item.overdue;
    if (filter === "upcoming") return Boolean(item.dueDate && item.dueDate > today);
    if (filter === "progress") return item.inProgress;
    return true;
  });
  const groups = GROUP_ORDER.map((label) => ({ label, items: visible.filter((item) => groupLabel(item, today) === label) })).filter((group) => group.items.length);
  const selected = work.find((item) => item.key === selectedKey) ?? null;

  useEffect(() => {
    if (!selectedKey && visible.length && window.matchMedia("(min-width: 1024px)").matches) setSelectedKey(visible[0].key);
  }, [selectedKey, visible]);

  function select(item: WorkItem) {
    setSelectedKey(item.key);
    if (!window.matchMedia("(min-width: 1024px)").matches) setSheetOpen(true);
  }

  return (
    <Page
      title="Tasks"
      subtitle="Sorted by what matters most, not by when you typed it"
      toolbar={
        <>
          <Segmented
            label="Filter tasks"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${counts.all}` },
              { value: "today", label: `Today ${counts.today}` },
              { value: "upcoming", label: `Upcoming ${counts.upcoming}` },
              { value: "progress", label: `In progress ${counts.progress}` },
              { value: "done", label: `Done ${counts.done}` }
            ]}
          />
          <div className="ml-auto flex items-center gap-2.5">
            <Chip icon={<Sparkles className="h-3 w-3" />} className="hidden sm:inline-flex">
              Smart order
            </Chip>
            <Button variant="primary" onClick={() => openQuickAdd({ mode: "form", kind: "task" })} icon={<Plus className="h-4 w-4" />}>
              Task
            </Button>
          </div>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="p-2.5 sm:p-3">
          {groups.length ? (
            groups.map((group) => (
              <div key={group.label}>
                <Label className={cn("px-3 pb-1.5 pt-3", group.label === "Overdue" && "text-rose")}>{group.label}</Label>
                {group.items.map((item) => (
                  <WorkRow key={item.key} item={item} selected={item.key === selectedKey} onSelect={() => select(item)} />
                ))}
              </div>
            ))
          ) : (
            <EmptyState
              icon={<CheckSquare className="h-6 w-6" />}
              title={filter === "done" ? "Nothing finished yet" : "Nothing here"}
              body={filter === "all" ? "Add a task, or describe one in plain words: “Finish calc problem set by Friday”." : "Try another filter."}
              action={
                filter === "all" ? (
                  <Button variant="primary" onClick={() => openQuickAdd()} icon={<Plus className="h-4 w-4" />}>
                    Add a task
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>

        <div className="hidden lg:block">
          <Card className="sticky top-24">{selected ? <WorkDetail item={selected} onDeleted={() => setSelectedKey(null)} /> : <EmptyState title="Select a task" body="Pick a task to see its steps and planned sessions." />}</Card>
        </div>
      </div>

      <Sheet open={sheetOpen && Boolean(selected)} onClose={() => setSheetOpen(false)} title="Details">
        {selected ? <WorkDetail item={selected} onDeleted={() => setSheetOpen(false)} /> : null}
      </Sheet>
    </Page>
  );
}

function WorkRow({ item, selected, onSelect }: { item: WorkItem; selected: boolean; onSelect: () => void }) {
  const { store } = useApp();
  const showBar = !item.done && (item.steps.length > 0 || item.progress > 0);
  return (
    <div className={cn("flex items-center gap-3 rounded-[14px] border px-3 py-3", selected ? "border-accent-line bg-accent-soft/50" : "border-transparent hover:bg-surface-2")}>
      <Checkbox checked={item.done} onChange={() => toggleWork(store, item)} label={`Mark ${item.title} done`} />
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate font-semibold", item.done && "text-ink-3 line-through")}>{item.title}</span>
        {showBar ? (
          <span className="mt-1.5 flex items-center gap-2">
            <ProgressBar value={item.progress} tone={item.urgency === "neutral" ? "accent" : item.urgency} className="w-28 sm:w-36" />
            <span className="truncate text-[13px] text-ink-2">{item.detail}</span>
          </span>
        ) : (
          <span className="block truncate text-[13px] text-ink-2">{item.detail || item.reason}</span>
        )}
      </button>
      <Chip tone={item.tone} className="hidden max-w-[140px] truncate md:inline-flex">
        {item.courseLabel}
      </Chip>
      <span className={cn("w-[92px] shrink-0 text-right text-[13px] font-semibold sm:w-[108px]", item.done ? "text-ink-3" : item.urgency === "rose" ? "text-rose" : "")}>{item.dueLabel}</span>
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", item.done ? "bg-transparent" : TONE[item.urgency].solid)} />
    </div>
  );
}

export function WorkDetail({ item, onDeleted }: { item: WorkItem; onDeleted: () => void }) {
  const { store, showToast, now } = useApp();
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  const [newStep, setNewStep] = useState("");
  const task = item.kind === "task" ? data.tasks.find((entry) => entry.id === item.id) : undefined;
  const assignment = item.kind === "assignment" ? data.assignments.find((entry) => entry.id === item.id) : undefined;
  const sessions = data.events.filter((event) => event.linkedTaskId === item.id && event.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  function setSteps(steps: TaskStep[]) {
    if (task) store.updateTask(task.id, { steps });
    if (assignment) store.updateAssignment(assignment.id, { steps });
  }

  function breakDown() {
    const work = task ?? assignment;
    if (!work) return;
    const kind = /\b(exam|midterm|final|test|quiz)\b/i.test(work.title) ? "exam" : /\b(essay|paper|report)\b/i.test(work.title) ? "paper" : /\bproject\b/i.test(work.title) ? "project" : /\blab\b/i.test(work.title) ? "lab" : "general";
    const steps = defaultSteps(kind, Math.max(work.estimatedMinutes, 90));
    setSteps(steps);
  }

  function planSessions() {
    if (!task) return;
    const planned = planStudySessions(data, { dueDate: task.dueDate ?? addDays(today, 3), totalMinutes: Math.max(task.estimatedMinutes, 50), maxSessions: 3 }, now);
    if (planned.length === 0) {
      showToast("No free time found before this is due.");
      return;
    }
    const ids = planned.map((session) => store.addEvent({ title: task.title, date: session.date, startTime: session.startTime, endTime: session.endTime, category: "study", priority: "medium", repeatType: "never", linkedTaskId: task.id, autoPlanned: true }));
    showToast(`Planned ${planned.length} session${planned.length === 1 ? "" : "s"}.`, () => ids.forEach((id) => store.deleteEvent(id)));
  }

  function remove() {
    if (task) {
      const { id: _id, createdAt: _createdAt, actualMinutes: _actual, progressPercent: _progress, ...rest } = task;
      store.deleteTask(task.id);
      showToast(`Deleted ${task.title}.`, () => store.addTask(rest));
    } else if (assignment) {
      const { id: _id, actualMinutes: _actual, status: _status, ...rest } = assignment;
      store.deleteAssignment(assignment.id);
      showToast(`Deleted ${assignment.title}.`, () => store.addAssignment(rest));
    }
    onDeleted();
  }

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex flex-wrap gap-2">
          <Chip tone={item.tone}>{item.courseLabel}</Chip>
          <Chip>{item.kind === "task" ? "Task" : "Assignment"}</Chip>
        </div>
        <h2 className="mb-1 mt-2.5 text-[22px] font-bold leading-tight tracking-[-0.02em]">{item.title}</h2>
        <p className="text-[13px] text-ink-2">
          {[item.dueDate ? `${getRelativeDayLabel(item.dueDate, today)}${item.dueTime ? ` at ${formatShortTime(item.dueTime)}` : ""}` : "No due date", item.done ? "" : item.reason].filter(Boolean).join(" · ")}
        </p>
      </div>

      {task || assignment ? (
        <>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label>Steps</Label>
              {item.steps.length === 0 ? (
                <Button size="sm" variant="ghost" onClick={breakDown} icon={<Sparkles className="h-4 w-4" />}>
                  Break it down
                </Button>
              ) : (
                <span className="text-[13px] font-semibold text-ink-2">
                  {item.steps.filter((step) => step.done).length} of {item.steps.length}
                </span>
              )}
            </div>
            {item.steps.map((step, index) => (
              <div key={step.id} className={cn("flex items-center gap-3 py-2.5", index > 0 && "border-t border-line")}>
                <Checkbox checked={step.done} onChange={() => setSteps(item.steps.map((entry) => (entry.id === step.id ? { ...entry, done: !entry.done } : entry)))} label={`Mark step ${step.title} done`} />
                <span className={cn("min-w-0 flex-1 font-medium", step.done && "text-ink-3 line-through")}>{step.title}</span>
                {step.minutes ? <span className="text-[13px] text-ink-2">{step.minutes} min</span> : null}
                <button type="button" aria-label={`Remove step ${step.title}`} onClick={() => setSteps(item.steps.filter((entry) => entry.id !== step.id))} className="text-ink-3 hover:text-rose">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!newStep.trim()) return;
                setSteps([...item.steps, { id: crypto.randomUUID(), title: newStep.trim(), done: false }]);
                setNewStep("");
              }}
            >
              <TextInput value={newStep} onChange={(event) => setNewStep(event.target.value)} placeholder="Add a step" aria-label="New step" className="h-10" />
              <Button type="submit" disabled={!newStep.trim()}>
                Add
              </Button>
            </form>
          </div>

          {task ? <>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label>Planned sessions</Label>
              {!item.done ? (
                <Button size="sm" variant="ghost" onClick={planSessions} icon={<Sparkles className="h-4 w-4" />}>
                  {sessions.length ? "Plan more" : "Plan sessions"}
                </Button>
              ) : null}
            </div>
            {sessions.length ? (
              <div className="grid grid-cols-3 gap-2">
                {sessions.slice(0, 6).map((session) => (
                  <div key={session.id} className={cn("rounded-xl border px-3 py-2.5", session.date === today ? "border-accent-line bg-accent-soft/50" : "border-line")}>
                    <div className="truncate text-[13px] font-semibold">{getRelativeDayLabel(session.date, today)}</div>
                    <div className="text-[13px] text-ink-2">{formatShortTime(session.startTime)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-2">No time set aside yet.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <TextInput type="date" value={task.dueDate ?? ""} onChange={(event) => store.updateTask(task.id, { dueDate: event.target.value || undefined })} />
            </Field>
            <Field label="Status">
              <SelectInput value={task.status === "overdue" ? "not_started" : task.status} onChange={(event) => store.updateTaskStatus(task.id, event.target.value as typeof task.status)}>
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="paused">Paused</option>
                <option value="completed">Done</option>
              </SelectInput>
            </Field>
          </div>
          </> : null}
        </>
      ) : null}

      {assignment ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <SelectInput value={assignment.status} onChange={(event) => store.updateAssignment(assignment.id, { status: event.target.value as Assignment["status"] })}>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="submitted">Submitted</option>
              <option value="graded">Graded</option>
            </SelectInput>
          </Field>
          <Field label="Score (%)">
            <TextInput
              type="number"
              min={0}
              max={100}
              value={assignment.score ?? ""}
              placeholder="When graded"
              onChange={(event) => {
                const score = event.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(event.target.value)));
                store.updateAssignment(assignment.id, score === undefined ? { score } : { score, status: "graded" });
              }}
            />
          </Field>
          <Field label="Due date" className="col-span-2">
            <TextInput type="date" value={assignment.dueDate} onChange={(event) => store.updateAssignment(assignment.id, { dueDate: event.target.value })} />
          </Field>
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        {task && !item.done ? (
          <Button variant="primary" full href={`/focus?task=${task.id}`} icon={<Timer className="h-[17px] w-[17px]" />}>
            Start focus on this
          </Button>
        ) : (
          <Button variant="primary" full onClick={() => toggleWork(store, item)}>
            {item.done ? "Reopen" : "Mark as submitted"}
          </Button>
        )}
        <Button variant="danger" onClick={remove} icon={<Trash2 className="h-4 w-4" />}>
          Delete
        </Button>
      </div>
    </div>
  );
}
