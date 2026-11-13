// ui-redesign round 1: the home page's cards (choose / hide / reorder), the "do this now" card, hide-names, and the menu groups.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
const { err } = vi.hoisted(() => ({ err: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err, notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => null }));

import { Home } from "@client/pages/Home";
import { Shell } from "@client/components/Shell";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms } from "@client/store";
import { route } from "@client/router";
import { dashboard } from "@client/lib/dashboard";
import { failedCount } from "@client/lib/outbox";
import { setHideNames } from "@client/lib/homePrefs";
import { serializeHomeCards, defaultHomeCards } from "@client/lib/homeCards";
import { LAYOUT_CARDS } from "@client/lib/homeLayout";
import { saveAppearance, resetAppearanceForTests } from "@client/lib/appearance";

/** home_cards text with the cards of layout a (the old whole-page fields stay, as the app writes them) */
const withA = (a: { order: string[]; hidden: string[] }) => JSON.stringify({ ...JSON.parse(serializeHomeCards(defaultHomeCards())), a });
import type { DashboardPayload, Settings } from "@shared/types";
import { asg, kid } from "./m1-05-fixture";

const NOW = Date.UTC(2026, 10, 4, 4, 0, 0); // 4 Nov 2026 11:00 in Bangkok
const TODAY = "2026-11-04";

