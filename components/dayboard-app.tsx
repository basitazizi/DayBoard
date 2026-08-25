"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlarmClock,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleEllipsis,
  Dumbbell,
  Droplets,
  FileText,
  GraduationCap,
  Home,
  Leaf,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
  Target,
  Trash2,
  User,
  Wifi,
  X
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatClock,
  formatDisplayDate,
  formatDuration,
  formatMobileDate,
  formatMonthYear,
  formatShortTime,
  formatTime,
  getMonthGrid,
  getRelativeDayLabel,
  getWeekDays,
  minutesFromTime,
  todayKey
} from "@/lib/date-utils";
import { currentTimeTopPercent, detectConflict, getEventsForDate, getEventStatus, sortEvents } from "@/lib/calendar";
import { useSupabaseAuth } from "@/lib/auth";
import { useDayBoardData } from "@/lib/local-data";
import { getGreeting } from "@/lib/time-logic";
import { getTaskPriority, sortRelevantTasks } from "@/lib/task-priority";
import type { CalendarEvent, CalendarView, DayBoardData, EventCategory, Habit, Task, TaskPriority } from "@/types/dayboard";

type Screen = "dashboard" | "calendar" | "tasks" | "school" | "habits" | "insights" | "notes" | "settings" | "display";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home, screen: "dashboard" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, screen: "calendar" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, screen: "tasks" },
  { href: "/school", label: "School", icon: GraduationCap, screen: "school" },
  { href: "/habits", label: "Habits", icon: Target, screen: "habits" },
  { href: "/insights", label: "Insights", icon: BarChart3, screen: "insights" },
  { href: "/notes", label: "Notes", icon: FileText, screen: "notes" },
  { href: "/settings", label: "Settings", icon: Settings, screen: "settings" }
] as const;

const eventIconMap: Record<EventCategory, ReactNode> = {
  school: <BookOpen className="h-6 w-6" />,
  work: <BriefcaseBusiness className="h-6 w-6" />,
  personal: <User className="h-6 w-6" />,
  gym: <Dumbbell className="h-6 w-6" />,
  study: <BookOpen className="h-6 w-6" />,
  appointment: <CalendarDays className="h-6 w-6" />,
  deadline: <AlarmClock className="h-6 w-6" />,
  social: <User className="h-6 w-6" />,
  other: <CircleEllipsis className="h-6 w-6" />
};

const habitIconMap: Record<Habit["icon"], ReactNode> = {
  dumbbell: <Dumbbell className="h-5 w-5" />,
  book: <BookOpen className="h-5 w-5" />,
  droplet: <Droplets className="h-5 w-5" />,
  leaf: <Leaf className="h-5 w-5" />,
  target: <Target className="h-5 w-5" />
};

function useNow() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

export function DayBoardApp({ screen }: { screen: Screen }) {
  const store = useDayBoardData();
  const auth = useSupabaseAuth();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const now = useNow();
  const isDisplay = screen === "display";

  return (
    <main
      className={cn(
        "lcd-frame min-h-dvh bg-white text-[#111111]",
        (screen === "dashboard" || isDisplay) && "lg:lcd-dashboard",
        isDisplay && "text-[1.05rem]"
      )}
    >
      <div className={cn("mx-auto flex min-h-dvh w-full max-w-[1920px] flex-col lg:h-dvh lg:min-h-0", isDisplay ? "p-3" : "lg:p-3")}>
        {screen === "dashboard" || isDisplay ? (
          <DashboardScreen store={store} auth={auth} now={now} displayMode={isDisplay} onQuickAdd={() => setQuickAddOpen(true)} />
        ) : (
          <InnerPageFrame screen={screen} store={store} auth={auth} now={now} onQuickAdd={() => setQuickAddOpen(true)} />
        )}
      </div>

      <MobileBottomNav onQuickAdd={() => setQuickAddOpen(true)} />
      <QuickAddSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} store={store} />
    </main>
  );
}

function DashboardScreen({
  store,
  auth,
  now,
  displayMode,
  onQuickAdd
}: {
  store: ReturnType<typeof useDayBoardData>;
  auth: ReturnType<typeof useSupabaseAuth>;
  now: Date;
  displayMode: boolean;
  onQuickAdd: () => void;
}) {
  const { data, lastSynced } = store;

  return (
    <div className={cn("flex min-h-dvh flex-col lg:h-full lg:min-h-0", displayMode ? "gap-3" : "lg:gap-3")}>
      <DashboardHeader data={data} auth={auth} now={now} lastSynced={lastSynced} displayMode={displayMode} />
      <MobileDashboardHeader data={data} auth={auth} now={now} onQuickAdd={onQuickAdd} />

      <section className="mobile-safe-bottom grid flex-1 grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2 lg:min-h-0 lg:grid-cols-3 lg:grid-rows-[1.05fr_0.95fr] lg:gap-3 lg:overflow-hidden lg:px-0 lg:py-0">
        <TodayCard data={data} now={now} />
        <TasksCard store={store} now={now} />
        <UpcomingCard data={data} />
        <HabitsCard store={store} />
        <InsightsCard data={data} />
        <NotesCard store={store} />
      </section>

      <DesktopNavigation active={displayMode ? "dashboard" : "dashboard"} />
    </div>
  );
}

function DashboardHeader({
  data,
  auth,
  now,
  lastSynced,
  displayMode
}: {
  data: DayBoardData;
  auth: ReturnType<typeof useSupabaseAuth>;
  now: Date;
  lastSynced: Date;
  displayMode: boolean;
}) {
  const greeting = getGreeting(now);
  const displayName = auth.user?.user_metadata?.display_name || data.displayName;

  return (
    <header className="hidden items-center justify-between border-b border-[#e5e5e5] bg-white px-8 py-3 lg:flex">
      <div className="flex items-center gap-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-black">
          <Check className="h-8 w-8" strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none">DayBoard</div>
          <div className="mt-1 text-base text-[#555]">Plan. Focus. Achieve.</div>
        </div>
      </div>

      <div className="h-16 w-px bg-[#e5e5e5]" />

      <div className="min-w-[260px]">
        <div className="text-base font-medium uppercase">{formatDisplayDate(now, data.timezone)}</div>
        <div className="mt-1 text-[3.4rem] font-semibold leading-none tracking-normal">
          {formatClock(now, data.timezone)}
        </div>
      </div>

      <div className="h-16 w-px bg-[#e5e5e5]" />

      <div className="min-w-[360px]">
        <div className="text-2xl font-semibold">
          {greeting.greeting}, {displayName}
        </div>
        <div className="mt-1 text-lg text-[#555]">{greeting.detail}</div>
      </div>

      <div className="flex items-center gap-5">
        <Sun className="h-12 w-12" strokeWidth={1.7} />
        <div>
          <div className="text-2xl font-semibold">72°</div>
          <div className="text-base text-[#555]">Sunny</div>
          <div className="mt-1 text-sm text-[#555]">↑ 78° ↓ 63°</div>
        </div>
      </div>

      <div className="h-16 w-px bg-[#e5e5e5]" />

      <div className="flex items-center gap-4">
        <Wifi className="h-10 w-10" strokeWidth={2} />
        <div>
          <div className="text-lg font-medium">Connected</div>
          <div className="text-base text-[#555]">{displayMode ? "Display mode active" : `Synced ${formatClock(lastSynced)}`}</div>
        </div>
      </div>

      <ProfileControl auth={auth} />
    </header>
  );
}

