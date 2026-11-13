// T-35: home layout ข "แผงรายห้อง" — a ring per room, the strip of what to do now, the picked room's detail (AC-25..29, AC-38, AC-39).
// The fixture is the BR example (3 rooms 32 / 30 / 28 children): handed-in 92 / 88 / 89 %, roll-call 94 / 90 / not checked, 30 waiting, 22 missing.
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
import { attWords, defaultRoomId, followCount, headCount, panelLabel, roomOpenWork, workSegments } from "@client/components/home/b/logic";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Assignment, DashboardPayload, Settings, Student } from "@shared/types";
import { asg, kid } from "./m1-05-fixture";

const NOW = Date.UTC(2026, 10, 4, 4, 0, 0); // 11:00 in Bangkok, after late_after
const TODAY = "2026-11-04";
const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(NOW - 9 * 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});
const w = (id: string, title: string, due: string | null, ids: string[], over: Partial<Assignment> = {}): Assignment => ({ ...asg(id, due, title), assigned_date: "2026-10-01", class_ids: ids, ...over });
const per = (classId: string, total: number, submitted: number, missing: number, o: Partial<{ awaiting: number; late: number; excused: number }> = {}) =>
  ({ classId, total, submitted, scored: submitted - (o.awaiting ?? 0), awaiting: 0, late: 0, missing, excused: 0, ...o });
const ids = (p: string, n: number, from = 0) => Array.from({ length: n }, (_, i) => p + (from + i));
const mk = (p: string, n: number, classId: string): Student[] => ids(p, n).map((id, i) => ({ ...kid(i), id, class_id: classId, first_name: "ชื่อ" + id, last_name: "สกุล" }));

/** the BR-03/04 example: ป.6/1 · ป.6/2 · ป.5/1 */
const payload = (over: Partial<DashboardPayload> = {}): DashboardPayload => ({
  date: TODAY, termId: "t1", gradingAssignments: [], awaitingCount: 30, missingCount: 22, serverTime: 0,
  openAssignments: [
    { assignment: w("a1", "ใบงานเศษส่วน", TODAY, ["c1", "c2"]), perClass: [per("c1", 32, 27, 0), per("c2", 30, 21, 0)] },
    { assignment: w("a2", "การบ้านทศนิยม", "2026-11-05", ["c3"]), perClass: [per("c3", 28, 16, 0, { awaiting: 4 })] },
    { assignment: w("o1", "แบบฝึกหัดร้อยละ", "2026-10-28", ["c1", "c2"]), perClass: [per("c1", 32, 28, 4, { awaiting: 8 }), per("c2", 30, 24, 6)] },
    { assignment: w("o2", "ใบงานอัตราส่วน", "2026-11-01", ["c1", "c2"]), perClass: [per("c1", 32, 29, 3, { awaiting: 12 }), per("c2", 30, 26, 4, { late: 3 })] },
    { assignment: w("o3", "สอบย่อยบทที่ 3", "2026-11-02", ["c3"]), perClass: [per("c3", 28, 23, 5, { awaiting: 6 })] },
  ],
  attendanceToday: [
    { date: TODAY, classId: "c1", present: 28, late: 2, leave: 1, sick: 1, absent: 0, marked: 32, total: 32 },
    { date: TODAY, classId: "c2", present: 26, late: 1, leave: 1, sick: 0, absent: 2, marked: 30, total: 30 },
    { date: TODAY, classId: "c3", present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 28 },
  ],
  followUp: [
    { studentId: "s0", classId: "c1", missing: 2 }, { studentId: "s1", classId: "c1", missing: 2 }, { studentId: "s2", classId: "c1", missing: 2 }, { studentId: "s3", classId: "c1", missing: 1 },
    { studentId: "b0", classId: "c2", missing: 2 }, { studentId: "b1", classId: "c2", missing: 2 },
    { studentId: "c0", classId: "c3", missing: 1 }, { studentId: "c1", classId: "c3", missing: 1 },
  ],
  dueSoon: [
    { assignmentId: "a1", classId: "c1", studentIds: ids("s", 5, 20) }, { assignmentId: "a1", classId: "c2", studentIds: ids("b", 9, 20) },
    { assignmentId: "a2", classId: "c3", studentIds: ids("c", 12, 10) },
  ],
  absentToday: [
    { classId: "c1", studentId: "s30", status: "late" }, { classId: "c1", studentId: "s31", status: "late" }, { classId: "c1", studentId: "s29", status: "leave" }, { classId: "c1", studentId: "s28", status: "sick" },
    { classId: "c2", studentId: "b29", status: "late" }, { classId: "c2", studentId: "b28", status: "leave" }, { classId: "c2", studentId: "b27", status: "absent" }, { classId: "c2", studentId: "b26", status: "absent" },
  ],
  ...over,
});

