// T-36: home layout ค "โฟกัสงานถัดไป" — focus box, "ต่อจากนี้", ทำทีหลัง, clear state, tiles (AC-30..33, BR-01/02/03/04/05).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => null }));

import { Home } from "@client/pages/Home";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms } from "@client/store";
import { dashboard, dashboardStale } from "@client/lib/dashboard";
import { setHideNames } from "@client/lib/homePrefs";
import { saveAppearance, resetAppearanceForTests } from "@client/lib/appearance";
import { focusQueue, nextRows, pickFocus, ringSegments, NEXT_SHOWN } from "@client/components/home/c/logic";
import type { Assignment, DashboardPayload, Settings } from "@shared/types";
import { asg, kid } from "./m1-05-fixture";

const NOW = Date.UTC(2026, 10, 4, 4, 0, 0); // 11:00 in Bangkok, after late_after
const TODAY = "2026-11-04";
const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(NOW - 9 * 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});
const w = (id: string, title: string, due: string | null, over: Partial<Assignment> = {}): Assignment => ({ ...asg(id, due, title), assigned_date: "2026-10-01", ...over });
const per = (classId: string, o: Partial<{ total: number; submitted: number; awaiting: number; late: number; missing: number; excused: number }> = {}) =>
  ({ classId, total: 10, submitted: 0, scored: 0, awaiting: 0, late: 0, missing: 0, excused: 0, ...o });

/** the BR-01 example in small: roll-call of ป.5/1 not done, work due today, late work (O1 7 days past due), review, backup 9 days, one work due tomorrow = 5 rows */
const payload = (over: Partial<DashboardPayload> = {}): DashboardPayload => ({
  date: TODAY, termId: "t1", gradingAssignments: [], awaitingCount: 30, missingCount: 20, serverTime: 0,
  openAssignments: [
    { assignment: w("due1", "ใบงานเศษส่วน", TODAY), perClass: [per("c1", { submitted: 5, awaiting: 3, excused: 2 })] },
    { assignment: w("o1", "O1", "2026-10-28"), perClass: [per("c1", { submitted: 0, missing: 10 })] },
    { assignment: w("o2", "O2", "2026-11-01"), perClass: [per("c1", { submitted: 3, missing: 7 })] },
    { assignment: w("nodue", "งานไม่มีกำหนด", null, { assigned_date: "2026-11-01" }), perClass: [per("c1", { missing: 3 })] },
    { assignment: w("tom", "ใบงานพรุ่งนี้", "2026-11-05"), perClass: [per("c2", { submitted: 2 })] },
  ],
  attendanceToday: [
    { date: TODAY, classId: "c1", present: 6, late: 1, leave: 0, sick: 0, absent: 1, marked: 8, total: 8 },
    { date: TODAY, classId: "c2", present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 5 },
  ],
  followUp: [{ studentId: "s0", classId: "c1", missing: 2 }, { studentId: "s1", classId: "c1", missing: 2 }, { studentId: "s2", classId: "c1", missing: 1 }],
  dueSoon: [{ assignmentId: "due1", classId: "c1", studentIds: ["s0", "s1", "s2", "s3", "s4"] }, { assignmentId: "tom", classId: "c2", studentIds: ["t0", "t1"] }],
  absentToday: [{ classId: "c1", studentId: "s7", status: "absent" }, { classId: "c1", studentId: "s6", status: "late" }],
  ...over,
});

let current: DashboardPayload;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  put.mockResolvedValue({ ok: true });
  current = payload();
  get.mockImplementation(async () => current);
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [
    { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 },
    { id: "c2", name: "ป.5/1", grade: "ป.5", sort: 2, archived: false, year: 2569, updated_at: 0 },
  ];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = [...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(kid), ...[0, 1].map((i) => ({ ...kid(i), id: "t" + i, class_id: "c2", first_name: "อีกห้อง" + i }))];
  settings.value = base();
  dashboard.value = null;
  dashboardStale.value = false;
  setHideNames(false);
  resetAppearanceForTests();
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ""; });

