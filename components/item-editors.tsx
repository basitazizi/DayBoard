"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import type { Assignment, Exam } from "@/types/dayboard";
import { useApp } from "./app-context";
import { CanvasActions, CanvasBadge, CanvasNotices } from "./canvas-ui";
import { Button, Chip, Field, SelectInput, TextArea, TextInput, Toggle } from "./ui";

/**
 * Full editing for assignments and exams, imported or not. On imported items every change is remembered
 * as the student's own, so Canvas sync stops changing that field (see lib/local-data.ts).
 */

/** A text box that saves when you leave it (or press Enter), not on every keystroke. */
function CommitText({ value, onCommit, multiline, ...props }: { value: string; onCommit: (value: string) => void; multiline?: boolean; placeholder?: string; "aria-label"?: string; maxLength?: number }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline) return <TextArea {...props} value={draft} rows={3} onChange={(event) => setDraft(event.target.value)} onBlur={commit} />;
  return <TextInput {...props} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && (event.currentTarget as HTMLInputElement).blur()} />;
}

const TYPES: [Assignment["assignmentType"], string][] = [
  ["homework", "Homework"],
  ["quiz", "Quiz"],
  ["lab", "Lab"],
  ["paper", "Paper / essay"],
  ["project", "Project"],
  ["other", "Other"]
];

function CourseSelect({ value, onChange }: { value: string; onChange: (courseId: string) => void }) {
  const { store } = useApp();
  return (
    <SelectInput value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">No class</option>
      {store.data.courses.map((course) => (
        <option key={course.id} value={course.id}>
          {course.name}
        </option>
      ))}
    </SelectInput>
  );
}

export function AssignmentEditor({ assignment, onConverted }: { assignment: Assignment; onConverted?: () => void }) {
  const { store, showToast } = useApp();
  const update = (patch: Parameters<typeof store.updateAssignment>[1]) => store.updateAssignment(assignment.id, patch);
  const meta = assignment.sourceMeta;

  return (
    <div className="grid gap-3">
      <CanvasNotices kind="assignment" id={assignment.id} meta={meta} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title" className="col-span-2">
          <CommitText value={assignment.title} maxLength={200} aria-label="Title" onCommit={(title) => title.trim() && update({ title: title.trim() })} />
        </Field>
        <Field label="Due date">
          <TextInput type="date" value={assignment.dueDate} onChange={(event) => update({ dueDate: event.target.value })} />
        </Field>
        <Field label="Due time">
          <TextInput type="time" value={assignment.dueTime} onChange={(event) => update({ dueTime: event.target.value })} />
        </Field>
        <Field label="Class">
          <CourseSelect value={assignment.courseId} onChange={(courseId) => update({ courseId })} />
        </Field>
        <Field label="Type">
          <SelectInput value={assignment.assignmentType} onChange={(event) => update({ assignmentType: event.target.value as Assignment["assignmentType"] })}>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Time needed (min)">
          <TextInput type="number" min={5} step={5} value={assignment.estimatedMinutes} onChange={(event) => update({ estimatedMinutes: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Field label="Notes" className="col-span-2">
          <CommitText multiline value={assignment.notes ?? ""} placeholder="Anything to remember" aria-label="Notes" onCommit={(notes) => update({ notes: notes.trim() })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CanvasActions kind="assignment" id={assignment.id} meta={meta} onHidden={onConverted} />
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeftRight className="h-4 w-4" />}
          onClick={() => {
            store.convertAssignmentToExam(assignment.id);
            showToast(`${assignment.title} is now an exam.`);
            onConverted?.();
          }}
        >
          Turn into an exam
        </Button>
      </div>
    </div>
  );
}

export function ExamEditor({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const { store, showToast } = useApp();
  const update = (patch: Parameters<typeof store.updateExam>[1]) => store.updateExam(exam.id, patch);
  const meta = exam.sourceMeta;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="amber">Exam</Chip>
        <CanvasBadge meta={meta} />
      </div>
      <CanvasNotices kind="exam" id={exam.id} meta={meta} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title" className="col-span-2">
          <CommitText value={exam.title} maxLength={200} aria-label="Title" onCommit={(title) => title.trim() && update({ title: title.trim() })} />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={exam.examDate} onChange={(event) => event.target.value && update({ examDate: event.target.value })} />
        </Field>
        <Field label="Time">
          <TextInput type="time" value={exam.examTime} onChange={(event) => update({ examTime: event.target.value })} />
        </Field>
        <Field label="Class">
          <CourseSelect value={exam.courseId} onChange={(courseId) => update({ courseId })} />
        </Field>
        <Field label="Study goal (min)">
          <TextInput type="number" min={15} step={15} value={exam.studyMinutesGoal} onChange={(event) => update({ studyMinutesGoal: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Field label="Score (%)">
          <TextInput
            type="number"
            min={0}
            max={100}
            placeholder="When graded"
            value={exam.score ?? ""}
            onChange={(event) => update({ score: event.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(event.target.value))) })}
          />
        </Field>
        <Field label="Notes" className="col-span-2">
          <CommitText multiline value={exam.notes ?? ""} placeholder="Topics, room, what to bring" aria-label="Notes" onCommit={(notes) => update({ notes: notes.trim() })} />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
        <span className="text-sm font-semibold">Plan study time before it</span>
        <Toggle checked={exam.planStudy !== false} onChange={(planStudy) => update({ planStudy, ...(planStudy ? { studyPlannedFor: undefined } : {}) })} label="Plan study time" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CanvasActions kind="exam" id={exam.id} meta={meta} onHidden={onClose} />
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeftRight className="h-4 w-4" />}
          onClick={() => {
            store.convertExamToAssignment(exam.id);
            showToast(`${exam.title} is now an assignment.`);
            onClose();
          }}
        >
          Turn into an assignment
        </Button>
      </div>
      <Button
        variant="danger"
        icon={<Trash2 className="h-4 w-4" />}
        onClick={() => {
          store.deleteExam(exam.id);
          showToast(`Deleted ${exam.title}.`);
          onClose();
        }}
      >
        Delete exam
      </Button>
    </div>
  );
}
