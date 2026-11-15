"use client";

import { Lock, LogOut, Monitor } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAssistantStatus } from "@/lib/assistant-client";
import { cn } from "@/lib/cn";
import { useTheme, type AccentColor, type TextSize, type ThemeMode } from "@/lib/theme";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { Button, Card, CardHeader, Chip, Field, Label, Notice, Row, Segmented, TextInput, Toggle } from "../ui";

const ACCENTS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: "violet", label: "Violet", color: "#5b4bf5" },
  { value: "teal", label: "Teal", color: "#0b8f80" },
  { value: "blue", label: "Blue", color: "#2470d8" },
  { value: "rose", label: "Rose", color: "#d13a60" },
  { value: "amber", label: "Amber", color: "#b8730a" }
];

const THEMES: Array<{ value: ThemeMode; label: string; preview: string }> = [
  { value: "day", label: "Light", preview: "bg-[#f4f3ee] border border-line" },
  { value: "night", label: "Dark", preview: "bg-[#14161c]" },
  { value: "auto", label: "Match device", preview: "bg-[linear-gradient(90deg,#f4f3ee_50%,#14161c_50%)]" }
];

function SettingRow({ title, detail, first, children }: { title: string; detail?: string; first?: boolean; children: ReactNode }) {
  return (
    <Row first={first}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {detail ? <div className="text-[13px] text-ink-2">{detail}</div> : null}
      </div>
      {children}
    </Row>
  );
}