const room = (id: string, name: string, sort: number) => ({ id, name, grade: "ป.6", sort, archived: false, year: 2569, updated_at: 0 });
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
  classes.value = [room("c1", "ป.6/1", 1), room("c2", "ป.6/2", 2), room("c3", "ป.5/1", 3)];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = [...mk("s", 32, "c1"), ...mk("b", 30, "c2"), ...mk("c", 28, "c3")];
  settings.value = base();
  dashboard.value = null;
  setHideNames(false);
  resetAppearanceForTests();
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ""; });

async function open() {
  await act(async () => { await saveAppearance({ layout: "b" }, { silent: true }); });
  const r = render(<Home />);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(r.container.querySelector(".hmb-panel")).not.toBeNull());
  return r;
}
const panel = (c: Element, id: string) => c.querySelector<HTMLElement>(`.hmb-panel[data-room=${id}]`)!;

describe("ข panels (AC-25)", () => {
  it("a ring and the four numbers per room, with the BR example: 92 / 88 / 89 % handed in", async () => {
    const { container } = await open();
    expect(container.querySelectorAll(".hmb-panel")).toHaveLength(3);
    const rings = [...container.querySelectorAll(".hmb-panel")].map((p) => p.querySelector(".hmb-ring .rc")?.textContent);
    expect(rings).toEqual(["92%", "88%", "89%"]);
    const p1 = panel(container, "c1");
    expect(p1.querySelector(".nm")?.textContent).toBe("ป.6/1");
    expect(p1.textContent).toContain("32 คน · 3 งานเปิดรับ");
    // ป.6/1: handed in 27+28+29 = 84, missing 0+4+3 = 7, waiting 8+12 = 20, late 0
    const stats = [...p1.querySelectorAll(".p-stats > span")].map((s) => s.textContent);
    expect(stats).toEqual(["ส่งแล้ว84", "ค้างส่ง7", "รอตรวจ20", "ส่งช้า0"]);
    expect([...panel(container, "c2").querySelectorAll(".p-stats > span")].map((s) => s.textContent)).toEqual(["ส่งแล้ว71", "ค้างส่ง10", "รอตรวจ0", "ส่งช้า3"]);
    // the waiting figures of the rooms add up to the page's number (BR-03): 20 + 0 + 10
    expect([...container.querySelectorAll(".hmb-panel")].reduce((n, p) => n + Number(p.querySelectorAll(".p-stats b")[2].textContent), 0)).toBe(30);
  });

  it("roll-call per room: 94 % / 90 % / 'ยังไม่ได้เช็คชื่อวันนี้' (never 0 %), and the line under the greeting says 92 % · ยังเหลือ 1 ห้อง", async () => {
    const { container } = await open();
    expect(panel(container, "c1").querySelector(".p-att")?.textContent).toContain("มาเรียน 94%");
    expect(panel(container, "c2").querySelector(".p-att")?.textContent).toContain("มาเรียน 90%");
    expect(panel(container, "c3").querySelector(".p-att")?.textContent).toBe("ยังไม่ได้เช็คชื่อวันนี้");
    expect(panel(container, "c3").textContent).not.toMatch(/มาเรียน 0%/);
    const line = within(screen.getByRole("group", { name: "ตัวเลขสรุป" }));
    expect(line.getByText("มาเรียน 92% · ยังเหลือ 1 ห้อง")).toBeTruthy();
    expect(line.getByText("รอตรวจ 30 ชิ้น")).toBeTruthy();
    expect(line.getByText("ค้างส่ง 22 ชิ้น")).toBeTruthy();
    expect(line.getByText("ครบกำหนดวันนี้ 1 งาน")).toBeTruthy();
  });

  it("'ต้องติดตาม N คน' per room from that room's own children; names hidden -> no avatar at all", async () => {
    const { container } = await open();
    expect(panel(container, "c1").textContent).toContain("ต้องติดตาม 4 คน");
    expect(panel(container, "c2").textContent).toContain("ต้องติดตาม 2 คน");
    expect(panel(container, "c1").querySelectorAll(".av-stack .uc-av")).toHaveLength(4);
    cleanup();
    setHideNames(true);
    const again = await open();
    expect(panel(again.container, "c1").textContent).toContain("ต้องติดตาม 4 คน");
    expect(again.container.querySelector(".hmb-panel .uc-av")).toBeNull();
  });

  it("the room's quick buttons and rooms' labels: one h1, aria-pressed panels, rings are pictures (aria-hidden) with the words in the label (AC-39)", async () => {
    const { container } = await open();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    for (const p of container.querySelectorAll(".hmb-panel")) {
      expect(p.getAttribute("aria-pressed")).toMatch(/true|false/);
      expect(p.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(panel(container, "c1").getAttribute("aria-label")).toBe("ป.6/1 ส่งงาน 92% · ส่งแล้ว 84 รอตรวจ 20 ค้างส่ง 7 ส่งช้า 0 · มาเรียน 94% · ต้องติดตาม 4 คน · แตะเพื่อดูรายละเอียด");
    expect(screen.getByRole("link", { name: /สแกนส่งงาน/ })).toBeTruthy();
  });
});

describe("ข strip of what to do now (AC-26)", () => {
  it("the number is the model's (5), three pills with a button each, 'อีก 2 อย่าง' opens a sheet and does not change the layout", async () => {
    const { container } = await open();
    const strip = container.querySelector(".hmb-strip") as HTMLElement;
    expect(strip.querySelector(".lead .n")?.textContent).toBe("5");
    const pills = [...strip.querySelectorAll(".hmb-pill")];
    expect(pills).toHaveLength(3);
    for (const p of pills) { expect(p.querySelector("button")).not.toBeNull(); expect(p.querySelector("small")?.textContent).toMatch(/ต้องดู|ควรทำ|ว่างค่อยทำ/); }
    const more = within(strip).getByRole("button", { name: /อีก 2 อย่าง/ });
    fireEvent.click(more);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getAllByRole("listitem").length).toBeGreaterThanOrEqual(6); // 5 rows + tomorrow's
    expect(within(dlg).getByText("ภายหลัง · ไม่นับในตัวเลขวันนี้")).toBeTruthy();
    expect(document.querySelector(".hm[data-hm-layout=b]")).not.toBeNull();
    expect(location.hash).toBe("");
  });

  it("a pill's button does what the row says (the roll-call row goes to the room's roll-call)", async () => {
    const { container } = await open();
    const pill = container.querySelector(".hmb-strip .hmb-pill") as HTMLElement;
    fireEvent.click(within(pill).getByRole("button"));
    expect(location.hash).toBe("#/attendance?class=c3");
  });

  it("nothing to do: 'ไม่มีอะไรค้าง · เคลียร์ครบแล้ว' and no 'อีก' button", async () => {
    settings.value = base({ last_backup_at: String(NOW - 86_400_000) });
    current = payload({
      awaitingCount: 0, missingCount: 0, openAssignments: [payload().openAssignments[1]], dueSoon: [],
      attendanceToday: payload().attendanceToday.map((a) => ({ ...a, present: a.total, marked: a.total })),
    });
    const { container } = await open();
    expect(container.querySelector(".hmb-strip .lead .n")?.textContent).toBe("0");
    expect(container.querySelector(".hmb-strip")?.textContent).toContain("ไม่มีอะไรค้าง · เคลียร์ครบแล้ว");
    expect(screen.queryByRole("button", { name: /อีก \d+ อย่าง/ })).toBeNull();
  });

  it("names hidden: the sheet has no copy-to-LINE; shown: one per room, never the other rooms' children", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write }, onLine: true });
    const { container } = await open();
    fireEvent.click(within(container.querySelector(".hmb-strip") as HTMLElement).getByRole("button", { name: /อีก 2 อย่าง/ }));
    const dlg = await screen.findByRole("dialog");
    const copy = within(dlg).getAllByRole("button", { name: /คัดลอกรายชื่อไป LINE/ });
    expect(copy).toHaveLength(2); // ป.6/1 and ป.6/2 owe ใบงานเศษส่วน
    fireEvent.click(within(dlg).getByRole("button", { name: "คัดลอกรายชื่อไป LINE · ป.6/2" }));
    const text: string = write.mock.calls[0][0];
    expect(text).toContain("ป.6/2");
    expect(text).not.toContain("ชื่อs"); // none of ป.6/1's children
    cleanup();
    setHideNames(true);
    const h = await open();
    fireEvent.click(within(h.container.querySelector(".hmb-strip") as HTMLElement).getByRole("button", { name: /อีก 2 อย่าง/ }));
    expect(within(await screen.findByRole("dialog")).queryByRole("button", { name: /คัดลอกรายชื่อไป LINE/ })).toBeNull();
  });
});

