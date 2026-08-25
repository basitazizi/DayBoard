import type { DayBoardData } from "@/types/dayboard";

export const seedData: DayBoardData = {
  displayName: "Basit",
  timezone: "America/Los_Angeles",
  tasks: [
    {
      id: "task-cs-assignment",
      title: "Submit CS assignment",
      description: "Finish sections 3-5 and upload the PDF before midnight.",
      dueDate: "2026-08-24",
      dueTime: "23:59",
      priority: "high",
      status: "not_started",
      estimatedMinutes: 120,
      actualMinutes: 0,
      category: "School",
      progressPercent: 0,
      autoRollover: false,
      createdAt: "2026-08-20T10:00:00Z"
    },
    {
      id: "task-linear-study",
      title: "Study Linear Algebra",
      description: "Review eigenvalues and the practice quiz.",
      dueDate: "2026-08-24",
      priority: "high",
      status: "in_progress",
      estimatedMinutes: 90,
      actualMinutes: 48,
      category: "School",
      progressPercent: 53,
      autoRollover: true,
      createdAt: "2026-08-22T10:00:00Z"
    },
    {
      id: "task-insurance",
      title: "Call insurance",
      dueDate: "2026-08-25",
      priority: "medium",
      status: "not_started",
      estimatedMinutes: 25,
      actualMinutes: 0,
      category: "Personal",
      progressPercent: 0,
      autoRollover: true,
      createdAt: "2026-08-21T10:00:00Z"
    },
    {
      id: "task-groceries",
      title: "Buy groceries",
      dueDate: "2026-08-29",
      priority: "low",
      status: "not_started",
      estimatedMinutes: 45,
      actualMinutes: 0,
      category: "Personal",
      progressPercent: 0,
      autoRollover: true,
      createdAt: "2026-08-22T10:00:00Z"
    },
    {
      id: "task-reading",
      title: "Finish CS reading",
      dueDate: "2026-08-24",
      priority: "medium",
      status: "completed",
      estimatedMinutes: 60,
      actualMinutes: 52,
      category: "School",
      progressPercent: 100,
      autoRollover: false,
      createdAt: "2026-08-21T10:00:00Z",
      completedAt: "2026-08-24T15:10:00Z"
    },
    {
      id: "task-workout",
      title: "Workout",
      dueDate: "2026-08-24",
      priority: "medium",
      status: "completed",
      estimatedMinutes: 60,
      actualMinutes: 60,
      category: "Health",
      progressPercent: 100,
      autoRollover: true,
      createdAt: "2026-08-24T10:00:00Z",
      completedAt: "2026-08-24T21:10:00Z"
    }
  ],
  events: [
    {
      id: "event-work",
      title: "Work",
      date: "2026-08-24",
      startTime: "10:00",
      endTime: "11:30",
      category: "work",
      priority: "medium",
      location: "Remote"
    },
    {
      id: "event-gym",
      title: "Gym",
      date: "2026-08-24",
      startTime: "14:00",
      endTime: "15:00",
      category: "gym",
      priority: "medium"
    },
    {
      id: "event-linear",
      title: "Linear Algebra",
      date: "2026-08-24",
      startTime: "17:30",
      endTime: "18:45",
      category: "school",
      priority: "high",
      location: "P 144",
      repeatType: "weekly",
      repeatDays: [2, 4]
    },
    {
      id: "event-data",
      title: "Data Structures",
      date: "2026-08-24",
      startTime: "19:00",
      endTime: "20:15",
      category: "school",
      priority: "high",
      location: "SH 101",
      repeatType: "weekly",
      repeatDays: [2, 4]
    },
    {
      id: "event-study-block",
      title: "Work on CS Assignment",
      date: "2026-08-25",
      startTime: "15:00",
      endTime: "16:30",
      category: "study",
      priority: "high",
      linkedTaskId: "task-cs-assignment"
    }
  ],
  upcoming: [
    {
      id: "up-cs",
      title: "CS Assignment",
      date: "2026-08-25",
      timeLabel: "Due 11:59 PM",
      kind: "assignment",
      importance: 91
    },
    {
      id: "up-project",
      title: "Project Deadline",
      date: "2026-08-26",
      timeLabel: "Due 11:59 PM",
      kind: "deadline",
      importance: 84
    },
    {
      id: "up-exam",
      title: "Linear Algebra Exam",
      date: "2026-08-27",
      timeLabel: "10:00 AM",
      kind: "exam",
      importance: 98
    },
    {
      id: "up-payday",
      title: "Pay Day",
      date: "2026-08-28",
      timeLabel: "All day",
      kind: "payday",
      importance: 55
    }
  ],
  habits: [
    {
      id: "habit-gym",
      name: "Gym",
      icon: "dumbbell",
      scheduleType: "weekly",
      targetDays: [1, 3, 5],
      targetTimesPerWeek: 4,
      weekPattern: [true, true, true, false, false, false, false],
      streak: 3,
      completedToday: true
    },
    {
      id: "habit-study",
      name: "Study",
      icon: "book",
      scheduleType: "daily",
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      weekPattern: [true, true, true, true, true, false, false],
      streak: 5,
      completedToday: true
    },
    {
      id: "habit-read",
      name: "Read",
      icon: "book",
      scheduleType: "daily",
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      weekPattern: [true, true, true, true, false, false, false],
      streak: 4,
      completedToday: true
    },
    {
      id: "habit-water",
      name: "Drink Water",
      icon: "droplet",
      scheduleType: "daily",
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      weekPattern: [true, true, true, true, true, true, false],
      streak: 6,
      completedToday: true
    },
    {
      id: "habit-meditate",
      name: "Meditate",
      icon: "leaf",
      scheduleType: "daily",
      targetDays: [0, 1, 2, 3, 4, 5, 6],
      weekPattern: [true, true, false, false, false, false, false],
      streak: 2,
      completedToday: false
    }
  ],
  notes: [
    {
      id: "note-quote",
      title: "Daily focus",
      content: "Discipline is the bridge between goals and accomplishment.\n\n- Jim Rohn",
      pinned: true,
      category: "Quote",
      updatedAt: "2026-08-24T09:30:00Z"
    },
    {
      id: "note-study",
      title: "Study Plan",
      content: "Focus on linear algebra this week. Rework missed examples before the midterm.",
      pinned: false,
      category: "School",
      updatedAt: "2026-08-23T19:30:00Z"
    }
  ],
  courses: [
    {
      id: "course-cs210",
      code: "CS 210",
      name: "Data Structures",
      days: "Tue / Thu",
      time: "7:00-8:15 PM",
      room: "SH 101"
    },
    {
      id: "course-math254",
      code: "MATH 254",
      name: "Linear Algebra",
      days: "Tue / Thu",
      time: "5:30-6:45 PM",
      room: "P 144"
    },
    {
      id: "course-rws305w",
      code: "RWS 305W",
      name: "Writing in Various Settings",
      days: "To be announced",
      time: "To be announced",
      room: "ONLINE"
    },
    {
      id: "course-stat250",
      code: "STAT 250",
      name: "Stat Principle & Practice",
      days: "Wednesday + Online",
      time: "9:00-10:40 AM",
      room: "GMCS 421"
    }
  ],
  assignments: [
    {
      id: "assignment-cs2",
      courseId: "course-cs210",
      title: "Assignment 2",
      assignmentType: "homework",
      dueDate: "2026-08-25",
      dueTime: "23:59",
      estimatedMinutes: 180,
      actualMinutes: 70,
      gradeWeight: 8,
      difficulty: 3,
      status: "in_progress"
    },
    {
      id: "assignment-math3",
      courseId: "course-math254",
      title: "Problem Set 3",
      assignmentType: "homework",
      dueDate: "2026-08-26",
      dueTime: "23:59",
      estimatedMinutes: 150,
      actualMinutes: 0,
      gradeWeight: 6,
      difficulty: 4,
      status: "not_started"
    }
  ],
  exams: [
    {
      id: "exam-linear-midterm",
      courseId: "course-math254",
      title: "Linear Algebra Midterm",
      examDate: "2026-08-27",
      examTime: "10:00",
      gradeWeight: 25,
      studyMinutesGoal: 480,
      studyMinutesCompleted: 275,
      importanceScore: 96
    }
  ]
};
