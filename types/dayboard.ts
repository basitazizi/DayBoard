export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed"
  | "overdue"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type EventCategory =
  | "school"
  | "work"
  | "personal"
  | "gym"
  | "study"
  | "appointment"
  | "deadline"
  | "social"
  | "other";

export type CalendarView = "month" | "week" | "day";

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedMinutes: number;
  actualMinutes: number;
  category: string;
  progressPercent: number;
  autoRollover: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  category: EventCategory;
  location?: string;
  description?: string;
  priority: TaskPriority;
  linkedTaskId?: string;
  repeatType?: "never" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "custom";
  repeatDays?: number[];
}

export interface UpcomingItem {
  id: string;
  title: string;
  date: string;
  timeLabel: string;
  kind: "assignment" | "exam" | "deadline" | "event" | "payday";
  importance: number;
}

export interface Habit {
  id: string;
  name: string;
  icon: "dumbbell" | "book" | "droplet" | "leaf" | "target";
  scheduleType: "daily" | "scheduled" | "weekly";
  targetDays: number[];
  targetTimesPerWeek?: number;
  weekPattern: boolean[];
  streak: number;
  completedToday: boolean;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  completedAt?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  category: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  days: string;
  time: string;
  room: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  assignmentType: "homework" | "quiz" | "project" | "lab" | "paper" | "midterm" | "final" | "other";
  dueDate: string;
  dueTime: string;
  estimatedMinutes: number;
  actualMinutes: number;
  gradeWeight?: number;
  difficulty: number;
  status: "not_started" | "in_progress" | "submitted" | "graded";
}

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  examDate: string;
  examTime: string;
  gradeWeight?: number;
  studyMinutesGoal: number;
  studyMinutesCompleted: number;
  importanceScore: number;
}

export interface DayBoardData {
  displayName: string;
  timezone: string;
  tasks: Task[];
  events: CalendarEvent[];
  upcoming: UpcomingItem[];
  habits: Habit[];
  notes: Note[];
  courses: Course[];
  assignments: Assignment[];
  exams: Exam[];
  habitLogs: HabitLog[];
}

export interface PriorityResult {
  score: number;
  urgency: "safe" | "attention" | "high_risk" | "critical";
  displayStatus: "gray" | "blue" | "green" | "red";
  reason: string;
}
