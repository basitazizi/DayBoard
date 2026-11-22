"use client";

import { useRouter } from "next/navigation";
import { BarChart3, CalendarDays, CheckSquare, CornerDownLeft, FileText, GraduationCap, Home, Moon, Plus, School, Search, Settings, Sparkles, Sun, Target, Timer, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getRelativeDayLabel, todayKey } from "@/lib/date-utils";
import { useTheme } from "@/lib/theme";
import { useApp } from "./app-context";
import { Sheet } from "./ui";

interface Command {
  id: string;
  group: string;
  title: string;
  detail?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

const PAGES: Array<{ href: string; label: string; icon: LucideIcon; key: string }> = [
  { href: "/", label: "Dashboard", icon: Home, key: "d" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, key: "c" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, key: "t" },
  { href: "/school", label: "School", icon: GraduationCap, key: "s" },
  { href: "/focus", label: "Focus", icon: Timer, key: "f" },
  { href: "/habits", label: "Habits", icon: Target, key: "h" },
  { href: "/insights", label: "Insights", icon: BarChart3, key: "i" },
  { href: "/notes", label: "Notes", icon: FileText, key: "n" },
  { href: "/assistant", label: "Assistant", icon: Sparkles, key: "a" },
  { href: "/settings", label: "Settings", icon: Settings, key: "," }
];

export const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Ctrl", "K"], label: "Search everything" },
  { keys: ["/"], label: "Search everything" },
  { keys: ["N"], label: "Add something" },
  { keys: ["G", "then a letter"], label: "Go to a page: D dashboard, C calendar, T tasks, S school, F focus, H habits, I insights, N notes, A assistant" },
  { keys: ["?"], label: "Show these shortcuts" },
  { keys: ["Esc"], label: "Close any window" }
];

