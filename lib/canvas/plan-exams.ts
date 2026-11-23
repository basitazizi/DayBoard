import type { DayBoardStore } from "../local-data";
import { getLocalDateKey } from "../date-utils";
import { defaultSteps, planStudySessions } from "../planner";

/** Marks prep tasks made for imported exams, so they can be tidied up if the exam goes away. */
export const IMPORTED_PLAN_NOTE = "Study plan created by DayBoard for an imported exam.";

/**
 * When an imported exam is removed (by sync or by disconnecting), its untouched prep task and upcoming
 * study sessions go too. Anything the student started (status or steps) is left alone.
 */
export function cleanupOrphanStudyPlans(store: DayBoardStore, now = new Date()): number {
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  const examTitles = new Set(data.exams.map((exam) => `Prepare for ${exam.title}`));
  let removed = 0;
  for (const task of data.tasks) {
    if (task.description !== IMPORTED_PLAN_NOTE || examTitles.has(task.title)) continue;
    if (task.status !== "not_started" || task.steps?.some((step) => step.done)) continue;
    for (const event of data.events) if (event.linkedTaskId === task.id && event.autoPlanned && event.date >= today) store.deleteEvent(event.id);
    store.deleteTask(task.id);
    removed += 1;
  }
  return removed;
}

/**
 * Study plans for imported exams. Runs in the app after a sync (works the same for guests and accounts):
 * an exam that wants a plan and hasn't got one for its current date gets a "Prepare for …" task and
 * study sessions in free time. If Canvas moved the exam, the old upcoming sessions are replaced.
 * Returns how many exams were (re)planned.
 */
export function planImportedExams(store: DayBoardStore, now = new Date()): number {
  const data = store.data;
  const today = getLocalDateKey(now, data.timezone);
  let planned = 0;

  for (const exam of data.exams) {
    if (!exam.sourceMeta || exam.planStudy === false) continue;
    if (exam.examDate < today || exam.studyPlannedFor === exam.examDate) continue;

    const title = `Prepare for ${exam.title}`;
    const existingTask = data.tasks.find((task) => task.title === title && (task.courseId ?? "") === (exam.courseId ?? ""));
    let taskId = existingTask?.id;

    if (existingTask) {
      // The date moved: clear the old upcoming sessions and move the prep task.
      for (const event of data.events) if (event.linkedTaskId === existingTask.id && event.autoPlanned && event.date >= today) store.deleteEvent(event.id);
      store.updateTask(existingTask.id, { dueDate: exam.examDate, dueTime: exam.examTime || undefined });
    } else {
      taskId = store.addTask({
        title,
        description: IMPORTED_PLAN_NOTE,
        dueDate: exam.examDate,
        dueTime: exam.examTime || undefined,
        priority: "high",
        estimatedMinutes: exam.studyMinutesGoal,
        category: "School",
        autoRollover: false,
        courseId: exam.courseId || undefined,
        steps: defaultSteps("exam", exam.studyMinutesGoal)
      });
    }

    for (const session of planStudySessions(data, { dueDate: exam.examDate, totalMinutes: exam.studyMinutesGoal }, now)) {
      store.addEvent({ title: `Study: ${exam.title}`, date: session.date, startTime: session.startTime, endTime: session.endTime, category: "study", priority: "high", repeatType: "never", linkedTaskId: taskId, autoPlanned: true });
    }
    // Remember the date this plan is for, even when no free time was found, so it isn't retried every sync.
    store.updateExam(exam.id, { studyPlannedFor: exam.examDate });
    planned += 1;
  }
  return planned;
}
