// T-33: Home picks the layout from the look (appearance), keeps each layout's cards apart, and the shared states work in every layout.
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
import type { DashboardPayload, Settings } from "@shared/types";
import { asg, kid } from "./m1-05-fixture";

const NOW = Date.UTC(2026, 10, 4, 4, 0, 0);
const TODAY = "2026-11-04";
const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(NOW - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});
const payload = (): DashboardPayload => ({
  date: TODAY, termId: "t1", gradingAssignments: [], awaitingCount: 1, missingCount: 2, serverTime: 0,
  openAssignments: [{ assignment: asg("a1", "2000-01-01", "ใบงานเก่า"), perClass: [{ classId: "c1", total: 10, submitted: 6, scored: 5, awaiting: 1, late: 1, missing: 2, excused: 2 }] }],
  attendanceToday: [{ date: TODAY, classId: "c1", present: 6, late: 1, leave: 0, sick: 0, absent: 1, marked: 8, total: 8 }],
  followUp: [{ studentId: "s0", classId: "c1", missing: 2 }], dueSoon: [], absentToday: [],
});

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
  settings.value = base();
  dashboard.value = null;
  setHideNames(false);
  resetAppearanceForTests();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const pick = (layout: "a" | "b" | "c") => act(async () => { await saveAppearance({ layout }, { silent: true }); });

describe("the shared home page", () => {
  it("the top bar has the term picker, hide-names (aria-pressed) and the adjust chip, in every layout", async () => {
    for (const layout of ["a", "b", "c"] as const) {
      await pick(layout);
      const { unmount } = render(<Home />);
      await screen.findByRole("heading", { level: 1 });
      expect(document.querySelector(`.hm[data-hm-layout=${layout}]`)).not.toBeNull();
      expect(screen.getByRole("button", { name: "ปรับหน้าหลัก" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByLabelText("ภาคเรียนที่แสดง")).toBeTruthy();
      unmount();
    }
  });

  it("the drawer follows the layout: ข lists two cards, and choosing ค in it changes the page at once", async () => {
    await pick("b");
    render(<Home />);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: "ปรับหน้าหลัก · โครง ข แผงรายห้อง" });
    expect(within(dlg).getAllByRole("switch")).toHaveLength(2);
    expect(dlg.textContent).toContain("ปิดไม่ได้: ปุ่มลัด · แถบต้องทำ · แผงห้อง");
    fireEvent.click(within(dlg).getByRole("radio", { name: /โครง ค/ }));
    await screen.findByRole("dialog", { name: "ปรับหน้าหลัก · โครง ค โฟกัสงานถัดไป" });
    expect(document.querySelector(".hm[data-hm-layout=c]")).not.toBeNull();
  });

  it("each layout keeps its own cards: hide one in ก, switch to ค, it is still shown there", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ต้องติดตาม" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: /โครง ก/ });
    fireEvent.click(within(dlg).getByRole("switch", { name: "แสดงการ์ด ต้องติดตาม" }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "ต้องติดตาม" })).toBeNull());
    fireEvent.click(within(dlg).getByRole("radio", { name: /โครง ค/ }));
    await screen.findByRole("heading", { level: 2, name: "ต้องติดตาม" });
    fireEvent.click(within(await screen.findByRole("dialog", { name: /โครง ค/ })).getByRole("radio", { name: /โครง ก/ }));
    await screen.findByRole("dialog", { name: /โครง ก/ });
    await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "ต้องติดตาม" })).toBeNull());
  });

  it("while loading, the skeleton has the layout's shape and the quick buttons are real", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    for (const layout of ["a", "b", "c"] as const) {
      await pick(layout);
      const { unmount, container } = render(<Home />);
      expect(container.querySelector(`.hm-skel-${layout}`)).not.toBeNull();
      expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
      expect(screen.getByRole("link", { name: /สแกนส่งงาน/ })).toBeTruthy();
      unmount();
    }
  });
});

import { copyDueToLine } from "@client/components/home/today";
import { buildHomeModel } from "@client/components/home/model";
import { dueGroups } from "@client/lib/homeLogic";
import { layoutCardsOf } from "@client/lib/homeLayout";
import { serializeHomeCards, toggleCard, defaultHomeCards } from "@client/lib/homeCards";

describe("review fixes (R-3301..R-3306)", () => {
  it("R-3301: copy to LINE is per room: 5 lines for ป.6/1 only, no name of the other room", async () => {
    classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }, { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, archived: false, year: 2569, updated_at: 0 }];
    students.value = [0, 1, 2, 3, 4].map(kid).map((s, i) => ({ ...s, class_id: "c1", id: "a" + i })).concat([0, 1, 2, 3, 4, 5, 6, 7, 8].map(kid).map((s, i) => ({ ...s, class_id: "c2", id: "b" + i, first_name: "อีกห้อง" + i })));
    const d = { ...payload(), openAssignments: [{ assignment: asg("w1", TODAY, "ใบงานเศษส่วน"), perClass: [] }], dueSoon: [{ assignmentId: "w1", classId: "c1", studentIds: ["a0", "a1", "a2", "a3", "a4"] }, { assignmentId: "w1", classId: "c2", studentIds: ["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"] }] };
    const g = dueGroups(d, TODAY)[0];
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: write }, onLine: true });
    copyDueToLine(g, "c1");
    const text: string = write.mock.calls[0][0];
    expect(text).not.toContain("อีกห้อง");
    expect(text.split("\n").filter((l) => /^\d+\./.test(l.trim()))).toHaveLength(5);
    expect(text).toContain("ป.6/1");
  });

  it("R-3303: an old offline copy without dueSoon / absentToday gives arrays in the model; hide drops the copy buttons", () => {
    const old = payload() as Partial<DashboardPayload>; delete old.dueSoon; delete old.absentToday;
    const m = buildHomeModel(old as DashboardPayload, [], true);
    expect(m.d.absentToday).toEqual([]); expect(m.d.dueSoon).toEqual([]);
    expect(m.rooms[0].absent).toEqual([]);
    expect(m.todo.every((r) => !r.secondary)).toBe(true);
  });

  it("R-3304: a card hidden in the old app stays hidden in ก and ค (same name); a layout never set otherwise gets its defaults", () => {
    settings.value = base({ home_cards: serializeHomeCards(toggleCard(toggleCard(defaultHomeCards(), "follow"), "att")) });
    expect(layoutCardsOf("a").hidden).toContain("follow");
    expect(layoutCardsOf("c").hidden).toEqual(expect.arrayContaining(["follow", "att"]));
    expect(layoutCardsOf("b").hidden).toEqual(["follow"]);
    settings.value = base({ home_cards: "" });
    expect(layoutCardsOf("c").hidden).toEqual([]);
  });

  it("R-3306: the arrow at the end of the list stays focusable (aria-disabled) and does nothing", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "ความคืบหน้ารายห้อง" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: /โครง ก/ });
    const up = within(dlg).getByRole("button", { name: "เลื่อน ความคืบหน้ารายห้อง ขึ้น" });
    expect(up.hasAttribute("disabled")).toBe(false);
    expect(up.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(up);
    expect(put).not.toHaveBeenCalled();
  });
});
