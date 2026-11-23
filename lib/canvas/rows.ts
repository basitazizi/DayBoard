import type { SourceMeta, SyncedField } from "../../types/dayboard";

/** Database columns for SourceMeta (on assignments, exams and events). */
export const SOURCE_COLUMNS = ["source", "external_id", "external_url", "source_hash", "edited_fields", "removed_from_source", "hidden", "source_date_changed"] as const;

const FIELDS: SyncedField[] = ["title", "dueDate", "dueTime", "courseId", "assignmentType", "estimatedMinutes", "notes", "endTime"];

type Row = Record<string, unknown>;

export function metaFromRow(row: Row): SourceMeta | undefined {
  if (row.source !== "canvas" || typeof row.external_id !== "string") return undefined;
  const edited = Array.isArray(row.edited_fields) ? (row.edited_fields as unknown[]).filter((field): field is SyncedField => FIELDS.includes(field as SyncedField)) : [];
  return {
    source: "canvas",
    externalId: row.external_id,
    externalUrl: typeof row.external_url === "string" ? row.external_url : undefined,
    hash: typeof row.source_hash === "string" ? row.source_hash : undefined,
    editedFields: edited,
    removedFromSource: row.removed_from_source === true,
    hidden: row.hidden === true,
    dateChanged: row.source_date_changed === true
  };
}

export function metaToRow(meta: SourceMeta | undefined): Row {
  if (!meta) return { source: null, external_id: null, external_url: null, source_hash: null, edited_fields: [], removed_from_source: false, hidden: false, source_date_changed: false };
  return {
    source: "canvas",
    external_id: meta.externalId,
    external_url: meta.externalUrl ?? null,
    source_hash: meta.hash ?? null,
    edited_fields: meta.editedFields,
    removed_from_source: meta.removedFromSource,
    hidden: meta.hidden,
    source_date_changed: meta.dateChanged
  };
}

/** Which tracked fields a patch touches (so sync stops changing them). */
export function editedFieldsFor(patch: Record<string, unknown>, map: Record<string, SyncedField>): SyncedField[] {
  return Object.keys(patch)
    .map((key) => map[key])
    .filter((field): field is SyncedField => Boolean(field));
}

export const ASSIGNMENT_FIELD_MAP: Record<string, SyncedField> = {
  title: "title",
  dueDate: "dueDate",
  dueTime: "dueTime",
  courseId: "courseId",
  assignmentType: "assignmentType",
  estimatedMinutes: "estimatedMinutes",
  notes: "notes"
};

export const EXAM_FIELD_MAP: Record<string, SyncedField> = {
  title: "title",
  examDate: "dueDate",
  examTime: "dueTime",
  courseId: "courseId",
  notes: "notes",
  studyMinutesGoal: "estimatedMinutes"
};

export const EVENT_FIELD_MAP: Record<string, SyncedField> = {
  title: "title",
  date: "dueDate",
  startTime: "dueTime",
  endTime: "endTime",
  description: "notes"
};

export function withEdited(meta: SourceMeta | undefined, fields: SyncedField[]): SourceMeta | undefined {
  if (!meta || !fields.length) return meta;
  const next = new Set(meta.editedFields);
  for (const field of fields) next.add(field);
  // Changing the date yourself also clears the "Due date changed in Canvas" note.
  const dateTouched = fields.includes("dueDate") || fields.includes("dueTime");
  return { ...meta, editedFields: [...next], dateChanged: dateTouched ? false : meta.dateChanged };
}
