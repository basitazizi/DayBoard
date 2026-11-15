"use client";

import { useSearchParams } from "next/navigation";
import { BookOpen, CalendarDays, Camera, CheckSquare, Clock, FileText, GraduationCap, Loader2, Lock, Mic, Send, Sparkles, Square, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { askAssistant, prepareImage, useAssistantStatus, type AssistantImage, type ChatTurn } from "@/lib/assistant-client";
import { cn } from "@/lib/cn";
import { applyDrafts, describeResult, type DraftChange, type DraftItem } from "@/lib/drafts";
import { useTheme } from "@/lib/theme";
import { useSpeech } from "@/lib/use-speech";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { countSelected, DraftList } from "../drafts-ui";
import { Button, Card, Chip, IconButton, IconTile, Toggle } from "../ui";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  hasPhoto?: boolean;
  drafts?: DraftItem[];
  changes?: DraftChange[];
  applied?: string;
  undo?: () => void;
  source?: "cloud" | "device";
  note?: string;
}

const SUGGESTIONS: Array<{ icon: ReactNode; text: string }> = [
  { icon: <CalendarDays className="h-[17px] w-[17px]" />, text: "What's due this week?" },
  { icon: <CheckSquare className="h-[17px] w-[17px]" />, text: "What should I work on next?" },
  { icon: <Clock className="h-[17px] w-[17px]" />, text: "When am I free today?" },
  { icon: <GraduationCap className="h-[17px] w-[17px]" />, text: "How are my grades?" },
  { icon: <BookOpen className="h-[17px] w-[17px]" />, text: "Add a chem quiz Thursday at 2pm" }
];

