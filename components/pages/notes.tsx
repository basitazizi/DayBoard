"use client";

import { ArrowLeft, FileText, Pin, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { getLocalDateKey, getRelativeDayLabel } from "@/lib/date-utils";
import type { Note } from "@/types/dayboard";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { Button, Card, Chip, EmptyState, IconButton, SelectInput } from "../ui";

export function NotesPage() {
  const { store, now, openQuickAdd } = useApp();
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileEditing, setMobileEditing] = useState(false);

  const categories = useMemo(() => ["All", ...new Set(data.notes.map((note) => note.category))], [data.notes]);
  const visible = data.notes
    .filter((note) => (category === "All" || note.category === category) && (!query.trim() || `${note.title} ${note.content}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  const selected = data.notes.find((note) => note.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected && visible.length && window.matchMedia("(min-width: 1024px)").matches) setSelectedId(visible[0].id);
  }, [selected, visible]);

  function create() {
    const id = store.addNote({ title: "Untitled note", content: "", pinned: false, category: category === "All" ? "Quick" : category });
    setSelectedId(id);
    setMobileEditing(true);
  }

  return (
    <Page title="Notes" subtitle="Linked to your classes, tasks and exams" fill>
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[330px_1fr]">
        <Card className={cn("flex min-h-0 flex-col gap-1 p-3 sm:p-3", mobileEditing && "hidden lg:flex")}>
          <div className="mb-2 flex items-center gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-bg px-3 text-ink-3">
              <Search className="h-4 w-4 shrink-0" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3" />
            </label>
            <IconButton label="New note" tone="accent" className="h-10 w-10" onClick={create}>
              <Plus className="h-5 w-5" />
            </IconButton>
          </div>
          {categories.length > 2 ? (
            <div className="thin-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
              {categories.map((entry) => (
                <button key={entry} type="button" onClick={() => setCategory(entry)} aria-pressed={category === entry}>
                  <Chip tone={category === entry ? "accent" : "neutral"}>{entry === "All" ? `All ${data.notes.length}` : entry}</Chip>
                </button>
              ))}
            </div>
          ) : null}
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
            {visible.length ? (
              visible.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(note.id);
                    setMobileEditing(true);
                  }}
                  className={cn("block w-full rounded-[14px] border px-3.5 py-3 text-left", note.id === selectedId ? "border-accent-line bg-accent-soft/50" : "border-transparent hover:bg-surface-2")}
                >
                  <span className="flex items-center gap-2">
                    {note.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                    <span className="min-w-0 flex-1 truncate font-semibold">{note.title || "Untitled note"}</span>
                    <span className="shrink-0 text-xs text-ink-3">{getRelativeDayLabel(getLocalDateKey(new Date(note.updatedAt), data.timezone), today)}</span>
                  </span>
                  <span className="line-clamp-2 mb-1.5 mt-1 text-[13px] text-ink-2">{note.content || "Empty note"}</span>
                  <Chip tone={data.courses.find((course) => course.name === note.category)?.color ?? "neutral"}>{note.category}</Chip>
                </button>
              ))
            ) : (
              <EmptyState icon={<FileText className="h-6 w-6" />} title={data.notes.length ? "No notes match" : "No notes yet"} body={data.notes.length ? "Try a different search." : "Capture lecture notes, ideas or anything you want to keep."} action={data.notes.length ? undefined : <Button variant="primary" onClick={create}>New note</Button>} />
            )}
          </div>
        </Card>

        <Card className={cn("min-h-[60dvh] flex-col p-5 sm:p-7 lg:min-h-0", mobileEditing ? "flex" : "hidden lg:flex")}>
          {selected ? (
            <NoteEditor key={selected.id} note={selected} onBack={() => setMobileEditing(false)} onDeleted={() => { setSelectedId(null); setMobileEditing(false); }} onTasks={(text) => openQuickAdd({ mode: "type", text })} />
          ) : (
            <EmptyState className="flex-1" icon={<FileText className="h-6 w-6" />} title="Select a note" body="Or start a new one." action={<Button variant="primary" onClick={create}>New note</Button>} />
          )}
        </Card>
      </div>
    </Page>
  );
}

function NoteEditor({ note, onBack, onDeleted, onTasks }: { note: Note; onBack: () => void; onDeleted: () => void; onTasks: (text: string) => void }) {
  const { store, showToast } = useApp();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ title, content });
  latest.current = { title, content };

  function queueSave() {
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      store.updateNote(note.id, latest.current);
      setSaved(true);
    }, 700);
  }

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (latest.current.title !== note.title || latest.current.content !== note.content) store.updateNote(note.id, latest.current);
    },
    // Flush pending edits when leaving this note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const ask = (prompt: string) => `/assistant?notes=1&q=${encodeURIComponent(`${prompt} my note titled "${title}".`)}`;
  const categories = [...new Set(["Quick", ...store.data.courses.map((course) => course.name), note.category])];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Back to notes" tone="soft" className="lg:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <SelectInput aria-label="Category" value={note.category} onChange={(event) => store.updateNote(note.id, { category: event.target.value })} className="h-9 w-auto max-w-[180px] text-[13px] font-semibold">
          {categories.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </SelectInput>
        <span className="ml-auto text-[13px] text-ink-3">{saved ? "Saved" : "Saving…"}</span>
        <IconButton label={note.pinned ? "Unpin note" : "Pin note"} onClick={() => store.updateNote(note.id, { pinned: !note.pinned })} className={note.pinned ? "text-accent" : ""}>
          <Pin className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Delete note"
          onClick={() => {
            window.clearTimeout(timer.current);
            store.deleteNote(note.id);
            showToast(`Deleted ${title || "note"}.`, () => store.addNote({ title, content, pinned: note.pinned, category: note.category }));
            onDeleted();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
      <input
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          queueSave();
        }}
        placeholder="Title"
        aria-label="Note title"
        className="mb-2 mt-4 w-full bg-transparent text-[26px] font-bold tracking-[-0.02em] outline-none placeholder:text-ink-3 sm:text-[30px]"
      />
      <textarea
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          queueSave();
        }}
        placeholder="Start writing…"
        aria-label="Note content"
        className="thin-scrollbar min-h-[220px] w-full flex-1 resize-none bg-transparent text-[15.5px] leading-[1.7] outline-none placeholder:text-ink-3"
      />
      <div className="ai-surface mt-4 flex flex-wrap items-center gap-2 rounded-2xl border px-3.5 py-3">
        <Sparkles className="h-[18px] w-[18px] text-accent" />
        <span className="mr-auto text-[13px] font-semibold">Do more with this note</span>
        <Button size="sm" href={ask("Summarize")}>
          Summarize
        </Button>
        <Button size="sm" href={ask("Quiz me on")}>
          Quiz me
        </Button>
        <Button size="sm" variant="primary" disabled={!content.trim()} onClick={() => onTasks(content.slice(0, 600))}>
          Turn into tasks
        </Button>
      </div>
    </>
  );
}