function ProfileControl({ auth }: { auth: ReturnType<typeof useSupabaseAuth> }) {
  const [open, setOpen] = useState(false);
  const email = auth.user?.email;

  if (auth.loading) {
    return <div className="h-14 w-28 rounded-lg bg-[#f3f3f3]" aria-label="Checking session" />;
  }

  if (!auth.user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-3 rounded-lg bg-black px-6 py-4 text-lg font-medium text-white"
        style={{ color: "#ffffff" }}
      >
        <User className="h-6 w-6" />
        Login
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex h-14 w-14 items-center justify-center rounded-lg bg-black text-white"
        aria-label="Open profile menu"
        style={{ color: "#ffffff" }}
      >
        <User className="h-7 w-7" />
      </button>

      {open ? (
        <div className="absolute right-0 top-16 z-40 w-64 rounded-xl border border-[#e0e0e0] bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#e5e5e5] px-3 py-3">
            <div className="text-sm font-semibold">Account</div>
            <div className="mt-1 truncate text-sm text-[#666]">{email}</div>
          </div>
          <Link href="/settings" className="block rounded-lg px-3 py-3 text-sm hover:bg-[#fafafa]">
            Preferences
          </Link>
          <Link href="/display" className="block rounded-lg px-3 py-3 text-sm hover:bg-[#fafafa]">
            Display Mode
          </Link>
          <button
            onClick={async () => {
              await auth.signOut();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm hover:bg-[#fafafa]"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MobileDashboardHeader({
  data,
  auth,
  now,
  onQuickAdd
}: {
  data: DayBoardData;
  auth: ReturnType<typeof useSupabaseAuth>;
  now: Date;
  onQuickAdd: () => void;
}) {
  const greeting = getGreeting(now);
  const displayName = auth.user?.user_metadata?.display_name || data.displayName;

  return (
    <header className="block border-b border-[#e5e5e5] bg-white lg:hidden">
      <div className="flex h-16 items-center justify-between px-6">
        <button aria-label="Open menu">
          <Menu className="h-7 w-7" />
        </button>
        <div className="text-xl font-semibold">Dashboard</div>
        {auth.user ? (
          <Link href="/settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-black bg-black text-white" aria-label="Profile">
            <User className="h-5 w-5" />
          </Link>
        ) : (
          <Link href="/login" className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">
            Login
          </Link>
        )}
      </div>
      <div className="px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 text-3xl font-semibold leading-tight">
              <span>
                {greeting.greeting}, {displayName}
              </span>
              <Sun className="h-8 w-8 shrink-0" strokeWidth={1.8} />
            </div>
            <div className="mt-3 text-xl text-[#666]">{formatMobileDate(now, data.timezone)}</div>
          </div>
          <button
            onClick={onQuickAdd}
            className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#d8d8d8] min-[420px]:flex"
            aria-label="Add item"
          >
            <Plus className="h-7 w-7" />
          </button>
        </div>
        <div className="mt-6 ml-auto flex w-fit items-center gap-4 rounded-xl border border-[#e0e0e0] px-5 py-4">
          <Sun className="h-10 w-10" strokeWidth={1.7} />
          <div className="text-4xl font-semibold">72°</div>
          <div className="text-base text-[#333]">Sunny</div>
        </div>
      </div>
    </header>
  );
}

function CardHeader({ icon, title, href }: { icon: ReactNode; title: string; href?: string }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-5">
        {icon}
        <h2 className="text-xl font-semibold tracking-normal lg:text-lg xl:text-xl">{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="text-base font-medium lg:text-sm xl:text-base">
          View all
        </Link>
      ) : null}
    </div>
  );
}

function TodayCard({ data, now }: { data: DayBoardData; now: Date }) {
  const today = todayKey();
  const events = getEventsForDate(data.events, today);

  return (
    <article className="card flex min-h-[300px] flex-col overflow-hidden p-6 lg:min-h-0 lg:p-5">
      <CardHeader icon={<CalendarDays className="h-7 w-7" />} title="TODAY" href="/calendar" />
      <div className="flex-1 space-y-0">
        {events.length === 0 ? (
          <EmptyState>Nothing scheduled today.</EmptyState>
        ) : (
          events.slice(0, 5).map((event) => {
            const status = getEventStatus(event, now);
            const duration = minutesFromTime(event.endTime) - minutesFromTime(event.startTime);
            return (
              <div key={event.id} className={cn("grid grid-cols-[88px_1px_1fr] gap-5", status === "finished" && "opacity-45")}>
                <div className="py-3 text-lg font-medium lg:py-2 lg:text-base xl:text-lg">{formatTime(event.startTime)}</div>
                <div className="bg-[#e5e5e5]" />
                <div className={cn("border-b border-[#e5e5e5] py-3 lg:py-2", status === "active" && "rounded-lg border border-black px-3")}>
                  <div className="flex items-center gap-4">
                    <span className="text-[#111]">{eventIconMap[event.category]}</span>
                    <div>
                      {status === "active" ? <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em]">● Now</div> : null}
                      <div className="text-lg font-medium leading-tight">{event.title}</div>
                      <div className="mt-1 text-sm text-[#444]">{formatDuration(duration)}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <CardFooter href="/calendar">View calendar</CardFooter>
    </article>
  );
}

function TasksCard({ store, now }: { store: ReturnType<typeof useDayBoardData>; now: Date }) {
  const tasks = sortRelevantTasks(store.data.tasks, now);
  const completed = store.data.tasks.filter((task) => task.status === "completed").length;
  const total = store.data.tasks.length;

  return (
    <article className="card flex min-h-[300px] flex-col overflow-hidden p-6 lg:min-h-0 lg:p-5">
      <CardHeader icon={<CheckSquare className="h-7 w-7" />} title="TASKS" href="/tasks" />
      <div className="flex-1">
        {tasks.slice(0, 6).map((task) => (
          <TaskLine key={task.id} task={task} now={now} onToggle={() => store.updateTaskStatus(task.id, task.status === "completed" ? "not_started" : "completed")} />
        ))}
      </div>
      <div>
        <div className="mt-2 text-lg lg:text-base">
          {completed} / {total} completed
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-[#e8e8e8]">
          <div className="h-full rounded-full bg-black" style={{ width: `${Math.round((completed / Math.max(total, 1)) * 100)}%` }} />
        </div>
      </div>
    </article>
  );
}

function TaskLine({ task, now, onToggle }: { task: Task; now: Date; onToggle: () => void }) {
  const priority = getTaskPriority(task, now);
  const dotClass = {
    gray: "border-black bg-white",
    blue: "border-[#3b82f6] bg-[#3b82f6]",
    green: "border-[#16a34a] bg-[#16a34a]",
    red: "border-[#ef4444] bg-[#ef4444]"
  }[priority.displayStatus];

  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-4 border-b border-[#e5e5e5] py-3 last:border-b-0">
      <button
        onClick={onToggle}
        className={cn("flex h-5 w-5 items-center justify-center rounded-full border transition-colors", dotClass)}
        aria-label={`Toggle ${task.title}`}
      >
        {task.status === "completed" ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
      </button>
      <div className={cn("min-w-0 text-lg lg:text-base xl:text-lg", task.status === "completed" && "text-[#555] line-through")}>{task.title}</div>
      <div className="whitespace-nowrap text-sm text-[#555]">{task.status === "completed" ? "Completed" : task.dueDate ? getRelativeDayLabel(task.dueDate) : task.priority}</div>
    </div>
  );
}

function UpcomingCard({ data }: { data: DayBoardData }) {
  const items = [...data.upcoming].sort((a, b) => b.importance - a.importance || a.date.localeCompare(b.date)).slice(0, 4);

  return (
    <article className="card flex min-h-[300px] flex-col overflow-hidden p-6 lg:min-h-0 lg:p-5">
      <CardHeader icon={<CalendarDays className="h-7 w-7" />} title="UPCOMING" href="/calendar" />
      <div className="flex-1 space-y-3">
        {items.map((item) => {
          const date = new Date(`${item.date}T12:00:00`);
          return (
            <div key={item.id} className="grid grid-cols-[64px_1fr] gap-4 border-b border-[#e5e5e5] pb-3 lg:pb-2 last:border-b-0">
              <div className="rounded-lg border border-[#dddddd] px-2 py-2 text-center">
                <div className="text-xs font-semibold uppercase">{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</div>
                <div className="text-3xl font-semibold leading-none">{date.getDate()}</div>
              </div>
              <div className="pt-1">
                <div className="text-lg font-medium">{item.title}</div>
                <div className="mt-1 text-base text-[#555]">{item.timeLabel}</div>
              </div>
            </div>
          );
        })}
      </div>
      <CardFooter href="/calendar">View calendar</CardFooter>
    </article>
  );
}

function HabitsCard({ store }: { store: ReturnType<typeof useDayBoardData> }) {
  return (
    <article className="card min-h-[300px] overflow-hidden p-6 lg:min-h-0 lg:p-5">
      <CardHeader icon={<Target className="h-7 w-7" />} title="HABITS" href="/habits" />
      <div>
        {store.data.habits.slice(0, 5).map((habit) => (
          <button
            key={habit.id}
            onClick={() => store.toggleHabit(habit.id)}
            className="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-[#e5e5e5] py-3 text-left last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-4">
              {habitIconMap[habit.icon]}
              <div className="min-w-0">
                <div className="text-lg font-medium leading-tight">{habit.name}</div>
                <div className="mt-1 text-sm text-[#555]">{habit.streak} day streak</div>
              </div>
            </div>
            <WeekDots pattern={habit.weekPattern} />
          </button>
        ))}
      </div>
    </article>
  );
}

function WeekDots({ pattern }: { pattern: boolean[] }) {
  return (
    <div className="flex items-center gap-2">
      {pattern.map((complete, index) => (
        <span key={index} className={cn("h-3.5 w-3.5 rounded-full border border-black", complete ? "bg-black" : "bg-white")} />
      ))}
    </div>
  );
}

function InsightsCard({ data }: { data: DayBoardData }) {
  const total = data.tasks.length;
  const completed = data.tasks.filter((task) => task.status === "completed").length;
  const focusScore = Math.round((completed / Math.max(total, 1)) * 45 + 30);
  const points = [25, 58, 44, 78, 43, 74, 35, 58, 66, 92, 73, 87];

  return (
    <article className="card min-h-[300px] overflow-hidden p-6 lg:min-h-0 lg:p-5">
      <CardHeader icon={<BarChart3 className="h-7 w-7" />} title="INSIGHTS" href="/insights" />
      <MetricRow label="Tasks Completed" value={`${completed + 16} / ${total + 18}`} />
      <MetricRow label="Study Time" value="12h 45m" />
      <MetricRow label="Gym Sessions" value="3 this week" />
      <MetricRow label="Focus Score" value={`${focusScore}%`} />
      <MiniChart points={points} />
    </article>
  );
}

function NotesCard({ store }: { store: ReturnType<typeof useDayBoardData> }) {
  const note = [...store.data.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))[0];

  return (
    <article className="card flex min-h-[300px] flex-col overflow-hidden p-6 lg:min-h-0 lg:p-5">
      <CardHeader icon={<FileText className="h-7 w-7" />} title="NOTES" href="/notes" />
      {note ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-5xl font-semibold leading-none">“</div>
          <p className="mt-2 max-w-[28rem] whitespace-pre-line text-xl leading-relaxed lg:text-lg xl:text-xl">{note.content}</p>
        </div>
      ) : (
        <EmptyState>Add your first note.</EmptyState>
      )}
      <div className="mt-5 border-t border-[#e5e5e5] pt-5 text-center text-lg">
        <Link href="/notes" className="inline-flex items-center gap-2">
          <Plus className="h-5 w-5" /> New note
        </Link>
      </div>
    </article>
  );
}

function CardFooter({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="mt-4 text-right text-lg lg:text-base">
      <Link href={href} className="inline-flex items-center gap-3 font-medium">
        {children}
        <ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg bg-[#fafafa] text-center text-[#666]">{children}</div>;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e5e5e5] py-1.5 text-base">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MiniChart({ points }: { points: number[] }) {
  const width = 320;
  const height = 110;
  const step = width / (points.length - 1);
  const coords = points.map((value, index) => `${index * step},${height - (value / 100) * (height - 16) - 8}`).join(" ");

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full overflow-visible" role="img" aria-label="Weekly productivity line chart">
        {[0, 25, 50, 75, 100].map((value) => (
          <line key={value} x1="0" x2={width} y1={height - (value / 100) * (height - 16) - 8} y2={height - (value / 100) * (height - 16) - 8} stroke="#e5e5e5" strokeWidth="1" />
        ))}
        <polyline points={coords} fill="none" stroke="#111111" strokeWidth="2.5" />
        {points.map((value, index) => (
          <circle key={index} cx={index * step} cy={height - (value / 100) * (height - 16) - 8} r="4" fill="#111111" />
        ))}
      </svg>
      <div className="grid grid-cols-7 text-center text-xs font-medium">
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
    </div>
  );
}

function DesktopNavigation({ active }: { active: Screen }) {
  return (
    <nav className="hidden border-t border-[#e5e5e5] bg-white px-10 py-3 lg:block">
      <div className="grid grid-cols-8 items-end gap-6">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.screen;
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-2 text-[#555]", isActive && "text-black")}>
              <Icon className="h-7 w-7" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-sm font-medium">{item.label}</span>
              <span className={cn("h-1 w-14 rounded-full", isActive ? "bg-black" : "bg-transparent")} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileBottomNav({ onQuickAdd }: { onQuickAdd: () => void }) {
  const pathname = usePathname();
  const mobileItems = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/school", label: "School", icon: GraduationCap },
    { href: "/settings", label: "More", icon: MoreHorizontal }
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e5e5] bg-white/95 px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
      <button
        onClick={onQuickAdd}
        className="absolute left-1/2 top-0 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-black text-white shadow-[0_0_0_1px_#d9d9d9]"
        aria-label="Add new"
      >
        <Plus className="h-10 w-10" />
      </button>
      <div className="grid grid-cols-5 items-end">
        {mobileItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-1 text-[#555]", index === 2 && "pt-8", isActive && "text-black")}>
              <Icon className="h-7 w-7" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-sm font-medium">{item.label}</span>
              <span className={cn("mt-1 h-1 w-8 rounded-full", isActive ? "bg-black" : "bg-transparent")} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function InnerPageFrame({
  screen,
  store,
  auth,
  now,
  onQuickAdd
}: {
  screen: Exclude<Screen, "dashboard" | "display">;
  store: ReturnType<typeof useDayBoardData>;
  auth: ReturnType<typeof useSupabaseAuth>;
  now: Date;
  onQuickAdd: () => void;
}) {
  const title = screen[0].toUpperCase() + screen.slice(1);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#e5e5e5] bg-white px-5 py-4 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="lg:hidden" aria-label="Back to dashboard">
            <ChevronLeft className="h-7 w-7" />
          </Link>
          <h1 className="text-2xl font-semibold lg:text-3xl">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="hidden h-11 items-center gap-2 rounded-lg border border-[#e0e0e0] px-4 text-sm text-[#333] lg:flex">
            <Wifi className="h-4 w-4" /> Local sync
          </button>
          <button onClick={onQuickAdd} className="flex h-11 items-center gap-2 rounded-lg bg-black px-4 font-medium text-white">
            <Plus className="h-5 w-5" /> <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </header>

      <section className="mobile-safe-bottom flex-1 px-5 py-5 lg:px-8">
        {screen === "calendar" ? <CalendarPage store={store} now={now} /> : null}
        {screen === "tasks" ? <TasksPage store={store} now={now} /> : null}
        {screen === "school" ? <SchoolPage data={store.data} /> : null}
        {screen === "habits" ? <HabitsPage store={store} /> : null}
        {screen === "insights" ? <InsightsPage data={store.data} /> : null}
        {screen === "notes" ? <NotesPage store={store} /> : null}
        {screen === "settings" ? <SettingsPage store={store} auth={auth} /> : null}
      </section>

      <DesktopNavigation active={screen} />
    </>
  );
}

function CalendarPage({ store, now }: { store: ReturnType<typeof useDayBoardData>; now: Date }) {
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [view, setView] = useState<CalendarView>("month");
  const selectedEvents = getEventsForDate(store.data.events, selectedDate);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedDate(todayKey())} className="rounded-lg border border-[#e0e0e0] px-4 py-2 font-medium">
            Today
          </button>
          <button onClick={() => setSelectedDate(addDays(selectedDate, -30))} className="rounded-lg border border-[#e0e0e0] p-2" aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-[180px] text-center text-xl font-semibold">{formatMonthYear(selectedDate)}</div>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 30))} className="rounded-lg border border-[#e0e0e0] p-2" aria-label="Next month">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <SegmentedControl
          value={view}
          options={[
            ["month", "Month"],
            ["week", "Week"],
            ["day", "Day"]
          ]}
          onChange={(value) => setView(value as CalendarView)}
        />
      </div>

      {view === "month" ? (
        <div className="grid gap-5 lg:grid-cols-[1.55fr_0.95fr]">
          <MonthCalendar data={store.data} selectedDate={selectedDate} onSelect={setSelectedDate} />
          <AgendaPanel dateKey={selectedDate} events={selectedEvents} />
        </div>
      ) : null}
      {view === "week" ? <WeekCalendar events={store.data.events} selectedDate={selectedDate} now={now} /> : null}
      {view === "day" ? <DayTimeline events={selectedEvents} dateKey={selectedDate} now={now} /> : null}
    </div>
  );
}

function MonthCalendar({ data, selectedDate, onSelect }: { data: DayBoardData; selectedDate: string; onSelect: (date: string) => void }) {
  const monthGrid = getMonthGrid(selectedDate);
  const today = todayKey();

  return (
    <div className="card p-4 lg:p-6">
      <div className="grid grid-cols-7 pb-3 text-center text-xs font-semibold text-[#666]">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {monthGrid.map((cell) => {
          const events = getEventsForDate(data.events, cell.dateKey);
          const isToday = cell.dateKey === today;
          const isSelected = cell.dateKey === selectedDate;
          return (
            <button
              key={cell.dateKey}
              onClick={() => onSelect(cell.dateKey)}
              className={cn(
                "min-h-[94px] rounded-lg border border-[#ededed] p-2 text-left transition-colors hover:border-[#bfbfbf] lg:min-h-[122px]",
                !cell.isCurrentMonth && "text-[#aaa]",
                isSelected && "bg-[#f4f4f4]",
                isToday && "border-black"
              )}
            >
              <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold", isToday && "bg-black text-white")}>{cell.day}</span>
              <div className="mt-2 space-y-1">
                {events.slice(0, 3).map((event) => (
                  <div key={event.id} className="truncate text-xs text-[#333]">
                    • {event.title}
                  </div>
                ))}
                {events.length > 3 ? <div className="text-xs text-[#666]">+{events.length - 3} more</div> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgendaPanel({ dateKey, events }: { dateKey: string; events: CalendarEvent[] }) {
  const date = new Date(`${dateKey}T12:00:00`);

  return (
    <aside className="card p-6">
      <h2 className="text-xl font-semibold uppercase">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date)}</h2>
      <div className="mt-6 space-y-4">
        {events.length === 0 ? <EmptyState>Nothing scheduled.</EmptyState> : null}
        {events.map((event) => (
          <div key={event.id} className="grid grid-cols-[90px_1fr] gap-4 border-b border-[#e5e5e5] pb-4">
            <div className="font-medium">{formatTime(event.startTime)}</div>
            <div>
              <div className="text-lg font-medium">{event.title}</div>
              <div className="mt-1 text-sm text-[#555]">
                {formatTime(event.startTime)}-{formatTime(event.endTime)} {event.location ? `• ${event.location}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function WeekCalendar({ events, selectedDate, now }: { events: CalendarEvent[]; selectedDate: string; now: Date }) {
  const days = getWeekDays(selectedDate);
  const hours = Array.from({ length: 17 }, (_, index) => index + 6);
  const currentTop = currentTimeTopPercent(now);

  return (
    <div className="card overflow-x-auto p-4 thin-scrollbar">
      <div className="min-w-[920px]">
        <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-[#e5e5e5] pb-3">
          <div />
          {days.map((day) => (
            <div key={day} className="text-center">
              <div className="text-xs font-semibold uppercase text-[#666]">{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${day}T12:00:00`))}</div>
              <div className="text-xl font-semibold">{new Date(`${day}T12:00:00`).getDate()}</div>
            </div>
          ))}
        </div>
        <div className="relative grid grid-cols-[70px_repeat(7,1fr)]" style={{ height: 850 }}>
          {days.includes(todayKey()) ? <div className="absolute left-[70px] right-0 z-10 border-t-2 border-black" style={{ top: `${currentTop}%` }} /> : null}
          <div>
            {hours.map((hour) => (
              <div key={hour} className="h-[50px] border-b border-[#f0f0f0] pr-3 text-right text-xs text-[#666]">
                {hour % 12 || 12} {hour >= 12 ? "PM" : "AM"}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={day} className="relative border-l border-[#e5e5e5]">
              {hours.map((hour) => (
                <div key={hour} className="h-[50px] border-b border-[#f0f0f0]" />
              ))}
              {getEventsForDate(events, day).map((event) => {
                const start = minutesFromTime(event.startTime);
                const end = minutesFromTime(event.endTime);
                const top = ((start - 360) / (17 * 60)) * 100;
                const height = ((end - start) / (17 * 60)) * 100;
                return (
                  <div key={event.id} className="absolute left-1 right-1 rounded-lg border border-black bg-white p-2 text-xs" style={{ top: `${top}%`, height: `${height}%` }}>
                    <div className="font-semibold">{event.title}</div>
                    <div>{formatShortTime(event.startTime)}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayTimeline({ events, dateKey, now }: { events: CalendarEvent[]; dateKey: string; now: Date }) {
  const hours = Array.from({ length: 17 }, (_, index) => index + 6);
  const isToday = dateKey === todayKey();

  return (
    <div className="card mx-auto max-w-4xl p-6">
      <h2 className="mb-6 text-xl font-semibold uppercase">{formatMobileDate(new Date(`${dateKey}T12:00:00`))}</h2>
      <div className="relative">
        {isToday ? <div className="absolute left-16 right-0 z-10 border-t-2 border-black" style={{ top: `${currentTimeTopPercent(now)}%` }} /> : null}
        {hours.map((hour) => (
          <div key={hour} className="grid min-h-[70px] grid-cols-[64px_1fr] border-b border-[#f0f0f0]">
            <div className="pt-2 text-sm text-[#666]">{hour % 12 || 12} {hour >= 12 ? "PM" : "AM"}</div>
            <div className="relative" />
          </div>
        ))}
        {events.map((event) => {
          const start = minutesFromTime(event.startTime);
          const end = minutesFromTime(event.endTime);
          return (
            <div
              key={event.id}
              className="absolute left-20 right-2 rounded-lg border border-black bg-white p-4"
              style={{
                top: `${((start - 360) / (17 * 60)) * 100}%`,
                height: `${Math.max(((end - start) / (17 * 60)) * 100, 7)}%`
              }}
            >
              <div className="font-semibold">{event.title}</div>
              <div className="mt-1 text-sm text-[#555]">{formatTime(event.startTime)}-{formatTime(event.endTime)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TasksPage({ store, now }: { store: ReturnType<typeof useDayBoardData>; now: Date }) {
  const [filter, setFilter] = useState("all");
  const filtered = sortRelevantTasks(store.data.tasks, now).filter((task) => {
    if (filter === "today") return task.dueDate === todayKey();
    if (filter === "upcoming") return task.dueDate && task.dueDate > todayKey() && task.status !== "completed";
    if (filter === "in_progress") return task.status === "in_progress" || task.status === "paused";
    if (filter === "completed") return task.status === "completed";
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl">
      <SegmentedControl
        value={filter}
        options={[
          ["all", "All"],
          ["today", "Today"],
          ["upcoming", "Upcoming"],
          ["in_progress", "In Progress"],
          ["completed", "Completed"]
        ]}
        onChange={setFilter}
      />
      <div className="mt-5 card overflow-hidden">
        {filtered.map((task) => (
          <TaskPageRow key={task.id} task={task} now={now} store={store} />
        ))}
      </div>
    </div>
  );
}

function TaskPageRow({ task, now, store }: { task: Task; now: Date; store: ReturnType<typeof useDayBoardData> }) {
  const priority = getTaskPriority(task, now);
  const colorClass = {
    gray: "border-black bg-white",
    blue: "border-[#3b82f6] bg-[#3b82f6]",
    green: "border-[#16a34a] bg-[#16a34a]",
    red: "border-[#ef4444] bg-[#ef4444]"
  }[priority.displayStatus];

  return (
    <div className="grid gap-3 border-b border-[#e5e5e5] p-5 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex gap-4">
        <button
          onClick={() => store.updateTaskStatus(task.id, task.status === "completed" ? "not_started" : "completed")}
          className={cn("mt-1 flex h-5 w-5 items-center justify-center rounded-full border", colorClass)}
          aria-label={`Toggle ${task.title}`}
        >
          {task.status === "completed" ? <Check className="h-3.5 w-3.5 text-white" /> : null}
        </button>
        <div>
          <div className={cn("text-lg font-semibold", task.status === "completed" && "text-[#666] line-through")}>{task.title}</div>
          <div className="mt-1 text-sm text-[#555]">
            {task.dueDate ? `${getRelativeDayLabel(task.dueDate)}${task.dueTime ? ` • ${formatTime(task.dueTime)}` : ""}` : "No deadline"} • {task.priority} • {task.category}
          </div>
          <div className="mt-1 text-sm text-[#555]">Estimated {formatDuration(task.estimatedMinutes)} • {priority.reason}</div>
        </div>
      </div>
      <div className="flex gap-2 sm:justify-end">
        {task.status !== "completed" ? (
          <>
            <button onClick={() => store.updateTaskStatus(task.id, "in_progress")} className="rounded-lg border border-[#dcdcdc] px-3 py-2 text-sm font-medium">
              Start
            </button>
            <button onClick={() => store.updateTaskStatus(task.id, "completed")} className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">
              Complete
            </button>
          </>
        ) : null}
        <button onClick={() => store.deleteTask(task.id)} className="rounded-lg border border-[#dcdcdc] p-2" aria-label={`Delete ${task.title}`}>
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function SchoolPage({ data }: { data: DayBoardData }) {
  const [tab, setTab] = useState("classes");

  return (
    <div className="mx-auto max-w-6xl">
      <SegmentedControl
        value={tab}
        options={[
          ["classes", "Classes"],
          ["assignments", "Assignments"],
          ["exams", "Exams"],
          ["grades", "Grades"]
        ]}
        onChange={setTab}
      />
      {tab === "classes" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {data.courses.map((course) => (
            <article key={course.id} className="card p-5">
              <div className="text-xl font-semibold">{course.code}</div>
              <div className="mt-1 text-lg">{course.name}</div>
              <div className="mt-5 text-[#555]">{course.days}</div>
              <div className="text-[#555]">{course.time}</div>
              <div className="mt-3 font-medium">{course.room}</div>
            </article>
          ))}
        </div>
      ) : null}
      {tab === "assignments" ? (
        <div className="mt-5 card divide-y divide-[#e5e5e5]">
          {data.assignments.map((assignment) => (
            <div key={assignment.id} className="p-5">
              <div className="text-lg font-semibold">
                {data.courses.find((course) => course.id === assignment.courseId)?.code} - {assignment.title}
              </div>
              <div className="mt-1 text-[#555]">Due {getRelativeDayLabel(assignment.dueDate)} • {formatTime(assignment.dueTime)}</div>
              <div className="mt-1 text-[#555]">Estimated {formatDuration(assignment.estimatedMinutes)} • Weight {assignment.gradeWeight ?? "?"}%</div>
            </div>
          ))}
        </div>
      ) : null}
      {tab === "exams" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {data.exams.map((exam) => (
            <article key={exam.id} className="card p-5">
              <div className="text-xl font-semibold">{exam.title}</div>
              <div className="mt-2 text-[#555]">{getRelativeDayLabel(exam.examDate)} • {formatTime(exam.examTime)}</div>
              <div className="mt-4 text-[#555]">{exam.gradeWeight}% of grade</div>
              <div className="mt-2 font-medium">
                Study: {formatDuration(exam.studyMinutesCompleted)} / {formatDuration(exam.studyMinutesGoal)}
              </div>
              <div className="mt-3 h-2 rounded-full bg-[#e8e8e8]">
                <div className="h-full rounded-full bg-black" style={{ width: `${(exam.studyMinutesCompleted / exam.studyMinutesGoal) * 100}%` }} />
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {tab === "grades" ? <div className="mt-5 card p-8 text-[#666]">Grade tracking is ready for the next phase.</div> : null}
    </div>
  );
}

function HabitsPage({ store }: { store: ReturnType<typeof useDayBoardData> }) {
  return (
    <div className="mx-auto max-w-4xl card divide-y divide-[#e5e5e5]">
      {store.data.habits.map((habit) => (
        <button key={habit.id} onClick={() => store.toggleHabit(habit.id)} className="grid w-full gap-4 p-5 text-left sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex gap-4">
            {habitIconMap[habit.icon]}
            <div>
              <div className="text-xl font-semibold">{habit.name}</div>
              <div className="mt-1 text-[#555]">{habit.streak} day streak</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <WeekDots pattern={habit.weekPattern} />
            <span className="rounded-lg border border-[#dcdcdc] px-3 py-2 text-sm font-medium">{habit.completedToday ? "Done" : "Mark Complete"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function InsightsPage({ data }: { data: DayBoardData }) {
  const completed = data.tasks.filter((task) => task.status === "completed").length;
  const total = data.tasks.length;
  const habitCompleted = data.habits.filter((habit) => habit.completedToday).length;

  return (
    <div className="mx-auto max-w-6xl">
      <SegmentedControl
        value="this_week"
        options={[
          ["this_week", "This Week"],
          ["this_month", "This Month"],
          ["last_30", "Last 30 Days"]
        ]}
        onChange={() => undefined}
      />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <InsightMetric title="Tasks Completed" value={`${completed + 16} / ${total + 18}`} />
        <InsightMetric title="Completion Rate" value={`${Math.round(((completed + 16) / (total + 18)) * 100)}%`} />
        <InsightMetric title="Focused Time" value="12h 45m" />
        <InsightMetric title="Habits" value={`${habitCompleted} / ${data.habits.length}`} />
        <InsightMetric title="Workload" value="Heavy" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <article className="card p-6">
          <h2 className="text-xl font-semibold">Productivity Chart</h2>
          <MiniChart points={[32, 62, 48, 78, 49, 75, 42, 59, 68, 91, 70, 86]} />
        </article>
        <article className="card p-6">
          <h2 className="text-xl font-semibold">Important This Week</h2>
          <div className="mt-4 space-y-4">
            <div>
              <div className="font-semibold">Linear Algebra Midterm</div>
              <div className="text-sm text-[#555]">2 days • preparation behind schedule</div>
            </div>
            <div>
              <div className="font-semibold">CS Assignment</div>
              <div className="text-sm text-[#555]">Tonight • high priority</div>
            </div>
            <div>
              <div className="font-semibold">Project Deadline</div>
              <div className="text-sm text-[#555]">4 days • heavy work remaining</div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function InsightMetric({ title, value }: { title: string; value: string }) {
  return (
    <article className="card p-5">
      <div className="text-sm font-medium uppercase text-[#666]">{title}</div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
    </article>
  );
}

function NotesPage({ store }: { store: ReturnType<typeof useDayBoardData> }) {
  const [query, setQuery] = useState("");
  const notes = store.data.notes
    .filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="mx-auto max-w-4xl">
      <label className="mb-5 flex items-center gap-3 rounded-lg border border-[#e0e0e0] px-4 py-3">
        <Search className="h-5 w-5 text-[#555]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" className="w-full outline-none" />
      </label>
      <div className="grid gap-4">
        {notes.map((note) => (
          <article key={note.id} className="card p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{note.title}</h2>
              {note.pinned ? <span className="rounded-full border border-black px-3 py-1 text-xs font-semibold">PINNED</span> : null}
            </div>
            <p className="mt-3 whitespace-pre-line text-[#333]">{note.content}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function SettingsPage({ store, auth }: { store: ReturnType<typeof useDayBoardData>; auth: ReturnType<typeof useSupabaseAuth> }) {
  const displayName = auth.user?.user_metadata?.display_name || store.data.displayName;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SettingsSection title="Account">
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadonlyField label="Display Name" value={displayName} />
          <ReadonlyField label="Email" value={auth.user?.email ?? "Not signed in"} />
          <ReadonlyField label="Timezone" value={store.data.timezone} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {auth.user ? (
            <button onClick={() => auth.signOut()} className="rounded-lg border border-[#dcdcdc] px-4 py-3 font-medium">
              Sign Out
            </button>
          ) : (
            <Link href="/login" className="rounded-lg bg-black px-4 py-3 font-medium text-white">
              Login
            </Link>
          )}
        </div>
      </SettingsSection>
      <SettingsSection title="Dashboard">
        <ToggleRow label="Show Weather" checked />
        <ToggleRow label="Show Notes" checked />
        <ToggleRow label="Show Habits" checked />
        <ToggleRow label="Show Insights" checked />
      </SettingsSection>
      <SettingsSection title="Raspberry Pi Mode">
        <div className="flex flex-wrap gap-3">
          <Link href="/display" className="rounded-lg bg-black px-4 py-3 font-medium text-white">
            Open Display Mode
          </Link>
          <button onClick={store.resetData} className="rounded-lg border border-[#dcdcdc] px-4 py-3 font-medium">
            Reset Local Data
          </button>
        </div>
        <p className="mt-3 text-sm text-[#666]">Use Chromium kiosk mode with the /display route when the Raspberry Pi is ready.</p>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#666]">{label}</span>
      <input value={value} readOnly className="mt-1 w-full rounded-lg border border-[#dcdcdc] px-3 py-3 outline-none" />
    </label>
  );
}

function ToggleRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <label className="flex items-center justify-between border-b border-[#e5e5e5] py-3 last:border-b-0">
      <span>{label}</span>
      <input type="checkbox" defaultChecked={checked} className="h-5 w-5 accent-black" />
    </label>
  );
}

function SegmentedControl({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-[#e0e0e0] p-1 sm:w-fit">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          onClick={() => onChange(optionValue)}
          className={cn("whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-[#555]", value === optionValue && "bg-black text-white")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function QuickAddSheet({ open, onClose, store }: { open: boolean; onClose: () => void; store: ReturnType<typeof useDayBoardData> }) {
  const [kind, setKind] = useState<"menu" | "task" | "event" | "habit" | "note" | "assignment" | "exam">("menu");

  useEffect(() => {
    if (open) setKind("menu");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20" role="dialog" aria-modal="true">
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-5 shadow-2xl lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {kind === "menu"
              ? "Add New"
              : kind === "task"
                ? "Add Task"
                : kind === "event"
                  ? "Add Event"
                  : kind === "habit"
                    ? "Add Habit"
                    : kind === "assignment"
                      ? "Add Assignment"
                      : kind === "exam"
                        ? "Add Exam"
                        : "Add Note"}
          </h2>
          <button onClick={onClose} className="rounded-lg border border-[#dcdcdc] p-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {kind === "menu" ? (
          <div className="grid gap-2">
            <QuickOption icon={<CheckSquare />} title="Task" detail="Add a new task" onClick={() => setKind("task")} />
            <QuickOption icon={<CalendarDays />} title="Event" detail="Add to calendar" onClick={() => setKind("event")} />
            <QuickOption icon={<Target />} title="Habit" detail="Track a habit" onClick={() => setKind("habit")} />
            <QuickOption icon={<FileText />} title="Note" detail="Quick note" onClick={() => setKind("note")} />
            <QuickOption icon={<GraduationCap />} title="Assignment" detail="Add school work" onClick={() => setKind("assignment")} />
            <QuickOption icon={<AlarmClock />} title="Exam" detail="Add important exam" onClick={() => setKind("exam")} />
          </div>
        ) : null}
        {kind === "task" ? <TaskForm store={store} onDone={onClose} /> : null}
        {kind === "event" ? <EventForm store={store} onDone={onClose} /> : null}
        {kind === "habit" ? <HabitForm store={store} onDone={onClose} /> : null}
        {kind === "note" ? <NoteForm store={store} onDone={onClose} /> : null}
        {kind === "assignment" ? <AssignmentForm store={store} onDone={onClose} /> : null}
        {kind === "exam" ? <ExamForm store={store} onDone={onClose} /> : null}
      </div>
    </div>
  );
}

function QuickOption({ icon, title, detail, onClick, disabled }: { icon: ReactNode; title: string; detail: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="flex items-center gap-4 rounded-lg border border-[#e0e0e0] p-4 text-left disabled:opacity-45">
      <span className="flex h-10 w-10 items-center justify-center">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-[#666]">{detail}</span>
      </span>
    </button>
  );
}

function TaskForm({ store, onDone }: { store: ReturnType<typeof useDayBoardData>; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayKey());
  const [dueTime, setDueTime] = useState("23:59");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [category, setCategory] = useState("Personal");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    store.addTask({
      title: title.trim(),
      description: "",
      dueDate,
      dueTime,
      priority,
      estimatedMinutes,
      category,
      autoRollover: true
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <TextInput label="Title" value={title} onChange={setTitle} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
        <TextInput label="Due Time" value={dueTime} onChange={setDueTime} type="time" />
      </div>
      <Select label="Priority" value={priority} onChange={(value) => setPriority(value as TaskPriority)} options={["low", "medium", "high", "critical"]} />
      <TextInput label="Estimate Minutes" value={String(estimatedMinutes)} onChange={(value) => setEstimatedMinutes(Number(value))} type="number" />
      <TextInput label="Category" value={category} onChange={setCategory} />
      <button className="mt-2 rounded-lg bg-black px-4 py-3 font-semibold text-white">Save</button>
    </form>
  );
}

function EventForm({ store, onDone }: { store: ReturnType<typeof useDayBoardData>; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayKey());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [category, setCategory] = useState<EventCategory>("personal");
  const [conflict, setConflict] = useState<CalendarEvent | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const newEvent: CalendarEvent = {
      id: "preview",
      title: title.trim(),
      date,
      startTime,
      endTime,
      category,
      priority: "medium",
      repeatType: "never"
    };
    const foundConflict = detectConflict(newEvent, store.data.events);
    if (foundConflict && !conflict) {
      setConflict(foundConflict);
      return;
    }
    store.addEvent(newEvent);
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <TextInput label="Title" value={title} onChange={setTitle} autoFocus />
      <TextInput label="Date" value={date} onChange={setDate} type="date" />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Start Time" value={startTime} onChange={setStartTime} type="time" />
        <TextInput label="End Time" value={endTime} onChange={setEndTime} type="time" />
      </div>
      <Select label="Category" value={category} onChange={(value) => setCategory(value as EventCategory)} options={["school", "work", "personal", "gym", "study", "appointment", "deadline", "social", "other"]} />
      {conflict ? (
        <div className="rounded-lg border border-black bg-[#fafafa] p-3 text-sm">
          <div className="font-semibold">Schedule conflict</div>
          <div className="mt-1">{title || "This event"} overlaps {conflict.title}. Press Save again to keep anyway.</div>
        </div>
      ) : null}
      <button className="mt-2 rounded-lg bg-black px-4 py-3 font-semibold text-white">Save</button>
    </form>
  );
}

function NoteForm({ store, onDone }: { store: ReturnType<typeof useDayBoardData>; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(true);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    store.addNote({ title: title.trim(), content: content.trim(), pinned, category: "Quick" });
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <TextInput label="Title" value={title} onChange={setTitle} autoFocus />
      <label className="block">
        <span className="text-sm font-medium text-[#666]">Content</span>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} className="mt-1 min-h-28 w-full rounded-lg border border-[#dcdcdc] px-3 py-3 outline-none" />
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} className="h-5 w-5 accent-black" />
        Pin to Dashboard
      </label>
      <button className="mt-2 rounded-lg bg-black px-4 py-3 font-semibold text-white">Save</button>
    </form>
  );
}

function AssignmentForm({ store, onDone }: { store: ReturnType<typeof useDayBoardData>; onDone: () => void }) {
  const firstCourse = store.data.courses[0]?.id ?? "";
  const [courseId, setCourseId] = useState(firstCourse);
  const [title, setTitle] = useState("");
  const [assignmentType, setAssignmentType] = useState("homework");
  const [dueDate, setDueDate] = useState(todayKey());
  const [dueTime, setDueTime] = useState("23:59");
  const [estimatedMinutes, setEstimatedMinutes] = useState(90);
  const [gradeWeight, setGradeWeight] = useState("");
  const [difficulty, setDifficulty] = useState("3");
  const [createTask, setCreateTask] = useState(true);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    const course = store.data.courses.find((item) => item.id === courseId);
    const cleanTitle = title.trim();

    store.addAssignment({
      courseId,
      title: cleanTitle,
      assignmentType: assignmentType as "homework" | "quiz" | "project" | "lab" | "paper" | "midterm" | "final" | "other",
      dueDate,
      dueTime,
      estimatedMinutes,
      gradeWeight: gradeWeight ? Number(gradeWeight) : undefined,
      difficulty: Number(difficulty)
    });

    if (createTask) {
      store.addTask({
        title: `Complete ${course?.code ? `${course.code} ` : ""}${cleanTitle}`,
        description: "Created from assignment.",
        dueDate,
        dueTime,
        priority: Number(gradeWeight || 0) >= 15 ? "high" : "medium",
        estimatedMinutes,
        category: "School",
        autoRollover: false
      });
    }

    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Select label="Course" value={courseId} onChange={setCourseId} options={store.data.courses.map((course) => course.id)} labels={Object.fromEntries(store.data.courses.map((course) => [course.id, `${course.code} - ${course.name}`]))} />
      <TextInput label="Assignment Title" value={title} onChange={setTitle} autoFocus />
      <Select label="Type" value={assignmentType} onChange={setAssignmentType} options={["homework", "quiz", "project", "lab", "paper", "midterm", "final", "other"]} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
        <TextInput label="Due Time" value={dueTime} onChange={setDueTime} type="time" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Estimate Minutes" value={String(estimatedMinutes)} onChange={(value) => setEstimatedMinutes(Number(value))} type="number" />
        <TextInput label="Grade Weight %" value={gradeWeight} onChange={setGradeWeight} type="number" />
      </div>
      <Select label="Difficulty" value={difficulty} onChange={setDifficulty} options={["1", "2", "3", "4", "5"]} labels={{ "1": "1 - Easy", "2": "2", "3": "3 - Medium", "4": "4", "5": "5 - Hard" }} />
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={createTask} onChange={(event) => setCreateTask(event.target.checked)} className="h-5 w-5 accent-black" />
        Create task for this assignment
      </label>
      <button className="mt-2 rounded-lg bg-black px-4 py-3 font-semibold text-white">Save Assignment</button>
    </form>
  );
}

function ExamForm({ store, onDone }: { store: ReturnType<typeof useDayBoardData>; onDone: () => void }) {
  const firstCourse = store.data.courses[0]?.id ?? "";
  const [courseId, setCourseId] = useState(firstCourse);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState(todayKey());
  const [examTime, setExamTime] = useState("10:00");
  const [gradeWeight, setGradeWeight] = useState("25");
  const [studyHoursGoal, setStudyHoursGoal] = useState("8");
  const [createStudyTask, setCreateStudyTask] = useState(true);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    const course = store.data.courses.find((item) => item.id === courseId);
    const cleanTitle = title.trim();
    const studyMinutesGoal = Math.round(Number(studyHoursGoal || 0) * 60);

    store.addExam({
      courseId,
      title: cleanTitle,
      examDate,
      examTime,
      gradeWeight: gradeWeight ? Number(gradeWeight) : undefined,
      studyMinutesGoal
    });

    if (createStudyTask) {
      store.addTask({
        title: `Study for ${course?.code ? `${course.code} ` : ""}${cleanTitle}`,
        description: "Created from exam study goal.",
        dueDate: examDate,
        dueTime: examTime,
        priority: "high",
        estimatedMinutes: studyMinutesGoal,
        category: "School",
        autoRollover: false
      });
    }

    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Select label="Course" value={courseId} onChange={setCourseId} options={store.data.courses.map((course) => course.id)} labels={Object.fromEntries(store.data.courses.map((course) => [course.id, `${course.code} - ${course.name}`]))} />
      <TextInput label="Exam Name" value={title} onChange={setTitle} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Exam Date" value={examDate} onChange={setExamDate} type="date" />
        <TextInput label="Exam Time" value={examTime} onChange={setExamTime} type="time" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Grade Weight %" value={gradeWeight} onChange={setGradeWeight} type="number" />
        <TextInput label="Study Goal Hours" value={studyHoursGoal} onChange={setStudyHoursGoal} type="number" />
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={createStudyTask} onChange={(event) => setCreateStudyTask(event.target.checked)} className="h-5 w-5 accent-black" />
        Create study task
      </label>
      <button className="mt-2 rounded-lg bg-black px-4 py-3 font-semibold text-white">Save Exam</button>
    </form>
  );
}

function HabitForm({ store, onDone }: { store: ReturnType<typeof useDayBoardData>; onDone: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<Habit["icon"]>("target");
  const [scheduleType, setScheduleType] = useState("daily");
  const [targetDays, setTargetDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [targetTimesPerWeek, setTargetTimesPerWeek] = useState("3");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    store.addHabit({
      name: name.trim(),
      icon,
      scheduleType: scheduleType as "daily" | "scheduled" | "weekly",
      targetDays: scheduleType === "daily" ? [0, 1, 2, 3, 4, 5, 6] : targetDays,
      targetTimesPerWeek: scheduleType === "weekly" ? Number(targetTimesPerWeek) : undefined
    });

    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <TextInput label="Habit Name" value={name} onChange={setName} autoFocus />
      <Select label="Icon" value={icon} onChange={(value) => setIcon(value as Habit["icon"])} options={["target", "dumbbell", "book", "droplet", "leaf"]} />
      <Select label="Schedule" value={scheduleType} onChange={setScheduleType} options={["daily", "scheduled", "weekly"]} labels={{ daily: "Every day", scheduled: "Specific days", weekly: "Times per week" }} />
      {scheduleType === "scheduled" ? <WeekdayPicker selected={targetDays} onChange={setTargetDays} /> : null}
      {scheduleType === "weekly" ? <TextInput label="Target Times Per Week" value={targetTimesPerWeek} onChange={setTargetTimesPerWeek} type="number" /> : null}
      <button className="mt-2 rounded-lg bg-black px-4 py-3 font-semibold text-white">Save Habit</button>
    </form>
  );
}

function WeekdayPicker({ selected, onChange }: { selected: number[]; onChange: (days: number[]) => void }) {
  const days = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div>
      <div className="text-sm font-medium text-[#666]">Target Days</div>
      <div className="mt-2 grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          const active = selected.includes(index);
          return (
            <button
              key={`${day}-${index}`}
              type="button"
              onClick={() => onChange(active ? selected.filter((item) => item !== index) : [...selected, index].sort())}
              className={cn("h-11 rounded-lg border border-[#dcdcdc] font-semibold", active && "border-black bg-black text-white")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  autoFocus
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#666]">{label}</span>
      <input autoFocus={autoFocus} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#dcdcdc] px-3 outline-none focus:border-black" />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  labels
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#666]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#dcdcdc] px-3 outline-none focus:border-black">
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
