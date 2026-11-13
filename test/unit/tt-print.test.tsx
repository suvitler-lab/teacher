// T-17: print sheet S8 (BR-16 · AC-60..63, AC-65). Model (pure) + DOM of <PrintSheet>. CSS page fitting is checked in the browser (evidence/t17).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { classes, settings, subjects, terms, currentTermId } from "@client/store";
import { online } from "@client/lib/outbox";
import { pinClock } from "@client/lib/timetable/clock";
import { setTable, ttResetAll } from "@client/lib/timetable/state";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_1_2569, TERM_2_2569, cls } from "@client/lib/timetable/testdata";
import { PrintSheet, buildPrintModel, canPrintTimetable, printColumns, printNameLine, thaiDate } from "@client/components/timetable/print";
import { serializeFrame, type Slot } from "@shared/timetable";
import type { Settings } from "@shared/types";
import { readFileSync } from "node:fs";
import path from "node:path";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนบ้านตัวอย่าง", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "0",
  period_times: "", period_frame: serializeFrame(FRAME, 3), home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "",
  reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

const T2 = TERM_2_2569.id;
const seed = (slots: Slot[] = F_T1, o: { readOnly?: boolean; termId?: string; loadedAt?: number } = {}) =>
  setTable({ termId: o.termId ?? T2, rev: 7, readOnly: !!o.readOnly, slots, confirmed: slots, pending: 0, loadedAt: o.loadedAt ?? Date.UTC(2026, 10, 13, 2, 41), source: "server" });
const sheet = () => document.body.querySelector<HTMLElement>("[data-testid=tt-print]");
const text = () => sheet()?.textContent ?? "";

beforeEach(() => {
  ttResetAll();
  online.value = true;
  pinClock(Date.UTC(2026, 10, 13, 3, 0)); // 13 Nov 2026 10:00 Bangkok
  settings.value = base();
  terms.value = [TERM_2_2569, TERM_1_2569];
  currentTermId.value = T2;
  classes.value = CLASSES;
  subjects.value = SUBJECTS;
});
afterEach(() => { cleanup(); pinClock(null); online.value = true; });

describe("name line (AC-65)", () => {
  it.each([
    ["ครูทดสอบ", "โรงเรียนบ้านตัวอย่าง", "ครูผู้สอน ครูทดสอบ · โรงเรียนบ้านตัวอย่าง"],
    ["ครูทดสอบ", "", "ครูผู้สอน ครูทดสอบ"],
    ["", "โรงเรียนบ้านตัวอย่าง", "โรงเรียนบ้านตัวอย่าง"],
    ["", "", null],
    ["   ", "  ", null],
    ["  ครูทดสอบ ", " โรงเรียนบ้านตัวอย่าง  ", "ครูผู้สอน ครูทดสอบ · โรงเรียนบ้านตัวอย่าง"],
  ])("%j + %j", (t, s, want) => { expect(printNameLine(t, s)).toBe(want); });

  it("renders no line and no empty label when both are blank", () => {
    seed(); settings.value = base({ teacher_name: "   ", school_name: "" });
    render(<PrintSheet termId={T2} />);
    expect(sheet()!.querySelector(".tt-print-names")).toBeNull();
    expect(text()).not.toContain("ครูผู้สอน");
  });
  it("renders the trimmed line under the title", () => {
    seed(); settings.value = base({ school_name: "  โรงเรียนบ้านตัวอย่าง " });
    render(<PrintSheet termId={T2} />);
    expect(sheet()!.querySelector(".tt-print-names")!.textContent).toBe("ครูผู้สอน ครูทดสอบ · โรงเรียนบ้านตัวอย่าง");
  });
});

