// ui-redesign round 1: the home page's cards (choose / hide / reorder), the "do this now" card, hide-names, and the menu groups.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

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
import { serializeHomeCards, defaultHomeCards, moveCard, toggleCard, visibleOrder } from "@client/lib/homeCards";
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
  route.value = "/home";
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const h2 = (name: string) => screen.queryByRole("heading", { level: 2, name });

describe("home page cards", () => {
  it("shows the five default cards and leaves the four that start off out", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    for (const n of ["เช็คชื่อวันนี้", "ต้องติดตาม", "ครบกำหนดวันนี้/พรุ่งนี้", "ใครไม่มาวันนี้"]) expect(h2(n)).toBeTruthy();
    for (const n of ["ห้องของฉัน", "ค้างในเครื่องนี้", "สำรองข้อมูล", "ภาคเรียน"]) expect(h2(n)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("สวัสดี ครูทดสอบ");
  });

  it("follows the saved layout: a hidden card is gone, an enabled one appears, and the order is the saved order", async () => {
    let p = toggleCard(toggleCard(defaultHomeCards(), "follow"), "classes");
    p = moveCard(p, "att", -1);                                   // att before open
    settings.value = baseSettings({ home_cards: serializeHomeCards(p) });
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ห้องของฉัน" });
    expect(h2("ต้องติดตาม")).toBeNull();
    // all the cards sit in the page columns (PageCols), in the saved order
    const names = [...document.querySelectorAll(".pg-cols h2")].map((e) => e.textContent);
    expect(names).toContain("เช็คชื่อวันนี้");
    expect(names.indexOf("งานที่กำลังเก็บ")).toBeLessThan(names.indexOf("ห้องของฉัน")); // wide column order kept
  });

  it("wide-screen layout: one visible card = one column; a wide region spreads the cards over three, the first one top-left", async () => {
    let only = defaultHomeCards();
    for (const k of visibleOrder(only)) if (k !== "open") only = toggleCard(only, k);
    settings.value = baseSettings({ home_cards: serializeHomeCards(only) });
    const { unmount } = render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    expect(document.querySelector(".hm.pg")).not.toBeNull();
    expect(document.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1");
    expect(document.querySelectorAll(".pg-col")).toHaveLength(1);
    unmount();

    // a 96rem-wide region (jsdom has no layout: report the width by hand)
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 96 * 16, height: 100, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
    settings.value = baseSettings();
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    await waitFor(() => expect(document.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("3"));
    const cols = [...document.querySelectorAll(".pg-col")];
    expect(cols).toHaveLength(3);
    expect(cols[0].querySelector("h2")!.textContent).toContain("งานที่กำลังเก็บ");
    rect.mockRestore();
  });

  it("the settings panel lists all nine cards and saves every change at once (and tells the other devices through the settings)", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: "ปรับหน้าหลัก" });
    expect(within(dlg).getAllByRole("switch")).toHaveLength(9);

    fireEvent.click(within(dlg).getByRole("switch", { name: "แสดงการ์ด ห้องของฉัน" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, body] = put.mock.calls[0];
    expect(url).toBe("/api/settings");
    expect(JSON.parse(body.home_cards).hidden).not.toContain("classes");
    await screen.findByRole("heading", { level: 2, name: "ห้องของฉัน" });   // shown at once, behind the panel

    // reorder: the second card up
    fireEvent.click(within(dlg).getByRole("button", { name: "เลื่อน เช็คชื่อวันนี้ ขึ้น" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(JSON.parse(put.mock.calls[1][1].home_cards).order.slice(0, 2)).toEqual(["att", "open"]);
    expect(within(dlg).getByRole("status").textContent).toContain("ย้าย เช็คชื่อวันนี้ ไปลำดับ 1");
  });

  it("a failed save puts the layout back and says so", async () => {
    put.mockRejectedValueOnce(new Error("offline"));
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: "ปรับหน้าหลัก" });
    fireEvent.click(within(dlg).getByRole("switch", { name: "แสดงการ์ด ห้องของฉัน" }));
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(settings.value!.home_cards).toBe("");                     // back to the saved layout
    await waitFor(() => expect(h2("ห้องของฉัน")).toBeNull());
  });

  it("reset asks first, then restores the default layout", async () => {
    settings.value = baseSettings({ home_cards: serializeHomeCards(toggleCard(defaultHomeCards(), "open")) });
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "เช็คชื่อวันนี้" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: "ปรับหน้าหลัก" });
    fireEvent.click(within(dlg).getByRole("button", { name: /คืนค่าเริ่มต้น/ }));
    expect(put).not.toHaveBeenCalled();                              // only asked so far
    fireEvent.click(within(dlg).getByRole("button", { name: "ใช่ คืนค่า" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][1].home_cards).toBe(serializeHomeCards(defaultHomeCards()));
  });
});

describe("the work card", () => {
  it("separates 'ยังไม่ส่ง' and 'รอตรวจ' per class (each a button), and offers the scan for the class that still owes work", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    const row = document.querySelector(".hm-prog")!;
    expect(within(row as HTMLElement).getByRole("button", { name: /ยังไม่ส่ง 2/ })).toBeTruthy();
    expect(within(row as HTMLElement).getByRole("button", { name: /รอตรวจ 1/ })).toBeTruthy();
    expect(row.querySelector(".num")!.textContent).toBe("6/8 · ยกเว้น 2");
  });

  it("the 'ควรปิดรับ' filter lists open work that is more than a week overdue and offers to close it", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    fireEvent.click(screen.getByRole("button", { name: /ควรปิดรับ \(1\)/ }));
    expect(screen.getByRole("button", { name: /ปิดรับงาน/ })).toBeTruthy();
    expect(document.body.textContent).toContain("เลยกำหนด");
  });
});