describe("ข picked room (AC-27, AC-28)", () => {
  it("starts on the room the day's list asks for (ป.5/1: roll-call not done); a tap picks another and the detail follows, no page change", async () => {
    const { container } = await open();
    expect(panel(container, "c3").getAttribute("aria-pressed")).toBe("true");
    expect(panel(container, "c1").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { level: 2, name: "กำลังดู ป.5/1 · งานที่เปิดรับ" })).toBeTruthy();
    expect(panel(container, "c3").querySelector(".viewing")?.textContent).toContain("กำลังดู"); // not colour alone
    fireEvent.click(panel(container, "c2"));
    expect(panel(container, "c2").getAttribute("aria-pressed")).toBe("true");
    expect(panel(container, "c3").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { level: 2, name: "กำลังดู ป.6/2 · งานที่เปิดรับ" })).toBeTruthy();
    expect(location.hash).toBe("");
  });

  it("open work oldest due first (overdue, today), with the bar, the numbers and a scan button that goes to that work and room", async () => {
    const { container } = await open();
    fireEvent.click(panel(container, "c2"));
    const rows = [...container.querySelectorAll(".hmb-asg")];
    expect(rows.map((r) => r.querySelector("h3")?.textContent)).toEqual(["แบบฝึกหัดร้อยละ", "ใบงานอัตราส่วน", "ใบงานเศษส่วน"]);
    expect(rows[0].textContent).toContain("เลยกำหนด 7 วัน");
    expect(rows[2].textContent).toContain("ครบกำหนดวันนี้");
    expect(rows[0].textContent).toContain("ส่งแล้ว 24/30");
    expect(rows[0].querySelector("[role=img]")?.getAttribute("aria-label")).toContain("ค้าง 6");
    fireEvent.click(within(rows[2] as HTMLElement).getByRole("button", { name: "สแกนรับ ใบงานเศษส่วน ป.6/2" }));
    expect(location.hash).toBe("#/scan?asg=a1&class=c2");
  });

  it("'ค้าง' and 'รอตรวจ' go to that work's rows in the gradebook; 'สร้างงาน' carries the room", async () => {
    const { container } = await open();
    fireEvent.click(panel(container, "c1"));
    const o1 = [...container.querySelectorAll(".hmb-asg")].find((r) => r.querySelector("h3")?.textContent === "แบบฝึกหัดร้อยละ") as HTMLElement;
    fireEvent.click(within(o1).getByRole("button", { name: /ค้าง 4/ }));
    expect(location.hash).toBe("#/gradebook?class=c1&subject=math&asg=o1&rows=missing");
    fireEvent.click(within(o1).getByRole("button", { name: /รอตรวจ 8/ }));
    expect(location.hash).toBe("#/gradebook?class=c1&subject=math&asg=o1&rows=awaiting");
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));
    expect(location.hash).toBe("#/gradebook?new=1&class=c1");
  });

  it("follow-up of the room only (never 'ทั้งหมด', with a link to the reports) and who is away by status; the roll-call button of a room not checked", async () => {
    const { container } = await open();
    const follow = () => screen.getByRole("heading", { level: 2, name: /ต้องติดตาม · / }).closest("section") as HTMLElement;
    expect(follow().textContent).toContain("ชิ้นที่ค้าง · 2 คน"); // ป.5/1 (c3): 1 piece, 2 children
    fireEvent.click(panel(container, "c1"));
    expect(follow().textContent).toContain("ชิ้นที่ค้าง · 3 คน");
    expect(follow().textContent).toContain("ชิ้นที่ค้าง · 1 คน");
    expect([...document.querySelectorAll(".hmb-side .fh .big")].map((e) => e.textContent)).toEqual(["2", "1"]);
    expect(follow().textContent).not.toContain("ทั้งหมด");
    expect(within(follow()).getByText("ชื่อs0")).toBeTruthy();
    fireEvent.click(within(follow()).getByRole("button", { name: /ดูในรายงาน/ }));
    expect(location.hash).toBe("#/reports");
    const abs = screen.getByRole("heading", { level: 2, name: "ไม่มาวันนี้" }).closest("section") as HTMLElement;
    expect(abs.textContent).toContain("สาย 2");
    expect(abs.textContent).toContain("ลา 1");
    expect(abs.textContent).toContain("ป่วย 1");
    expect(abs.textContent).not.toContain("ขาด");
    fireEvent.click(panel(container, "c3"));
    const abs3 = screen.getByRole("heading", { level: 2, name: "ไม่มาวันนี้" }).closest("section") as HTMLElement;
    expect(abs3.textContent).toContain("ยังไม่ได้เช็คชื่อ ป.5/1 วันนี้");
    fireEvent.click(within(abs3).getByRole("button", { name: "เช็คชื่อ ป.5/1" }));
    expect(location.hash).toBe("#/attendance?class=c3");
  });

  it("names hidden: the detail shows counts only (BR-08), no names, no initials", async () => {
    setHideNames(true);
    const { container } = await open();
    fireEvent.click(panel(container, "c1"));
    const page = container.querySelector(".hm")!;
    expect(page.textContent).not.toContain("ชื่อs");
    expect(page.querySelector(".uc-av")).toBeNull();
    expect(page.querySelector(".hmb-person")).toBeNull();
    expect(page.textContent).toContain("ชิ้นที่ค้าง · 3 คน");
    expect(page.textContent).toContain("ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน");
  });

  it("AC-28: a room with no open work, nobody to follow and everyone present: '—' (not 0%) and the three sentences", async () => {
    classes.value = [...classes.value, room("c4", "ป.4/1", 4)];
    students.value = [...students.value, ...mk("d", 10, "c4")];
    current = payload({ attendanceToday: [...payload().attendanceToday, { date: TODAY, classId: "c4", present: 10, late: 0, leave: 0, sick: 0, absent: 0, marked: 10, total: 10 }] });
    const { container } = await open();
    const p4 = panel(container, "c4");
    expect(p4.querySelector(".hmb-ring .rc")?.textContent).toBe("—");
    expect(p4.querySelector(".hmb-ring .val")).toBeNull(); // no arc at all
    expect(p4.textContent).not.toMatch(/(?<!\d)0%/);
    fireEvent.click(p4);
    expect(screen.getByText("ยังไม่มีงานที่เปิดรับ")).toBeTruthy();
    expect(screen.getByText(/ไม่มีใครค้างมากในห้องนี้/)).toBeTruthy();
    expect(screen.getByText(/มาครบทุกคน/)).toBeTruthy();
  });

  it("a room with nobody in it: its panel says so and the detail offers 'นำเข้านักเรียน'; the roll-call count leaves it out ('ยังเหลือ 1 ห้อง')", async () => {
    classes.value = [room("c1", "ป.6/1", 1), room("c2", "ป.6/2", 2), room("c3", "ป.6/3", 3)];
    students.value = [...mk("s", 8, "c1"), ...mk("b", 5, "c2")];
    current = payload({
      openAssignments: [], awaitingCount: 0, missingCount: 0, followUp: [], dueSoon: [], absentToday: [],
      attendanceToday: [
        { date: TODAY, classId: "c1", present: 8, late: 0, leave: 0, sick: 0, absent: 0, marked: 8, total: 8 },
        { date: TODAY, classId: "c2", present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 5 },
      ],
    });
    const { container } = await open();
    expect(panel(container, "c3").textContent).toContain("ยังไม่มีนักเรียน");
    expect(panel(container, "c3").querySelector(".hmb-ring")).toBeNull();
    fireEvent.click(panel(container, "c3"));
    expect(screen.getByText("ยังไม่มีนักเรียนในห้อง")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "นำเข้านักเรียน" }));
    expect(location.hash).toBe("#/students?class=c3");
    expect(within(screen.getByRole("group", { name: "ตัวเลขสรุป" })).getByText(/ยังเหลือ 1 ห้อง/)).toBeTruthy();
  });
});