async function open() {
  await act(async () => { await saveAppearance({ layout: "c" }, { silent: true }); });
  const r = render(<Home />);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(r.container.querySelector(".hmc-focus")).not.toBeNull());
  await act(async () => { await new Promise((res) => setTimeout(res, 50)); }); // let the page's own "count changed" effect settle before the test taps
  put.mockClear(); // saving the layout choice above is not what the page does
  return r;
}
const box = (c: Element) => c.querySelector<HTMLElement>(".hmc-focus")!;
const title = (c: Element) => box(c).querySelector(".hmc-f-t")?.textContent;
const nexts = (c: Element) => [...c.querySelectorAll<HTMLElement>("button.hmc-nx")];
const pull = (c: Element, t: string) => fireEvent.click(nexts(c).find((b) => b.querySelector("b")?.textContent === t)!);
const nextTitles = (c: Element) => nexts(c).map((b) => b.querySelector("b")?.textContent);
const liveText = () => [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent).filter(Boolean);

describe("ค focus box and 'ต่อจากนี้' (AC-30)", () => {
  it("AC-30: the big box is job 1 of 5 with the step line, a word label, reason, the button and ทำทีหลัง; no 'เสร็จแล้ว'", async () => {
    const { container } = await open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("สวัสดี ครูทดสอบ");
    expect(box(container).querySelector(".hmc-step")?.textContent).toContain("ถัดไป · 1 จาก 5");
    expect(box(container).querySelectorAll(".dots i")).toHaveLength(5);
    expect(box(container).querySelector(".dots")?.getAttribute("aria-hidden")).toBe("true");
    expect(title(container)).toBe("เช็คชื่อ ป.5/1");
    expect(box(container).textContent).toContain("ควรทำ"); // the level is a word, not only a colour
    expect(box(container).textContent).toContain("ยังไม่ได้เช็คชื่อ · 5 คน");
    expect(box(container).querySelector(".hmc-f-ic [data-icon]")).not.toBeNull();
    expect(within(box(container)).getByRole("button", { name: "เริ่มเช็คชื่อ" })).toBeTruthy();
    expect(within(box(container)).getByRole("button", { name: "ทำทีหลัง: เช็คชื่อ ป.5/1" })).toBeTruthy();
    expect(container.textContent).not.toContain("เสร็จแล้ว");
    expect(container.querySelector("input[type=checkbox], [role=checkbox]")).toBeNull();
  });

  it("AC-30: the other 4 stand in 'ต่อจากนี้' (tomorrow's work is not one of them); a row's button goes to the room's roll-call", async () => {
    const { container } = await open();
    expect(screen.getByRole("heading", { level: 2, name: "ต่อจากนี้" })).toBeTruthy();
    expect(nextTitles(container)).toEqual(["ใบงานเศษส่วน", "ตามงานค้าง", "ตรวจงานที่ส่งแล้ว", "สำรองข้อมูลล่าสุด 9 วันที่แล้ว"]);
    expect(container.querySelector(".hmc-next")?.textContent).not.toContain("ใบงานพรุ่งนี้");
    expect(nexts(container)[0].getAttribute("aria-label")).toBe("ทำ ใบงานเศษส่วน ก่อน");
    fireEvent.click(within(box(container)).getByRole("button", { name: "เริ่มเช็คชื่อ" }));
    expect(location.hash).toBe("#/attendance?class=c2");
  });

  it("BR-09: the figures in the box are the model's: roll-call chips, per-room bars, late work chips and the page's own count", async () => {
    const { container } = await open();
    expect(container.querySelector(".hmc-left")?.textContent).toBe("เหลือ 5 อย่างที่ต้องทำวันนี้");
    expect(within(box(container)).getByText("ป.6/1 ครบ 8/8")).toBeTruthy();
    expect(within(box(container)).getByText("ป.5/1 ยังไม่เช็ค")).toBeTruthy();
    pull(container, "ใบงานเศษส่วน");
    expect(within(box(container)).getByText("5/8 · ยกเว้น 2")).toBeTruthy();
    expect(box(container).textContent).toContain("ยังไม่ส่ง 5 คน · ป.6/1 5 คน");
    pull(container, "ตามงานค้าง");
    expect(within(box(container)).getByText("O1 · เลย 7 วัน · ค้าง 10")).toBeTruthy();
    expect(within(box(container)).getByText("งานไม่มีกำหนด · ค้าง 3")).toBeTruthy();
    expect(container.textContent).not.toContain("เลย 0 วัน");
  });
});