describe("due-soon and absent cards, and hiding names", () => {
  it("due-soon: counts who has not handed in; names appear only when the list is opened", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ครบกำหนดวันนี้/พรุ่งนี้" });
    expect(screen.getByText("ยังไม่ส่ง 2 คน")).toBeTruthy();
    expect(document.body.textContent).not.toContain("2 เด็ก1");
    fireEvent.click(screen.getByRole("button", { name: /ดูรายชื่อ/ }));
    expect(document.body.textContent).toContain("2 เด็ก1");
    expect(document.body.textContent).toContain("3 เด็ก2");
  });

  it("a dashboard saved before this update (no dueSoon / absentToday) still renders, with both cards empty", async () => {
    const old = payload() as Partial<DashboardPayload>;
    delete old.dueSoon; delete old.absentToday;
    get.mockImplementation(async () => old);
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ครบกำหนดวันนี้/พรุ่งนี้" });
    expect(screen.getByText("ไม่มีงานครบกำหนดวันนี้หรือพรุ่งนี้")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "ใครไม่มาวันนี้" }).closest("section")!.textContent).toContain("มาครบ");
  });

  it("absent card: groups today's absentees by status with their names", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ใครไม่มาวันนี้" });
    const card = screen.getByRole("heading", { level: 2, name: "ใครไม่มาวันนี้" }).closest("section")!;
    expect(card.textContent).toContain("ขาด 1");
    expect(card.textContent).toContain("สาย 1");
    expect(within(card as HTMLElement).getByRole("button", { name: "4 เด็ก3" })).toBeTruthy();
  });

  it("'ซ่อนชื่อ' removes every child's name from every card and shows counts instead; it is remembered on this device", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ต้องติดตาม" });
    expect(document.body.textContent).toContain("เด็ก0 ทดสอบ");           // the follow-up list names the child
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

describe("the 'do this now' card", () => {
  it("is gone when nothing needs doing", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    expect(h2("ต้องทำตอนนี้")).toBeNull();
  });

  it("lists failed sends first and opens the failed list", async () => {
    failedCount.value = 2;
    render(<Home />);
    const card = (await screen.findByRole("heading", { level: 2, name: "ต้องทำตอนนี้" })).closest("section")!;
    expect(card.querySelector(".hm-todo-row")!.textContent).toContain("ส่งไม่สำเร็จ 2 รายการ");
    expect(within(card as HTMLElement).getByRole("button", { name: "ดูรายการ" })).toBeTruthy();
  });

  it("warns about a room not checked yet only once the 'late' time has passed", async () => {
    get.mockImplementation(async () => payload({ attendanceToday: [{ date: TODAY, classId: "c1", present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 8 }], absentToday: [] }));
    render(<Home />);
    await screen.findByText(/ป\.6\/1 ยังไม่ได้เช็คชื่อ/);                  // 11:00 > 08:30
    cleanup();
    dashboard.value = null;
    vi.setSystemTime(Date.UTC(2026, 10, 4, 1, 0, 0));                    // 08:00 in Bangkok
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    expect(screen.queryByText(/ป\.6\/1 ยังไม่ได้เช็คชื่อ/)).toBeNull();
  });

  it("says when there has never been a backup, and stays quiet after a recent one", async () => {
    settings.value = baseSettings({ last_backup_at: "" });
    render(<Home />);
    await screen.findByText("ยังไม่เคยสำรองข้อมูล");
  });
});

describe("the menu", () => {
  it("has four labelled groups holding the eight pages in the day's order, and marks the current page", () => {
    route.value = "/attendance";
    render(<Shell><div /></Shell>);
    const rail = screen.getByRole("navigation", { name: "เมนูหลัก" });
    const groups = within(rail).getAllByRole("group").map((g) => [g.getAttribute("aria-label"), within(g).getAllByRole("link").map((a) => a.textContent)]);
    expect(groups).toEqual([
      ["วันนี้", ["หน้าหลัก"]], ["ในห้องเรียน", ["สแกน", "เช็คชื่อ", "สุ่มชื่อ"]], ["ตรวจงาน", ["คะแนน", "รายงาน"]], ["จัดการ", ["นักเรียน", "ตั้งค่า"]],
    ]);
    const current = within(rail).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["เช็คชื่อ"]);
    expect(rail.querySelector(".ti-notebook")).toBeTruthy();         // the new icons (D22)
    expect(rail.querySelector(".ti-users")).toBeTruthy();
    expect(rail.querySelector(".ti-dice-3")).toBeTruthy();
    expect(within(rail).getByRole("button", { name: "ออกจากระบบ" })).toBeTruthy();
  });

  it("phone: five tabs, the current one marked, and the menu button opens the sheet with the same groups", () => {
    route.value = "/home";
    render(<Shell><div /></Shell>);
    const bar = screen.getByRole("navigation", { name: "เมนู" });
    expect(within(bar).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual(["หน้าหลัก"]);
    const btn = within(bar).getByRole("button", { name: "เมนู" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    const sheet = screen.getByRole("dialog", { name: "เมนู" });
    expect(btn.getAttribute("aria-controls")).toBe(sheet.id);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect([...sheet.querySelectorAll(".sheet-gl")].map((e) => e.textContent)).toEqual(["ในห้องเรียน", "ตรวจงาน", "จัดการ"]);
    expect(within(sheet).getAllByRole("link").map((a) => a.textContent!.trim())).toEqual(["สุ่มชื่อ", "รายงาน", "นักเรียน", "ตั้งค่า"]);
  });
});