describe("ข many rooms (AC-29, AC-38)", () => {
  const long = (i: number) => "ห้องพิเศษวิทยาศาสตร์ภาษา" + i; // 25 characters
  async function eight() {
    const names = Array.from({ length: 8 }, (_, i) => ({ id: "m" + i, name: long(i + 1) }));
    classes.value = names.map((n, i) => room(n.id, n.name, i + 1));
    students.value = names.flatMap((n, i) => mk("m" + i + "x", 3, n.id));
    current = payload({
      openAssignments: [{ assignment: w("a1", "งานยาวมากมาย".repeat(6), TODAY, names.map((n) => n.id)), perClass: names.map((n) => per(n.id, 3, 1, 1)) }],
      attendanceToday: names.map((n) => ({ date: TODAY, classId: n.id, present: 3, late: 0, leave: 0, sick: 0, absent: 0, marked: 3, total: 3 })),
      followUp: [], dueSoon: [], absentToday: [], awaitingCount: 0, missingCount: 8,
    });
    return open();
  }

  it("more than 3 rooms: compact panels, a chip row to pick the room, the full name in the label and the title (cut with … by CSS only)", async () => {
    const { container } = await eight();
    expect(container.querySelector(".hmb-panels")?.classList.contains("compact")).toBe(true);
    expect(container.querySelectorAll(".hmb-panel.cp")).toHaveLength(8);
    const chips = screen.getByRole("group", { name: "เลือกห้อง (เลื่อนซ้ายขวาได้)" });
    expect(within(chips).getAllByRole("button")).toHaveLength(8);
    const p = panel(container, "m4");
    expect(p.querySelector(".nm")?.getAttribute("title")).toBe(long(5));
    expect(p.getAttribute("aria-label")).toContain(long(5));
    expect(p.querySelector(".nm")?.textContent).toBe(long(5)); // the text itself is whole; only the drawing is cut
    expect(within(chips).getByRole("button", { name: long(1) }).getAttribute("aria-pressed")).toBe("true"); // no room needs the teacher: the one with most missing (all 1) -> first
    fireEvent.click(within(chips).getByRole("button", { name: long(6) }));
    expect(panel(container, "m5").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: `กำลังดู ${long(6)} · งานที่เปิดรับ` })).toBeTruthy();
  });

  it("one room picked at a time: only its work is listed, a long title is a 2-line clamp with the whole title in `title`", async () => {
    const { container } = await eight();
    expect(container.querySelectorAll(".hmb-asg")).toHaveLength(1);
    expect(container.querySelector(".hmb-asg h3")?.getAttribute("title")).toBe("งานยาวมากมาย".repeat(6));
    expect(container.querySelector(".hmb-asg h3")?.classList.contains("clamp2")).toBe(true);
  });

  it("30 open works: five are shown, 'ดูทั้งหมด (30)' shows every one (scroll down, nothing hidden)", async () => {
    current = payload({
      openAssignments: Array.from({ length: 30 }, (_, i) => ({ assignment: w("x" + i, "งาน" + i, "2026-11-" + String(5 + (i % 20)).padStart(2, "0"), ["c1"]), perClass: [per("c1", 32, 10, 0)] })),
      awaitingCount: 0, missingCount: 0,
    });
    const { container } = await open();
    fireEvent.click(panel(container, "c1"));
    expect(container.querySelectorAll(".hmb-asg")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /ดูทั้งหมด \(30\)/ }));
    expect(container.querySelectorAll(".hmb-asg")).toHaveLength(30);
  });
});

