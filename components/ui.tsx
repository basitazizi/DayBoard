"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/types/dayboard";

/* ------------------------------------------------------------------
   DayBoard 2.0 interface kit.
   Every page builds from these parts so buttons, cards, chips and
   dialogs look and behave the same everywhere, at every screen size.
   ------------------------------------------------------------------ */

export const TONE: Record<Tone, { text: string; soft: string; solid: string; border: string }> = {
  accent: { text: "text-accent", soft: "bg-accent-soft", solid: "bg-accent", border: "border-accent" },
  teal: { text: "text-teal", soft: "bg-teal-soft", solid: "bg-teal", border: "border-teal" },
  blue: { text: "text-blue", soft: "bg-blue-soft", solid: "bg-blue", border: "border-blue" },
  amber: { text: "text-amber", soft: "bg-amber-soft", solid: "bg-amber", border: "border-amber" },
  rose: { text: "text-rose", soft: "bg-rose-soft", solid: "bg-rose", border: "border-rose" },
  green: { text: "text-green", soft: "bg-green-soft", solid: "bg-green", border: "border-green" },
  neutral: { text: "text-ink-2", soft: "bg-track", solid: "bg-ink-3", border: "border-line" }
};

type ButtonVariant = "primary" | "secondary" | "ghost" | "dark" | "hero" | "heroGhost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-track hover:text-ink",
  dark: "bg-ink text-bg hover:opacity-90",
  hero: "bg-white text-[var(--hero-from)] hover:bg-white/90",
  heroGhost: "bg-white/15 text-white hover:bg-white/25",
  danger: "border border-line bg-surface text-rose hover:bg-rose-soft"
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-[10px] px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-[14px] px-5 text-[15px]"
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  full?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", href, full, icon, className, children, type, ...props }: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors disabled:opacity-45",
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    // A full-width button next to another (e.g. "Save" + "Delete") must give up room, or it pushes its neighbour off screen.
    full ? "w-full" : "shrink-0",
    className
  );
  const content = (
    <>
      {icon}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} className={classes} {...props}>
      {content}
    </button>
  );
}

export function IconButton({ label, className, children, tone = "plain", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "plain" | "soft" | "accent" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-[10px] transition-colors disabled:opacity-45",
        tone === "plain" && "text-ink-2 hover:bg-track hover:text-ink",
        tone === "soft" && "bg-bg text-ink-2 hover:bg-track hover:text-ink",
        tone === "accent" && "bg-accent text-on-accent hover:bg-accent-strong",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ai, ...props }: React.HTMLAttributes<HTMLDivElement> & { ai?: boolean }) {
  return (
    <section className={cn("db-card min-w-0 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5", ai && "ai-surface", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex min-h-8 items-center justify-between gap-3", className)}>
      <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
      {action}
    </div>
  );
}

export function Label({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3", className)}>{children}</div>;
}

export function Chip({ tone = "neutral", icon, className, children }: { tone?: Tone; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold", TONE[tone].soft, TONE[tone].text, className)}>
      {icon}
      {children}
    </span>
  );
}

export function Stripe({ tone }: { tone: Tone }) {
  return <span aria-hidden className={cn("w-1 shrink-0 self-stretch rounded-full", TONE[tone].solid)} />;
}

export function IconTile({ tone = "accent", size = "md", solid, className, children }: { tone?: Tone; size?: "sm" | "md" | "lg"; solid?: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        size === "sm" && "h-8 w-8 rounded-[10px]",
        size === "md" && "h-10 w-10 rounded-xl",
        size === "lg" && "h-12 w-12 rounded-[14px]",
        solid ? cn(TONE[tone].solid, tone === "accent" ? "text-on-accent" : "text-white") : cn(TONE[tone].soft, TONE[tone].text),
        className
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (value: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("thin-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-track p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 shrink-0 whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-semibold transition-colors",
            value === option.value ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-ink-2 hover:text-ink"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, tone = "accent", disabled }: { checked: boolean; onChange: () => void; label: string; tone?: Tone; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
        checked ? cn(TONE[tone].solid, TONE[tone].border, tone === "accent" ? "text-on-accent" : "text-white") : "border-ink-3/50 hover:border-accent"
      )}
    >
      {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[26px] w-11 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-ink-3/40")}
    >
      <span className={cn("absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left]", checked ? "left-[21px]" : "left-[3px]")} />
    </button>
  );
}

export function ProgressBar({ value, tone = "accent", className, label }: { value: number; tone?: Tone; className?: string; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"} className={cn("h-2 overflow-hidden rounded-full bg-track", className)}>
      <div className={cn("h-full rounded-full transition-[width]", TONE[tone].solid)} style={{ width: `${safe}%` }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 8, tone = "accent", trackClass = "stroke-track", children, className }: { value: number; size?: number; stroke?: number; tone?: Tone | "white"; trackClass?: string; children?: ReactNode; className?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeClass = tone === "white" ? "stroke-white" : { accent: "stroke-accent", teal: "stroke-teal", blue: "stroke-blue", amber: "stroke-amber", rose: "stroke-rose", green: "stroke-green", neutral: "stroke-ink-3" }[tone];
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className={trackClass} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - safe / 100)} className={cn(strokeClass, "transition-[stroke-dashoffset] duration-700")} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-8 text-center", className)}>
      {icon ? <IconTile tone="neutral" size="lg">{icon}</IconTile> : null}
      <div className="mt-1 font-semibold">{title}</div>
      {body ? <p className="max-w-sm text-sm text-ink-2">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Row({ first, className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { first?: boolean }) {
  return (
    <div className={cn("db-row flex items-center gap-3 py-3", !first && "border-t border-line", className)} {...props}>
      {children}
    </div>
  );
}

/** Dialog: a bottom sheet on phones, a centred panel on larger screens. */
export function Sheet({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose} role="presentation">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          "animate-pop flex max-h-[92dvh] w-full flex-col rounded-t-[26px] border border-line bg-surface shadow-pop outline-none sm:rounded-[22px]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold tracking-[-0.01em]">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-ink-2">{description}</p> : null}
          </div>
          <IconButton label="Close" tone="soft" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

const FIELD_CLASS = "h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_CLASS, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_CLASS, "h-auto min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

export function SelectInput({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD_CLASS, "appearance-auto pr-2", className)} {...props}>
      {children}
    </select>
  );
}

export function Notice({ tone = "accent", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl px-3.5 py-2.5 text-sm font-medium", TONE[tone].soft, TONE[tone].text, className)}>{children}</div>;
}