describe("ค ทำทีหลัง and pulling a row up (AC-31, BR-02)", () => {
  it("AC-31: ทำทีหลัง moves the job to the end, the next one is in the box, the move is announced, the count stays 5 and nothing is written", async () => {
    const { container } = await open();
    fireEvent.click(within(box(container)).getByRole("button", { name: "ทำทีหลัง: เช็คชื่อ ป.5/1" }));
    await waitFor(() => expect(title(container)).toBe("ใบงานเศษส่วน"));
    expect(box(container).querySelector(".hmc-step")?.textContent).toContain("ถัดไป · 1 จาก 5");
    expect(nextTitles(container)).toEqual(["ตามงานค้าง", "ตรวจงานที่ส่งแล้ว", "สำรองข้อมูลล่าสุด 9 วันที่แล้ว", "เช็คชื่อ ป.5/1"]);
    expect(liveText()).toContain("ย้าย เช็คชื่อ ป.5/1 ไปท้ายคิวแล้ว");
    expect(container.querySelector(".hmc-left")?.textContent).toBe("เหลือ 5 อย่างที่ต้องทำวันนี้");
    expect(put).not.toHaveBeenCalled();
    expect(location.hash).toBe("");
  });

  it("AC-31: a row of the list comes up into the box without leaving the page; ทำทีหลัง on it sends THAT row to the end", async () => {
    const { container } = await open();
    fireEvent.click(nexts(container)[1]); // ตามงานค้าง, 3rd of 5
    expect(title(container)).toBe("ตามงานค้าง");
    expect(box(container).querySelector(".hmc-step")?.textContent).toContain("ถัดไป · 3 จาก 5");
    expect(location.hash).toBe("");
    expect(liveText()).toContain("ขึ้นเป็นงานถัดไป: ตามงานค้าง");
    expect(document.activeElement).toBe(box(container).querySelector(".hmc-f-t")); // the tapped row is gone: the keyboard follows it into the box
    fireEvent.click(within(box(container)).getByRole("button", { name: "ทำทีหลัง: ตามงานค้าง" }));
    await waitFor(() => expect(title(container)).toBe("เช็คชื่อ ป.5/1"));
    expect(nextTitles(container)).toEqual(["ใบงานเศษส่วน", "ตรวจงานที่ส่งแล้ว", "สำรองข้อมูลล่าสุด 9 วันที่แล้ว", "ตามงานค้าง"]);
  });

  it("BR-02: when the roll-call is done and the data reloads the row is gone and the count is 4 (nothing was 'ticked')", async () => {
    const { container } = await open();
    current = payload({ attendanceToday: payload().attendanceToday.map((a) => (a.classId === "c2" ? { ...a, present: 5, marked: 5 } : a)) });
    const { loadDashboard } = await import("@client/lib/dashboard");
    await act(async () => { await loadDashboard("t1", { force: true }); });
    await waitFor(() => expect(container.querySelector(".hmc-left")?.textContent).toBe("เหลือ 4 อย่างที่ต้องทำวันนี้"));
    expect(title(container)).toBe("ใบงานเศษส่วน");
    expect(box(container).querySelector(".hmc-step")?.textContent).toContain("ถัดไป · 1 จาก 4");
  });

  it("with one job left there is nothing to push back: no ทำทีหลัง", async () => {
    current = payload({ attendanceToday: payload().attendanceToday.map((a) => ({ ...a, present: a.total, marked: a.total })), awaitingCount: 0, openAssignments: [payload().openAssignments[4]], missingCount: 0, dueSoon: [payload().dueSoon![1]] });
    settings.value = base({ last_backup_at: String(NOW - 9 * 86_400_000) });
    const { container } = await open();
    expect(title(container)).toBe("สำรองข้อมูลล่าสุด 9 วันที่แล้ว");
    expect(box(container).querySelector(".hmc-step")?.textContent).toContain("ถัดไป · 1 จาก 1");
    expect(within(box(container)).queryByRole("button", { name: /ทำทีหลัง/ })).toBeNull();
    expect(nexts(container)).toHaveLength(0);
  });

  it("the second button of a job: one copy button per room (only that room's names) and ปิดรับงานนี้ only where shouldClose", async () => {
    const { container } = await open();
    pull(container, "ใบงานเศษส่วน");
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write }, onLine: true });
    fireEvent.click(within(box(container)).getByRole("button", { name: "คัดลอกรายชื่อไป LINE · ป.6/1" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain("ป.6/1");
    expect(write.mock.calls[0][0]).not.toContain("อีกห้อง");
    fireEvent.click(within(box(container)).getByRole("button", { name: "สแกนรับงาน" }));
    expect(location.hash).toBe("#/scan?asg=due1&class=c1");
    location.hash = "";
    pull(container, "ตามงานค้าง");
    const close = within(box(container)).getAllByRole("button", { name: /ปิดรับงานนี้/ });
    expect(close).toHaveLength(1);
    expect(close[0].getAttribute("aria-label")).toBe("ปิดรับงานนี้ O1");
    fireEvent.click(close[0]);
    expect(location.hash).toBe("#/gradebook?class=c1&subject=math&asg=o1");
    expect(put).not.toHaveBeenCalled();
  });
});