describe("ข logic", () => {
  const roomOf = (classId: string, over: Record<string, unknown> = {}) => ({ classId, name: classId, studentCount: 5, openCount: 0, submitted: 0, missing: 0, late: 0, awaiting: 0, rate: null, att: null, follow: [], absent: [], ...over } as never);
  it("defaultRoomId: the room the list asks for, else most missing (first on a tie), else the first with children, else the first", () => {
    const rooms = [roomOf("a", { missing: 3 }), roomOf("b", { missing: 7 }), roomOf("c", { missing: 7 })];
    expect(defaultRoomId({ rooms, todo: [] })).toBe("b");
    expect(defaultRoomId({ rooms, todo: [{ kind: "room", classId: "c" } as never] })).toBe("c");
    expect(defaultRoomId({ rooms: [roomOf("e", { studentCount: 0 }), roomOf("f", { studentCount: 0 })], todo: [] })).toBe("e");
    expect(defaultRoomId({ rooms: [roomOf("e", { studentCount: 0 }), roomOf("f", { studentCount: 4 })], todo: [] })).toBe("f");
    expect(defaultRoomId({ rooms: [], todo: [] })).toBeNull();
  });

  it("roomOpenWork: oldest due first, no due date last, the same date in the server's order", () => {
    const a = (id: string, due: string | null) => ({ assignment: asg(id, due), perClass: [per("c1", 10, 5, 1)] });
    const d = { openAssignments: [a("n", null), a("x", "2026-11-05"), a("y", "2026-10-01"), a("z", "2026-11-05"), a("t", TODAY)] } as never;
    expect(roomOpenWork({ d }, "c1").map((r) => r.a.assignment.id)).toEqual(["y", "t", "x", "z", "n"]);
    expect(roomOpenWork({ d }, "other")).toEqual([]);
  });

  it("workSegments adds up to the children counted; attWords never says 0% for a room not checked", () => {
    expect(workSegments({ classId: "c", total: 30, submitted: 20, scored: 14, awaiting: 6, late: 1, missing: 4, excused: 2 })).toEqual({ handed: 14, awaiting: 6, missing: 4, pending: 4 });
    expect(attWords({ att: { progress: "none", marked: 0, total: 5, present: 0, late: 0, leave: 0, sick: 0, absent: 0, pct: null } })).toBe("ยังไม่ได้เช็คชื่อวันนี้");
    expect(attWords({ att: null })).toBe("มาเรียนวันนี้ —");
    expect(attWords({ att: { progress: "partial", marked: 3, total: 9, present: 3, late: 0, leave: 0, sick: 0, absent: 0, pct: 100 } })).toBe("มาเรียน 100% · เช็คแล้ว 3/9");
    expect(headCount({ att: null, studentCount: 4 })).toBe(4);
    expect(followCount({ follow: [{ pieces: 2, people: [{ studentId: "a", classId: "c" }] }, { pieces: 1, people: [{ studentId: "b", classId: "c" }, { studentId: "c", classId: "c" }] }] })).toBe(3);
    expect(panelLabel(roomOf("x", { name: "ห้อง", studentCount: 0 }), false)).toBe("ห้อง ยังไม่มีนักเรียน");
  });
});

