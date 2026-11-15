"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Camera, Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { useSupabaseAuth } from "@/lib/auth";
import { localTimezone } from "@/lib/date-utils";
import { supabase } from "@/lib/supabase";
import { Button, Field, Notice, Segmented, TextInput } from "./ui";

type AuthMode = "signin" | "signup";

export function LoginPage() {
  const router = useRouter();
  const auth = useSupabaseAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.user) router.replace("/");
  }, [auth.loading, auth.user, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim();
    const normalizedName = displayName.trim().slice(0, 80);
    if (mode === "signup" && !normalizedName) {
      setSubmitting(false);
      setError("Enter a display name.");
      return;
    }

    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { display_name: normalizedName, timezone: localTimezone() } } })
        : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email to confirm it, then sign in.");
      setMode("signin");
      return;
    }
    router.replace("/");
  }

  return (
    <main className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hero-gradient m-4 hidden flex-col rounded-[28px] p-10 text-white lg:flex">
          <div className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em]">
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-white text-[var(--hero-from)]">
              <Check className="h-6 w-6" strokeWidth={3} />
            </span>
            DayBoard
          </div>
          <div className="mt-auto">
            <p className="max-w-md text-4xl font-bold leading-tight tracking-[-0.02em]">Know what to do next, and add anything in one step.</p>
            <ul className="mt-8 grid gap-4 text-lg text-white/90">
              <li className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 shrink-0" /> Classes, tasks, exams and habits in one place
              </li>
              <li className="flex items-center gap-3">
                <Camera className="h-5 w-5 shrink-0" /> Type it, say it or snap a photo to add it
              </li>
              <li className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 shrink-0" /> An assistant that plans your study time
              </li>
            </ul>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink">
              <ArrowLeft className="h-4 w-4" />
              Continue without an account
            </Link>
            <h1 className="text-3xl font-bold tracking-[-0.02em]">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
            <p className="mb-6 mt-2 text-ink-2">{mode === "signin" ? "Sign in to see your DayBoard on every device." : "Your account keeps your data in sync across your phone, laptop and wall display."}</p>

            <Segmented
              label="Sign in or sign up"
              className="mb-5 w-full [&>button]:flex-1"
              value={mode}
              onChange={(next) => {
                setMode(next);
                setError(null);
              }}
              options={[
                { value: "signin", label: "Sign in" },
                { value: "signup", label: "Sign up" }
              ]}
            />

            <form onSubmit={submit} className="grid gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
              {mode === "signup" ? (
                <Field label="Display name">
                  <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} placeholder="Your name" autoComplete="name" />
                </Field>
              ) : null}
              <Field label="Email">
                <TextInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="you@example.com" autoComplete="email" />
              </Field>
              <Field label="Password">
                <div className="relative">
                  <TextInput value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} required minLength={6} placeholder="At least 6 characters" autoComplete={mode === "signin" ? "current-password" : "new-password"} className="pr-11" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-track" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </Field>
              {error ? <Notice tone="rose">{error}</Notice> : null}
              {message ? <Notice tone="green">{message}</Notice> : null}
              <Button type="submit" variant="primary" size="lg" disabled={submitting}>
                {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
