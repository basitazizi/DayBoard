"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Camera, CheckSquare, FileText, GraduationCap, Home, LayoutGrid, Mic, Plus, Search, Settings, Sparkles, Target, Timer, Undo2, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getFocusRemaining, useActiveFocusSession } from "@/lib/focus-session";
import { clearGuestItems, countGuestItems } from "@/lib/local-data";
import { AppProvider, useApp } from "./app-context";
import { CommandPalette, openSearch } from "./command-palette";
import { Avatar } from "./avatar";
import { LogoMark } from "./logo-mark";
import { useTheme } from "@/lib/theme";
import { QuickAdd } from "./quick-add";
import { Button, IconButton, Sheet } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/school", label: "School", icon: GraduationCap },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/habits", label: "Habits", icon: Target },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/notes", label: "Notes", icon: FileText }
];

const ASSISTANT_NAV: NavItem = { href: "/assistant", label: "Assistant", icon: Sparkles };
const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 text-lg font-bold tracking-[-0.02em]", className)}>
      <LogoMark size={32} />
      DayBoard
    </Link>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors", active ? "bg-accent-soft font-semibold text-accent" : "font-medium text-ink-2 hover:bg-track hover:text-ink")}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.9} />
      {item.label}
    </Link>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { auth, store } = useApp();
  const { profile } = useTheme();
  const name = auth.displayName || (auth.user ? auth.user.email?.split("@")[0] : "Guest") || "Guest";

  return (
    <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col gap-1 border-r border-line bg-surface-2 px-3.5 pb-3.5 pt-5 lg:flex">
      <Logo className="mb-4 px-2.5" />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {MAIN_NAV.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        <div className="mt-2.5">
          <SidebarLink item={ASSISTANT_NAV} active={isActive(pathname, ASSISTANT_NAV.href)} />
        </div>
      </nav>
      <div className="flex-1" />
      {store.hydrated && store.isGuest ? (
        <Link href="/login" className="mb-1 rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5 text-[13px] leading-snug text-accent">
          <span className="font-semibold">Sign in to sync</span>
          <span className="block text-ink-2">Your data is saved on this device only.</span>
        </Link>
      ) : null}
      <SidebarLink item={SETTINGS_NAV} active={isActive(pathname, SETTINGS_NAV.href)} />
      <Link href="/settings" className="mt-2 flex items-center gap-2.5 border-t border-line px-2.5 pt-3">
        <Avatar profile={profile} name={name} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className="block truncate text-xs text-ink-3">{profile.tagline || (auth.user ? auth.user.email : "Not signed in")}</span>
        </span>
      </Link>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const { openQuickAdd } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = [MAIN_NAV[0], MAIN_NAV[1]];
  const secondary = [MAIN_NAV[2]];
  const more = [...MAIN_NAV.slice(3), ASSISTANT_NAV, SETTINGS_NAV];
  const moreActive = more.some((item) => isActive(pathname, item.href));

  useEffect(() => setMoreOpen(false), [pathname]);

  const tab = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-accent" : "text-ink-3")}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center px-2">
          {primary.map(tab)}
          <div className="flex flex-1 justify-center">
            <button type="button" aria-label="Add anything" onClick={() => openQuickAdd()} className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-accent text-on-accent shadow-[0_10px_22px_-8px_var(--accent)] transition-transform active:scale-95">
              <Plus className="h-6 w-6" strokeWidth={2.4} />
            </button>
          </div>
          {secondary.map(tab)}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={cn("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", moreActive ? "text-accent" : "text-ink-3")}>
            <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={1.9} />
            More
          </button>
        </div>
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-2.5">
          {more.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-[13px] font-semibold", active ? "border-accent-line bg-accent-soft text-accent" : "border-line text-ink-2")}>
                <Icon className="h-6 w-6" strokeWidth={1.9} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function ToastView() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-8">
      <div key={toast.id} className="animate-pop pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink py-2.5 pl-4 pr-2.5 text-sm font-medium text-bg shadow-pop">
        <span className="min-w-0 flex-1">{toast.message}</span>
        {toast.undo ? (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              dismissToast();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-bg/15 px-2.5 font-semibold hover:bg-bg/25"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </button>
        ) : null}
        <button type="button" aria-label="Dismiss" onClick={dismissToast} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-bg/15">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ActiveFocusBanner() {
  const pathname = usePathname();
  const { session } = useActiveFocusSession();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  if (!session || session.status === "completed" || pathname.startsWith("/focus")) return null;
  const remaining = getFocusRemaining(session);
  const label = session.status === "paused" ? "Focus paused" : session.phase === "break" ? "On a break" : "Focusing";

  return (
    <Link href="/focus" className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-sm text-bg sm:mx-6 lg:mx-8">
      <Timer className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{label}</span> · {session.focus_reason}
      </span>
      <span className="font-semibold tabular-nums">
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </span>
    </Link>
  );
}

/** After signing in, offers to move anything created as a guest on this device into the account. */
function GuestImportBanner() {
  const { store, showToast } = useApp();
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(store.hydrated && !store.isGuest ? countGuestItems() : 0);
  }, [store.hydrated, store.isGuest]);

  if (count === 0) return null;
  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-accent-line bg-accent-soft px-4 py-3 text-sm sm:mx-6 lg:mx-8">
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-accent">
          {count} item{count === 1 ? "" : "s"} saved on this device
        </span>{" "}
        from before you signed in. Add them to your account?
      </span>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          const added = store.importGuestData();
          setCount(0);
          showToast(`Added ${added} item${added === 1 ? "" : "s"} to your account.`);
        }}
      >
        Add to my account
      </Button>
      <Button
        size="sm"
        onClick={() => {
          clearGuestItems();
          setCount(0);
        }}
      >
        Discard
      </Button>
    </div>
  );
}