describe("ข in an earlier year", () => {
  it("no strip, no roll-call on the panels, no 'ไม่มาวันนี้' card; the rest still works", async () => {
    const { viewingPastYear } = await import("@client/store");
    terms.value = [...terms.value, { id: "old", year: 2568, term: 2, name: "2/2568", is_current: false, start_date: "2025-10-01", end_date: "2026-03-31", updated_at: 0 }];
    classes.value = [{ ...room("co", "ป.6/9", 9), year: 2568 }];
    students.value = mk("o", 4, "co");
    selectedTermId.value = "old";
    current = payload({ termId: "old", openAssignments: [{ assignment: w("a1", "งานเก่า", "2026-02-01", ["co"]), perClass: [per("co", 4, 2, 2)] }], attendanceToday: [], followUp: [], dueSoon: [], absentToday: [] });
    await act(async () => { await saveAppearance({ layout: "b" }, { silent: true }); });
    const { container } = render(<Home />);
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(container.querySelector(".hmb-panel")).not.toBeNull());
    expect(viewingPastYear.value).toBe(true);
    expect(container.querySelector(".hmb-strip")).toBeNull();
    expect(container.querySelector(".hmb-panel .p-att")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "ไม่มาวันนี้" })).toBeNull();
    expect(container.querySelector(".hmb-panel .hmb-ring .rc")?.textContent).toBe("50%");
    selectedTermId.value = "t1";
  });
});

