"use client";

import { ArrowDown, ArrowUp, Bell, Camera, Check, Cloud, Download, Upload, HardDrive, ImagePlus, Lock, LogOut, Monitor, PartyPopper, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAssistantStatus } from "@/lib/assistant-client";
import { supabase } from "@/lib/supabase";
import { countBackupItems, downloadBackup, readBackup, stageBackup } from "@/lib/backup";
import { notificationsSupported } from "@/lib/use-reminders";
import { cn } from "@/lib/cn";
import { ACCENTS, AVATAR_EMOJIS, BACKDROPS, DEFAULT_WIDGETS, FONTS, GRADIENTS, imageToDataUrl, WIDGETS, type Backdrop, type WidgetSlot } from "@/lib/personalize";
import { useTheme, type Density, type TextSize, type ThemeMode } from "@/lib/theme";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { Avatar } from "../avatar";
import { Button, Card, CardHeader, Chip, Field, IconButton, Label, Notice, Row, Segmented, SelectInput, TextInput, Toggle } from "../ui";

type Tab = "profile" | "appearance" | "dashboard" | "general";
const TABS: Tab[] = ["profile", "appearance", "dashboard", "general"];

const THEMES: Array<{ value: ThemeMode; label: string; preview: string }> = [
  { value: "day", label: "Light", preview: "bg-[#f4f3ee] border border-line" },
  { value: "night", label: "Dark", preview: "bg-[#14161c]" },
  { value: "auto", label: "Match device", preview: "bg-[linear-gradient(90deg,#f4f3ee_50%,#14161c_50%)]" }
];

const BACKDROP_PREVIEW: Record<Backdrop, string> = {
  plain: "var(--bg)",
  dots: "radial-gradient(color-mix(in srgb, var(--ink) 22%, transparent) 1.2px, transparent 1.7px) 0 0 / 10px 10px, var(--bg)",
  grid: "linear-gradient(color-mix(in srgb, var(--ink) 12%, transparent) 1px, transparent 1px) 0 0 / 12px 12px, linear-gradient(90deg, color-mix(in srgb, var(--ink) 12%, transparent) 1px, transparent 1px) 0 0 / 12px 12px, var(--bg)",
  aurora: "radial-gradient(70% 70% at 10% 0%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%), radial-gradient(60% 60% at 100% 20%, color-mix(in srgb, var(--teal) 35%, transparent), transparent 70%), var(--bg)",
  sunset: "radial-gradient(80% 80% at 0% 0%, color-mix(in srgb, #ff9a52 45%, transparent), transparent 70%), radial-gradient(70% 70% at 100% 100%, color-mix(in srgb, #e0476b 38%, transparent), transparent 70%), var(--bg)",
  ocean: "radial-gradient(80% 80% at 100% 0%, color-mix(in srgb, #2470d8 40%, transparent), transparent 70%), radial-gradient(70% 70% at 0% 100%, color-mix(in srgb, #2bc0c9 38%, transparent), transparent 70%), var(--bg)",
  wallpaper: "var(--wallpaper, linear-gradient(135deg, var(--track), var(--surface)))"
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function SettingRow({ title, detail, first, children }: { title: string; detail?: string; first?: boolean; children: ReactNode }) {
  return (
    <Row first={first} className="flex-wrap sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {detail ? <div className="text-[13px] text-ink-2">{detail}</div> : null}
      </div>
      {children}
    </Row>
  );
}

/** A round colour or gradient choice. */
function Swatch({ selected, label, background, onClick }: { selected: boolean; label: string; background: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ background }}
      className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-white", selected && "ring-2 ring-ink ring-offset-[3px] ring-offset-surface")}
    >
      {selected ? <Check className="h-4 w-4 drop-shadow" strokeWidth={3} /> : null}
    </button>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

  // Opens the tab named in the link, for example /settings?tab=dashboard.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (requested && TABS.includes(requested)) setTab(requested);
  }, []);

  function changeTab(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", next === "profile" ? "/settings" : `/settings?tab=${next}`);
  }

  return (
    <Page
      title="Settings"
      subtitle="Make DayBoard yours"
      toolbar={
        <Segmented
          label="Settings section"
          value={tab}
          onChange={changeTab}
          options={[
            { value: "profile", label: "Profile" },
            { value: "appearance", label: "Appearance" },
            { value: "dashboard", label: "Dashboard" },
            { value: "general", label: "General" }
          ]}
        />
      }
    >
      {tab === "profile" ? <ProfileTab /> : null}
      {tab === "appearance" ? <AppearanceTab /> : null}
      {tab === "dashboard" ? <DashboardTab /> : null}
      {tab === "general" ? <GeneralTab /> : null}
    </Page>
  );
}

