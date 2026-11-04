// ui-redesign (fix round): the home page's loading / empty / error states, the scan button rules, the save toast and the sign-out dialog.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
const { ok } = vi.hoisted(() => ({ ok: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok, err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => null }));

import { Home } from "@client/pages/Home";
import { Shell } from "@client/components/Shell";
import { HomeError } from "@client/components/home/States";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms } from "@client/store";
import { route } from "@client/router";
import { dashboard } from "@client/lib/dashboard";
import { failedCount } from "@client/lib/outbox";
import { setHideNames } from "@client/lib/homePrefs";
import type { DashboardPayload, Settings } from "@shared/types";
import { asg, kid } from "./m1-05-fixture";

const NOW = Date.UTC(2026, 10, 4, 4, 0, 0);
const TODAY = "2026-11-04";
const baseSettings = (): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(NOW - 2 * 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
});
// 10 children, 6 handed in, 2 excused, 0 missing, 2 simply not yet (open work, nothing overdue)
function payload(per: Partial<DashboardPayload["openAssignments"][0]["perClass"][0]> = {}): DashboardPayload {
  return {
    date: TODAY, termId: "t1", gradingAssignments: [], awaitingCount: 0, missingCount: 0, serverTime: 0,
    openAssignments: [{ assignment: asg("a1", "2099-12-31", "ใบงานใหม่"), perClass: [{ classId: "c1", total: 10, submitted: 6, scored: 6, awaiting: 0, late: 0, missing: 0, excused: 2, ...per }] }],
    attendanceToday: [{ date: TODAY, classId: "c1", present: 6, late: 1, leave: 0, sick: 0, absent: 1, marked: 8, total: 8 }],
    followUp: [], dueSoon: [], absentToday: [],
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

describe("loading and empty states", () => {
  it("while the dashboard loads: the quick actions are there, grey blocks stand in for numbers, and the words wait", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<Home />);
    expect(screen.getByRole("link", { name: /สแกนส่งงาน/ })).toBeTruthy();
    expect(container.querySelectorAll(".hm-stats .uc-stat .hm-skel").length).toBeGreaterThan(4);
    expect(container.querySelector(".hm-slow")).toBeNull();                        // not before three seconds
    expect(container.querySelector("[aria-busy=true] .sr-only")!.textContent).toBe("กำลังโหลดหน้าหลัก…");
  });

  it("after three seconds the loading words are shown", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<Home />);
    await act(async () => { vi.advanceTimersByTime(3100); });
    expect(container.querySelector(".hm-slow")!.textContent).toBe("กำลังโหลดหน้าหลัก…");
  });

  it("no classes: one card that says so and goes to the class set-up; the quick actions stay", async () => {
    classes.value = [];
    render(<Home />);
    expect(screen.getByText("ยังไม่มีห้องเรียน")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ตั้งค่าห้องเรียน/ }));
    expect(window.location.hash).toBe("#/settings?section=catalog");
    expect(screen.getByRole("link", { name: /สแกนส่งงาน/ })).toBeTruthy();
    expect(document.querySelector(".hm-stats")).toBeNull();
  });

  it("classes but nobody in them: 'ยังไม่มีนักเรียนในห้อง' with the import button", async () => {
    students.value = [];
    get.mockImplementation(async () => ({ ...payload(), openAssignments: [], attendanceToday: [{ date: TODAY, classId: "c1", present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 0 }] }));
    render(<Home />);
    await screen.findByText("ยังไม่มีนักเรียนในห้อง");
    fireEvent.click(screen.getByRole("button", { name: /นำเข้านักเรียน/ }));
    expect(window.location.hash).toBe("#/students");
  });

  it("offline with nothing cached says scanning and roll call still work; online failure says it plainly; both can retry", () => {
    const retry = vi.fn();
    const { rerender } = render(<HomeError online={false} onRetry={retry} />);
    expect(screen.getByText(/สแกนและเช็คชื่อยังใช้ได้/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ลองอีกครั้ง/ }));
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(<HomeError online={true} onRetry={retry} />);
    expect(screen.getByText("โหลดข้อมูลหน้าหลักไม่สำเร็จ")).toBeTruthy();
    expect(document.querySelector(".ti-cloud-x")).toBeTruthy();
  });
});

describe("the scan button on the work card", () => {
  it("is offered for open work with children who have not handed in, even when nothing is overdue", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    expect(within(document.querySelector(".hm-prog") as HTMLElement).getByRole("button", { name: /สแกนห้องนี้/ })).toBeTruthy();
  });

  it("is offered when children are overdue even if the counts leave no one 'not yet'", async () => {
    get.mockImplementation(async () => payload({ submitted: 8, scored: 8, missing: 2 }));
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    expect(within(document.querySelector(".hm-prog") as HTMLElement).getByRole("button", { name: /สแกนห้องนี้/ })).toBeTruthy();
  });

  it("is not offered when the page shows an earlier year", async () => {
    terms.value = [
      { id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 },
      { id: "t0", year: 2568, term: 2, name: "2/2568", is_current: false, start_date: "2025-11-01", end_date: "2026-03-31", updated_at: 0 },
    ];
    classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: true, year: 2568, updated_at: 0 }];
    selectedTermId.value = "t0";
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    expect(screen.queryByRole("button", { name: /สแกนห้องนี้/ })).toBeNull();
  });
});

describe("saving, progress bars, sign-out", () => {
  it("tells the teacher a card change was saved for every device", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: "ปรับหน้าหลัก" });
    fireEvent.click(within(dlg).getByRole("switch", { name: "แสดงการ์ด ห้องของฉัน" }));
    await waitFor(() => expect(ok).toHaveBeenCalledWith("บันทึกแล้ว · ใช้ทุกเครื่อง"));
  });

  it("the bar of a class row is a progressbar with words", async () => {
    render(<Home />);
    await screen.findByRole("heading", { level: 2, name: "งานที่กำลังเก็บ" });
    const bar = screen.getByRole("progressbar", { name: /ป\.6\/1 ส่งแล้ว 6\/8/ });
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
  });

  it("signing out with work waiting asks in a dialog (not window.confirm) and stays when the answer is no", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { attDrafts } = await import("@client/lib/attSync");
    const { pendingCount } = await import("@client/lib/outbox");
    pendingCount.value = 3;
    render(<Shell><div /></Shell>);
    fireEvent.click(screen.getAllByRole("button", { name: "ออกจากระบบ" })[0]);
    const dlg = await screen.findByRole("alertdialog", { name: "ออกจากระบบเลยไหม?" });
    expect(dlg.textContent).toContain("คะแนน/การส่งงานรอส่ง 3 รายการ");
    fireEvent.click(within(dlg).getByRole("button", { name: "อยู่ต่อ" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "ออกจากระบบเลยไหม?" })).toBeNull());
    expect(confirmSpy).not.toHaveBeenCalled();
    pendingCount.value = 0;
    void attDrafts;
  });
});
