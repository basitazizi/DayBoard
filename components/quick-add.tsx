"use client";

import { Loader2, Mic, Sparkles, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { askAssistant, useAssistantStatus } from "@/lib/assistant-client";
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

/** The one place to add anything: type it, fill in a form, or (where the browser supports it) say it. */
export function QuickAdd() {
  const { quickAdd, closeQuickAdd, store, showToast, auth } = useApp();
  const { prefs } = useTheme();
  const cloudEnabled = useAssistantStatus();
  const [mode, setMode] = useState<QuickAddMode>("type");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const open = Boolean(quickAdd?.open);

  const speech = useSpeech((finalText) => {
    setText(finalText);
    setDrafts(parseQuickAdd(finalText, store.data));
  });
  // Voice is offered only where it works (not in the Android app for now) and when it's switched on in Settings.
  const canSpeak = speech.supported && prefs.voiceInput;

  useEffect(() => {
    if (!quickAdd?.open) return;
    const requested = quickAdd.mode ?? "type";
    const nextMode = requested === "speak" && !canSpeak ? "type" : requested;
    setMode(nextMode);
    setText(quickAdd.text ?? "");
    setMessage(null);
    setBusy(false);
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

  function submit() {
    const result = applyDrafts(store, drafts, [], { autoPlan: prefs.autoPlanStudy });
    if (result.added === 0) return;
    showToast(describeResult(result), result.undo);
    closeQuickAdd();
  }

  const count = countSelected(drafts);
  const liveText = mode === "speak" && speech.listening ? speech.transcript : text;
  const liveDrafts = mode === "speak" && speech.listening && speech.transcript ? parseQuickAdd(speech.transcript, store.data) : drafts;

  return (
    <Sheet
      open={open}
      onClose={closeQuickAdd}
      title="Quick add"
      description={canSpeak ? "Type it or say it. DayBoard files it in the right place." : "Type it in your own words. DayBoard files it in the right place."}
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
          { value: "type" as const, label: "Type" },
          ...(canSpeak ? [{ value: "speak" as const, label: "Speak" }] : []),
          { value: "form" as const, label: "Form" }
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

        {mode === "speak" && canSpeak ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
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
