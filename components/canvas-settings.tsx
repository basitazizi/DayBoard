"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { matchCourse } from "@/lib/canvas/classify";
import { validateFeedUrl } from "@/lib/canvas/feed-url";
import type { CanvasSettings, CourseMap, CourseMapping } from "@/lib/canvas/settings";
import { useApp } from "./app-context";
import { useCanvas, type CanvasPreview } from "./canvas-provider";
import { Button, Card, CardHeader, Chip, Notice, Row, SelectInput, Sheet, TextInput, Toggle } from "./ui";

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

function timeAgo(iso: string | null | undefined, now: Date) {
  if (!iso) return "Not synced yet";
  const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "Last synced just now";
  if (minutes < 60) return `Last synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Last synced ${days} day${days === 1 ? "" : "s"} ago`;
}

const mappingValue = (mapping: CourseMapping) => (mapping.mode === "existing" ? `existing:${mapping.courseId}` : mapping.mode);
const parseMapping = (value: string): CourseMapping => (value.startsWith("existing:") ? { mode: "existing", courseId: value.slice(9) } : value === "skip" ? { mode: "skip" } : { mode: "new" });

/** Which DayBoard class each Canvas course goes into. */
function CourseMapper({ names, map, onChange }: { names: { name: string; detail?: string }[]; map: CourseMap; onChange: (map: CourseMap) => void }) {
  const { store } = useApp();
  if (!names.length) return null;
  return (
    <div className="grid gap-2">
      {names.map(({ name, detail }) => (
        <div key={name} className="grid gap-1.5 rounded-xl border border-line p-3 sm:grid-cols-[1fr_220px] sm:items-center">
          <div className="min-w-0">
            <div className="truncate font-semibold">{name}</div>
            {detail ? <div className="text-[13px] text-ink-2">{detail}</div> : null}
          </div>
          <SelectInput aria-label={`Class for ${name}`} value={mappingValue(map[name] ?? { mode: "new" })} onChange={(event) => onChange({ ...map, [name]: parseMapping(event.target.value) })} className="h-10 text-[14px]">
            {store.data.courses.map((course) => (
              <option key={course.id} value={`existing:${course.id}`}>
                Into {course.name}
              </option>
            ))}
            <option value="new">Create a new class</option>
            <option value="skip">Don&apos;t import this course</option>
          </SelectInput>
        </div>
      ))}
    </div>
  );
}

function TypeToggles({ settings, onChange }: { settings: CanvasSettings; onChange: (settings: CanvasSettings) => void }) {
  const set = (key: keyof CanvasSettings["types"], value: boolean) => onChange({ ...settings, types: { ...settings.types, [key]: value } });
  return (
    <>
      <SettingRow first title="Assignments">
        <Toggle checked={settings.types.assignments} onChange={(value) => set("assignments", value)} label="Import assignments" />
      </SettingRow>
      <SettingRow title="Quizzes">
        <Toggle checked={settings.types.quizzes} onChange={(value) => set("quizzes", value)} label="Import quizzes" />
      </SettingRow>
      <SettingRow title="Exams" detail="Titles with exam, midterm, final or test">
        <Toggle checked={settings.types.exams} onChange={(value) => set("exams", value)} label="Import exams" />
      </SettingRow>
      <SettingRow title="Other calendar events" detail="Class events your teachers add in Canvas">
        <Toggle checked={settings.types.events} onChange={(value) => set("events", value)} label="Import calendar events" />
      </SettingRow>
    </>
  );
}

const MINUTE_LABELS: [keyof CanvasSettings["minutes"], string][] = [
  ["homework", "Homework"],
  ["quiz", "Quiz"],
  ["lab", "Lab"],
  ["paper", "Paper / essay"],
  ["project", "Project"],
  ["exam", "Exam study goal"]
];

