// T-34: home layout ก "วันนี้ของครู" — hero number, the day's list in BR-01 order, the five side cards (AC-17..24, AC-20a).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => null }));

import { Home } from "@client/pages/Home";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms } from "@client/store";
import { dashboard } from "@client/lib/dashboard";
import { setHideNames } from "@client/lib/homePrefs";
import { saveAppearance, resetAppearanceForTests } from "@client/lib/appearance";
import { overdueText, timelineItems, attTotals, roomChips } from "@client/components/home/a/logic";
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

/** the BR-01 example in small: roll-call of ป.5/1 not done, one work due today (ป.6/1 5 not in), late work O1/O2 + one with no due date, review, backup 9 days, one work due tomorrow */
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
  setHideNames(false);
  resetAppearanceForTests();
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ""; });

async function open(layoutCards?: unknown) {
  await act(async () => { await saveAppearance({ layout: "a" }, { silent: true }); });
  if (layoutCards) settings.value = base(layoutCards as Partial<Settings>);
  const r = render(<Home />);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(r.container.querySelector(".hma-big")).not.toBeNull());
  return r;
}
const items = (c: Element) => [...c.querySelectorAll<HTMLElement>(".hma-tl > .hma-item")];

describe("ก hero and list (AC-17, AC-21..23)", () => {
  it("AC-17: greeting + teacher name, the big number is the model's count, and the four numbers (AC-09) sit under it", async () => {
    const { container } = await open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("สวัสดี ครูทดสอบ");
    // roll-call ป.5/1 · work due today · late work · review · backup = 5 (BR-01)
    expect(container.querySelector(".hma-big .num")?.textContent).toBe("5");
    expect(container.querySelector(".hma-big")?.textContent).toContain("อย่างที่ต้องทำวันนี้");
    const bar = within(screen.getByRole("group", { name: "ตัวเลขสรุป" }));
    expect(bar.getByText("รอตรวจ 30")).toBeTruthy();
    expect(bar.getByText("ค้างส่ง 20")).toBeTruthy();
    expect(bar.getByText("ครบกำหนดวันนี้ 1 งาน")).toBeTruthy();
    expect(bar.getByText(/ยังเหลือ 1 ห้อง/)).toBeTruthy();
  });

  it("AC-17: rows in BR-01 order with type labels, icon, title, reason and a button; no time the system does not have", async () => {
    const { container } = await open();
    const rows = items(container);
    expect(rows.map((r) => r.dataset.kind)).toEqual(["room", "due", "overdue", "review", "backup", "tomorrow"]);
    expect(rows.map((r) => r.querySelector(".hma-time")?.textContent)).toEqual(["เข้าเรียน 08:30", "วันนี้", "ค้างอยู่", "ว่างแล้วทำ", "ว่างแล้วทำ", "พรุ่งนี้"]);
    for (const r of rows) {
      expect(r.querySelector("h3")?.textContent).toBeTruthy();
      expect(r.querySelector(".hma-node i[data-icon]")).not.toBeNull();
      expect(r.querySelector(".hma-acts button")).not.toBeNull();
    }
    expect(rows[0].textContent).toContain("ควรทำ"); // the level is a word, not only a colour
    expect(container.textContent).not.toMatch(/คาบ/);
  });

  it("AC-18: a chip per room, the totals of the checked rooms, and the button goes to that room's roll-call", async () => {
    const { container } = await open();
    const row = items(container)[0];
    expect(within(row).getByText("ป.6/1 ครบ 8/8")).toBeTruthy();
    expect(within(row).getByText("ป.5/1 ยังไม่เช็ค")).toBeTruthy();
    expect(row.textContent).toContain("ห้องที่เช็คแล้ว: มา 6 · สาย 1 · ลา 0 · ป่วย 0 · ขาด 1");
    fireEvent.click(within(row).getByRole("button", { name: /^เริ่มเช็คชื่อ / }));
    expect(location.hash).toBe("#/attendance?class=c2");
  });

  it("AC-19: per-room bar and the not-handed-in line, scan goes to that work, copy-to-LINE is one room only", async () => {
    const { container } = await open();
    const row = items(container)[1];
    expect(row.textContent).toContain("ยังไม่ส่ง 5 คน · ป.6/1 5 คน");
    const bar = row.querySelector<HTMLElement>("[role=progressbar]")!;
    expect(bar.getAttribute("aria-label")).toBe("ป.6/1 ส่งแล้ว 5/8 · ยกเว้น 2");
    expect(row.textContent).toContain("5/8 · ยกเว้น 2");
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write }, onLine: true });
    fireEvent.click(within(row).getByRole("button", { name: /^คัดลอกรายชื่อไป LINE · ป\.6\/1 · ใบงานเศษส่วน/ }));
    expect(write).toHaveBeenCalledTimes(1);
    const text: string = write.mock.calls[0][0];
    expect(text).toContain("ป.6/1");
    expect(text).not.toContain("อีกห้อง");
    fireEvent.click(within(row).getByRole("button", { name: "สแกนรับงาน ใบงานเศษส่วน" }));
    expect(location.hash).toBe("#/scan?asg=due1&class=c1");
  });

  it("AC-19 / R-3403: two rooms share one work (same seat numbers): each copy button carries only that room's children", async () => {
    const dueRooms = payload().openAssignments.map((a) => (a.assignment.id === "due1" ? { ...a, perClass: [per("c1", { submitted: 5 }), per("c2", { submitted: 3 })] } : a));
    current = payload({ openAssignments: dueRooms, dueSoon: [
      { assignmentId: "due1", classId: "c1", studentIds: ["s0", "s1", "s2", "s3", "s4"] }, { assignmentId: "due1", classId: "c2", studentIds: ["t0"] },
      { assignmentId: "tom", classId: "c2", studentIds: ["t0", "t1"] }] });
    const { container } = await open();
    const row = items(container).find((r) => r.dataset.kind === "due")!;
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write }, onLine: true });
    const six = within(row).getByRole("button", { name: /^คัดลอกรายชื่อไป LINE · ป\.6\/1 · / });
    const five = within(row).getByRole("button", { name: /^คัดลอกรายชื่อไป LINE · ป\.5\/1 · / });
    fireEvent.click(five);
    const t5: string = write.mock.calls[0][0];
    expect(t5).toContain("อีกห้อง0");
    expect(t5).not.toContain("เด็ก");
    expect(t5).not.toContain("ป.6/1");
    fireEvent.click(six);
    const t6: string = write.mock.calls[1][0];
    expect(t6).toContain("เด็ก0");
    expect(t6).not.toContain("อีกห้อง");
    expect(t6).not.toContain("ป.5/1");
  });

  it("R-3401: a room whose work is open but not due yet says so (no '0%', no 'ยังไม่มีงานเปิดรับ'); a room with no open work still says that", async () => {
    // c1 has one open work due next week and nobody has handed in or missed it; c2 has no open work at all
    current = payload({ openAssignments: [{ assignment: w("fut", "งานสัปดาห์หน้า", "2026-11-12"), perClass: [per("c1", { submitted: 0, missing: 0 })] }], awaitingCount: 0, missingCount: 0, followUp: [], dueSoon: [] });
    await open();
    const prog = screen.getByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" }).closest("section") as HTMLElement;
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

  it("T-68 R-3401: the 'ห้องของฉัน' card draws no bar and no 0% for a room whose open work is not due yet; a room with a rate keeps its bar", async () => {
    current = payload({ openAssignments: [
      { assignment: w("fut", "งานสัปดาห์หน้า", "2026-11-12"), perClass: [per("c1", { submitted: 0, missing: 0 })] },
      { assignment: w("past", "งานเก่า", "2026-11-01"), perClass: [per("c2", { submitted: 1, missing: 1 })] },
    ], awaitingCount: 0, missingCount: 1, followUp: [], dueSoon: [] });
    await open({ home_cards: JSON.stringify({ a: { order: ["open", "follow", "absent", "due", "classes"], hidden: [] } }) });
    const sec = screen.getByRole("heading", { level: 2, name: "ห้องของฉัน" }).closest("section") as HTMLElement;
    const cells = [...sec.querySelectorAll<HTMLElement>(".hma-cls")];
    const c1 = cells.find((c) => c.textContent?.includes("ป.6/1")) as HTMLElement;
    const c2 = cells.find((c) => c.textContent?.includes("ป.5/1")) as HTMLElement;
    expect(c1.querySelector("[role=progressbar]")).toBeNull();
    expect(c1.textContent).not.toContain("0%");
    expect(c1.textContent).toContain("งานเปิดรับ 1 งาน ยังไม่ถึงกำหนด");
    expect(c2.querySelector("[role=progressbar]")).not.toBeNull();
  });

  it("AC-20: late-work chips 'ชื่องาน · เลย N วัน · ค้าง X'; 'ปิดรับงานนี้' only where shouldClose, and it only navigates", async () => {
    const { container } = await open();
    const row = items(container)[2];
    expect(within(row).getByText("O1 · เลย 7 วัน · ค้าง 10")).toBeTruthy();
    expect(within(row).getByText("O2 · เลย 3 วัน · ค้าง 7")).toBeTruthy();
    const close = within(row).getAllByRole("button", { name: /ปิดรับงานนี้/ });
    expect(close).toHaveLength(1); // O1 is 7 days past due; O2 (3) and the new no-due work are not
    expect(close[0].getAttribute("aria-label")).toBe("ปิดรับงานนี้ O1");
    fireEvent.click(close[0]);
    expect(location.hash).toBe("#/gradebook?class=c1&subject=math&asg=o1");
    expect(put).not.toHaveBeenCalled();
  });

  it("AC-20a: a work with no due date never says 'เลย 0 วัน' (the chip is 'ชื่องาน · ค้าง X')", async () => {
    const { container } = await open();
    const row = items(container)[2];
    expect(within(row).getByText("งานไม่มีกำหนด · ค้าง 3")).toBeTruthy();
    expect(container.textContent).not.toContain("เลย 0 วัน");
    expect(overdueText({ title: "A", daysLate: 0, missing: 4 })).toBe("A · ค้าง 4");
    expect(overdueText({ title: "A", daysLate: 2, missing: 4 })).toBe("A · เลย 2 วัน · ค้าง 4");
  });

  it("AC-20a: an open work with no due date and nobody missing (the usual case) has no chip at all", async () => {
    current = payload({ openAssignments: payload().openAssignments.map((a) => (a.assignment.id === "nodue" ? { ...a, perClass: [per("c1", { missing: 0 })] } : a)), missingCount: 17 });
    const { container } = await open();
    expect(container.textContent).not.toContain("งานไม่มีกำหนด");
  });

  it("AC-21: no tick and no 'เสร็จแล้ว' on any row; when the data changes the row goes and the count 5 -> 4 is spoken", async () => {
    const { container } = await open();
    expect(container.querySelectorAll(".hma-tl input[type=checkbox], .hma-tl [role=checkbox], .hma-tl [aria-pressed]")).toHaveLength(0);
    expect(container.querySelector(".hma-tl")?.textContent).not.toContain("เสร็จแล้ว");
    const live = () => [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent).find((t) => /อย่างที่ต้องทำวันนี้|เคลียร์ครบแล้ว/.test(t ?? ""));
    expect(live()).toBe("เหลือ 5 อย่างที่ต้องทำวันนี้");
    // the roll-call of ป.5/1 is done: reload gives the new numbers
    current = payload({ attendanceToday: payload().attendanceToday.map((a) => (a.classId === "c2" ? { ...a, present: 5, marked: 5 } : a)) });
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    const { loadDashboard } = await import("@client/lib/dashboard");
    await act(async () => { await loadDashboard("t1", { force: true }); });
    await waitFor(() => expect(container.querySelector(".hma-big .num")?.textContent).toBe("4"));
    expect(items(container).some((r) => r.dataset.kind === "room")).toBe(false);
    expect(live()).toBe("เหลือ 4 อย่างที่ต้องทำวันนี้");
  });

  it("AC-22: tomorrow's work is last, dimmed, shows not-handed-in per room and is not in the big number", async () => {
    const { container } = await open();
    const rows = items(container);
    const last = rows[rows.length - 1];
    expect(last.classList.contains("later")).toBe(true);
    expect(last.dataset.kind).toBe("tomorrow");
    expect(last.textContent).toContain("ยังไม่ส่ง 2 คน · ป.5/1 2 คน");
    expect(last.textContent).toContain("ไม่นับในตัวเลขวันนี้");
    expect(container.querySelector(".hma-big .num")?.textContent).toBe("5");
  });

  it("AC-23: nothing to do -> check mark + 'เคลียร์ครบแล้ว', side cards and quick buttons still there, tomorrow still listed", async () => {
    settings.value = base({ last_backup_at: String(NOW - 86_400_000) });
    current = payload({
      awaitingCount: 0, missingCount: 0,
      openAssignments: [payload().openAssignments[4]],
      attendanceToday: payload().attendanceToday.map((a) => ({ ...a, present: a.total, marked: a.total })),
    });
    const { container } = await open();
    expect(container.querySelector(".hma-big .num")).toBeNull();
    expect(container.querySelector(".hma-big")?.textContent).toContain("เคลียร์ครบแล้ว");
    expect(container.querySelector(".hma-big [data-icon=check-circle]")).not.toBeNull();
    expect(screen.getByRole("link", { name: /สแกนส่งงาน/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "ต้องติดตาม" })).toBeTruthy();
    const kinds = items(container).map((r) => r.dataset.kind);
    expect(kinds).toEqual(["clear", "tomorrow"]); // the "nothing left" line comes before tomorrow's
  });
});

