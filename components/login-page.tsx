"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSupabaseAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type AuthMode = "signin" | "signup";

export function LoginPage() {
  const router = useRouter();
  const auth = useSupabaseAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [displayName, setDisplayName] = useState("Basit");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.user) {
      router.replace("/");
    }
  }, [auth.loading, auth.user, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim();
    const normalizedName = displayName.trim() || "Basit";

    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                display_name: normalizedName,
                timezone: "America/Los_Angeles"
              }
            }
          })
        : await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password
          });

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email to confirm your account, then sign in.");
      setMode("signin");
      return;
    }

    router.replace("/");
  }

  return (
    <main className="min-h-dvh bg-white text-[#111111]">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden border-r border-[#e5e5e5] px-10 py-10 lg:flex lg:flex-col">
          <Link href="/" className="mb-16 inline-flex w-fit items-center gap-2 text-sm font-medium text-[#555]">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-black">
              <Check className="h-9 w-9" strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-3xl font-semibold">DayBoard</div>
              <div className="mt-1 text-lg text-[#555]">Plan. Focus. Achieve.</div>
            </div>
          </div>
          <div className="mt-auto">
            <p className="max-w-md text-4xl font-semibold leading-tight">Your phone controls the day. Your LCD keeps it visible.</p>
            <p className="mt-5 max-w-md text-lg leading-8 text-[#555]">
              Sign in once and DayBoard can later sync tasks, calendar, habits, and notes across your devices.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-[#555] lg:hidden">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>

            <div className="mb-8">
              <h1 className="text-3xl font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h1>
              <p className="mt-3 text-[#666]">
                {mode === "signin" ? "Use your DayBoard account on your phone and LCD." : "Create the account that will own your DayBoard data."}
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-lg border border-[#e0e0e0] p-1">
              <button
                onClick={() => setMode("signin")}
                className={cn("rounded-md px-4 py-2 text-sm font-medium text-[#555]", mode === "signin" && "bg-black text-white")}
              >
                Login
              </button>
              <button
                onClick={() => setMode("signup")}
                className={cn("rounded-md px-4 py-2 text-sm font-medium text-[#555]", mode === "signup" && "bg-black text-white")}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={submit} className="card p-5">
              {mode === "signup" ? (
                <label className="mb-4 block">
                  <span className="text-sm font-medium text-[#666]">Display name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-1 h-12 w-full rounded-lg border border-[#dcdcdc] px-3 outline-none focus:border-black"
                    placeholder="Basit"
                  />
                </label>
              ) : null}

              <label className="mb-4 block">
                <span className="text-sm font-medium text-[#666]">Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  required
                  className="mt-1 h-12 w-full rounded-lg border border-[#dcdcdc] px-3 outline-none focus:border-black"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[#666]">Password</span>
                <div className="mt-1 flex h-12 rounded-lg border border-[#dcdcdc] focus-within:border-black">
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    className="w-full rounded-lg px-3 outline-none"
                    placeholder="At least 6 characters"
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="px-3" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </label>

              {error ? <div className="mt-4 rounded-lg border border-[#ef4444] p-3 text-sm text-[#991b1b]">{error}</div> : null}
              {message ? <div className="mt-4 rounded-lg border border-[#dcdcdc] bg-[#fafafa] p-3 text-sm">{message}</div> : null}

              <button disabled={submitting} className="mt-5 h-12 w-full rounded-lg bg-black font-semibold text-white disabled:opacity-50">
                {submitting ? "Please wait..." : mode === "signin" ? "Login" : "Create account"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