function MoreOptions({ settings, onChange }: { settings: CanvasSettings; onChange: (settings: CanvasSettings) => void }) {
  return (
    <>
      <SettingRow first title="Import short notes" detail="The start of each description, as plain text">
        <Toggle checked={settings.importNotes} onChange={(importNotes) => onChange({ ...settings, importNotes })} label="Import notes" />
      </SettingRow>
      <SettingRow title="Plan study time for exams" detail="Sessions in your free time before each imported exam">
        <Toggle checked={settings.autoStudyPlans} onChange={(autoStudyPlans) => onChange({ ...settings, autoStudyPlans })} label="Plan study time automatically" />
      </SettingRow>
      <SettingRow title="Sync automatically" detail="When you open DayBoard (at most hourly), and once a day">
        <Toggle checked={settings.autoSync} onChange={(autoSync) => onChange({ ...settings, autoSync })} label="Sync automatically" />
      </SettingRow>
      <SettingRow title="Skip older items" detail="Don't import things due more than this long ago">
        <SelectInput aria-label="Skip items older than" value={String(settings.pastDays)} onChange={(event) => onChange({ ...settings, pastDays: Number(event.target.value) })} className="h-10 w-[140px] text-[14px]">
          <option value="0">Today on</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </SelectInput>
      </SettingRow>
      <div className="mt-3">
        <div className="mb-2 text-[13px] font-semibold text-ink-2">Default time for new items (minutes)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MINUTE_LABELS.map(([key, label]) => (
            <label key={key} className="grid gap-1 text-[13px] text-ink-2">
              {label}
              <TextInput
                type="number"
                min={5}
                max={3000}
                step={5}
                value={settings.minutes[key]}
                onChange={(event) => onChange({ ...settings, minutes: { ...settings.minutes, [key]: Math.max(5, Number(event.target.value) || 0) } })}
                className="h-10"
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

/** How to find the link, in the Canvas app (steps from the student's point of view). */
const GUIDE: ReactNode[] = [
  <>Open the <strong>Canvas</strong> app.</>,
  <>Tap the <strong>three bars</strong> (☰) in the top corner.</>,
  <>Go to <strong>Settings</strong>.</>,
  <>Tap <strong>Subscribe to Calendar Feed</strong>.</>,
  <>Copy the link and paste it here.</>
];

function Guide() {
  return (
    <ol className="grid gap-2.5">
      {GUIDE.map((step, index) => (
        <li key={index} className="flex gap-3 text-sm leading-relaxed">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">{index + 1}</span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
      <li className="pl-9 text-[13px] text-ink-3">On a computer: Canvas → Calendar → Calendar Feed.</li>
    </ol>
  );
}

/**
 * Everything about the Canvas connection in one panel: add or replace the link, preview and pick courses,
 * then (once connected) status, Sync now, options and Disconnect.
 */
function CanvasPanel({ onDone }: { onDone: () => void }) {
  const { store, now, showToast } = useApp();
  const canvas = useCanvas();
  const status = canvas.status!;
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CanvasPreview | null>(null);
  const [settings, setSettings] = useState<CanvasSettings>(status.settings);
  const [courseMap, setCourseMap] = useState<CourseMap>(status.courseMap);
  const [showOptions, setShowOptions] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [justConnected, setJustConnected] = useState<string | null>(null);

  useEffect(() => {
    setSettings(status.settings);
    setCourseMap(status.courseMap);
  }, [status]);

  const previewCourses = useMemo(
    () =>
      (preview?.summary.courses ?? [])
        .filter((course) => course.name !== "No course")
        .map((course) => ({ name: course.name, detail: [course.assignments ? `${course.assignments} assignment${course.assignments === 1 ? "" : "s"}` : "", course.exams ? `${course.exams} exam${course.exams === 1 ? "" : "s"}` : "", course.events ? `${course.events} event${course.events === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") })),
    [preview]
  );

  async function runPreview() {
    setError(null);
    const checked = validateFeedUrl(link);
    if (!checked.ok) return setError(checked.error);
    const result = await canvas.preview(link);
    if (result.error || !result.preview) return setError(result.error ?? "Couldn't read that link.");
    const map: CourseMap = {};
    for (const course of result.preview.summary.courses) {
      if (course.name === "No course") continue;
      const match = matchCourse(course.name, store.data.courses);
      map[course.name] = match ? { mode: "existing", courseId: match.id } : { mode: "new" };
    }
    setCourseMap(map);
    setPreview(result.preview);
  }

  async function runConnect() {
    const message = await canvas.connect(link, settings, courseMap, preview ?? undefined);
    setPreview(null);
    setLink("");
    setRelinking(false);
    // Stay open on the "manage" view so the student can customise straight away.
    setJustConnected(message);
  }

  /* -------- Step 2: preview and choices -------- */
  if (preview) {
    return (
      <div className="grid gap-5">
        <Notice tone="green">
          Found {previewCourses.length} course{previewCourses.length === 1 ? "" : "s"}, {preview.summary.assignments} assignment{preview.summary.assignments === 1 ? "" : "s"} and {preview.summary.exams} exam{preview.summary.exams === 1 ? "" : "s"}.
        </Notice>
        {previewCourses.length ? (
          <section>
            <div className="mb-2 font-semibold">Your courses</div>
            <CourseMapper names={previewCourses} map={courseMap} onChange={setCourseMap} />
          </section>
        ) : null}
        <section>
          <div className="mb-1 font-semibold">What to import</div>
          <TypeToggles settings={settings} onChange={setSettings} />
        </section>
        <section>
          <button type="button" className="text-[14px] font-semibold text-accent" onClick={() => setShowOptions((value) => !value)}>
            {showOptions ? "Hide options" : "More options"}
          </button>
          {showOptions ? (
            <div className="mt-2">
              <MoreOptions settings={settings} onChange={setSettings} />
            </div>
          ) : null}
        </section>
        <div className="flex items-center gap-3">
          <Button variant="primary" full disabled={canvas.busy} onClick={() => void runConnect()} icon={canvas.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {canvas.busy ? "Importing…" : "Import"}
          </Button>
          <Button onClick={() => setPreview(null)}>Back</Button>
        </div>
      </div>
    );
  }

  /* -------- Step 1: add (or replace) the link -------- */
  if (!status.connected || relinking) {
    return (
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-ink-2">Add your Canvas calendar link once, and your assignments and exams stay up to date in DayBoard. You can still edit, complete or hide anything.</p>
        <Guide />
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void runPreview();
          }}
        >
          <TextInput value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://school.instructure.com/feeds/calendars/user_….ics" aria-label="Canvas Calendar Feed link" autoComplete="off" spellCheck={false} inputMode="url" />
          <Button type="submit" variant="primary" disabled={!link.trim() || canvas.busy} icon={canvas.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {canvas.busy ? "Checking…" : "Continue"}
          </Button>
        </form>
        {error ? <Notice tone="rose">{error}</Notice> : null}
        <p className="text-[12px] leading-relaxed text-ink-3">Treat this link like a password: anyone with it can see your Canvas calendar. DayBoard stores it securely and only uses it to read your calendar. You can disconnect any time.</p>
        {relinking ? (
          <Button variant="ghost" onClick={() => setRelinking(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    );
  }

  /* -------- Connected: manage -------- */
  const knownCourses = Object.keys(courseMap).map((name) => ({ name }));
  const dirty = JSON.stringify(settings) !== JSON.stringify(status.settings) || JSON.stringify(courseMap) !== JSON.stringify(status.courseMap);

  if (confirmDisconnect) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-ink-2">DayBoard will stop syncing and forget your Canvas link. What should happen to the imported items?</p>
        <Button
          variant="primary"
          onClick={async () => {
            await canvas.disconnect(true);
            showToast("Canvas disconnected. Your imported items are kept.");
            onDone();
          }}
        >
          Keep imported items
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            const removed = await canvas.disconnect(false);
            showToast(`Canvas disconnected. Removed ${removed} item${removed === 1 ? "" : "s"} you hadn't changed.`);
            onDone();
          }}
        >
          Remove the ones I haven&apos;t edited
        </Button>
        <Button variant="ghost" onClick={() => setConfirmDisconnect(false)}>
          Cancel
        </Button>
        <p className="text-[13px] text-ink-2">Anything you edited, started or completed always stays.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {justConnected ? (
        <Notice tone="green">
          <div className="font-semibold">You&apos;re connected to Canvas!</div>
          <div className="mt-0.5 font-normal">
            {/^everything is up to date$/i.test(justConnected) ? "Nothing new to import right now." : `${justConnected}.`} Make it yours below: pick courses, what to import, default times, study plans and syncing.
          </div>
        </Notice>
      ) : null}
      <div className="rounded-xl border border-line p-3.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Your Canvas link</span>
          <button type="button" className="text-[13px] font-semibold text-accent" onClick={() => setRelinking(true)}>
            Change link
          </button>
        </div>
        <div className="mt-1 truncate text-ink-2">{status.feed}</div>
        <div className="text-ink-3">{timeAgo(status.lastSyncedAt, now)}</div>
      </div>
      {status.lastStatus === "error" && status.lastError ? <Notice tone="amber">{status.lastError}</Notice> : null}
      {status.lastStatus === "broken" ? <Notice tone="rose">{status.lastError ?? "This Canvas link doesn't work any more."} Your imported items are safe — paste a new link to keep syncing.</Notice> : null}

      {status.lastStatus === "broken" ? (
        <Button variant="primary" onClick={() => setRelinking(true)} icon={<Link2 className="h-4 w-4" />}>
          Paste a new link
        </Button>
      ) : (
        <Button variant="primary" disabled={canvas.busy} icon={<RefreshCw className={`h-4 w-4 ${canvas.busy ? "animate-spin" : ""}`} />} onClick={async () => showToast(await canvas.syncNow())}>
          {canvas.busy ? "Syncing…" : "Sync now"}
        </Button>
      )}

      <div className="border-t border-line pt-4 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">Customize</div>
      {knownCourses.length ? (
        <section>
          <div className="mb-2 font-semibold">Courses</div>
          <CourseMapper names={knownCourses} map={courseMap} onChange={setCourseMap} />
        </section>
      ) : null}
      <section>
        <div className="mb-1 font-semibold">What to import</div>
        <TypeToggles settings={settings} onChange={setSettings} />
      </section>
      <section>
        <div className="mb-1 font-semibold">Options</div>
        <MoreOptions settings={settings} onChange={setSettings} />
      </section>
      {dirty ? (
        <div className="flex gap-3">
          <Button
            variant="primary"
            full
            onClick={async () => {
              await canvas.saveSettings(settings, courseMap);
              showToast("Saved. Changes apply from the next sync.");
            }}
          >
            Save changes
          </Button>
          <Button
            onClick={() => {
              setSettings(status.settings);
              setCourseMap(status.courseMap);
            }}
          >
            Undo
          </Button>
        </div>
      ) : null}
      <Button variant="danger" onClick={() => setConfirmDisconnect(true)} icon={<Unplug className="h-4 w-4" />}>
        Disconnect Canvas
      </Button>
    </div>
  );
}

/** The Canvas panel, mounted once in the app shell; opened from Settings, More or School. */
export function CanvasPanelSheet() {
  const canvas = useCanvas();
  const status = canvas.status;
  return (
    <Sheet open={canvas.panelOpen && Boolean(status)} onClose={canvas.closePanel} title={status?.connected ? "Canvas" : "Connect to Canvas"} description="Works with Canvas" wide>
      {/* Remounting on open starts each visit fresh (no half-filled link or old preview). */}
      {status && canvas.panelOpen ? <CanvasPanel onDone={canvas.closePanel} /> : null}
    </Sheet>
  );
}

/** Short status line for a Canvas connection. */
export function canvasStatusChip(status: ReturnType<typeof useCanvas>["status"]) {
  if (!status) return null;
  if (!status.connected) return <Chip>Not connected</Chip>;
  if (status.lastStatus === "broken") return <Chip tone="rose">Needs a new link</Chip>;
  if (status.lastStatus === "error") return <Chip tone="amber">Will retry</Chip>;
  return <Chip tone="green">Connected</Chip>;
}

/** The Canvas card in Settings: a short summary and one button that opens the panel. */
export function CanvasImportCard() {
  const { now } = useApp();
  const canvas = useCanvas();
  const status = canvas.status;
  const { openPanel } = canvas;

  // Opened from a link elsewhere: /settings?tab=general&canvas=1
  useEffect(() => {
    if (status && new URLSearchParams(window.location.search).get("canvas") === "1") openPanel();
  }, [status, openPanel]);

  const connected = Boolean(status?.connected);
  return (
    <Card id="canvas">
      <CardHeader title="Canvas" action={canvasStatusChip(status)} />
      <p className="text-sm leading-relaxed text-ink-2">
        {connected ? `Your assignments and exams sync from Canvas. ${timeAgo(status?.lastSyncedAt, now)}.` : "Bring in your Canvas assignments and exams automatically, and keep them up to date."}
      </p>
      <Button variant={connected ? "secondary" : "primary"} className="mt-3" disabled={!status} onClick={openPanel} icon={<Link2 className="h-4 w-4" />}>
        {connected ? "Manage Canvas" : "Connect to Canvas"}
      </Button>
    </Card>
  );
}