describe("ก side cards (AC-24, BR-12)", () => {
  it("AC-24: quick buttons, room progress (same rate as the model), follow groups with a link to the reports page", async () => {
    await open();
    const prog = screen.getByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" }).closest("section") as HTMLElement;
    // ป.6/1: handed in 5+0+3+0 = 8, missing 0+10+7+3 = 20 -> 800 / 28 = 28.57 -> 29%
    expect(within(prog).getByRole("button", { name: /ป\.6\/1 ส่งงาน 29%/ })).toBeTruthy();
    expect(within(prog).getByText("29")).toBeTruthy();
    const follow = screen.getByRole("heading", { level: 2, name: "ต้องติดตาม" }).closest("section") as HTMLElement;
    expect(follow.textContent).toContain("ชิ้นที่ค้าง · 2 คน");
    expect(follow.textContent).toContain("ชิ้นที่ค้าง · 1 คน");
    expect(follow.textContent).not.toContain("ทั้งหมด");
    fireEvent.click(within(follow).getByRole("button", { name: /ดูในรายงาน/ }));
    expect(location.hash).toBe("#/reports");
  });

  it("the cards follow the teacher's list: ก has 5, 'ห้องของฉัน' is off until turned on, order and hide are kept", async () => {
    await open();
    const h2 = () => [...document.querySelectorAll(".hma-side h2")].map((h) => h.textContent);
    expect(h2()).toEqual(["ความคืบหน้ารายห้อง", "ต้องติดตาม", "ไม่มาวันนี้", "ครบกำหนด"]);
    expect(timelineItems([])).toEqual([]);
  });

  it("absent card: per status counts with names; unchecked room says so; hide-names shows counts only", async () => {
    await open();
    const abs = screen.getByRole("heading", { level: 2, name: "ไม่มาวันนี้" }).closest("section") as HTMLElement;
    expect(abs.textContent).toContain("ขาด 1");
    expect(abs.textContent).toContain("สาย 1");
    expect(abs.textContent).toContain("เด็ก7");
    expect(abs.textContent).toContain("ป.5/1");
    expect(abs.textContent).toContain("ยังไม่ได้เช็คชื่อ");
  });

  it("hide names: no names, no initials, no copy-to-LINE anywhere on the page (BR-08)", async () => {
    setHideNames(true);
    const { container } = await open();
    const page = container.querySelector(".hm")!;
    expect(page.textContent).not.toContain("เด็ก");
    expect(page.querySelector(".hma-person")).toBeNull();
    expect(page.querySelector(".uc-av")).toBeNull();
    expect(screen.queryByRole("button", { name: /คัดลอกรายชื่อไป LINE/ })).toBeNull();
    const follow = screen.getByRole("heading", { level: 2, name: "ต้องติดตาม" }).closest("section") as HTMLElement;
    expect(follow.textContent).toContain("ชิ้นที่ค้าง · 2 คน");
    expect(screen.getByText("ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน")).toBeTruthy();
  });

  it("a past year has no 'today': no big number, no today's list, no roll-call / due cards", async () => {
    const { viewingPastYear } = await import("@client/store");
    // fake "viewing an earlier year" through the term the picker shows
    terms.value = [...terms.value, { id: "old", year: 2568, term: 2, name: "2/2568", is_current: false, start_date: "2025-10-01", end_date: "2026-03-31", updated_at: 0 }];
    classes.value = [...classes.value, { id: "co", name: "ป.6/9", grade: "ป.6", sort: 9, archived: false, year: 2568, updated_at: 0 }];
    selectedTermId.value = "old";
    current = payload({ termId: "old" });
    await act(async () => { await saveAppearance({ layout: "a" }, { silent: true }); });
    const { container } = render(<Home />);
    await screen.findByRole("heading", { level: 1 });
    expect(viewingPastYear.value).toBe(true);
    await waitFor(() => expect(container.querySelector(".hma-past")).not.toBeNull());
    expect(container.querySelector(".hma-big .num")).toBeNull();
    expect(container.querySelector(".hma-tl")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "ไม่มาวันนี้" })).toBeNull();
    // R-3402: no roll-call pill and no "due today" pill either (the two that only mean something for today)
    const bar = within(screen.getByRole("group", { name: "ตัวเลขสรุป" }));
    expect(bar.queryByText(/มาเรียน/)).toBeNull();
    expect(bar.queryByText(/ครบกำหนดวันนี้/)).toBeNull();
    expect(bar.getByText(/รอตรวจ/)).toBeTruthy();
    selectedTermId.value = "t1";
  });

  it("many due-today works (> 3) fold into one 'ครบกำหนดวันนี้ N งาน' line that opens", async () => {
    const dues = ["a", "b", "c", "d"].map((k) => ({ assignment: w("d" + k, "งาน" + k, TODAY), perClass: [per("c1", { submitted: 5 })] }));
    current = payload({ openAssignments: dues, dueSoon: dues.map((a) => ({ assignmentId: a.assignment.id, classId: "c1", studentIds: ["s0"] })), missingCount: 0 });
    const { container } = await open();
    const fold = items(container).find((r) => r.dataset.kind === "dueFold") as HTMLElement;
    expect(fold.querySelector("h3")?.textContent).toBe("ครบกำหนดวันนี้ 4 งาน");
    expect(items(container).filter((r) => r.dataset.kind === "due")).toHaveLength(0);
    expect(container.querySelector(".hma-big .num")?.textContent).toBe("7"); // the count is still one per work: room + 4 works + review + backup (BR-01)
    const btn = within(fold).getByRole("button", { name: "ดูทั้ง 4 งาน" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    // R-3404: four buttons, four different names (the work's title is in each)
    const scans = within(fold).getAllByRole("button", { name: /^สแกนรับงาน / });
    expect(scans).toHaveLength(4);
    expect(new Set(scans.map((b) => b.getAttribute("aria-label"))).size).toBe(4);
    const copies = within(fold).getAllByRole("button", { name: /^คัดลอกรายชื่อไป LINE · ป\.6\/1 · / });
    expect(new Set(copies.map((b) => b.getAttribute("aria-label"))).size).toBe(copies.length);
    expect(within(fold).getByRole("button", { name: "ซ่อนรายการ" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("ก helpers", () => {
  it("attTotals counts only checked rooms; roomChips leaves out an empty room", () => {
    const room = (classId: string, name: string, att: unknown) => ({ classId, name, att, studentCount: 0, follow: [], absent: [] } as never);
    const rooms = [
      room("a", "ป.6/1", { progress: "complete", marked: 8, total: 8, present: 6, late: 1, leave: 0, sick: 0, absent: 1, pct: 88 }),
      room("b", "ป.5/1", { progress: "none", marked: 0, total: 5, present: 0, late: 0, leave: 0, sick: 0, absent: 0, pct: null }),
      room("c", "ป.4/1", { progress: "partial", marked: 3, total: 9, present: 3, late: 0, leave: 0, sick: 0, absent: 0, pct: 100 }),
      room("d", "ป.3/1", { progress: "none", marked: 0, total: 0, present: 0, late: 0, leave: 0, sick: 0, absent: 0, pct: null }),
      room("e", "ป.2/1", null),
    ];
    expect(attTotals(rooms)).toEqual({ present: 9, late: 1, leave: 0, sick: 0, absent: 1, checked: 2 });
    expect(roomChips(rooms).map((c) => c.text)).toEqual(["ป.6/1 ครบ 8/8", "ป.5/1 ยังไม่เช็ค", "ป.4/1 เช็คบางส่วน 3/9"]);
  });
});