// ---- round T-35R (R-3501..R-3506) ----
const css = readFileSync(path.resolve(__dirname, "../../src/styles/home-b.css"), "utf8");
/** the body of the rule whose selector is exactly `sel` (first match) */
const ruleOf = (sel: string) => { const i = css.indexOf("\n" + sel + " {"); return i < 0 ? "" : css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i)); };

describe("ข review fixes: styles", () => {
  it("R-3501: the number on the red 'ต้องทำตอนนี้' badge uses the theme's on-danger text colour", () => {
    const r = ruleOf(".hmb-strip .lead .n");
    expect(r).toContain("background: var(--fill-danger)");
    expect(r).toMatch(/color: var\(--on-danger\)/);
  });
  it("R-3503: the picked panel is drawn without `outline`, and its focus ring is offset past the picked ring", () => {
    expect(ruleOf('.hmb-panel[aria-pressed="true"]')).not.toMatch(/outline/);
    expect(ruleOf('.hmb-panel[aria-pressed="true"]:focus-visible')).toMatch(/outline: 3px solid[^;]*;\s*outline-offset: 6px/);
  });
  it("R-3506: the chip row keeps end padding at least as wide as its fade", () => {
    expect(ruleOf(".hmb-chips")).toMatch(/padding: 2px 5rem /);
  });
});