/** The "Add anything" box that sits at the top of every page on larger screens. */
function AddBox() {
  const { openQuickAdd } = useApp();
  return (
    <div className="hidden h-[46px] w-[min(430px,38vw)] items-center gap-1.5 rounded-[14px] border border-line bg-surface pl-3.5 pr-1.5 shadow-[0_1px_2px_rgb(20_22_28/0.04)] lg:flex">
      <button type="button" onClick={() => openQuickAdd({ mode: "type" })} className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left text-ink-3">
        <Plus className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">Add anything… “Chem exam Friday 9am”</span>
      </button>
      <IconButton label="Add by voice" tone="soft" className="h-8 w-8" onClick={() => openQuickAdd({ mode: "speak" })}>
        <Mic className="h-[17px] w-[17px]" />
      </IconButton>
      <IconButton label="Add from a photo" tone="soft" className="h-8 w-8" onClick={() => openQuickAdd({ mode: "photo" })}>
        <Camera className="h-[17px] w-[17px]" />
      </IconButton>
    </div>
  );
}

const CONFETTI_COLOURS = ["var(--accent)", "#ffb86b", "#5dd48a", "#6aa5f5", "#f584cd", "#ffd84d"];

/** A short burst of confetti when something is finished. Turn it off in Settings. */
function Confetti() {
  const { celebration } = useApp();
  const [pieces, setPieces] = useState<Array<{ id: number; left: number; delay: number; dx: number; spin: number; fall: number; colour: string }>>([]);

  useEffect(() => {
    if (!celebration) return;
    setPieces(
      Array.from({ length: 46 }, (_, index) => ({
        id: celebration + index,
        left: 10 + Math.random() * 80,
        delay: Math.random() * 180,
        dx: (Math.random() - 0.5) * 260,
        spin: (Math.random() - 0.5) * 900,
        fall: 1100 + Math.random() * 700,
        colour: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length]
      }))
    );
    const timer = window.setTimeout(() => setPieces([]), 2200);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  if (!pieces.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{ left: `${piece.left}%`, background: piece.colour, animationDelay: `${piece.delay}ms`, ["--dx" as string]: `${piece.dx}px`, ["--spin" as string]: `${piece.spin}deg`, ["--fall" as string]: `${piece.fall}ms` }}
        />
      ))}
    </div>
  );
}

/** Standard page frame: the same header and spacing on every screen. */
export function Page({ title, subtitle, toolbar, children, fill }: { title: string; subtitle?: string; toolbar?: ReactNode; children: ReactNode; fill?: boolean }) {
  const { store } = useApp();
  const pathname = usePathname();
  return (
    <>
      <header className="safe-top sticky top-0 z-30 box-content flex h-16 shrink-0 items-center gap-3 bg-bg/90 px-4 backdrop-blur sm:px-6 lg:h-20 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-[-0.02em] lg:text-2xl">{title}</h1>
          {subtitle ? <p className="truncate text-[13px] text-ink-3">{subtitle}</p> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <IconButton label="Search (Ctrl+K)" tone="soft" className="h-10 w-10 lg:h-[46px] lg:w-[46px] lg:rounded-[14px] lg:border lg:border-line lg:bg-surface" onClick={openSearch}>
            <Search className="h-[18px] w-[18px]" />
          </IconButton>
          <AddBox />
          {pathname.startsWith("/assistant") ? null : (
            <Button variant="primary" href="/assistant" icon={<Sparkles className="h-[17px] w-[17px]" />}>
              Ask
            </Button>
          )}
        </div>
      </header>
      <ActiveFocusBanner />
      <GuestImportBanner />
      {store.syncError ? (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-rose-soft px-4 py-2.5 text-sm font-medium text-rose sm:mx-6 lg:mx-8" role="alert">
          <span className="flex-1">{store.syncError}</span>
          <Button size="sm" onClick={() => void store.refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      <main className={cn("min-w-0 flex-1 px-4 pb-8 sm:px-6 lg:px-8", fill && "flex flex-col lg:min-h-0")}>
        {toolbar ? <div className="mb-4 flex flex-wrap items-center gap-3">{toolbar}</div> : null}
        {store.hydrated ? children : <PageSkeleton />}
      </main>
    </>
  );
}

function PageSkeleton() {
  return (
    <div aria-label="Loading" className="grid gap-5 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-44 animate-pulse rounded-card border border-line bg-surface p-5">
          <div className="h-4 w-28 rounded bg-track" />
          <div className="mt-5 h-3 w-full rounded bg-track" />
          <div className="mt-3 h-3 w-3/4 rounded bg-track" />
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div data-app-shell className="flex min-h-dvh text-ink">
        <Sidebar />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
        <MobileNav />
        <QuickAdd />
        <ToastView />
        <Confetti />
        <CommandPalette />
      </div>
    </AppProvider>
  );
}