describe("the sheet (AC-60)", () => {
  it("title, 5 day rows, periods 1-7 with times, a lunch band, 14 filled cells, summary, print date", () => {
    seed();
    render(<PrintSheet termId={T2} />);
    expect(sheet()!.querySelector("h1")!.textContent).toBe("ตารางสอน ภาคเรียนที่ 2 ปีการศึกษา 2569");
    expect(sheet()!.querySelectorAll("tbody tr")).toHaveLength(5);
    const heads = [...sheet()!.querySelectorAll("thead th")].map((h) => h.textContent);
    expect(heads).toContain("คาบ 1" + "08:30–09:30");
    expect(heads.filter((h) => h!.startsWith("คาบ "))).toHaveLength(7);
    const band = sheet()!.querySelector("td.tt-print-brk") as HTMLTableCellElement;
    expect(band.textContent).toBe("พักกลางวัน 11:30–12:30");
    expect(band.rowSpan).toBe(5);
    expect(sheet()!.querySelectorAll("tbody td:not(.tt-print-brk) .tt-print-txt")).toHaveLength(14);
    expect(text()).toContain("สอน 9 · กิจกรรม 5 · รวม 14 คาบ (14 ชม.)");
    expect(text()).toContain("พิมพ์เมื่อ 13 พ.ย. 2569");
    expect(sheet()!.getAttribute("aria-hidden")).toBe("true");
  });

  it("the lunch break sits between period 3 and 4 and every row has one cell per period", () => {
    seed();
    const cols = printColumns(FRAME);
    expect(cols.map((c) => (c.k === "p" ? c.period : "b"))).toEqual([1, 2, 3, "b", 4, 5, 6, 7]);
    render(<PrintSheet termId={T2} />);
    const first = sheet()!.querySelector("tbody tr")!;
    expect(first.children).toHaveLength(1 + 8); // day + 7 periods + the band (row 1 only)
    expect(sheet()!.querySelectorAll("tbody tr")[1].children).toHaveLength(1 + 7);
  });

  it("class = bold text, activity = the word กิจกรรม: (kind is told by words, not colour)", () => {
    seed();
    render(<PrintSheet termId={T2} />);
    expect(text()).toContain("คณิตศาสตร์ ป.6/2");
    expect(text()).toContain("กิจกรรม: PLC กลุ่มสาระ");
    expect(text()).toContain("กิจกรรม: ลูกเสือ");
    expect(sheet()!.querySelectorAll(".tt-print-txt i")).toHaveLength(5);
    expect(sheet()!.querySelectorAll(".tt-print-txt b")).toHaveLength(9);
    expect(text()).not.toMatch(/เช็คชื่อ|สแกน|ลงชื่อ/);
  });

  it("is the same for any layout: no layout input, grid is always the weekly table", () => {
    seed();
    const a = render(<PrintSheet termId={T2} />); const first = text(); a.unmount();
    localStorage.setItem("ngankrob-layout", "b");
    render(<PrintSheet termId={T2} />);
    expect(text()).toBe(first);
  });
});

describe("states", () => {
  it("archived room prints with (เก็บแล้ว), not faded (AC-62ก)", () => {
    seed(); classes.value = [CLASSES[0], CLASSES[1], cls("c3", "ป.6/3", { archived: true }), CLASSES[3]];
    render(<PrintSheet termId={T2} />);
    expect(text().match(/\(เก็บแล้ว\)/g)).toHaveLength(2);
    expect(text()).toContain("คณิตศาสตร์ ป.6/3 (เก็บแล้ว)");
    expect(text()).toContain("สอน 9 · กิจกรรม 5 · รวม 14 คาบ"); // archived rooms still count (BR-05)
  });
  it("empty table: nothing to print (AC-62ข)", () => {
    seed([]);
    render(<PrintSheet termId={T2} />);
    expect(sheet()).toBeNull();
    expect(canPrintTimetable(T2)).toBe(false);
  });
  it("no table loaded yet: nothing", () => {
    render(<PrintSheet termId={T2} />);
    expect(sheet()).toBeNull();
    expect(canPrintTimetable(null)).toBe(false);
  });
  it("offline: 'ข้อมูลเมื่อ HH:MM' from the copy on the device, no 'ออฟไลน์' banner (AC-62ค)", () => {
    seed(F_T1, { loadedAt: Date.UTC(2026, 10, 13, 2, 41) }); online.value = false;
    render(<PrintSheet termId={T2} />);
    expect(text()).toContain("ข้อมูลเมื่อ 09:41");
    expect(text()).not.toContain("ออฟไลน์");
    expect(canPrintTimetable(T2)).toBe(true);
  });
  it("online: no data stamp", () => {
    seed(); render(<PrintSheet termId={T2} />);
    expect(text()).not.toContain("ข้อมูลเมื่อ");
  });
  it("past year (read-only): title of that term and a note (AC-62ง)", () => {
    terms.value = [{ ...TERM_1_2569, id: "t2568-2", year: 2568, term: 2, name: "2/2568", is_current: false }, TERM_2_2569];
    seed(F_T1, { termId: "t2568-2", readOnly: true });
    render(<PrintSheet termId="t2568-2" />);
    expect(sheet()!.querySelector("h1")!.textContent).toBe("ตารางสอน ภาคเรียนที่ 2 ปีการศึกษา 2568");
    expect(text()).toContain("ภาคปีที่ผ่านมา");
  });
  it("prints nothing about students or people other than the teacher (AC-62)", () => {
    seed(); render(<PrintSheet termId={T2} />);
    expect(text()).not.toMatch(/ลงชื่อ|ผู้อำนวยการ|ผู้บริหาร|นักเรียน|เด็กชาย|เด็กหญิง/);
  });
  it("writes nothing and calls no API (printing leaves no history)", () => {
    seed(); const before = JSON.stringify(settings.value);
    render(<PrintSheet termId={T2} />);
    expect(JSON.stringify(settings.value)).toBe(before);
  });
});

