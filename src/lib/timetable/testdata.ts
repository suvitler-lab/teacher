// Fixture F-T1 (the reference timetable, fixtures.md) as plain data for unit tests. Not imported by the app.
import type { Frame, Slot } from "@shared/timetable";
import type { Class, Subject, Term } from "@shared/types";
import type { RefLite, TtInput } from "./logic";

export const cls = (id: string, name: string, over: Partial<Class> = {}): Class => ({ id, name, grade: null, sort: 0, archived: false, year: 2569, updated_at: 0, ...over });
export const subj = (id: string, name: string, over: Partial<Subject> = {}): Subject => ({ id, code: null, name, color: "#000", sort: 0, archived: false, updated_at: 0, ...over });

export const CLASSES: Class[] = [cls("c1", "ป.6/1"), cls("c2", "ป.6/2"), cls("c3", "ป.6/3"), cls("c4", "ป.6/4")];
export const SUBJECTS: Subject[] = [subj("s-math", "คณิตศาสตร์"), subj("s-music", "ดนตรี")];

const room = (weekday: Slot["weekday"], period: number, classId: string, subjectId = "s-math"): Slot => ({ weekday, period, kind: "class", classId, subjectId, label: null });
const act = (weekday: Slot["weekday"], period: number, label: string): Slot => ({ weekday, period, kind: "activity", classId: null, subjectId: null, label });

/** 14 slots: จ 3 · อ 2 · พ 2 · พฤ 2 · ศ 5 — teaching 9, activities 5. */
export const F_T1: Slot[] = [
  room(1, 2, "c2"), room(1, 5, "c4", "s-music"), act(1, 7, "PLC กลุ่มสาระ"),
  room(2, 2, "c1"), room(2, 6, "c2"),
  room(3, 2, "c4"), room(3, 4, "c3"),
  room(4, 2, "c3"), act(4, 6, "ลูกเสือ"),
  room(5, 3, "c4"), room(5, 4, "c1"), act(5, 5, "ชุมนุม"), act(5, 6, "สวดมนต์"), act(5, 7, "PLC สายชั้น"),
];

export const FRAME: Frame = {
  v: 1, rev: 3, saved: true,
  periods: ["08:30", "09:30", "10:30", "12:30", "13:30", "14:30", "15:30"].map((s) => ({ start: s, end: `${String(Number(s.slice(0, 2)) + 1).padStart(2, "0")}${s.slice(2)}` })),
  breaks: [{ name: "พักกลางวัน", start: "11:30", end: "12:30" }],
  days: [1, 2, 3, 4, 5],
};

export const TERM_2_2569: Term = { id: "t2569-2", year: 2569, term: 2, name: "2/2569", is_current: true, start_date: "2026-10-26", end_date: "2027-03-12", updated_at: 0 };
export const TERM_1_2569: Term = { id: "t2569-1", year: 2569, term: 1, name: "1/2569", is_current: false, start_date: "2026-05-16", end_date: "2026-10-10", updated_at: 0 };

export const refs = (list: { id: string; name: string; archived: boolean }[]): RefLite[] => list.map((x) => ({ id: x.id, name: x.name, archived: x.archived }));

export function input(over: Partial<TtInput> = {}): TtInput {
  return {
    slots: F_T1,
    frame: FRAME,
    term: { start_date: TERM_2_2569.start_date, end_date: TERM_2_2569.end_date },
    classes: refs(CLASSES),
    subjects: refs(SUBJECTS),
    ...over,
  };
}