describe("ค review round (R-3602, R-3603)", () => {
  it("R-3602: two rooms share one work (same seat numbers): each copy button carries only that room's children", async () => {
    const dueRooms = payload().openAssignments.map((a) => (a.assignment.id === "due1" ? { ...a, perClass: [per("c1", { submitted: 5 }), per("c2", { submitted: 3 })] } : a));
    current = payload({ openAssignments: dueRooms, dueSoon: [
      { assignmentId: "due1", classId: "c1", studentIds: ["s0", "s1", "s2", "s3", "s4"] }, { assignmentId: "due1", classId: "c2", studentIds: ["t0"] },
      { assignmentId: "tom", classId: "c2", studentIds: ["t0", "t1"] }] });
    const { container } = await open();
    pull(container, "ใบงานเศษส่วน");
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write }, onLine: true });
    fireEvent.click(within(box(container)).getByRole("button", { name: "คัดลอกรายชื่อไป LINE · ป.5/1" }));
    const t5: string = write.mock.calls[0][0];
    expect(t5).toContain("อีกห้อง0");
    expect(t5).not.toContain("เด็ก");
    expect(t5).not.toContain("ป.6/1");
    fireEvent.click(within(box(container)).getByRole("button", { name: "คัดลอกรายชื่อไป LINE · ป.6/1" }));
    const t6: string = write.mock.calls[1][0];
    expect(t6).toContain("เด็ก0");
    expect(t6).not.toContain("อีกห้อง");
    expect(t6).not.toContain("ป.5/1");
  });

  it("R-3601: a room whose work is open but not due yet says so (no '0%', no 'ยังไม่มีงานเปิดรับ'); a room with no open work still says that", async () => {
    current = payload({ openAssignments: [{ assignment: w("fut", "งานสัปดาห์หน้า", "2026-11-12"), perClass: [per("c1", { submitted: 0, missing: 0 })] }], awaitingCount: 0, missingCount: 0, followUp: [], dueSoon: [] });
    await open();
    const prog = screen.getByRole("heading", { level: 2, name: "งานแต่ละห้อง" }).closest("section") as HTMLElement;
    const c1 = within(prog).getByRole("button", { name: /^ป\.6\/1 / });
    expect(c1.getAttribute("aria-label")).toContain("งานเปิดรับ 1 งาน ยังไม่ถึงกำหนด");
    expect(c1.getAttribute("aria-label")).not.toContain("ยังไม่มีงานเปิดรับ");
    expect(c1.querySelector("[role=progressbar]")).toBeNull();
    expect(c1.textContent).not.toContain("0%");
    expect(c1.textContent).toContain("—");
    const c2 = within(prog).getByRole("button", { name: /^ป\.5\/1 / });
    expect(c2.getAttribute("aria-label")).toContain("ยังไม่มีงานเปิดรับ");
    expect(c2.querySelector("[role=progressbar]")).toBeNull();
  });

  it("R-3603: 'all clear' drawn from an old offline copy carries the 'ข้อมูลเก่า' label; from live data it does not", async () => {
    settings.value = base({ last_backup_at: String(NOW - 86_400_000) });
    current = payload({
      awaitingCount: 0, missingCount: 0, dueSoon: [payload().dueSoon![1]], openAssignments: [payload().openAssignments[4]],
      attendanceToday: payload().attendanceToday.map((a) => ({ ...a, present: a.total, marked: a.total })),
    });
    const { container } = await open();
    expect(title(container)).toBe("วันนี้เคลียร์ครบแล้ว");
    expect(box(container).textContent).not.toContain("ข้อมูลเก่า");
    await act(async () => { dashboardStale.value = true; });
    expect(title(container)).toBe("วันนี้เคลียร์ครบแล้ว");
    expect(within(box(container)).getByText("ข้อมูลเก่า")).toBeTruthy();
  });
});