function SyncChip() {
  const { auth } = useApp();
  const { syncing } = useTheme();
  if (auth.user && syncing) return <Chip tone="green" icon={<Cloud className="h-3 w-3" />}>Synced to your account</Chip>;
  return <Chip icon={<HardDrive className="h-3 w-3" />}>Saved on this device</Chip>;
}

function ProfileTab() {
  const { store, auth } = useApp();
  const { profile, setProfile } = useTheme();
  const [name, setName] = useState(auth.displayName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(auth.displayName), [auth.displayName]);

  const shownName = name.trim() || auth.displayName || (auth.user ? auth.user.email?.split("@")[0] ?? "" : "Guest");
  const [birthMonth, birthDay] = profile.birthday ? profile.birthday.split("-").map(Number) : [0, 0];

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setStatus("saving");
    const result = await auth.saveDisplayName(name);
    if (result.error) {
      setError(result.error.message);
      setStatus("error");
    } else setStatus("saved");
  }

  async function choosePhoto(file: File) {
    setPhotoError("");
    try {
      setProfile({ photo: await imageToDataUrl(file, 160, true, 0.85), avatarKind: "photo" });
    } catch {
      setPhotoError("That image could not be used. Try a JPEG or PNG.");
    }
  }

  function setBirthday(month: number, day: number) {
    setProfile({ birthday: month && day ? `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "" });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
      <div className="grid content-start gap-5">
        <section className="db-card overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="h-28 sm:h-32" style={{ background: GRADIENTS[profile.banner].css }} />
          <div className="px-5 pb-5">
            <div className="-mt-11 flex items-end gap-4">
              <Avatar profile={profile} name={shownName} size={88} ring />
              <div className="mb-1 ml-auto">
                <SyncChip />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
              <h2 className="text-xl font-bold tracking-[-0.01em]">{shownName}</h2>
              {profile.pronouns ? <span className="text-sm text-ink-3">{profile.pronouns}</span> : null}
            </div>
            {profile.tagline ? <p className="text-ink-2">{profile.tagline}</p> : null}
            {profile.motto ? <p className="mt-2 text-[15px] italic text-ink-2">“{profile.motto}”</p> : null}
          </div>
        </section>

        <Card>
          <CardHeader title="About you" />
          <form onSubmit={saveName} className="flex flex-wrap items-end gap-3">
            <Field label="Display name" className="min-w-[180px] flex-1">
              <TextInput
                value={name}
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value);
                  setStatus("idle");
                }}
                placeholder="Your name"
              />
            </Field>
            <Button type="submit" variant="primary" className="h-11" disabled={status === "saving" || name.trim() === auth.displayName}>
              {status === "saving" ? "Saving…" : "Save name"}
            </Button>
          </form>
          {status === "saved" ? (
            <Notice tone="green" className="mt-3">
              Name saved.
            </Notice>
          ) : null}
          {status === "error" ? (
            <Notice tone="rose" className="mt-3">
              {error || "Could not save the name."}
            </Notice>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Headline" hint="Shown under your name, for example “CS major · Class of 2028”">
              <TextInput value={profile.tagline} maxLength={80} onChange={(event) => setProfile({ tagline: event.target.value })} placeholder="What you're about" />
            </Field>
            <Field label="Pronouns">
              <TextInput value={profile.pronouns} maxLength={30} onChange={(event) => setProfile({ pronouns: event.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Personal motto" hint="Shown at the top of your dashboard" className="sm:col-span-2">
              <TextInput value={profile.motto} maxLength={120} onChange={(event) => setProfile({ motto: event.target.value })} placeholder="Small steps every day" />
            </Field>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Birthday</span>
              <div className="flex gap-3">
                <SelectInput aria-label="Birthday month" value={birthMonth || ""} onChange={(event) => setBirthday(Number(event.target.value), birthDay || 1)} className="flex-1">
                  <option value="">Month</option>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput aria-label="Birthday day" value={birthDay || ""} onChange={(event) => setBirthday(birthMonth || 1, Number(event.target.value))} className="w-28">
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </SelectInput>
                {profile.birthday ? (
                  <IconButton label="Clear birthday" tone="soft" className="h-11 w-11" onClick={() => setProfile({ birthday: "" })}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                ) : null}
              </div>
              <span className="mt-1 block text-xs text-ink-3">DayBoard greets you with a celebration that day. The year is never stored.</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid content-start gap-5">
        <Card>
          <CardHeader title="Avatar" />
          <Segmented
            label="Avatar style"
            value={profile.avatarKind}
            onChange={(avatarKind) => {
              if (avatarKind === "photo" && !profile.photo) photoRef.current?.click();
              else setProfile({ avatarKind });
            }}
            options={[
              { value: "initials", label: "Initials" },
              { value: "emoji", label: "Emoji" },
              { value: "photo", label: "Photo" }
            ]}
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void choosePhoto(file);
            }}
          />

          {profile.avatarKind === "emoji" ? (
            <div className="mt-4 grid grid-cols-7 gap-2" role="radiogroup" aria-label="Avatar emoji">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={profile.emoji === emoji}
                  aria-label={emoji}
                  onClick={() => setProfile({ emoji })}
                  className={cn("grid aspect-square place-items-center rounded-xl text-2xl transition-colors", profile.emoji === emoji ? "bg-accent-soft ring-2 ring-accent" : "bg-bg hover:bg-track")}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          {profile.avatarKind === "photo" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => photoRef.current?.click()} icon={<Camera className="h-4 w-4" />}>
                {profile.photo ? "Change photo" : "Choose a photo"}
              </Button>
              {profile.photo ? (
                <Button variant="danger" onClick={() => setProfile({ photo: "", avatarKind: "initials" })} icon={<Trash2 className="h-4 w-4" />}>
                  Remove
                </Button>
              ) : null}
              <span className="w-full text-xs text-ink-3">Your photo is shrunk to a small square on your device before it is saved.</span>
            </div>
          ) : null}
          {photoError ? (
            <Notice tone="rose" className="mt-3">
              {photoError}
            </Notice>
          ) : null}

          {profile.avatarKind !== "photo" ? (
            <>
              <Label className="mb-2.5 mt-5">Avatar colour</Label>
              <div className="flex flex-wrap gap-3 pl-1" role="radiogroup" aria-label="Avatar colour">
                {Object.entries(GRADIENTS).map(([key, gradient]) => (
                  <Swatch key={key} label={gradient.label} background={gradient.css} selected={profile.avatarColor === key} onClick={() => setProfile({ avatarColor: key })} />
                ))}
              </div>
            </>
          ) : null}

          <Label className="mb-2.5 mt-5">Profile banner</Label>
          <div className="flex flex-wrap gap-3 pl-1" role="radiogroup" aria-label="Profile banner">
            {Object.entries(GRADIENTS).map(([key, gradient]) => (
              <Swatch key={key} label={gradient.label} background={gradient.css} selected={profile.banner === key} onClick={() => setProfile({ banner: key })} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Account" action={auth.user ? <Chip tone="green">Signed in</Chip> : <Chip tone="amber">Guest</Chip>} />
          <div className="grid gap-3 sm:grid-cols-2">
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
                <span className="text-[13px] text-ink-2">Sign in to keep your profile and look on every device.</span>
              </div>
            )}
          </div>
          <p className="mt-4 text-[13px] text-ink-3">
            Read how your information is handled in the{" "}
            <a href="/privacy" className="font-semibold text-ink-2 underline">
              privacy policy
            </a>
            .
          </p>
        </Card>

        {auth.user ? <DeleteAccountCard /> : null}
      </div>
    </div>
  );
}

/** Permanently deletes the signed-in account and everything in it. Google Play requires this for apps with sign-up. */
function DeleteAccountCard() {
  const { auth } = useApp();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("delete_my_account");
    if (rpcError) {
      setBusy(false);
      setError(/function|schema cache|not find/i.test(rpcError.message) ? "Account deletion isn't set up on the server yet. The site owner needs to run the delete-account database setup." : "Your account could not be deleted. Please try again.");
      return;
    }
    try {
      for (const key of ["dayboard:guest-data:v2", "dayboard:prefs", "dayboard:profile", "dayboard:wallpaper", "dayboard:focus-history", "dayboard-focus-session", "dayboard:reminders-sent"]) localStorage.removeItem(key);
    } catch {
      // Nothing stored.
    }
    await auth.signOut();
    window.location.assign("/?deleted=1");
  }

  return (
    <Card>
      <CardHeader title="Delete account" />
      <p className="-mt-1.5 text-[13px] text-ink-2">Permanently deletes your account and everything in it: tasks, calendar, classes, grades, habits, notes, focus history and profile. This can't be undone. You may want to download a backup first (Settings → General).</p>
      {open ? (
        <div className="mt-3 grid gap-3">
          <Field label='Type DELETE to confirm'>
            <TextInput value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" placeholder="DELETE" />
          </Field>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="danger" disabled={typed.trim() !== "DELETE" || busy} onClick={() => void remove()} icon={<Trash2 className="h-4 w-4" />}>
              {busy ? "Deleting…" : "Delete my account forever"}
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
          {error ? <Notice tone="rose">{error}</Notice> : null}
        </div>
      ) : (
        <Button variant="danger" className="mt-3" onClick={() => setOpen(true)} icon={<Trash2 className="h-4 w-4" />}>
          Delete account
        </Button>
      )}
    </Card>
  );
}

function AppearanceTab() {
  const { mode, setMode, prefs, setPrefs, wallpaper, setWallpaper } = useTheme();
  const [wallpaperError, setWallpaperError] = useState("");
  const wallpaperRef = useRef<HTMLInputElement>(null);

  async function chooseWallpaper(file: File) {
    setWallpaperError("");
    try {
      setWallpaper(await imageToDataUrl(file, 1600, false, 0.72));
      setPrefs({ backdrop: "wallpaper" });
    } catch {
      setWallpaperError("That image could not be used, or it is too large to keep on this device.");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="grid content-start gap-5">
        <Card>
          <CardHeader title="Theme" />
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
            {THEMES.map((theme) => (
              <button key={theme.value} type="button" role="radio" aria-checked={mode === theme.value} onClick={() => setMode(theme.value)} className={cn("rounded-[14px] border-2 p-2 text-center text-[13px] font-semibold", mode === theme.value ? "border-accent" : "border-line")}>
                <span className={cn("mb-1.5 block h-12 rounded-lg", theme.preview)} />
                {theme.label}
              </button>
            ))}
          </div>

          <Label className="mb-3 mt-5">Accent colour</Label>
          <div className="flex flex-wrap items-center gap-3 pl-1" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((accent) => (
              <Swatch key={accent.value} label={accent.label} background={accent.color} selected={prefs.accent === accent.value} onClick={() => setPrefs({ accent: accent.value })} />
            ))}
            <label
              title="Pick any colour"
              className={cn("relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full", prefs.accent === "custom" && "ring-2 ring-ink ring-offset-[3px] ring-offset-surface")}
              style={{ background: prefs.accent === "custom" ? prefs.customAccent : "conic-gradient(#f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)" }}
            >
              {prefs.accent === "custom" ? <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} /> : null}
              <input type="color" aria-label="Pick any accent colour" value={prefs.customAccent} onChange={(event) => setPrefs({ accent: "custom", customAccent: event.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          </div>
          <p className="mt-2 text-xs text-ink-3">The last circle lets you pick any colour you like.</p>
        </Card>

        <Card>
          <CardHeader title="Text" />
          <Label className="mb-2">Font</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Font">
            {FONTS.map((font) => (
              <button key={font.value} type="button" role="radio" aria-checked={prefs.font === font.value} onClick={() => setPrefs({ font: font.value })} className={cn("rounded-[14px] border-2 px-2 py-3 text-center", prefs.font === font.value ? "border-accent bg-accent-soft/40" : "border-line hover:bg-surface-2")}>
                <span className="block text-2xl font-semibold" style={{ fontFamily: font.sample }}>
                  Aa
                </span>
                <span className="text-[13px] font-semibold text-ink-2" style={{ fontFamily: font.sample }}>
                  {font.label}
                </span>
              </button>
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
          <CardHeader title="Background" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Background">
            {BACKDROPS.map((backdrop) => (
              <button
                key={backdrop.value}
                type="button"
                role="radio"
                aria-checked={prefs.backdrop === backdrop.value}
                onClick={() => {
                  if (backdrop.value === "wallpaper" && !wallpaper) wallpaperRef.current?.click();
                  else setPrefs({ backdrop: backdrop.value });
                }}
                className={cn("rounded-[14px] border-2 p-1.5 text-center text-[13px] font-semibold", prefs.backdrop === backdrop.value ? "border-accent" : "border-line")}
              >
                <span className="mb-1.5 grid h-14 place-items-center rounded-lg border border-line" style={{ background: BACKDROP_PREVIEW[backdrop.value], backgroundSize: backdrop.value === "wallpaper" ? "cover" : undefined, backgroundPosition: "center" }}>
                  {backdrop.value === "wallpaper" && !wallpaper ? <ImagePlus className="h-5 w-5 text-ink-3" /> : null}
                </span>
                {backdrop.label}
              </button>
            ))}
          </div>
          <input
            ref={wallpaperRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void chooseWallpaper(file);
            }}
          />
          {wallpaper ? (
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Button size="sm" onClick={() => wallpaperRef.current?.click()} icon={<ImagePlus className="h-4 w-4" />}>
                Change photo
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setWallpaper("");
                  if (prefs.backdrop === "wallpaper") setPrefs({ backdrop: "plain" });
                }}
              >
                Remove photo
              </Button>
              <span className="text-xs text-ink-3">Background photos stay on this device.</span>
            </div>
          ) : null}
          {wallpaperError ? (
            <Notice tone="rose" className="mt-3">
              {wallpaperError}
            </Notice>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Layout and feel" />
          <SettingRow first title="Density" detail="Compact fits more on the screen">
            <Segmented<Density>
              label="Density"
              value={prefs.density}
              onChange={(density) => setPrefs({ density })}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" }
              ]}
            />
          </SettingRow>
          <SettingRow title="Celebrations" detail="A burst of confetti when you finish a task">
            <Toggle checked={prefs.celebrate} onChange={(celebrate) => setPrefs({ celebrate })} label="Celebrations" />
          </SettingRow>
        </Card>
      </div>
    </div>
  );
}

function DashboardTab() {
  const { prefs, setPrefs } = useTheme();
  const { celebrate } = useApp();

  function update(next: WidgetSlot[]) {
    setPrefs({ widgets: next });
  }

  function move(id: WidgetSlot["id"], direction: -1 | 1) {
    const list = [...prefs.widgets];
    const index = list.findIndex((slot) => slot.id === id);
    const column = list[index].column;
    let target = index + direction;
    while (target >= 0 && target < list.length && list[target].column !== column) target += direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    update(list);
  }

  function switchColumn(id: WidgetSlot["id"]) {
    const slot = prefs.widgets.find((entry) => entry.id === id);
    if (!slot) return;
    update([...prefs.widgets.filter((entry) => entry.id !== id), { ...slot, column: slot.column === "main" ? "side" : "main" }]);
  }

  function setVisible(id: WidgetSlot["id"], visible: boolean) {
    update(prefs.widgets.map((slot) => (slot.id === id ? { ...slot, visible } : slot)));
  }

  const columns: Array<{ key: WidgetSlot["column"]; title: string; detail: string }> = [
    { key: "main", title: "Main column", detail: "The wide column on the left. On phones it comes first." },
    { key: "side", title: "Side column", detail: "The narrow column on the right. Small cards pair up side by side." }
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="grid content-start gap-5">
        {columns.map((column) => {
          const slots = prefs.widgets.filter((slot) => slot.column === column.key);
          return (
            <Card key={column.key}>
              <CardHeader title={column.title} action={<Chip>{slots.filter((slot) => slot.visible).length} shown</Chip>} />
              <p className="-mt-1.5 mb-2 text-[13px] text-ink-2">{column.detail}</p>
              {slots.length ? (
                slots.map((slot, index) => (
                  <Row key={slot.id} first={index === 0} className={cn("flex-wrap sm:flex-nowrap", !slot.visible && "opacity-60")}>
                    <div className="flex flex-col">
                      <IconButton label={`Move ${WIDGETS[slot.id].label} up`} className="h-7 w-7" disabled={index === 0} onClick={() => move(slot.id, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={`Move ${WIDGETS[slot.id].label} down`} className="h-7 w-7" disabled={index === slots.length - 1} onClick={() => move(slot.id, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </IconButton>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {WIDGETS[slot.id].label}
                        {WIDGETS[slot.id].small ? <span className="ml-2 text-xs font-medium text-ink-3">small</span> : null}
                      </div>
                      <div className="text-[13px] text-ink-2">{WIDGETS[slot.id].detail}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => switchColumn(slot.id)}>
                      Move to {slot.column === "main" ? "side" : "main"}
                    </Button>
                    <Toggle checked={slot.visible} onChange={(visible) => setVisible(slot.id, visible)} label={`Show ${WIDGETS[slot.id].label}`} />
                  </Row>
                ))
              ) : (
                <p className="py-3 text-sm text-ink-2">No cards here. Move one over from the other column.</p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="grid content-start gap-5">
        <Card>
          <CardHeader title="Countdown" />
          <p className="-mt-1.5 mb-3 text-[13px] text-ink-2">Count the days to something you're looking forward to: a trip, a break, a big game.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What's coming">
              <TextInput value={prefs.countdown?.title ?? ""} maxLength={40} placeholder="Spring break" onChange={(event) => setPrefs({ countdown: { title: event.target.value, date: prefs.countdown?.date ?? "" } })} />
            </Field>
            <Field label="Date">
              <TextInput
                type="date"
                value={prefs.countdown?.date ?? ""}
                onChange={(event) => {
                  const date = event.target.value;
                  setPrefs({
                    countdown: date ? { title: prefs.countdown?.title ?? "", date } : null,
                    widgets: date ? prefs.widgets.map((slot) => (slot.id === "countdown" ? { ...slot, visible: true } : slot)) : prefs.widgets
                  });
                }}
              />
            </Field>
          </div>
          {prefs.countdown ? (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPrefs({ countdown: null })}>
              Clear countdown
            </Button>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="More" />
          <SettingRow first title="Try the confetti" detail="What you'll see when you finish something">
            <Button size="sm" onClick={celebrate} icon={<PartyPopper className="h-4 w-4" />}>
              Celebrate
            </Button>
          </SettingRow>
          <SettingRow title="Wall display" detail="A large, button-free view for an always-on screen">
            <Button size="sm" href="/display" icon={<Monitor className="h-4 w-4" />}>
              Open
            </Button>
          </SettingRow>
          <SettingRow title="Reset the layout" detail="Puts every card back where it started">
            <Button size="sm" onClick={() => setPrefs({ widgets: DEFAULT_WIDGETS })} icon={<RotateCcw className="h-4 w-4" />}>
              Reset
            </Button>
          </SettingRow>
        </Card>
      </div>
    </div>
  );
}

function RemindersCard() {
  const { prefs, setPrefs } = useTheme();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission(notificationsSupported() ? Notification.permission : "unsupported");
  }, []);

  async function toggle(on: boolean) {
    if (on && notificationsSupported() && Notification.permission === "default") {
      setPermission(await Notification.requestPermission());
    }
    setPrefs({ reminders: on });
  }

  return (
    <Card>
      <CardHeader title="Reminders" action={<Bell className="h-[18px] w-[18px] text-ink-3" />} />
      <SettingRow first title="Remind me before things start" detail="Classes, events, exams, study sessions and timed deadlines">
        <Toggle checked={prefs.reminders} onChange={(on) => void toggle(on)} label="Reminders" />
      </SettingRow>
      <SettingRow title="How early" detail="Minutes before the start or due time">
        <Segmented
          label="How early"
          value={String(prefs.reminderLead)}
          onChange={(value) => setPrefs({ reminderLead: Number(value) })}
          options={[
            { value: "5", label: "5" },
            { value: "10", label: "10" },
            { value: "15", label: "15" },
            { value: "30", label: "30" }
          ]}
        />
      </SettingRow>
      {prefs.reminders ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          {permission === "granted"
            ? "You'll get a notification while DayBoard is open in a tab or installed as an app."
            : permission === "denied"
              ? "Notifications are blocked for this site, so reminders appear inside DayBoard instead. You can allow notifications in your browser's site settings."
              : permission === "unsupported"
                ? "This browser can't show notifications, so reminders appear inside DayBoard instead."
                : "Allow notifications when your browser asks, or reminders will appear inside DayBoard instead."}
        </p>
      ) : null}
    </Card>
  );
}

function BackupCard() {
  const { store, auth } = useApp();
  const { prefs, profile, setPrefs, setProfile } = useTheme();
  const [message, setMessage] = useState<{ tone: "green" | "rose"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function restore(file: File) {
    setMessage(null);
    try {
      const backup = await readBackup(file);
      const count = countBackupItems(backup);
      const prompt = auth.user
        ? `Restore ${count} item${count === 1 ? "" : "s"} from this backup? You'll be asked to add them to your account next. Nothing in your account is replaced.`
        : `Restore ${count} item${count === 1 ? "" : "s"} from this backup? This replaces what is saved on this device.`;
      if (!window.confirm(prompt)) return;
      stageBackup(backup);
      if (backup.prefs) setPrefs(backup.prefs);
      if (backup.profile) setProfile(backup.profile);
      window.location.assign("/");
    } catch (error) {
      setMessage({ tone: "rose", text: error instanceof Error ? error.message : "That backup could not be restored." });
    }
  }

  return (
    <Card>
      <CardHeader title="Backup" />
      <p className="-mt-1.5 mb-3 text-[13px] text-ink-2">Download everything as a file you can keep, or bring it back later or on another device.</p>
      <div className="flex flex-wrap gap-2.5">
        <Button
          icon={<Download className="h-4 w-4" />}
          onClick={() => {
            downloadBackup(store.data, prefs, profile);
            setMessage({ tone: "green", text: "Backup downloaded." });
          }}
        >
          Download a backup
        </Button>
        <Button icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
          Restore from a backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void restore(file);
          }}
        />
      </div>
      {message ? (
        <Notice tone={message.tone} className="mt-3">
          {message.text}
        </Notice>
      ) : null}
    </Card>
  );
}