const baseSettings = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(NOW - 2 * 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

function payload(over: Partial<DashboardPayload> = {}): DashboardPayload {
  return {
    date: TODAY, termId: "t1", gradingAssignments: [], awaitingCount: 1, missingCount: 2, serverTime: 0,
    openAssignments: [{ assignment: asg("a1", "2000-01-01", "ใบงานเก่า"), perClass: [{ classId: "c1", total: 10, submitted: 6, scored: 5, awaiting: 1, late: 1, missing: 2, excused: 2 }] }],
    attendanceToday: [{ date: TODAY, classId: "c1", present: 6, late: 1, leave: 0, sick: 0, absent: 1, marked: 8, total: 8 }],
    followUp: [{ studentId: "s0", classId: "c1", missing: 2 }],
    dueSoon: [{ assignmentId: "a1", classId: "c1", studentIds: ["s1", "s2"] }],
    absentToday: [{ classId: "c1", studentId: "s3", status: "absent" }, { classId: "c1", studentId: "s4", status: "late" }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  put.mockResolvedValue({ ok: true });
  get.mockImplementation(async () => payload());
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = [0, 1, 2, 3, 4].map(kid);
  settings.value = baseSettings();
  dashboard.value = null;
  failedCount.value = 0;
  setHideNames(false);
  resetAppearanceForTests();
  route.value = "/home";
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

/** the page in another layout (ก is the default) */
const useLayout = (layout: "a" | "b" | "c") => act(async () => { await saveAppearance({ layout }, { silent: true }); });
const h2 = (name: string) => screen.queryByRole("heading", { level: 2, name });

describe("home page cards (layout ก: its own five sub-cards, BR-12)", () => {
  it("shows the four default sub-cards of layout ก and leaves 'ห้องของฉัน' off; the cards of the other layouts are not there", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" });
    for (const n of ["ต้องติดตาม", "ครบกำหนด", "ไม่มาวันนี้"]) expect(h2(n)).toBeTruthy();
    for (const n of ["ห้องของฉัน", "เช็คชื่อวันนี้", "ค้างในเครื่องนี้", "สำรองข้อมูล", "ภาคเรียน"]) expect(h2(n)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("สวัสดี ครูทดสอบ");
  });

  it("follows the saved list of the layout: a hidden card is gone, an enabled one appears, and the order is the saved order", async () => {
    settings.value = baseSettings({ home_cards: withA({ order: ["due", "open", "absent", "follow", "classes"], hidden: ["follow"] }) });
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ห้องของฉัน" });
    expect(h2("ต้องติดตาม")).toBeNull();
    const names = [...document.querySelectorAll(".hma-side h2")].map((e) => e.textContent);
    expect(names.indexOf("ครบกำหนด")).toBeLessThan(names.indexOf("ความคืบหน้ารายห้อง"));
  });

  it("one visible card = one card in ก's side column; the default shows the four cards in the saved order (ก lays them out in its own two-column grid)", async () => {
    settings.value = baseSettings({ home_cards: withA({ order: [...LAYOUT_CARDS.a], hidden: LAYOUT_CARDS.a.filter((k) => k !== "open") }) });
    const { unmount } = render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" });
    expect(document.querySelector(".hm.pg")).not.toBeNull();
    expect(document.querySelector(".hma-grid")).not.toBeNull();
    expect(document.querySelectorAll(".hma-side > section")).toHaveLength(1);
    expect([...document.querySelectorAll(".hma-side h2")].map((e) => e.textContent)).toEqual(["ความคืบหน้ารายห้อง"]);
    unmount();

    settings.value = baseSettings();
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" });
    const cards = [...document.querySelectorAll(".hma-side > section")];
    expect(cards).toHaveLength(4);
    expect(cards[0].querySelector("h2")!.textContent).toContain("ความคืบหน้ารายห้อง");
    expect(cards.map((c) => c.querySelector("h2")!.textContent)).toEqual(["ความคืบหน้ารายห้อง", "ต้องติดตาม", "ไม่มาวันนี้", "ครบกำหนด"]);
  });

  it("the panel is titled with the layout, lists only that layout's five cards, saves every change at once into that layout's field", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: /^ปรับหน้าหลัก · โครง ก/ });
    expect(within(dlg).getAllByRole("switch")).toHaveLength(6); // the five sub-cards + the fixed timetable strip
    expect(within(dlg).getAllByRole("radio")).toHaveLength(3);
    expect(dlg.textContent).toContain("ปิดไม่ได้: ลำดับงานวันนี้ · ปุ่มลัด · ตัวเลขสรุป");
    expect(dlg.textContent).toContain("เปลี่ยนโครง/ธีมที่ ตั้งค่า > หน้าตา");

    fireEvent.click(within(dlg).getByRole("switch", { name: "แสดงการ์ด ห้องของฉัน" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, body] = put.mock.calls[0];
    expect(url).toBe("/api/settings");
    const saved = JSON.parse(body.home_cards);
    expect(saved.a.hidden).not.toContain("classes");
    expect(saved.order).toEqual(defaultHomeCards().order);               // the old fields stay for an app that was not updated
    await screen.findByRole("heading", { level: 2, name: "ห้องของฉัน" });   // shown at once, behind the panel

    fireEvent.click(within(dlg).getByRole("button", { name: "เลื่อน ต้องติดตาม ขึ้น" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(JSON.parse(put.mock.calls[1][1].home_cards).a.order.slice(0, 3)).toEqual(["timetable", "follow", "open"]) // the fixed strip stays first;
    expect(within(dlg).getByRole("status").textContent).toContain("ย้าย ต้องติดตาม ไปลำดับ 1");
  });

  it("a failed save puts the layout back and says so", async () => {
    put.mockRejectedValueOnce(new Error("offline"));
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: /^ปรับหน้าหลัก · โครง ก/ });
    fireEvent.click(within(dlg).getByRole("switch", { name: "แสดงการ์ด ห้องของฉัน" }));
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(settings.value!.home_cards).toBe("");                     // back to the saved layout
    await waitFor(() => expect(h2("ห้องของฉัน")).toBeNull());
  });

  it("reset asks first, then restores the default of this layout only", async () => {
    settings.value = baseSettings({ home_cards: withA({ order: [...LAYOUT_CARDS.a], hidden: ["classes", "due"] }) });
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ต้องติดตาม" });
    expect(h2("ครบกำหนด")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: /^ปรับหน้าหลัก · โครง ก/ });
    fireEvent.click(within(dlg).getByRole("button", { name: /คืนค่าเริ่มต้น/ }));
    expect(put).not.toHaveBeenCalled();                              // only asked so far
    fireEvent.click(within(dlg).getByRole("button", { name: "ใช่ คืนค่า" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][1].home_cards).toBe(serializeHomeCards(defaultHomeCards()));
  });
});

describe("the work card (ก: progress per room, ข: the picked room's work with numbers)", () => {
  it("ก: a progressbar and the numbers per room; ข: 'ค้าง' and 'รอตรวจ' are buttons per work, with 6/8 · ยกเว้น 2 and the scan for the room that still owes work", async () => {
    render(<Home />);
    const room = (await screen.findByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" })).closest("section")!.querySelector(".hma-room")!;
    expect(within(room as HTMLElement).getByRole("progressbar", { name: /ป\.6\/1 ส่งงาน 75%/ })).toBeTruthy();
    expect(room.textContent).toContain("รอตรวจ 1");
    expect(room.textContent).toContain("ค้าง 2");
    cleanup();

    await useLayout("b");
    render(<Home />);
    await waitFor(() => expect(document.querySelector(".hmb-asg")).not.toBeNull());
    const row = document.querySelector(".hmb-asg") as HTMLElement;
    expect(within(row).getByRole("button", { name: /ค้าง 2/ })).toBeTruthy();
    expect(within(row).getByRole("button", { name: /รอตรวจ 1/ })).toBeTruthy();
    expect(row.querySelector(".nums")!.textContent).toContain("6/8 · ยกเว้น 2");
    expect(within(row).getByRole("button", { name: "สแกนรับ ใบงานเก่า ป.6/1" })).toBeTruthy();
  });

  it("an open work more than a week overdue is in the day's list with 'เลยกำหนด' and offers to close it", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ลำดับงานวันนี้" });
    const li = document.querySelector("li[data-kind=overdue]") as HTMLElement;
    expect(li.textContent).toContain("เลย");
    fireEvent.click(within(li).getByRole("button", { name: /ปิดรับงานนี้/ }));
    expect(window.location.hash).toContain("#/gradebook");
  });
});

describe("due-soon and absent cards, and hiding names", () => {
  it("due-soon: counts who has not handed in per room; no child's name is on the page, the names go out only through the copy-to-LINE button", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write }, onLine: true });
    const base = payload();
    get.mockImplementation(async () => ({ ...base,
      openAssignments: [...base.openAssignments, { assignment: asg("a2", TODAY, "ใบงานเศษส่วน"), perClass: [{ classId: "c1", total: 10, submitted: 8, scored: 8, awaiting: 0, late: 0, missing: 0, excused: 0 }] }],
      dueSoon: [{ assignmentId: "a2", classId: "c1", studentIds: ["s1", "s2"] }] }));
    render(<Home />);
    const card = (await screen.findByRole("heading", { level: 2, name: "ครบกำหนด" })).closest("section")!;
    expect(card.textContent).toContain("ป.6/1 ยังไม่ส่ง 2 คน");
    expect(document.body.textContent).not.toContain("เด็ก1");
    fireEvent.click(screen.getByRole("button", { name: /คัดลอกรายชื่อไป LINE · ป\.6\/1/ }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain("เด็ก1");
    expect(write.mock.calls[0][0]).toContain("เด็ก2");
  });

  it("a dashboard saved before this update (no dueSoon / absentToday) still renders, with both cards empty", async () => {
    const old = payload() as Partial<DashboardPayload>;
    delete old.dueSoon; delete old.absentToday;
    get.mockImplementation(async () => old);
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ครบกำหนด" });
    expect(screen.getByText(/ไม่มีงานครบกำหนดวันนี้หรือพรุ่งนี้/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "ไม่มาวันนี้" }).closest("section")!.textContent).toContain("มาครบ");
  });

  it("absent card: groups today's absentees by status with their names", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ไม่มาวันนี้" });
    const card = screen.getByRole("heading", { level: 2, name: "ไม่มาวันนี้" }).closest("section")!;
    expect(card.textContent).toContain("ขาด 1");
    expect(card.textContent).toContain("สาย 1");
    expect(within(card as HTMLElement).getByRole("button", { name: /เด็ก3/ })).toBeTruthy();
  });

  it("'ซ่อนชื่อ' removes every child's name from every card and shows counts instead; it is remembered on this device", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ต้องติดตาม" });
    expect(screen.getByRole("heading", { level: 2, name: "ต้องติดตาม" }).closest("section")!.textContent).toContain("เด็ก0");   // the follow-up list names the child
    fireEvent.click(screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "" })).toBeTruthy());
    const text = document.querySelector(".hm")!.textContent!;
    for (const n of ["เด็ก0", "เด็ก1", "เด็ก2", "เด็ก3", "เด็ก4"]) expect(text).not.toContain(n);
    expect(text).toContain("ซ่อนชื่อนักเรียนอยู่");
    expect(text).toContain("1 คน");                                       // counts remain
    expect(localStorage.getItem("ngankrob-hide-names")).toBe("1");
    expect(screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the day's list in ก ('do this now')", () => {
  it("is cleared when nothing needs doing: the big line says so and no row is left", async () => {
    get.mockImplementation(async () => payload({ openAssignments: [], followUp: [], dueSoon: [], absentToday: [], awaitingCount: 0, missingCount: 0 }));
    render(<Home />);
    await screen.findByText("เคลียร์ครบแล้ว เยี่ยมมาก");
    expect(document.querySelector("li[data-kind=clear]")).not.toBeNull();
    expect(document.querySelector("li[data-kind=failed], li[data-kind=room], li[data-kind=overdue]")).toBeNull();
    expect(h2("ต้องทำตอนนี้")).toBeNull();
  });

  it("lists failed sends first and opens the failed list", async () => {
    failedCount.value = 2;
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ลำดับงานวันนี้" });
    const first = document.querySelector(".hma-tl > li")!;
    expect(first.getAttribute("data-kind")).toBe("failed");
    expect(first.textContent).toContain("ส่งไม่สำเร็จ 2 รายการ");
    expect(within(first as HTMLElement).getByRole("button", { name: /ดูรายการ/ })).toBeTruthy();
  });

  it("warns about a room not checked yet only once the 'late' time has passed", async () => {
    get.mockImplementation(async () => payload({ attendanceToday: [{ date: TODAY, classId: "c1", present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 8 }], absentToday: [] }));
    const roomRow = () => document.querySelector("li[data-kind=room]");
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ลำดับงานวันนี้" });
    expect(roomRow()!.textContent).toContain("ป.6/1");                       // 11:00 > 08:30
    expect(roomRow()!.textContent).toContain("ยังไม่ได้เช็คชื่อ");
    cleanup();
    dashboard.value = null;
    vi.setSystemTime(Date.UTC(2026, 10, 4, 1, 0, 0));                    // 08:00 in Bangkok
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ลำดับงานวันนี้" });
    expect(roomRow()).toBeNull();
  });

  it("says when there has never been a backup, and stays quiet after a recent one", async () => {
    settings.value = baseSettings({ last_backup_at: "" });
    render(<Home />);
    await screen.findByText("ยังไม่เคยสำรองข้อมูล");
  });
});

