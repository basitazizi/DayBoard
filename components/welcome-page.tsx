"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Bell, CalendarDays, Check, Flame, GraduationCap, Sparkles, Timer } from "lucide-react";
import { useSupabaseAuth } from "@/lib/auth";
import { markWelcomed } from "@/lib/app-entry";
import { cn } from "@/lib/cn";

/**
 * First-run onboarding: a swipeable, animated tour of what DayBoard does, ending with how to start
 * (create an account, sign in, or continue without one). Dark and glowing on purpose, so it flows
 * straight on from the app's dark splash screen and launch intro.
 */

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Mark({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="15" y="15" width="9" height="9" rx="3" fill="#fff" />
      <rect x="15" y="27.5" width="9" height="9" rx="3" fill="#fff" />
      <rect x="15" y="40" width="9" height="9" rx="3" fill="#fff" />
      <path d="M28 15h3.5c9.4 0 17 7.6 17 17s-7.6 17-17 17H28" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Slide 1: the brand, with your plans orbiting it ---------- */
function HeroArt() {
  const chips = [
    { text: "Chem · 9:00", tone: "ob-chip-a", style: { top: "8%", left: "4%", ...delay(250) } },
    { text: "Essay due Fri", tone: "ob-chip-b", style: { top: "18%", right: "0%", ...delay(420) } },
    { text: "Gym · 6 PM", tone: "ob-chip-b", style: { bottom: "16%", left: "0%", ...delay(590) } },
    { text: "Bio midterm", tone: "ob-chip-a", style: { bottom: "6%", right: "6%", ...delay(760) } }
  ];
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 grid place-items-center">
        <div className="ob-ring ob-ring-1" />
        <div className="ob-ring ob-ring-2" />
        <div className="ob-halo" />
        <div className="ob-logo-tile ob-pop">
          <Mark size={88} />
        </div>
      </div>
      {chips.map((chip) => (
        <span key={chip.text} className={cn("ob-chip ob-float-in", chip.tone)} style={chip.style}>
          {chip.text}
        </span>
      ))}
    </div>
  );
}

/* ---------- Slide 2: type a sentence, watch it become plans ---------- */
const PHRASE = "Chem exam Friday 9am";

function TypeArt() {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTyped((count) => (count >= PHRASE.length ? count : count + 1)), 70);
    return () => window.clearInterval(timer);
  }, []);
  const done = typed >= PHRASE.length;
  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 px-1">
      <div className="ob-glass flex items-center gap-3 px-4 py-3.5">
        <Sparkles className="h-5 w-5 shrink-0 text-white/80" />
        <span className="text-[17px] font-medium">
          {PHRASE.slice(0, typed)}
          <span className="ob-caret" />
        </span>
      </div>
      {done ? (
        <>
          <div className="ob-glass ob-drop flex items-center gap-3 p-3.5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Chemistry exam</span>
              <span className="block text-[13px] text-white/60">Friday · 9:00 AM</span>
            </span>
            <Check className="h-5 w-5 text-white" />
          </div>
          <div className="ob-glass ob-drop flex items-center gap-3 p-3.5" style={delay(260)}>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">3 study sessions planned</span>
              <span className="block text-[13px] text-white/60">In your free time before it</span>
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ---------- Slide 3: always know what's next ---------- */
function NextArt() {
  const rows = [
    { time: "9 AM", title: "Chemistry", tone: "bg-white" },
    { time: "2 PM", title: "Biology", tone: "bg-white/70" },
    { time: "4 PM", title: "Study: Bio midterm", tone: "bg-white/45" },
    { time: "6 PM", title: "Gym", tone: "bg-white/25" }
  ];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 px-1">
      <div className="ob-hero-card ob-pop p-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">Up next · in 25 min</span>
        <span className="mt-1 block text-2xl font-bold tracking-[-0.02em]">Chemistry</span>
        <span className="block text-[13px] text-white/70">9:00 – 10:15 AM · Science Hall 204</span>
        <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/15">
          <span className="ob-progress block h-full rounded-full bg-white" />
        </span>
      </div>
      <div className="ob-glass grid gap-1 p-2">
        {rows.map((row, index) => (
          <div key={row.title} className="ob-slide-in flex items-center gap-3 rounded-xl px-2.5 py-2" style={delay(300 + index * 120)}>
            <span className="w-11 text-[12px] font-semibold text-white/60">{row.time}</span>
            <span className={cn("h-7 w-1 rounded-full", row.tone)} />
            <span className="text-[15px] font-medium">{row.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Slide 4: reminders, focus and streaks ---------- */
function RemindArt() {
  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-3 px-1">
      <div className="ob-notify ob-glass flex items-center gap-3 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white">
          <span className="scale-[0.55]">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
              <rect x="15" y="15" width="9" height="9" rx="3" fill="#0d0d0f" />
              <rect x="15" y="27.5" width="9" height="9" rx="3" fill="#0d0d0f" />
              <rect x="15" y="40" width="9" height="9" rx="3" fill="#0d0d0f" />
              <path d="M28 15h3.5c9.4 0 17 7.6 17 17s-7.6 17-17 17H28" fill="none" stroke="#0d0d0f" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[12px] text-white/60">
            DayBoard · now <Bell className="ob-ring-bell h-3 w-3" />
          </span>
          <span className="block font-semibold">Chemistry starts in 10 min</span>
          <span className="block text-[13px] text-white/60">Science Hall 204</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="ob-glass ob-pop flex flex-col items-center gap-2 p-4" style={delay(450)}>
          <div className="relative grid h-20 w-20 place-items-center">
            <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="7" />
              <circle cx="40" cy="40" r="34" fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" pathLength={100} className="ob-focus-ring" />
            </svg>
            <Timer className="h-6 w-6 text-white/80" />
          </div>
          <span className="text-[13px] font-semibold">Focus 25:00</span>
        </div>
        <div className="ob-glass ob-pop flex flex-col items-center gap-2 p-4" style={delay(600)}>
          <span className="ob-flame grid h-20 w-20 place-items-center rounded-full bg-white/10">
            <Flame className="h-9 w-9 text-white" />
          </span>
          <span className="text-[13px] font-semibold">12-day streak</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Slide 5: get started ---------- */
function StartArt() {
  return (
    <div className="relative grid h-full w-full place-items-center">
      <div className="ob-ring ob-ring-1" />
      <div className="ob-halo ob-halo-strong" />
      <div className="ob-logo-tile ob-pop">
        <Mark size={72} />
      </div>
      {[CalendarDays, Sparkles, Bell, Timer].map((Icon, index) => (
        <span key={index} className="ob-orbit" style={delay(index * -2500)}>
          {/* Same delay on the counter-spin keeps each icon upright as it orbits. */}
          <span className="ob-orbit-dot" style={delay(index * -2500)}>
            <Icon className="h-4 w-4" />
          </span>
        </span>
      ))}
    </div>
  );
}

type Slide = { title: ReactNode; body: string; art: () => ReactNode };

const SLIDES: Slide[] = [
  { title: <>Your week,<br />finally in order.</>, body: "Classes, tasks, exams and habits in one calm place that tells you what to do next.", art: () => <HeroArt /> },
  { title: <>Just type it.<br />DayBoard files it.</>, body: "Write it the way you'd say it. Dates, times and classes are worked out for you, and study time is planned automatically.", art: () => <TypeArt /> },
  { title: <>Always know<br />what's next.</>, body: "Open the app and see what's up next, what's due and where your free time is.", art: () => <NextArt /> },
  { title: <>Never miss<br />a thing.</>, body: "Reminders before things start, a focus timer when it's time to work, and streaks that keep you going.", art: () => <RemindArt /> },
  { title: <>Let's plan<br />your first day.</>, body: "Create a free account to sync your phone, laptop and wall display, or jump straight in.", art: () => <StartArt /> }
];

export function WelcomePage() {
  const router = useRouter();
  const auth = useSupabaseAuth();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const last = SLIDES.length - 1;

  // Android app: white status-bar icons on this dark screen; the app's own theme takes over again afterwards.
  useEffect(() => {
    const scope = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    if (!scope.Capacitor?.isNativePlatform?.()) return;
    const setBars = async (dark: boolean) => {
      try {
        const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
        await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
      } catch {
        // Older app builds: leave the bar as it is.
      }
    };
    // The app's theme sets the bar when it starts up, which can land after this screen's first attempt,
    // so apply it again a moment later.
    void setBars(true);
    const timers = [300, 1200].map((ms) => window.setTimeout(() => void setBars(true), ms));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      void setBars(document.documentElement.dataset.theme === "night");
    };
  }, []);

  // Already signed in (for example, came back here by mistake): go straight in.
  useEffect(() => {
    if (!auth.loading && auth.user) {
      markWelcomed();
      router.replace("/");
    }
  }, [auth.loading, auth.user, router]);

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index !== active) setActive(index);
  }

  function continueAsGuest() {
    markWelcomed();
    router.replace("/");
  }

  return (
    <main className="ob-root fixed inset-0 flex flex-col overflow-hidden text-white">
      <div aria-hidden className="ob-aurora">
        <span className="ob-blob ob-blob-1" />
        <span className="ob-blob ob-blob-2" />
        <span className="ob-blob ob-blob-3" />
      </div>

      <header className="safe-top relative z-10 flex items-center justify-between px-6 pt-3">
        <span className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.01em]">
          <Mark size={22} /> DayBoard
        </span>
        <button type="button" onClick={() => goTo(last)} tabIndex={active < last ? 0 : -1} className={cn("rounded-full px-3 py-1.5 text-[14px] font-semibold text-white/70 transition-opacity hover:text-white", active === last && "pointer-events-none opacity-0")}>
          Skip
        </button>
      </header>

      <div ref={trackRef} onScroll={onScroll} className="ob-track relative z-10 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
        {SLIDES.map((slide, index) => (
          <section key={index} aria-hidden={index !== active} className="flex w-full shrink-0 snap-center flex-col px-6">
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
              <div className="relative min-h-0 flex-1 py-6">
                {/* Remounting on activation replays each slide's animation when you arrive at it. */}
                {Math.abs(index - active) <= 1 ? (
                  <div key={index === active ? "on" : "off"} className="h-full">
                    {slide.art()}
                  </div>
                ) : null}
              </div>
              <div key={index === active ? "on" : "off"} className="pb-4">
                <h1 className="ob-rise text-[34px] font-bold leading-[1.08] tracking-[-0.035em]">{slide.title}</h1>
                <p className="ob-rise mt-3 text-[16px] leading-relaxed text-white/65" style={delay(120)}>
                  {slide.body}
                </p>
              </div>
            </div>
          </section>
        ))}
      </div>

      <footer className="relative z-10 mx-auto w-full max-w-md px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="mb-5 flex justify-center gap-2" role="tablist" aria-label="Onboarding steps">
          {SLIDES.map((_, index) => (
            <button key={index} type="button" role="tab" aria-selected={index === active} aria-label={`Step ${index + 1}`} onClick={() => goTo(index)} className={cn("h-2 rounded-full transition-all duration-300", index === active ? "w-7 bg-white" : "w-2 bg-white/25")} />
          ))}
        </div>

        {active < last ? (
          <button type="button" onClick={() => goTo(active + 1)} className="ob-cta flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold">
            {active === 0 ? "Get started" : "Next"}
            <ArrowRight className="h-5 w-5" />
          </button>
        ) : (
          <div key="choices" className="grid gap-3">
            <Link href="/login?mode=signup" className="ob-cta ob-rise flex h-14 items-center justify-center rounded-2xl text-[16px] font-semibold">
              Create a free account
            </Link>
            <Link href="/login?mode=signin" className="ob-rise flex h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-[16px] font-semibold backdrop-blur" style={delay(90)}>
              I already have an account
            </Link>
            <button type="button" onClick={continueAsGuest} className="ob-rise h-11 text-[15px] font-semibold text-white/65 hover:text-white" style={delay(180)}>
              Continue without an account
            </button>
          </div>
        )}
      </footer>
    </main>
  );
}
