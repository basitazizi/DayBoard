import type { DayBoardData } from "@/types/dayboard";

export const seedData: DayBoardData = {
  displayName: "Basit",
  timezone: "America/Los_Angeles",
  tasks: [],
  events: [],
  upcoming: [],
  habits: [],
  notes: [],
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
  assignments: [],
  exams: [],
  habitLogs: []
};