export function AssistantPage() {
  const { store, auth } = useApp();
  const { prefs } = useTheme();
  const params = useSearchParams();
  const cloudEnabled = useAssistantStatus();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(params.get("notes") === "1");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const speech = useSpeech((finalText) => setInput(finalText));
  const fullAssistant = Boolean(cloudEnabled && auth.user);

  async function send(text: string, image?: AssistantImage) {
    const question = text.trim() || (image ? "Add everything from this photo." : "");
    if (!question || busy) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: question, hasPhoto: Boolean(image) };
    const history: ChatTurn[] = [...messagesRef.current, userMessage].map((message) => ({ role: message.role, content: message.text }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setBusy(true);
    const result = await askAssistant(history, store.data, { cloudEnabled: Boolean(cloudEnabled), image, includeNotes, mode: image ? "extract" : "chat" });
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: result.text, drafts: result.drafts?.length ? result.drafts : undefined, changes: result.changes?.length ? result.changes : undefined, source: result.source, note: result.error }]);
    setBusy(false);
  }

  useEffect(() => {
    const question = params.get("q");
    if (!question || started.current || cloudEnabled === null || !store.hydrated) return;
    started.current = true;
    void send(question);
    // Runs once, when the page is opened with a question in the link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, store.hydrated]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function patch(id: string, change: Partial<Message>) {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...change } : message)));
  }

  function confirm(message: Message) {
    const result = applyDrafts(store, message.drafts ?? [], message.changes ?? [], { autoPlan: prefs.autoPlanStudy });
    patch(message.id, { applied: describeResult(result), undo: result.undo });
  }

  return (
    <Page title="Assistant" subtitle="Knows your schedule. Answers your questions. Does the adding for you." fill>
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_330px]">
        <Card className="flex min-h-[70dvh] flex-col p-4 sm:p-6 lg:min-h-0">
          <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4" aria-live="polite">
            {messages.length === 0 ? (
              <div className="m-auto flex max-w-md flex-col items-center gap-3 py-8 text-center">
                <IconTile tone="accent" solid size="lg">
                  <Sparkles className="h-6 w-6" />
                </IconTile>
                <h2 className="text-xl font-bold tracking-[-0.01em]">How can I help?</h2>
                <p className="text-ink-2">Ask about your schedule, or tell me what to add. I show you what I&apos;m about to add before anything is saved.</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2 lg:hidden">
                  {SUGGESTIONS.slice(0, 3).map((suggestion) => (
                    <Button key={suggestion.text} size="sm" onClick={() => void send(suggestion.text)}>
                      {suggestion.text}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="max-w-[82%] self-end rounded-[18px] rounded-br-[5px] bg-accent px-4 py-2.5 font-medium text-on-accent">
                  {message.hasPhoto ? <span className="mb-1 flex items-center gap-1.5 text-[13px] opacity-85"><Camera className="h-3.5 w-3.5" /> Photo attached</span> : null}
                  {message.text}
                </div>
              ) : (
                <div key={message.id} className="flex max-w-full gap-3 sm:max-w-[90%]">
                  <IconTile tone="accent" solid className="hidden sm:grid">
                    <Sparkles className="h-[19px] w-[19px]" />
                  </IconTile>
                  <div className="min-w-0 flex-1 rounded-[18px] rounded-tl-[5px] bg-bg px-4 py-3.5">
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                    {message.note ? <p className="mt-2 text-[13px] text-ink-3">{message.note}</p> : null}
                    {(message.drafts || message.changes) && !message.applied ? (
                      <div className="mt-3">
                        <DraftList items={message.drafts ?? []} changes={message.changes ?? []} data={store.data} onItems={(drafts) => patch(message.id, { drafts })} onChanges={(changes) => patch(message.id, { changes })} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="primary" size="sm" disabled={countSelected(message.drafts ?? [], message.changes ?? []) === 0} onClick={() => confirm(message)}>
                            Confirm {countSelected(message.drafts ?? [], message.changes ?? [])} change{countSelected(message.drafts ?? [], message.changes ?? []) === 1 ? "" : "s"}
                          </Button>
                          <Button size="sm" onClick={() => patch(message.id, { drafts: undefined, changes: undefined })}>
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {message.applied ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Chip tone="green">{message.applied}</Chip>
                        {message.undo ? (
                          <button type="button" onClick={() => { message.undo?.(); patch(message.id, { applied: "Undone.", undo: undefined }); }}>
                            <Chip icon={<Undo2 className="h-3 w-3" />}>Undo</Chip>
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )}

            {busy ? (
              <div className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex h-14 shrink-0 items-center gap-1.5 rounded-2xl border border-line bg-surface pl-4 pr-2 shadow-[0_2px_10px_rgb(20_22_28/0.06)] focus-within:border-accent"
          >
            <input value={speech.listening ? speech.transcript : input} onChange={(event) => setInput(event.target.value)} placeholder={speech.listening ? "Listening…" : "Ask anything, or tell me what to add…"} aria-label="Message the assistant" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  void send(input, await prepareImage(file));
                } catch {
                  setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: "That photo could not be opened. Try a different one." }]);
                }
              }}
            />
            <IconButton label="Add from a photo" tone="soft" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Camera className="h-[18px] w-[18px]" />
            </IconButton>
            {speech.supported && prefs.voiceInput ? (
              <IconButton label={speech.listening ? "Stop listening" : "Speak"} tone="soft" className={cn(speech.listening && "bg-rose text-white hover:bg-rose hover:text-white")} onClick={() => (speech.listening ? speech.stop() : speech.start())}>
                {speech.listening ? <Square className="h-4 w-4" fill="currentColor" /> : <Mic className="h-[18px] w-[18px]" />}
              </IconButton>
            ) : null}
            <button type="submit" aria-label="Send" disabled={busy || !input.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-on-accent disabled:opacity-45">
              <Send className="h-[18px] w-[18px]" />
            </button>
          </form>
          {speech.error ? <p className="mt-2 text-[13px] text-rose">{speech.error}</p> : null}
        </Card>

        <div className="hidden content-start gap-5 lg:grid">
          <Card>
            <h2 className="mb-2 font-semibold">What I can see</h2>
            {[
              { icon: <CalendarDays className="h-4 w-4" />, label: "Calendar and classes", tone: "teal" as const },
              { icon: <CheckSquare className="h-4 w-4" />, label: "Tasks and deadlines", tone: "accent" as const },
              { icon: <GraduationCap className="h-4 w-4" />, label: "Grades and habits", tone: "amber" as const }
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 py-1.5 text-sm">
                <IconTile tone={row.tone} size="sm">
                  {row.icon}
                </IconTile>
                <span className="flex-1">{row.label}</span>
                <span className="text-[13px] font-semibold text-ink-3">Always</span>
              </div>
            ))}
            <div className="flex items-center gap-3 py-1.5 text-sm">
              <IconTile tone="rose" size="sm">
                <FileText className="h-4 w-4" />
              </IconTile>
              <span className="flex-1">Notes</span>
              <Toggle checked={includeNotes} onChange={setIncludeNotes} label="Let the assistant read notes" />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Try asking</h2>
            <div className="grid gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion.text} type="button" disabled={busy} onClick={() => void send(suggestion.text)} className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-left text-sm font-medium hover:border-accent hover:text-accent">
                  {suggestion.icon}
                  {suggestion.text}
                </button>
              ))}
            </div>
          </Card>

          <Card className="flex items-start gap-3">
            <IconTile tone="green">
              <Lock className="h-5 w-5" />
            </IconTile>
            <div className="text-[13px] leading-relaxed">
              <div className="font-semibold">{fullAssistant ? "Full assistant is on" : "Running on your device"}</div>
              <div className="text-ink-2">
                {fullAssistant
                  ? "Open questions and photos go to the assistant service. Nothing is added without your OK."
                  : cloudEnabled
                    ? "Sign in to ask open questions and add from photos. Schedule answers already work on this device."
                    : "I answer from your own data and understand what you type or say. Open questions and photo reading are not switched on for this site yet."}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