export function SettingsPage() {
  const { store, auth } = useApp();
  const { mode, setMode, prefs, setPrefs } = useTheme();
  const cloudEnabled = useAssistantStatus();
  const [name, setName] = useState(auth.displayName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => setName(auth.displayName), [auth.displayName]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setStatus("saving");
    const result = await auth.saveDisplayName(name);
    if (result.error) {
      setError(result.error.message);
      setStatus("error");
    } else setStatus("saved");
  }

  const initials = (name || "G").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Page title="Settings" subtitle="Make DayBoard yours">
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Profile" action={auth.user ? <Chip tone="green">Signed in</Chip> : <Chip tone="amber">Guest</Chip>} />
            <form onSubmit={saveName} className="flex flex-wrap items-end gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ffb86b] to-[#e0476b] text-xl font-bold text-white">{initials}</span>
              <Field label="Display name" className="min-w-[180px] flex-1">
                <TextInput value={name} maxLength={80} onChange={(event) => { setName(event.target.value); setStatus("idle"); }} placeholder="Your name" />
              </Field>
              <Button type="submit" variant="primary" className="h-11" disabled={status === "saving" || name.trim() === auth.displayName}>
                {status === "saving" ? "Saving…" : "Save"}
              </Button>
            </form>
            {status === "saved" ? <Notice tone="green" className="mt-3">Name saved.</Notice> : null}
            {status === "error" ? <Notice tone="rose" className="mt-3">{error || "Could not save the name."}</Notice> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Email</Label>
                <div className="truncate">{auth.user?.email ?? "Not signed in"}</div>
              </div>
              <div>
                <Label className="mb-1">Timezone</Label>
                <div className="truncate">{store.data.timezone.replace(/_/g, " ")}</div>
              </div>
            </div>
            <div className="mt-4">
              {auth.user ? (
                <Button onClick={() => void auth.signOut()} icon={<LogOut className="h-4 w-4" />}>
                  Sign out
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" href="/login">
                    Sign in or create an account
                  </Button>
                  <span className="text-[13px] text-ink-2">Your data is saved on this device until you sign in.</span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Appearance" />
            <Label className="mb-2">Theme</Label>
            <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
              {THEMES.map((theme) => (
                <button key={theme.value} type="button" role="radio" aria-checked={mode === theme.value} onClick={() => setMode(theme.value)} className={cn("rounded-[14px] border-2 p-2 text-center text-[13px] font-semibold", mode === theme.value ? "border-accent" : "border-line")}>
                  <span className={cn("mb-1.5 block h-12 rounded-lg", theme.preview)} />
                  {theme.label}
                </button>
              ))}
            </div>
            <Label className="mb-3 mt-5">Accent colour</Label>
            <div className="flex gap-4 pl-1" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((accent) => (
                <button key={accent.value} type="button" role="radio" aria-checked={prefs.accent === accent.value} aria-label={accent.label} title={accent.label} onClick={() => setPrefs({ accent: accent.value })} style={{ backgroundColor: accent.color }} className={cn("h-8 w-8 rounded-full", prefs.accent === accent.value && "ring-2 ring-ink ring-offset-[3px] ring-offset-surface")} />
              ))}
            </div>
            <Label className="mb-2 mt-5">Text size</Label>
            <Segmented<TextSize>
              label="Text size"
              value={prefs.textSize}
              onChange={(textSize) => setPrefs({ textSize })}
              options={[
                { value: "small", label: "Small" },
                { value: "default", label: "Default" },
                { value: "large", label: "Large" },
                { value: "xlarge", label: "Extra large" }
              ]}
            />
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Assistant" action={<Chip tone={cloudEnabled ? "green" : "neutral"} icon={<Lock className="h-3 w-3" />}>{cloudEnabled === null ? "Checking…" : cloudEnabled ? "Full assistant on" : "On-device only"}</Chip>} />
            <SettingRow first title="Plan study sessions automatically" detail="When an exam is added, set aside time before it">
              <Toggle checked={prefs.autoPlanStudy} onChange={(autoPlanStudy) => setPrefs({ autoPlanStudy })} label="Plan study sessions automatically" />
            </SettingRow>
            <SettingRow title="Voice input" detail="Add things by speaking, using your browser's speech recognition">
              <Toggle checked={prefs.voiceInput} onChange={(voiceInput) => setPrefs({ voiceInput })} label="Voice input" />
            </SettingRow>
            <SettingRow title="Daily focus goal" detail="Used on the dashboard and in Insights">
              <Segmented
                label="Daily focus goal"
                value={String(prefs.focusGoalMinutes)}
                onChange={(value) => setPrefs({ focusGoalMinutes: Number(value) })}
                options={[
                  { value: "60", label: "1h" },
                  { value: "120", label: "2h" },
                  { value: "180", label: "3h" },
                  { value: "240", label: "4h" }
                ]}
              />
            </SettingRow>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              {cloudEnabled
                ? "Scheduling answers and typed adds are worked out on your device. Open questions and photos are sent to the assistant service when you are signed in. Nothing is added without your confirmation."
                : "Right now the assistant runs entirely on your device: it understands what you type or say and answers from your own data. Photo reading and open questions switch on when the site owner adds an assistant key."}
            </p>
          </Card>

          <Card>
            <CardHeader title="Dashboard" />
            <SettingRow first title="Show habits">
              <Toggle checked={prefs.showHabits} onChange={(showHabits) => setPrefs({ showHabits })} label="Show habits" />
            </SettingRow>
            <SettingRow title="Show focus progress">
              <Toggle checked={prefs.showFocus} onChange={(showFocus) => setPrefs({ showFocus })} label="Show focus progress" />
            </SettingRow>
            <SettingRow title="Show pinned note">
              <Toggle checked={prefs.showNotes} onChange={(showNotes) => setPrefs({ showNotes })} label="Show pinned note" />
            </SettingRow>
            <SettingRow title="Wall display" detail="A large, button-free view for an always-on screen">
              <Button size="sm" href="/display" icon={<Monitor className="h-4 w-4" />}>
                Open
              </Button>
            </SettingRow>
          </Card>

          {store.isGuest ? (
            <Card>
              <CardHeader title="Data on this device" />
              <p className="text-sm text-ink-2">You are not signed in, so everything is stored in this browser only.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {confirmReset ? (
                  <>
                    <Button variant="danger" onClick={() => { store.resetData(); setConfirmReset(false); }}>
                      Yes, erase everything
                    </Button>
                    <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
                  </>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmReset(true)}>
                    Erase data on this device
                  </Button>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