function typing(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function matches(text: string, query: string) {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** Search across everything plus quick actions, opened with Ctrl+K, "/" or the search button. Also handles keyboard shortcuts. */
export function CommandPalette() {
  const router = useRouter();
  const { store, openQuickAdd, quickAdd } = useApp();
  const { theme, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingGo = useRef(0);

  useEffect(() => {
    const openPalette = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    const onOpenEvent = () => openPalette();
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || document.querySelector("[role=dialog]")) return;
      const key = event.key.toLowerCase();
      if (Date.now() - pendingGo.current < 1200) {
        pendingGo.current = 0;
        const page = PAGES.find((entry) => entry.key === key);
        if (page) {
          event.preventDefault();
          router.push(page.href);
        }
        return;
      }
      if (key === "/") {
        event.preventDefault();
        openPalette();
      } else if (key === "n") {
        event.preventDefault();
        openQuickAdd();
      } else if (key === "g") {
        pendingGo.current = Date.now();
      } else if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("dayboard:open-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dayboard:open-search", onOpenEvent);
    };
  }, [router, openQuickAdd]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Closes the palette if Quick Add opens from one of its actions.
  useEffect(() => {
    if (quickAdd?.open) setOpen(false);
  }, [quickAdd?.open, quickAdd?.nonce]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const data = store.data;
    const today = todayKey();
    const list: Command[] = [];

    list.push(
      { id: "add", group: "Actions", title: "Add something", detail: "Task, event, exam, habit or note", icon: <Plus className="h-4 w-4" />, keywords: "new create quick add", run: () => openQuickAdd() },
      { id: "focus", group: "Actions", title: "Start a focus session", icon: <Timer className="h-4 w-4" />, keywords: "pomodoro timer study", run: go("/focus") },
      {
        id: "theme",
        group: "Actions",
        title: theme === "night" ? "Switch to light mode" : "Switch to dark mode",
        icon: theme === "night" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        keywords: "theme dark light night day",
        run: () => {
          setMode(theme === "night" ? "day" : "night");
          setOpen(false);
        }
      },
      { id: "customize", group: "Actions", title: "Customize my dashboard", icon: <Settings className="h-4 w-4" />, keywords: "layout cards widgets personalize", run: go("/settings?tab=dashboard") },
      { id: "shortcuts", group: "Actions", title: "Show keyboard shortcuts", icon: <CornerDownLeft className="h-4 w-4" />, keywords: "keys help", run: () => { setOpen(false); setHelpOpen(true); } }
    );

    for (const page of PAGES) {
      const Icon = page.icon;
      list.push({ id: `page-${page.href}`, group: "Go to", title: page.label, icon: <Icon className="h-4 w-4" />, run: go(page.href) });
    }

    for (const task of data.tasks) {
      if (task.status === "cancelled") continue;
      list.push({ id: `task-${task.id}`, group: "Tasks", title: task.title, detail: task.status === "completed" ? "Done" : task.dueDate ? `Due ${getRelativeDayLabel(task.dueDate, today)}` : "No date", icon: <CheckSquare className="h-4 w-4" />, keywords: task.description, run: go(`/tasks?open=task-${task.id}`) });
    }
    for (const assignment of data.assignments) {
      list.push({ id: `assignment-${assignment.id}`, group: "Tasks", title: assignment.title, detail: assignment.dueDate ? `Assignment · due ${getRelativeDayLabel(assignment.dueDate, today)}` : "Assignment", icon: <FileText className="h-4 w-4" />, run: go(`/tasks?open=assignment-${assignment.id}`) });
    }
    for (const exam of data.exams) {
      list.push({ id: `exam-${exam.id}`, group: "School", title: exam.title, detail: `Exam · ${getRelativeDayLabel(exam.examDate, today)}`, icon: <GraduationCap className="h-4 w-4" />, run: go("/school?tab=exams") });
    }
    for (const course of data.courses) {
      list.push({ id: `course-${course.id}`, group: "School", title: course.name, detail: [course.code, course.days !== "To be announced" ? course.days : ""].filter(Boolean).join(" · "), icon: <School className="h-4 w-4" />, keywords: course.code, run: go("/school") });
    }
    for (const event of data.events) {
      list.push({ id: `event-${event.id}`, group: "Calendar", title: event.title, detail: getRelativeDayLabel(event.date, today), icon: <CalendarDays className="h-4 w-4" />, keywords: `${event.location ?? ""} ${event.description ?? ""}`, run: go(`/calendar?date=${event.date}`) });
    }
    for (const note of data.notes) {
      list.push({ id: `note-${note.id}`, group: "Notes", title: note.title || "Untitled note", detail: note.content.slice(0, 70) || note.category, icon: <FileText className="h-4 w-4" />, keywords: `${note.content} ${note.category}`, run: go(`/notes?open=${note.id}`) });
    }
    for (const habit of data.habits) {
      list.push({ id: `habit-${habit.id}`, group: "Habits", title: habit.name, detail: habit.completedToday ? "Done today" : `${habit.streak} day streak`, icon: <Target className="h-4 w-4" />, run: go("/habits") });
    }
    return list;
  }, [store.data, theme, router, openQuickAdd, setMode]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return commands.filter((command) => command.group === "Actions" || command.group === "Go to");
    const found = commands.filter((command) => matches(`${command.title} ${command.detail ?? ""} ${command.keywords ?? ""}`, trimmed)).slice(0, 40);
    found.push({
      id: "ask",
      group: "Assistant",
      title: `Ask the assistant: “${trimmed}”`,
      icon: <Sparkles className="h-4 w-4" />,
      run: () => {
        setOpen(false);
        router.push(`/assistant?q=${encodeURIComponent(trimmed)}`);
      }
    });
    return found;
  }, [commands, query, router]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";

  return (
    <>
      <Sheet open={open} onClose={() => setOpen(false)} title="Search" wide>
        <div className="flex h-12 items-center gap-2.5 rounded-xl border-2 border-accent px-3.5">
          <Search className="h-[18px] w-[18px] shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(results.length - 1, index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                results[active]?.run();
              }
            }}
            placeholder="Search tasks, notes, classes, events… or type a command"
            aria-label="Search"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
          />
        </div>
        <div ref={listRef} id="command-results" role="listbox" aria-label="Results" className="mt-3 grid gap-0.5">
          {results.map((command, index) => {
            const heading = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {heading ? <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{heading}</div> : null}
                <button
                  id={`command-${command.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => command.run()}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", index === active ? "bg-accent-soft" : "hover:bg-surface-2")}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-bg text-ink-2">{command.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{command.title}</span>
                    {command.detail ? <span className="block truncate text-[13px] text-ink-2">{command.detail}</span> : null}
                  </span>
                  {index === active ? <CornerDownLeft className="h-4 w-4 shrink-0 text-ink-3" /> : null}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 hidden text-xs text-ink-3 sm:block">Use the arrow keys to move, Enter to open. Press ? anywhere to see all shortcuts.</p>
      </Sheet>

      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <div className="grid gap-1">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label + shortcut.keys.join()} className="db-row flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
              <span className="min-w-0 flex-1 text-sm">{shortcut.label}</span>
              <span className="flex shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <kbd key={key} className="rounded-md border border-line bg-bg px-2 py-0.5 text-xs font-semibold">
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}

export function openSearch() {
  window.dispatchEvent(new Event("dayboard:open-search"));
}
