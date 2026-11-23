"use client";

import { useSearchParams } from "next/navigation";
import { GraduationCap, Plus, School, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { getAgenda, timeRangeLabel } from "@/lib/agenda";
import { cn } from "@/lib/cn";
import { addDays, formatShortTime, getDayDistance, getLocalDateKey, getRelativeDayLabel } from "@/lib/date-utils";
import { planStudySessions } from "@/lib/planner";
import { getCourseGrade, getWorkItems } from "@/lib/work";
import type { Assignment, Course, Exam, Tone } from "@/types/dayboard";
import { useApp } from "../app-context";
import { Page } from "../app-shell";
import { WorkDetail } from "./tasks";
import { kindIcon } from "../shared";
import { Button, Card, CardHeader, Chip, EmptyState, Field, IconTile, Label, ProgressBar, Row, Segmented, SelectInput, Sheet, TextInput, TONE } from "../ui";

type Tab = "overview" | "assignments" | "exams";
const COLORS: Tone[] = ["teal", "blue", "amber", "rose", "green", "accent"];

export function SchoolPage() {
  const { store, now, openQuickAdd } = useApp();
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  const [tab, setTab] = useState<Tab>("overview");
  const linkedTab = useSearchParams().get("tab");
  useEffect(() => {
    if (linkedTab === "overview" || linkedTab === "assignments" || linkedTab === "exams") setTab(linkedTab);
  }, [linkedTab]);
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const grades = useMemo(() => new Map(data.courses.map((course) => [course.id, getCourseGrade(data, course.id)])), [data]);
  const graded = [...grades.values()].filter((grade) => grade.percent !== null);
  const average = graded.length ? Math.round((graded.reduce((sum, grade) => sum + grade.percent!, 0) / graded.length) * 10) / 10 : null;
  const openAssignments = data.assignments.filter((item) => item.status !== "submitted" && item.status !== "graded");
  const upcomingExams = data.exams.filter((exam) => exam.examDate >= today).sort((a, b) => a.examDate.localeCompare(b.examDate));
  const nextExam = upcomingExams.find((exam) => exam.score === undefined);

  return (
    <Page
      title="School"
      subtitle={[`${data.courses.length} class${data.courses.length === 1 ? "" : "es"}`, average !== null ? `Average ${average}%` : "", `${openAssignments.length} open assignment${openAssignments.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
      toolbar={
        <>
          <Segmented
            label="School section"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview", label: "Overview" },
              { value: "assignments", label: `Assignments ${openAssignments.length}` },
              { value: "exams", label: `Exams ${upcomingExams.length}` }
            ]}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <Button variant="primary" onClick={() => openQuickAdd({ mode: "form", kind: tab === "exams" ? "exam" : tab === "assignments" ? "assignment" : "class" })} icon={<Plus className="h-4 w-4" />}>
              {tab === "exams" ? "Exam" : tab === "assignments" ? "Assignment" : "Class"}
            </Button>
          </div>
        </>
      }
    >
      {data.courses.length === 0 && data.assignments.length === 0 && data.exams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<School className="h-6 w-6" />}
            title="Add your classes to get started"
            body="Once your classes are in, assignments and exams link to them, they appear on your calendar, and DayBoard tracks each grade."
            action={
              <div className="flex flex-wrap justify-center gap-2.5">
                <Button variant="primary" onClick={() => openQuickAdd({ mode: "form", kind: "class" })} icon={<Plus className="h-4 w-4" />}>
                  Add a class
                </Button>
              </div>
            }
          />
        </Card>
      ) : null}

      {tab === "overview" && data.courses.length > 0 ? (
        <div className="mb-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {data.courses.map((course) => (
            <CourseCard key={course.id} course={course} grade={grades.get(course.id)?.percent ?? null} today={today} onEdit={() => setEditingCourse(course)} />
          ))}
        </div>
      ) : null}

      {tab === "overview" && (data.assignments.length > 0 || data.exams.length > 0) ? (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Assignments" action={<Chip>{openAssignments.length} open</Chip>} />
            <AssignmentList onSelect={setSelectedAssignment} items={openAssignments.slice(0, 6)} empty="Nothing open. Enjoy it." />
          </Card>
          <div className="grid content-start gap-5">
            {nextExam ? <NextExamCard exam={nextExam} today={today} /> : null}
            {graded.length > 0 ? (
              <Card>
                <CardHeader title="Grades" action={average !== null ? <Chip tone="green">Average {average}%</Chip> : undefined} />
                {data.courses
                  .filter((course) => grades.get(course.id)?.percent !== null)
                  .map((course, index) => (
                    <Row key={course.id} first={index === 0}>
                      <span className="min-w-0 flex-1 truncate font-medium">{course.name}</span>
                      <ProgressBar value={grades.get(course.id)!.percent!} tone={course.color ?? "accent"} className="w-24 sm:w-32" label={`${course.name} grade`} />
                      <span className="w-14 text-right font-semibold tabular-nums">{grades.get(course.id)!.percent}%</span>
                    </Row>
                  ))}
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "assignments" ? (
        <Card>
          <CardHeader title="All assignments" />
          <AssignmentList onSelect={setSelectedAssignment} items={[...data.assignments].sort((a, b) => Number(a.status === "submitted" || a.status === "graded") - Number(b.status === "submitted" || b.status === "graded") || a.dueDate.localeCompare(b.dueDate))} empty="No assignments yet." detailed />
        </Card>
      ) : null}

      {tab === "exams" ? (
        <Card>
          <CardHeader title="Exams" />
          {data.exams.length ? [...data.exams].sort((a, b) => a.examDate.localeCompare(b.examDate)).map((exam, index) => <ExamRow key={exam.id} exam={exam} first={index === 0} today={today} />) : <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No exams yet" body="Add one and DayBoard will plan study sessions before it." />}
        </Card>
      ) : null}

      <Sheet open={Boolean(selectedAssignment)} onClose={() => setSelectedAssignment(null)} title="Assignment details">
        {getWorkItems(data, now).filter((item) => item.kind === "assignment" && item.id === selectedAssignment).map((item) => <WorkDetail key={item.id} item={item} onDeleted={() => setSelectedAssignment(null)} />)}
      </Sheet>
      {editingCourse ? <CourseSheet course={editingCourse} onClose={() => setEditingCourse(null)} /> : null}
    </Page>
  );
}

function CourseCard({ course, grade, today, onEdit }: { course: Course; grade: number | null; today: string; onEdit: () => void }) {
  const { store, now } = useApp();
  const tone = course.color ?? "blue";
  const next = useMemo(() => {
    const work = getWorkItems(store.data, now).find((item) => !item.done && item.courseId === course.id);
    const exam = store.data.exams.filter((entry) => entry.courseId === course.id && entry.examDate >= today && entry.score === undefined).sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
    if (exam && getDayDistance(exam.examDate, today) <= 7) return { text: `${exam.title} ${getRelativeDayLabel(exam.examDate, today).toLowerCase()}`, urgent: true };
    if (work) return { text: `${work.title} · ${work.dueLabel}`, urgent: work.overdue || work.dueToday };
    for (let offset = 0; offset < 7; offset += 1) {
      const session = getAgenda(store.data, addDays(today, offset)).find((item) => item.kind === "class" && item.sourceId === course.id);
      if (session) return { text: `Next class ${getRelativeDayLabel(session.date, today).toLowerCase()} · ${timeRangeLabel(session).split(" – ")[0]}`, urgent: false };
    }
    return { text: "Nothing coming up", urgent: false };
  }, [store.data, now, course.id, today]);

  return (
    <button type="button" onClick={onEdit} className="overflow-hidden rounded-card border border-line bg-surface text-left shadow-card transition-colors hover:border-accent-line">
      <span className={cn("block h-2", TONE[tone].solid)} />
      <span className="block p-4 sm:p-[18px]">
        <span className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{course.name}</span>
            <span className="block truncate text-[13px] text-ink-2">{[course.code, course.days !== "To be announced" ? course.days : ""].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="text-[26px] font-bold leading-none tracking-[-0.02em]">{grade !== null ? `${Math.round(grade)}%` : "–"}</span>
        </span>
        <ProgressBar value={grade ?? 0} tone={tone} className="mb-2 mt-3" label={`${course.name} grade`} />
        <span className={cn("block truncate text-[13px]", next.urgent ? cn("font-semibold", TONE.amber.text) : "text-ink-2")}>{grade === null && !next.urgent ? "No grades entered yet" : next.text}</span>
      </span>
    </button>
  );
}

function NextExamCard({ exam, today }: { exam: Exam; today: string }) {
  const { store, now, showToast } = useApp();
  const days = getDayDistance(exam.examDate, today);
  const course = store.data.courses.find((entry) => entry.id === exam.courseId);
  const sessions = store.data.events.filter((event) => event.category === "study" && event.title.toLowerCase().includes(exam.title.toLowerCase()));
  const done = sessions.filter((event) => event.date < today).length;

  function plan() {
    const planned = planStudySessions(store.data, { dueDate: exam.examDate, totalMinutes: exam.studyMinutesGoal || 150 }, now);
    if (!planned.length) return showToast("No free time found before the exam.");
    const ids = planned.map((session) => store.addEvent({ title: `Study: ${exam.title}`, date: session.date, startTime: session.startTime, endTime: session.endTime, category: "study", priority: "high", repeatType: "never", autoPlanned: true }));
    showToast(`Planned ${planned.length} study session${planned.length === 1 ? "" : "s"}.`, () => ids.forEach((id) => store.deleteEvent(id)));
  }

  return (
    <Card className="bg-gradient-to-br from-amber-soft to-surface">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Label className="text-amber">Next exam</Label>
          <div className="mb-0.5 mt-1 text-xl font-bold tracking-[-0.01em]">{exam.title}</div>
          <div className="text-[13px] text-ink-2">{[getRelativeDayLabel(exam.examDate, today), exam.examTime ? formatShortTime(exam.examTime) : "", course?.name ?? ""].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-center">
          <div className="text-[30px] font-bold leading-none text-amber">{days}</div>
          <div className="text-[13px] text-ink-2">day{days === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sessions.length ? (
          <>
            <Chip tone="accent" icon={<Sparkles className="h-3 w-3" />}>
              {sessions.length} study session{sessions.length === 1 ? "" : "s"} planned
            </Chip>
            {done ? <Chip>{done} done</Chip> : null}
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={plan} icon={<Sparkles className="h-4 w-4" />}>
            Plan study sessions
          </Button>
        )}
      </div>
    </Card>
  );
}

function AssignmentList({ items, empty, detailed, onSelect }: { items: Assignment[]; empty: string; detailed?: boolean; onSelect: (id: string) => void }) {
  const { store, now } = useApp();
  const today = getLocalDateKey(now, store.data.timezone);
  if (!items.length) return <p className="py-3 text-sm text-ink-2">{empty}</p>;
  return (
    <>
      {items.map((item, index) => {
        const course = store.data.courses.find((entry) => entry.id === item.courseId);
        const finished = item.status === "submitted" || item.status === "graded";
        const distance = item.dueDate ? getDayDistance(item.dueDate, today) : null;
        return (
          <Row key={item.id} first={index === 0} className="flex-wrap sm:flex-nowrap">
            <IconTile tone={course?.color ?? "accent"}>{kindIcon("assignment")}</IconTile>
            <div className="min-w-0 flex-1">
              <div className={cn("truncate font-semibold", finished && "text-ink-3 line-through")}>{item.title}</div>
              <div className="truncate text-[13px] text-ink-2">{[course?.name ?? "No class", item.gradeWeight ? `${item.gradeWeight}% of grade` : "", item.estimatedMinutes ? `${item.estimatedMinutes} min` : ""].filter(Boolean).join(" · ")}</div>
            </div>
            {detailed ? (
              <>
                <SelectInput aria-label={`Status of ${item.title}`} value={item.status} onChange={(event) => store.updateAssignment(item.id, { status: event.target.value as Assignment["status"] })} className="h-9 w-[132px] text-[13px]">
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="submitted">Submitted</option>
                  <option value="graded">Graded</option>
                </SelectInput>
                <TextInput
                  aria-label={`Score for ${item.title}`}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Score %"
                  value={item.score ?? ""}
                  onChange={(event) => {
                    const score = event.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(event.target.value)));
                    store.updateAssignment(item.id, score === undefined ? { score } : { score, status: "graded" });
                  }}
                  className="h-9 w-[92px] text-[13px]"
                />
              </>
            ) : (
              <ProgressBar value={finished ? 100 : item.status === "in_progress" ? 50 : 0} tone={course?.color ?? "accent"} className="hidden w-24 sm:block" label={`${item.title} progress`} />
            )}
            <Button size="sm" onClick={() => onSelect(item.id)}>Steps</Button>
            <button type="button" aria-label={`Delete ${item.title}`} onClick={() => store.deleteAssignment(item.id)} className="text-ink-3 hover:text-rose"><Trash2 className="h-4 w-4" /></button>
            <Chip tone={finished ? "neutral" : distance !== null && distance <= 0 ? "rose" : distance !== null && distance <= 2 ? "amber" : "neutral"}>{finished ? (item.score !== undefined ? `${item.score}%` : "Done") : item.dueDate ? getRelativeDayLabel(item.dueDate, today) : "No date"}</Chip>
          </Row>
        );
      })}
    </>
  );
}

function ExamRow({ exam, first, today }: { exam: Exam; first: boolean; today: string }) {
  const { store, showToast } = useApp();
  const course = store.data.courses.find((entry) => entry.id === exam.courseId);
  const days = getDayDistance(exam.examDate, today);
  return (
    <Row first={first} className="flex-wrap sm:flex-nowrap">
      <IconTile tone="amber">{kindIcon("exam")}</IconTile>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{exam.title}</div>
        <div className="truncate text-[13px] text-ink-2">{[course?.name ?? "No class", getRelativeDayLabel(exam.examDate, today), exam.examTime ? formatShortTime(exam.examTime) : "", exam.gradeWeight ? `${exam.gradeWeight}% of grade` : ""].filter(Boolean).join(" · ")}</div>
      </div>
      <TextInput
        aria-label={`Score for ${exam.title}`}
        type="number"
        min={0}
        max={100}
        placeholder="Score %"
        value={exam.score ?? ""}
        onChange={(event) => store.updateExam(exam.id, { score: event.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(event.target.value))) })}
        className="h-9 w-[92px] text-[13px]"
      />
      <Chip tone={days < 0 ? "neutral" : days <= 2 ? "rose" : days <= 7 ? "amber" : "neutral"}>{days < 0 ? "Past" : days === 0 ? "Today" : `In ${days} day${days === 1 ? "" : "s"}`}</Chip>
      <button
        type="button"
        aria-label={`Delete ${exam.title}`}
        className="text-ink-3 hover:text-rose"
        onClick={() => {
          store.deleteExam(exam.id);
          showToast(`Deleted ${exam.title}.`);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Row>
  );
}

function CourseSheet({ course, onClose }: { course: Course; onClose: () => void }) {
  const { store, showToast } = useApp();
  const [draft, setDraft] = useState(course);
  const set = (patch: Partial<Course>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Sheet open onClose={onClose} title="Edit class">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.name.trim()) return;
          store.updateCourse(course.id, { code: draft.code.trim(), name: draft.name.trim(), days: draft.days, room: draft.room, startTime: draft.startTime, endTime: draft.endTime, color: draft.color });
          onClose();
        }}
      >
        <Field label="Class name">
          <TextInput value={draft.name} onChange={(event) => set({ name: event.target.value })} required />
        </Field>
        <Field label="Code">
          <TextInput value={draft.code} onChange={(event) => set({ code: event.target.value })} />
        </Field>
        <Field label="Days" hint="For example: Mon, Wed" className="sm:col-span-2">
          <TextInput value={draft.days === "To be announced" ? "" : draft.days} onChange={(event) => set({ days: event.target.value })} placeholder="Mon, Wed" />
        </Field>
        <Field label="Starts">
          <TextInput type="time" value={draft.startTime ?? ""} onChange={(event) => set({ startTime: event.target.value || undefined })} />
        </Field>
        <Field label="Ends">
          <TextInput type="time" value={draft.endTime ?? ""} onChange={(event) => set({ endTime: event.target.value || undefined })} />
        </Field>
        <Field label="Room" className="sm:col-span-2">
          <TextInput value={draft.room === "TBA" ? "" : draft.room} onChange={(event) => set({ room: event.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Colour</span>
          <div className="flex gap-3" role="radiogroup" aria-label="Class colour">
            {COLORS.map((color) => (
              <button key={color} type="button" role="radio" aria-checked={draft.color === color} aria-label={color} onClick={() => set({ color })} className={cn("h-8 w-8 rounded-full", TONE[color].solid, draft.color === color && "ring-2 ring-ink ring-offset-2 ring-offset-surface")} />
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" full>
            Save class
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => {
              store.deleteCourse(course.id);
              showToast(`Deleted ${course.name}.`);
              onClose();
            }}
          >
            Delete
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