describe("the menu", () => {
  it("has four labelled groups holding the nine pages in the day's order, and marks the current page", () => {
    route.value = "/attendance";
    render(<Shell><div /></Shell>);
    const rail = screen.getByRole("navigation", { name: "เมนูหลัก" });
    const groups = within(rail).getAllByRole("group").map((g) => [g.getAttribute("aria-label"), within(g).getAllByRole("link").map((a) => a.textContent)]);
    expect(groups).toEqual([
      ["วันนี้", ["หน้าหลัก", "ตารางสอน"]], ["ในห้องเรียน", ["สแกน", "เช็คชื่อ", "สุ่มชื่อ"]], ["ตรวจงาน", ["คะแนน", "รายงาน"]], ["จัดการ", ["นักเรียน", "ตั้งค่า"]],
    ]);
    const current = within(rail).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["เช็คชื่อ"]);
    expect(rail.querySelector("[data-icon=\"notebook\"]")).toBeTruthy();         // the new icons (D22)
    expect(rail.querySelector("[data-icon=\"users\"]")).toBeTruthy();
    expect(rail.querySelector("[data-icon=\"dice-3\"]")).toBeTruthy();
    expect(within(rail).getByRole("button", { name: "ออกจากระบบ" })).toBeTruthy();
  });

  it("phone: five tabs, the current one marked, and the menu button opens the sheet with the same groups", () => {
    route.value = "/home";
    render(<Shell><div /></Shell>);
    const bar = screen.getByRole("navigation", { name: "เมนู" });
    expect(within(bar).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual(["หน้าหลัก"]);
    const btn = within(bar).getByRole("button", { name: "เพิ่มเติม" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    const sheet = screen.getByRole("dialog", { name: "เพิ่มเติม" });
    expect(btn.getAttribute("aria-controls")).toBe(sheet.id);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect([...sheet.querySelectorAll(".sheet-gl")].map((e) => e.textContent)).toEqual(["วันนี้", "ในห้องเรียน", "ตรวจงาน", "จัดการ"]);
    expect(within(sheet).getAllByRole("link").filter((a) => !a.classList.contains("tp-manage")).map((a) => a.textContent!.trim())).toEqual(["ตารางสอน", "สุ่มชื่อ", "รายงาน", "นักเรียน", "ตั้งค่า"]);
  });
});