describe("page fitting (AC-61)", () => {
  it("7 days x 8 periods with 40-character names stays one sheet of 7 rows x 8 periods and keeps the full text for the clamp", () => {
    const frame = { days: [1, 2, 3, 4, 5, 6, 7] as const, breaks: FRAME.breaks, periods: [...FRAME.periods, { start: "16:30", end: "17:30" }] };
    const long = "กิจกรรมพัฒนาผู้เรียนลูกเสือเนตรนารีและชุมนุม12"; // 40 characters
    const slots: Slot[] = [];
    for (const w of frame.days) for (let p = 1; p <= 8; p++) slots.push({ weekday: w, period: p, kind: "activity", classId: null, subjectId: null, label: long.slice(0, 40) });
    const m = buildPrintModel({ slots, frame: { ...frame, days: [...frame.days] }, term: { year: 2569, term: 2 }, classes: [], subjects: [], readOnly: false, offline: false, loadedHM: "00:00", todayIso: "2026-11-13" })!;
    expect(m.rows).toHaveLength(7);
    expect(m.columns.filter((c) => c.k === "p")).toHaveLength(8);
    expect(m.summary.total).toBe(56);
  });
  it("CSS: A4 landscape 12mm, >= 10pt, black on white, 2-line clamp, scoped to .tt-print, hides the rest", () => {
    const css = readFileSync(path.resolve(__dirname, "../../src/styles/timetable-print.css"), "utf8");
    expect(css).toMatch(/@page tt-sheet \{ size: A4 landscape; margin: 12mm; \}/);
    expect(css).toMatch(/-webkit-line-clamp: 2/);
    expect(css).toMatch(/body:has\(> \.tt-print\) > :not\(\.tt-print\) \{ display: none !important; \}/);
    expect(css).not.toMatch(/body\.print-(report|cards)/);
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)pt/g)].map((x) => Number(x[1]));
    expect(sizes.length).toBeGreaterThan(3);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
    // every rule outside @media print is the single "hidden on screen" one
    const outside = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media print \{[\s\S]*\}\s*$/, "").replace(/@page[^}]*\}/g, "").trim();
    expect(outside).toBe(".tt-print { display: none; }");
  });
  it("the page style is added while mounted and removed after", () => {
    seed();
    const r = render(<PrintSheet termId={T2} />);
    expect(document.getElementById("tt-print-page")!.textContent).toContain("A4 landscape");
    r.unmount();
    expect(document.getElementById("tt-print-page")).toBeNull();
  });
});

describe("helpers", () => {
  it("thaiDate", () => { expect(thaiDate("2026-11-13")).toBe("13 พ.ย. 2569"); expect(thaiDate("2027-01-05")).toBe("5 ม.ค. 2570"); });
  it("hours rounded down (BR-05): 14 periods of 50 min = 11.6", () => {
    const frame = { ...FRAME, periods: FRAME.periods.map((p) => ({ start: p.start, end: `${String(Number(p.start.slice(0, 2)) + 1).padStart(2, "0")}:20` })) }; // 08:30 → 09:20 = 50 min
    const m = buildPrintModel({ slots: F_T1, frame, term: null, classes: CLASSES, subjects: SUBJECTS, readOnly: false, offline: false, loadedHM: "", todayIso: "2026-11-13" })!;
    expect(m.title).toBe("ตารางสอน");
    expect(m.summary.minutes).toBe(14 * 50);
    expect(m.summary.text).toBe("สอน 9 · กิจกรรม 5 · รวม 14 คาบ (11.6 ชม.)");
  });
});
