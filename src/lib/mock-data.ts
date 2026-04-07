import { MODULES } from "@/types/question";
import { getAllStandards } from "@/lib/standards";

export interface MockTeacher {
  id: string;
  name: string;
  email: string;
  assignedClassIds: string[];
  lastActiveAt: string;
}

export interface MockStudent {
  id: string;
  name: string;
  classId: string;
  teacherId: string;
}

export interface MockClassroom {
  id: string;
  name: string;
  grade: number;
  teacherId: string;
  studentIds: string[];
}

export interface MockAssignment {
  id: string;
  title: string;
  classId: string;
  dueDate?: string;
  moduleIds: number[];
  topics: string[];
  targetMinutes: number;
}

export interface MockNotification {
  id: string;
  recipientType: "student" | "teacher";
  recipientId: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface MockAttempt {
  id: string;
  studentId: string;
  teacherId: string;
  classId: string;
  assignmentId?: string;
  standardId: string;
  standardLabel: string;
  questionId: string;
  isCorrect: boolean;
  timeSpentSec: number;
  mode: "adaptive" | "review" | "exam";
  timestamp: string;
}

export const MOCK_TEACHERS: MockTeacher[] = [
  {
    id: "t_murphy",
    name: "Ms. Murphy",
    email: "murphy@keystone.edu",
    assignedClassIds: ["bio_p1", "bio_p4"],
    lastActiveAt: "2026-03-24T18:10:00.000Z",
  },
  {
    id: "t_chen",
    name: "Mr. Chen",
    email: "chen@keystone.edu",
    assignedClassIds: ["bio_honors"],
    lastActiveAt: "2026-03-25T10:00:00.000Z",
  },
];

export const MOCK_STUDENTS: MockStudent[] = [
  { id: "s_alex", name: "Alex Carter", classId: "bio_p1", teacherId: "t_murphy" },
  { id: "s_mia", name: "Mia Patel", classId: "bio_p1", teacherId: "t_murphy" },
  { id: "s_noah", name: "Noah Kim", classId: "bio_p4", teacherId: "t_murphy" },
  { id: "s_zoe", name: "Zoe Rivera", classId: "bio_honors", teacherId: "t_chen" },
];

export const MOCK_CLASSES: MockClassroom[] = [
  {
    id: "bio_p1",
    name: "Biology Period 1",
    grade: 9,
    teacherId: "t_murphy",
    studentIds: ["s_alex", "s_mia"],
  },
  {
    id: "bio_p4",
    name: "Biology Period 4",
    grade: 9,
    teacherId: "t_murphy",
    studentIds: ["s_noah"],
  },
  {
    id: "bio_honors",
    name: "Biology Honors",
    grade: 10,
    teacherId: "t_chen",
    studentIds: ["s_zoe"],
  },
];

const module1Topics = MODULES[0].topics;
const module2Topics = MODULES[1].topics;

export const MOCK_ASSIGNMENTS: MockAssignment[] = [
  {
    id: "a_transport_cell",
    title: "Cell Transport Readiness",
    classId: "bio_p1",
    dueDate: "2026-03-28T23:59:00.000Z",
    moduleIds: [1],
    topics: ["Homeostasis and Transport", "Bioenergetics"],
    targetMinutes: 30,
  },
  {
    id: "a_genetics_quickcheck",
    title: "Genetics Quick Check",
    classId: "bio_p4",
    dueDate: "2026-03-27T23:59:00.000Z",
    moduleIds: [2],
    topics: ["Genetics"],
    targetMinutes: 15,
  },
  {
    id: "a_full_review",
    title: "Module Spiral Review",
    classId: "bio_p1",
    moduleIds: [1, 2],
    topics: [...module1Topics, ...module2Topics],
    targetMinutes: 45,
  },
];

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: "n_1",
    recipientType: "student",
    recipientId: "s_alex",
    message: "Your teacher assigned Cell Transport Readiness. Due Fri 11:59 PM.",
    createdAt: "2026-03-25T12:00:00.000Z",
    read: false,
  },
  {
    id: "n_2",
    recipientType: "student",
    recipientId: "s_alex",
    message: "Great work: your accuracy in Genetics improved by 12% this week.",
    createdAt: "2026-03-24T14:30:00.000Z",
    read: true,
  },
  {
    id: "n_3",
    recipientType: "teacher",
    recipientId: "t_murphy",
    message: "3 students are below 60% accuracy in Homeostasis and Transport.",
    createdAt: "2026-03-25T08:15:00.000Z",
    read: false,
  },
];

const STANDARD_MAP = getAllStandards();

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateAttempts(): MockAttempt[] {
  const attempts: MockAttempt[] = [];
  let index = 0;

  for (const student of MOCK_STUDENTS) {
    for (let day = 1; day <= 14; day += 1) {
      for (let s = 0; s < STANDARD_MAP.length; s += 1) {
        const standard = STANDARD_MAP[s];
        const baseSeed = day * 100 + s * 10 + index;
        const attemptCount = 1 + Math.floor(pseudoRandom(baseSeed) * 3);
        for (let a = 0; a < attemptCount; a += 1) {
          const correctRoll = pseudoRandom(baseSeed + a + 17);
          const isCorrect = correctRoll > 0.35;
          const seconds = 35 + Math.round(pseudoRandom(baseSeed + a + 77) * 95);
          const timestamp = new Date(
            Date.UTC(2026, 2, day, 12, Math.floor(pseudoRandom(baseSeed + a + 55) * 59)),
          ).toISOString();
          attempts.push({
            id: `att_${student.id}_${day}_${s}_${a}`,
            studentId: student.id,
            teacherId: student.teacherId,
            classId: student.classId,
            assignmentId: day % 3 === 0 ? MOCK_ASSIGNMENTS[0].id : undefined,
            standardId: standard.id,
            standardLabel: standard.label,
            questionId: `${standard.id.replace(/\./g, "_")}_q_${a + 1}`,
            isCorrect,
            timeSpentSec: seconds,
            mode: a % 4 === 0 ? "exam" : a % 3 === 0 ? "review" : "adaptive",
            timestamp,
          });
          index += 1;
        }
      }
    }
  }

  return attempts;
}

export const MOCK_ATTEMPTS: MockAttempt[] = generateAttempts();

export const DEFAULT_STUDENT_ID = "s_alex";
export const DEFAULT_TEACHER_ID = "t_murphy";

export function getStudentById(studentId: string): MockStudent | undefined {
  return MOCK_STUDENTS.find((student) => student.id === studentId);
}

export function getTeacherById(teacherId: string): MockTeacher | undefined {
  return MOCK_TEACHERS.find((teacher) => teacher.id === teacherId);
}

export function getAssignmentsForStudent(studentId: string): MockAssignment[] {
  const student = getStudentById(studentId);
  if (!student) return [];
  return MOCK_ASSIGNMENTS.filter((assignment) => assignment.classId === student.classId);
}

export function getNotificationsForRecipient(
  recipientType: "student" | "teacher",
  recipientId: string,
): MockNotification[] {
  return MOCK_NOTIFICATIONS
    .filter((item) => item.recipientType === recipientType && item.recipientId === recipientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