describe("ข review fixes: words and focus", () => {
  const rm = (over: Record<string, unknown>) => ({ classId: "x", name: "ห้อง", studentCount: 5, openCount: 0, submitted: 0, missing: 0, late: 0, awaiting: 0, rate: null, att: null, follow: [], absent: [], ...over } as never);
  it("R-3502: open work not yet due is not 'no open work' and never 0%; no open work says so", () => {
    const a = panelLabel(rm({ openCount: 2 }), true);
    expect(a).toContain("ส่งงาน — (งานเปิดรับ 2 งาน ยังไม่ถึงกำหนด)");
    expect(a).not.toContain("ยังไม่มีงานเปิดรับ");
    expect(a).not.toMatch(/(?<!\d)0%/);
    expect(panelLabel(rm({ openCount: 0 }), true)).toContain("ส่งงาน ยังไม่มีงานเปิดรับ");
    expect(panelLabel(rm({ openCount: 2, rate: 0 }), true)).toContain("ส่งงาน 0%");
  });

  it("R-3504: roll-call half done and nobody away yet: never 'มาครบทุกคน'; says how many are checked and offers the roll-call", async () => {
    current = payload({ attendanceToday: payload().attendanceToday.map((a) => a.classId === "c1" ? { ...a, present: 10, late: 0, leave: 0, sick: 0, marked: 10 } : a), absentToday: [] });
    const { container } = await open();
    fireEvent.click(panel(container, "c1"));
    const abs = screen.getByRole("heading", { level: 2, name: "ไม่มาวันนี้" }).closest("section") as HTMLElement;
    expect(abs.textContent).not.toContain("มาครบทุกคน");
    expect(abs.textContent).toContain("ยังไม่มีคนขาด/ลา · เช็คแล้ว 10 จาก 32 คน");
    fireEvent.click(within(abs).getByRole("button", { name: "เช็คชื่อ ป.6/1" }));
    expect(location.hash).toBe("#/attendance?class=c1");
  });

  it("R-3505: 'ดูทั้งหมด' moves focus to the first work added, and the open list does not follow to another room", async () => {
    current = payload({
      openAssignments: Array.from({ length: 12 }, (_, i) => ({ assignment: w("x" + i, "งาน" + i, "2026-11-" + String(5 + i).padStart(2, "0"), ["c1", "c2"]), perClass: [per("c1", 32, 10, 0), per("c2", 30, 10, 0)] })),
      awaitingCount: 0, missingCount: 0,
    });
    const { container } = await open();
    fireEvent.click(panel(container, "c1"));
    fireEvent.click(screen.getByRole("button", { name: /ดูทั้งหมด \(12\)/ }));
    expect(container.querySelectorAll(".hmb-asg")).toHaveLength(12);
    expect(document.activeElement).toBe(container.querySelectorAll(".hmb-asg h3")[5]);
    expect(document.activeElement?.textContent).toBe("งาน5");
    fireEvent.click(panel(container, "c2"));
    expect(container.querySelectorAll(".hmb-asg")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /ดูทั้งหมด \(12\)/ })).toBeTruthy();
  });

  it("S-3505: four rooms are already compact panels (COMPACT_AFTER), three are not", async () => {
    classes.value = [...classes.value, room("c4", "ป.4/1", 4)];
    students.value = [...students.value, ...mk("d", 10, "c4")];
    const four = await open();
    expect(four.container.querySelector(".hmb-panels")?.classList.contains("compact")).toBe(true);
    cleanup();
    classes.value = classes.value.slice(0, 3);
    const three = await open();
    expect(three.container.querySelector(".hmb-panels")?.classList.contains("compact")).toBe(false);
  });

  it("S-3505: Esc closes the 'อีก N อย่าง' sheet and focus goes back to the button that opened it", async () => {
    const { container } = await open();
    const more = within(container.querySelector(".hmb-strip") as HTMLElement).getByRole("button", { name: /อีก 2 อย่าง/ });
    more.focus();
    fireEvent.click(more);
    const dlg = await screen.findByRole("dialog");
    fireEvent.keyDown(dlg, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(more);
  });
});
