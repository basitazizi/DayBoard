"use client";

import { Camera, ImagePlus, Loader2, Mic, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { askAssistant, prepareImage, useAssistantStatus } from "@/lib/assistant-client";
import { cn } from "@/lib/cn";
import { applyDrafts, describeResult, type DraftItem } from "@/lib/drafts";
import { parseQuickAdd } from "@/lib/quick-parse";
import { useTheme } from "@/lib/theme";
import { useSpeech } from "@/lib/use-speech";
import { useApp, type QuickAddMode } from "./app-context";
import { countSelected, DraftList } from "./drafts-ui";
import { Button, Notice, Segmented, Sheet, TextArea } from "./ui";

const EXAMPLES = ["Chem exam Friday 9am", "Bio essay due next Wednesday", "Dentist Thursday at 4", "Remind me to read every day"];

function blankDraft(kind: DraftItem["kind"] = "task", date?: string, courseId?: string): DraftItem {
  return { id: crypto.randomUUID(), kind, title: "", date, courseId, selected: true, planStudy: kind === "exam" ? true : undefined };
}

/** The one place to add anything: type it, say it, photograph it, or fill in a form. */
export function QuickAdd() {
  const { quickAdd, closeQuickAdd, store, showToast, auth } = useApp();
  const { prefs } = useTheme();
  const cloudEnabled = useAssistantStatus();
  const [mode, setMode] = useState<QuickAddMode>("type");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = Boolean(quickAdd?.open);

  const speech = useSpeech((finalText) => {
    setText(finalText);
    setDrafts(parseQuickAdd(finalText, store.data));
  });

  useEffect(() => {
    if (!quickAdd?.open) return;
    const nextMode = quickAdd.mode ?? "type";
    setMode(nextMode);
    setText(quickAdd.text ?? "");
    setMessage(null);
    setBusy(false);
    setPhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setDrafts(nextMode === "form" ? [blankDraft(quickAdd.kind, quickAdd.date, quickAdd.courseId)] : quickAdd.text ? parseQuickAdd(quickAdd.text, store.data) : []);
    // Re-run only when a new request opens the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAdd?.nonce]);

  useEffect(() => {
    if (!open) speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function changeMode(next: QuickAddMode) {
    speech.stop();
    setMode(next);
    setMessage(null);
    if (next === "form") setDrafts([blankDraft(quickAdd?.kind, quickAdd?.date, quickAdd?.courseId)]);
    else if (mode === "form") setDrafts(text ? parseQuickAdd(text, store.data) : []);
  }

  function changeText(value: string) {
    setText(value);
    setMessage(null);
    setDrafts(value.trim() ? parseQuickAdd(value, store.data) : []);
  }

  async function readWithAssistant() {
    if (!text.trim()) return;
    setBusy(true);
    const result = await askAssistant([{ role: "user", content: text }], store.data, { mode: "extract", cloudEnabled: Boolean(cloudEnabled) });
    setBusy(false);
    if (result.drafts?.length) setDrafts(result.drafts);
    setMessage(result.error ?? (result.drafts?.length ? null : result.text));
  }

  async function readPhoto(file: File) {
    setPhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setDrafts([]);
    setMessage(null);
    setBusy(true);
    try {
      const image = await prepareImage(file);
      const result = await askAssistant([{ role: "user", content: "Add everything from this photo." }], store.data, { mode: "extract", image, cloudEnabled: Boolean(cloudEnabled) });
      setDrafts(result.drafts ?? []);
      setMessage(result.drafts?.length ? result.text : result.text || "I couldn't find anything to add in that photo.");
    } catch {
      setMessage("That photo could not be opened. Try a different one.");
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const result = applyDrafts(store, drafts, [], { autoPlan: prefs.autoPlanStudy });
    if (result.added === 0) return;
    showToast(describeResult(result), result.undo);
    closeQuickAdd();
  }

  const count = countSelected(drafts);
  const liveText = mode === "speak" && speech.listening ? speech.transcript : text;
  const liveDrafts = mode === "speak" && speech.listening && speech.transcript ? parseQuickAdd(speech.transcript, store.data) : drafts;
  const photoUnavailable = cloudEnabled === false ? "Adding from a photo needs the full assistant, which is not switched on for this site yet." : !auth.user && !auth.loading ? "Sign in to add things from a photo." : null;

  return (
    <Sheet
      open={open}
      onClose={closeQuickAdd}
      title="Quick add"
      description="Type it, say it or snap it. DayBoard files it in the right place."
      wide
      footer={
        <div className="flex items-center gap-3">
          <Button variant="primary" size="lg" full disabled={count === 0 || busy || (mode === "speak" && speech.listening)} onClick={submit}>
            {count === 0 ? "Nothing to add yet" : `Add ${count} item${count === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <Segmented
        label="How to add"
        value={mode}
        onChange={changeMode}
        options={[
          { value: "type", label: "Type" },
          { value: "speak", label: "Speak" },
          { value: "photo", label: "Photo" },
          { value: "form", label: "Form" }
        ]}
      />

      <div className="mt-4 grid gap-4">
        {mode === "type" ? (
          <>
            <TextArea
              autoFocus
              value={text}
              onChange={(event) => changeText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && count > 0) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Chem exam Friday 9am and bio essay due next Wednesday"
              aria-label="What do you want to add?"
              className="min-h-[76px] border-2 border-accent text-[17px] font-medium shadow-[0_0_0_4px_var(--accent-soft)] focus:ring-0"
            />
            {!text.trim() ? (
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button key={example} type="button" onClick={() => changeText(example)} className="rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-accent hover:text-accent">
                    {example}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {mode === "speak" ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            {speech.supported && prefs.voiceInput ? (
              <>
                <button
                  type="button"
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  aria-label={speech.listening ? "Stop listening" : "Start listening"}
                  className={cn("grid h-20 w-20 place-items-center rounded-full transition-colors", speech.listening ? "bg-rose text-white" : "bg-accent text-on-accent hover:bg-accent-strong")}
                >
                  {speech.listening ? <Square className="h-7 w-7" fill="currentColor" /> : <Mic className="h-8 w-8" />}
                </button>
                {speech.listening ? (
                  <div className="flex h-10 items-center gap-1" aria-hidden>
                    {Array.from({ length: 11 }, (_, index) => (
                      <span key={index} className="voice-bar h-full w-1.5 rounded-full bg-accent" style={{ animationDelay: `${(index % 5) * 120}ms` }} />
                    ))}
                  </div>
                ) : null}
                <div className="text-[13px] font-medium text-ink-3">{speech.listening ? "Listening… tap to finish" : liveText ? "Tap to try again" : "Tap and say what to add"}</div>
                {liveText ? <p className="max-w-md text-lg font-semibold leading-snug">“{liveText}”</p> : null}
                {speech.error ? <Notice tone="rose">{speech.error}</Notice> : null}
              </>
            ) : (
              <Notice tone="amber">{prefs.voiceInput ? "Voice input is not available in this browser. Chrome, Edge and Safari support it. You can still type what you want to add." : "Voice input is turned off in Settings."}</Notice>
            )}
          </div>
        ) : null}

        {mode === "photo" ? (
          <div className="grid gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readPhoto(file);
                event.target.value = "";
              }}
            />
            {photoUnavailable ? (
              <Notice tone="amber">{photoUnavailable}</Notice>
            ) : photoUrl ? (
              <div className="relative overflow-hidden rounded-2xl border border-line bg-track">
                {/* A local preview of the person's own photo; next/image adds nothing here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="The photo you chose" className="max-h-64 w-full object-contain" />
                {busy ? (
                  <div className="absolute inset-0 grid place-items-center bg-surface/70 text-sm font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading the photo…
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-10 text-center hover:border-accent">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <Camera className="h-7 w-7" />
                </span>
                <span className="font-semibold">Take or choose a photo</span>
                <span className="max-w-xs text-[13px] text-ink-2">A syllabus, timetable, whiteboard or handwritten list. Every date found becomes an item you can confirm.</span>
              </button>
            )}
            {photoUrl && !busy && !photoUnavailable ? (
              <Button size="sm" className="justify-self-start" icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                Use a different photo
              </Button>
            ) : null}
          </div>
        ) : null}

        {message ? <Notice tone={liveDrafts.length ? "accent" : "amber"}>{message}</Notice> : null}

        {liveDrafts.length > 0 ? (
          <div className="grid gap-2.5">
            {mode !== "form" ? (
              <div className="flex items-center gap-2 text-[13px] font-semibold text-accent">
                <Sparkles className="h-4 w-4" />
                <span className="flex-1">
                  I understood {liveDrafts.length} item{liveDrafts.length === 1 ? "" : "s"}. Tap one to adjust it.
                </span>
                {mode === "type" && cloudEnabled && auth.user ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void readWithAssistant()} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
                    {busy ? "Reading…" : "Ask the assistant to read it"}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <DraftList items={liveDrafts} data={store.data} onItems={setDrafts} startExpanded={mode === "form"} />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