function GeneralTab() {
  const { store } = useApp();
  const { prefs, setPrefs, resetCustomization } = useTheme();
  const cloudEnabled = useAssistantStatus();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmLook, setConfirmLook] = useState(false);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="grid content-start gap-5">
        <Card>
          <CardHeader title="Date and time" />
          <SettingRow first title="24-hour clock" detail="Show 14:30 instead of 2:30 PM">
            <Toggle checked={prefs.clock24} onChange={(clock24) => setPrefs({ clock24 })} label="24-hour clock" />
          </SettingRow>
          <SettingRow title="Week starts on" detail="Used by the calendar and the habits grid">
            <Segmented
              label="Week starts on"
              value={String(prefs.weekStart)}
              onChange={(value) => setPrefs({ weekStart: value === "1" ? 1 : 0 })}
              options={[
                { value: "0", label: "Sunday" },
                { value: "1", label: "Monday" }
              ]}
            />
          </SettingRow>
        </Card>

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
      </div>

      <div className="grid content-start gap-5">
        <RemindersCard />
        <BackupCard />

        <Card>
          <CardHeader title="Start over" />
          <SettingRow first title="Reset appearance and layout" detail="Theme colours, font, background and dashboard go back to the defaults. Your profile and data stay.">
            {confirmLook ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    resetCustomization();
                    setConfirmLook(false);
                  }}
                >
                  Reset
                </Button>
                <Button size="sm" onClick={() => setConfirmLook(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setConfirmLook(true)} icon={<RotateCcw className="h-4 w-4" />}>
                Reset
              </Button>
            )}
          </SettingRow>
        </Card>

        {store.isGuest ? (
          <Card>
            <CardHeader title="Data on this device" />
            <p className="text-sm text-ink-2">You are not signed in, so everything is stored in this browser only.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {confirmReset ? (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      store.resetData();
                      setConfirmReset(false);
                    }}
                  >
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
  );
}
