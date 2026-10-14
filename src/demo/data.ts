// Made-up courses and assignments for demo mode. Course codes and titles are
// generic on purpose: they must not point to any real school or class.
import type { Assignment, Course, Snapshot } from "../ipc";

export const DEMO_ORIGIN = "https://canvas.example.edu";
/** The assignment starred in the demo, so the "Important" group shows. */
export const DEMO_STARRED_ID = "demo:essay-outline";

const COURSES: Course[] = [
  { id: "demo:calc", code: "CALC 201", name: "Multivariable Calculus", source: "canvas" },
  { id: "demo:chem", code: "CHEM 105", name: "General Chemistry", source: "canvas" },
  { id: "demo:hist", code: "HIST 120", name: "World History", source: "canvas" },
  { id: "demo:cs", code: "CS 101", name: "Intro to Programming", source: "canvas" },
  { id: "gs:demo:calc", code: "CALC 201", name: "Multivariable Calculus", source: "gradescope" },
  { id: "gs:demo:cs", code: "CS 101", name: "Intro to Programming", source: "gradescope" },
  { id: "gs:demo:phys", code: "PHYS 110", name: "Physics: Mechanics", source: "gradescope" },
];

/** Local time `days` from today at `hour:minute`. */
function at(now: Date, days: number, hour: number, minute = 0): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

type Draft = Pick<Assignment, "id" | "courseId" | "title" | "dueAt"> & Partial<Assignment>;

function assignment(draft: Draft): Assignment {
  const source = draft.id.startsWith("gs:") ? "gradescope" : "canvas";
  return {
    lateDueAt: null,
    url: source === "gradescope" ? "https://www.gradescope.com/" : `${DEMO_ORIGIN}/`,
    kind: "online",
    status: "notSubmitted",
    source,
    linksToGradescope: false,
    alsoInCanvas: false,
    canvasDueAt: null,
    ...draft,
  };
}

/** A snapshot whose deadlines are relative to `now`, so every group has something in it. */
export function demoSnapshot(now: Date): Snapshot {
  // Due later today, but at least two hours away, so it shows a countdown.
  const soon = new Date(Math.max(now.getTime() + 2 * 3600_000, new Date(at(now, 0, 18)).getTime()));
  return {
    fetchedAt: now.toISOString(),
    courses: COURSES,
    gradescope: "ok",
    assignments: [
      assignment({
        id: "demo:lab-report-2",
        courseId: "demo:chem",
        title: "Lab Report 2",
        dueAt: at(now, -1, 23, 59),
        status: "missing",
      }),
      assignment({
        id: "gs:demo:pset-5",
        courseId: "gs:demo:calc",
        title: "Problem Set 5",
        dueAt: soon.toISOString(),
        lateDueAt: at(now, 1, 18),
        alsoInCanvas: true,
      }),
      assignment({
        id: "demo:reading-quiz-7",
        courseId: "demo:hist",
        title: "Reading Quiz 7",
        dueAt: at(now, 0, 23, 59),
        status: "submitted",
      }),
      assignment({
        id: "gs:demo:project-2",
        courseId: "gs:demo:cs",
        title: "Project 2: Text Adventure",
        dueAt: at(now, 1, 23),
      }),
      assignment({
        id: "gs:demo:hw-6",
        courseId: "gs:demo:phys",
        title: "Homework 6",
        dueAt: at(now, 3, 22),
      }),
      assignment({
        id: DEMO_STARRED_ID,
        courseId: "demo:hist",
        title: "Essay Outline",
        dueAt: at(now, 5, 23, 59),
      }),
      assignment({
        id: "demo:lab-4",
        courseId: "demo:cs",
        title: "Lab 4: Loops",
        dueAt: at(now, 9, 23, 59),
      }),
      assignment({
        id: "demo:midterm",
        courseId: "demo:calc",
        title: "Midterm Exam",
        dueAt: at(now, 12, 10),
        kind: "onPaper",
      }),
      assignment({
        id: "gs:demo:pset-4",
        courseId: "gs:demo:calc",
        title: "Problem Set 4",
        dueAt: at(now, -6, 18),
        status: "graded",
      }),
      assignment({
        id: "demo:prelab-3",
        courseId: "demo:chem",
        title: "Pre-lab Quiz 3",
        dueAt: at(now, 2, 9),
        status: "submitted",
      }),
    ],
  };
}

export const DEMO_SCHOOLS = [
  { name: "Example University", url: DEMO_ORIGIN },
  { name: "Example State University", url: "https://canvas.state.example.edu" },
  { name: "Example Community College", url: "https://canvas.college.example.edu" },
];
