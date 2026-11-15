"use client";

import { useEffect, useRef, useState } from "react";
import { Moon } from "lucide-react";

export function SleepScreen() {
  const [asleep, setAsleep] = useState(false);
  const wakeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!asleep) return;
    wakeRef.current?.focus();
    const wake = () => { setAsleep(false); requestAnimationFrame(() => triggerRef.current?.focus()); };
    window.addEventListener("keydown", wake);
    return () => window.removeEventListener("keydown", wake);
  }, [asleep]);
  return <>
    <button ref={triggerRef} type="button" onClick={() => { window.speechSynthesis?.cancel(); setAsleep(true); }} title="Sleep screen" aria-label="Sleep screen" className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card lg:bottom-4"><Moon className="h-4 w-4" />Sleep</button>
    {asleep ? <button ref={wakeRef} type="button" aria-label="Screen asleep. Tap or press any key to wake." onClick={() => { setAsleep(false); triggerRef.current?.focus(); }} className="fixed inset-0 z-[9999] h-dvh w-screen cursor-default border-0 bg-black outline-none" style={{ background: "#000", outline: "none" }} /> : null}
  </>;
}