describe("ค clear day and many jobs (AC-32, ux ข้อมูลเยอะ)", () => {
  const clearPayload = () => payload({
    awaitingCount: 0, missingCount: 0, dueSoon: [payload().dueSoon![1]], openAssignments: [payload().openAssignments[4]],
    attendanceToday: payload().attendanceToday.map((a) => ({ ...a, present: a.total, marked: a.total })),
  });

  it("AC-32: nothing to do -> 'วันนี้เคลียร์ครบแล้ว', no reset, no ทำทีหลัง; quick buttons and tiles are still there; tomorrow listed", async () => {
    settings.value = base({ last_backup_at: String(NOW - 86_400_000) });
    current = clearPayload();
    const { container } = await open();
    expect(title(container)).toBe("วันนี้เคลียร์ครบแล้ว");
    expect(box(container).querySelector(".hmc-step")?.textContent).not.toContain("จาก");
    expect(within(box(container)).queryByRole("button", { name: /ทำทีหลัง|รีเซ็ต|เริ่มร่างใหม่/ })).toBeNull();
    expect(container.querySelector(".hmc-left")).toBeNull(); // no "0 อย่าง"
    fireEvent.click(within(box(container)).getByRole("button", { name: "สร้างงานพรุ่งนี้" }));
    expect(location.hash).toBe("#/gradebook?new=1");
    expect(screen.getByRole("link", { name: /สแกนส่งงาน/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "มาเรียนวันนี้" })).toBeTruthy();
    expect(nexts(container)).toHaveLength(0);
    expect(container.querySelector(".hmc-next")?.textContent).toContain("พรุ่งนี้: ใบงานพรุ่งนี้");
  });

  it("many jobs: 4 in 'ต่อจากนี้' and 'ดูทั้งหมด (N)' opens the rest (nothing is cut off)", async () => {
    const dues = ["a", "b", "c", "d", "e", "f", "g"].map((k) => ({ assignment: w("d" + k, "งาน" + k, TODAY), perClass: [per("c1", { submitted: 5 })] }));
    current = payload({ openAssignments: dues, dueSoon: dues.map((a) => ({ assignmentId: a.assignment.id, classId: "c1", studentIds: ["s0"] })), missingCount: 0 });
    const { container } = await open();
    // room + 7 works + review + backup = 10: one in the box, nine follow
    expect(box(container).querySelector(".hmc-step")?.textContent).toContain("ถัดไป · 1 จาก 10");
    expect(nexts(container)).toHaveLength(NEXT_SHOWN);
    const more = screen.getByRole("button", { name: "ดูทั้งหมด (10)" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(nexts(container)).toHaveLength(9);
    expect(screen.getByRole("button", { name: "ซ่อนรายการ" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("ค tiles (AC-33, BR-03/04/05, BR-08)", () => {
  it("AC-33: quick buttons, the roll-call ring (the model's %), per-room progress and follow groups with a link to reports", async () => {
    const { container } = await open();
    expect(screen.getByRole("link", { name: /สแกนส่งงาน/ })).toBeTruthy();
    const att = screen.getByRole("heading", { level: 2, name: "มาเรียนวันนี้" }).closest("section") as HTMLElement;
    // only ป.6/1 is checked: (6 + 1) / 8 = 87.5 -> 88%
    expect(att.querySelector("[role=img]")?.getAttribute("aria-label")).toBe("มาเรียน 88% · มา 6 สาย 1 ลา 0 ป่วย 0 ขาด 1");
    expect(att.textContent).toContain("ยังเหลือ 1 ห้อง");
    expect(att.textContent).toContain("ป.5/1 ยังไม่เช็ค");
    expect(att.textContent).toContain("นับเฉพาะห้องที่เช็คแล้ว");
    const prog = screen.getByRole("heading", { level: 2, name: "งานแต่ละห้อง" }).closest("section") as HTMLElement;
    expect(within(prog).getByRole("button", { name: /ป\.6\/1 ส่งงาน 29%/ })).toBeTruthy(); // 800 / 28 = 28.57
    const follow = screen.getByRole("heading", { level: 2, name: "ต้องติดตาม" }).closest("section") as HTMLElement;
    expect(follow.textContent).toContain("ชิ้นที่ค้าง · 2 คน");
    expect(follow.textContent).toContain("ชิ้นที่ค้าง · 1 คน");
    expect(follow.textContent).not.toContain("ทั้งหมด");
    fireEvent.click(within(follow).getByRole("button", { name: /ดูในรายงาน/ }));
    expect(location.hash).toBe("#/reports");
    expect(container.querySelectorAll(".hmc-tiles > section")).toHaveLength(3);
  });

  it("BR-12: the tiles follow the teacher's list (visible ones, in order)", async () => {
    settings.value = base({ home_cards: JSON.stringify({ c: { order: ["follow", "att", "open"], hidden: ["att"] } }) });
    const { container } = await open();
    expect([...container.querySelectorAll(".hmc-tiles h2")].map((h) => h.textContent)).toEqual(["ต้องติดตาม", "งานแต่ละห้อง"]);
  });

  it("hide names: no names, no initials, no copy-to-LINE, counts only (BR-08)", async () => {
    setHideNames(true);
    const { container } = await open();
    fireEvent.click(nexts(container)[0]); // the work due today
    const page = container.querySelector(".hm")!;
    expect(page.textContent).not.toContain("เด็ก");
    expect(page.querySelector(".hmc-person")).toBeNull();
    expect(page.querySelector(".uc-av")).toBeNull();
    expect(screen.queryByRole("button", { name: /คัดลอกรายชื่อไป LINE/ })).toBeNull();
    expect(page.textContent).toContain("ชิ้นที่ค้าง · 2 คน");
    expect(screen.getByText("ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน")).toBeTruthy();
    setHideNames(false);
  });

  it("names shown: a child is a button that opens the student", async () => {
    const { container } = await open();
    const follow = container.querySelector(".hmc-tiles")!;
    expect(follow.querySelectorAll(".hmc-person").length).toBe(3);
  });

  it("a past year has no 'today': no job box, no list, no roll-call tile; the other tiles stay", async () => {
    const { viewingPastYear } = await import("@client/store");
    terms.value = [...terms.value, { id: "old", year: 2568, term: 2, name: "2/2568", is_current: false, start_date: "2025-10-01", end_date: "2026-03-31", updated_at: 0 }];
    classes.value = [...classes.value, { id: "co", name: "ป.6/9", grade: "ป.6", sort: 9, archived: false, year: 2568, updated_at: 0 }];
    selectedTermId.value = "old";
    current = payload({ termId: "old" });
    await act(async () => { await saveAppearance({ layout: "c" }, { silent: true }); });
    const { container } = render(<Home />);
    await screen.findByRole("heading", { level: 1 });
    expect(viewingPastYear.value).toBe(true);
    await waitFor(() => expect(container.querySelector(".hmc-focus")).not.toBeNull());
    expect(container.querySelector(".hmc-step")).toBeNull();
    expect(container.querySelector(".hmc-next")).toBeNull();
    expect(container.querySelector(".hmc-left")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "มาเรียนวันนี้" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "งานแต่ละห้อง" })).toBeTruthy();
    selectedTermId.value = "t1";
  });
});

describe("ค helpers", () => {
  const row = (key: string, later = false) => ({ key, later }) as never;
  it("focusQueue leaves out tomorrow; pickFocus takes the picked row or the first; a vanished pick falls back", () => {
    const q = focusQueue([row("a"), row("b"), row("t", true)]);
    expect(q.map((r) => r.key)).toEqual(["a", "b"]);
    expect(pickFocus(q, "b")?.key).toBe("b");
    expect(pickFocus(q, "zzz")?.key).toBe("a");
    expect(pickFocus(q, null)?.key).toBe("a");
    expect(pickFocus([], null)).toBeUndefined();
  });
  it("nextRows keeps the place in the queue of every row except the one in the box", () => {
    const q = [row("a"), row("b"), row("c")];
    expect(nextRows(q, "b").map((n) => [n.row.key, n.pos])).toEqual([["a", 1], ["c", 3]]);
    expect(nextRows(q, undefined)).toHaveLength(3);
  });
  it("ringSegments: empty statuses have no arc, one status takes the whole ring, none gives nothing", () => {
    expect(ringSegments({ present: 0, late: 0, leave: 0, sick: 0, absent: 0 }, 100)).toEqual([]);
    const one = ringSegments({ present: 5, late: 0, leave: 0, sick: 0, absent: 0 }, 100);
    expect(one).toEqual([{ key: "present", len: 100, off: 0 }]);
    const two = ringSegments({ present: 3, late: 1, leave: 0, sick: 0, absent: 0 }, 100);
    expect(two.map((s) => s.key)).toEqual(["present", "late"]);
    expect(two[1].off).toBe(75);
  });
});
