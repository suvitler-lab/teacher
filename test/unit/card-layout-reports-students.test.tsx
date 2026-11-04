// Wide-screen card layout on Reports and Students: table/list + cards side by side from a width in rem of the page body, the cards
// stacked (1-2 columns) below that; any order and any subset of cards works; "sum" is pinned first on the students page.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/store", async (orig) => ({ ...(await orig<typeof import("@client/store")>()), loadBootstrap: vi.fn(async () => {}) }));

import { ReportsPage } from "@client/pages/Reports";
import { StudentsPage } from "@client/pages/Students";
import { assignments, classes, currentTermId, selectedTermId, settings, students, subjects, terms, qrRotatedAt } from "@client/store";
import { route } from "@client/router";
import { projectorOn } from "@client/lib/projector";
import { serializeLayout } from "@client/lib/cardLayout";

const kid = (n: number, first: string): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: first, last_name: "สมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const A: Assignment = {
  id: "a1", title: "ใบงานหนึ่ง", term_id: "t1", subject_id: "math", type_id: null, unit: null, full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05",
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const payload = () => ({
  classId: "c1", range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" },
  students: [kid(1, "กนก"), kid(2, "ขวัญ"), kid(3, "คเณศ")], assignments: [A],
  submissions: [{ assignment_id: "a1", student_id: "s1", status: "submitted", score: 9, late: false }],
  attendanceSessions: [{ id: "d1", date: "2026-10-01" }], attendance: [{ session_id: "d1", student_id: "s1", status: "present" }],
});
const baseSettings = (over: Record<string, string> = {}) => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
}) as never;
/** the layout the teacher saved: this order, only these cards on */
const layout = (order: string[], on: string[]) => serializeLayout({ v: 1, order, hidden: order.filter((k) => !on.includes(k)) } as never);

/** every element reports this width in rem (the root font is 16px) */
function boxWidth(rem: number) {
  const w = rem * 16;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: w, height: 100, top: 0, left: 0, right: w, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
}

beforeEach(() => {
  get.mockReset(); get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : payload()));
  route.value = "/reports"; try { localStorage.clear(); } catch { /* ignore */ }
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-01", end_date: "2026-10-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
  students.value = payload().students; assignments.value = [A]; qrRotatedAt.value = {};
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  settings.value = baseSettings(); projectorOn.value = false;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const REPORT_ALL = ["stats", "works", "att", "follow", "hist"];
const STUDENT_ALL = ["sum", "qr", "moved", "recent"];
/** the body measures itself after it is on screen: wait for the width to land */
const settled = (want: "lg" | "stack") => waitFor(() => expect(document.querySelector(".rp-body")!.getAttribute("data-split")).toBe(want));
const classes_ = (el: Element) => [...el.children].map((e) => e.className);

describe("Reports layout", () => {
  it("a wide body (>= 56rem): the table on the left (first in the DOM), the cards in one column on the right", async () => {
    boxWidth(62);
    render(<ReportsPage />);
    await screen.findByText("อัตราการส่งรายงาน");
    await settled("lg");
    const body = document.querySelector(".rp-body")!;
    expect(body.classList.contains("lg")).toBe(true);
    expect(classes_(body)).toEqual(["pg-main", "pg-aside"]);
    expect(body.querySelector(".pg-main table.rp-table")).toBeTruthy();
    expect(body.querySelector(".pg-aside .pg-cols")!.getAttribute("data-n")).toBe("1");
  });

  it("a narrower body: the cards above the table, 1 column under 52rem and 2 columns from it", async () => {
    boxWidth(40);
    const narrow = render(<ReportsPage />);
    await screen.findByText("อัตราการส่งรายงาน");
    let body = document.querySelector(".rp-body")!;
    expect(body.classList.contains("lg")).toBe(false);
    expect(classes_(body)).toEqual(["pg-aside", "pg-main"]);
    await waitFor(() => expect(body.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1"));
    narrow.unmount();
    vi.restoreAllMocks();
    boxWidth(55);
    render(<ReportsPage />);
    await screen.findByText("อัตราการส่งรายงาน");
    body = document.querySelector(".rp-body")!;
    expect(body.classList.contains("lg")).toBe(false);
    await waitFor(() => expect(body.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("2"));
  });

  it("no card on: the table alone in the readable 64rem block, no empty cards box", async () => {
    boxWidth(90);
    settings.value = baseSettings({ reports_cards: layout(REPORT_ALL, []) });
    render(<ReportsPage />);
    await screen.findByRole("table");
    const body = document.querySelector(".rp-body")!;
    expect(body.classList.contains("lg")).toBe(false);
    expect(body.querySelector(".pg-aside")).toBeNull();
    expect(body.querySelector(".pg-cols")).toBeNull();
    expect(body.querySelector(".pg-solo table.rp-table")).toBeTruthy();
  });

  it("one card on: one column (data-n=1) and the table stays beside it", async () => {
    boxWidth(90);
    settings.value = baseSettings({ reports_cards: layout(REPORT_ALL, ["follow"]) });
    render(<ReportsPage />);
    await screen.findByText(/ต้องติดตาม/);
    await settled("lg");
    expect(document.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1");
    expect(document.querySelectorAll(".pg-card").length).toBe(1);
    expect(document.querySelector(".rp-body")!.classList.contains("lg")).toBe(true);
  });

  it("the teacher's order is kept: the first card is top-left, the next goes to the lighter column", async () => {
    boxWidth(55); // stacked, 2 columns
    settings.value = baseSettings({ reports_cards: layout(["works", "follow", "att", "stats", "hist"], ["works", "follow", "att", "stats"]) });
    render(<ReportsPage />);
    await screen.findByText("อัตราการส่งรายงาน");
    await waitFor(() => expect(document.querySelectorAll(".pg-col").length).toBe(2));
    const cols = [...document.querySelectorAll(".pg-col")];
    expect(cols.map((c) => c.querySelectorAll(".pg-card").length)).toEqual([2, 2]); // works 4 | follow 4 | att -> left (tie) | stats -> right
    expect(cols[0].textContent).toContain("อัตราการส่งรายงาน");
    expect(cols[0].textContent).toContain("การมาเรียน");
    expect(cols[1].textContent).toContain("ต้องติดตาม");
    expect(cols[1].querySelector(".rp-stats")).toBeTruthy();
  });

  it("the stats are a card like the others: four tiles in a container-sized grid", async () => {
    boxWidth(62);
    render(<ReportsPage />);
    await screen.findByText("อัตราส่งงาน");
    expect(document.querySelectorAll(".rp-statwrap .rp-stats .rp-stat").length).toBe(4);
    expect(document.querySelector(".pg-aside .pg-card .rp-statwrap")).toBeTruthy();
  });

  it("a page with nothing measured (jsdom: width 0) is stacked: cards above the table, as on a phone", async () => {
    render(<ReportsPage />);
    await screen.findByText("อัตราการส่งรายงาน");
    const body = document.querySelector(".rp-body")!;
    expect(body.classList.contains("lg")).toBe(false);
    await waitFor(() => expect(body.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1"));
  });
});

describe("Students layout", () => {
  const withSum = () => waitFor(() => expect(document.querySelector('[aria-labelledby="sk-sum"]')).toBeTruthy());

  it("a wide body (>= 54rem): list left, every card in the sticky side column (the numbers first)", async () => {
    boxWidth(60);
    render(<StudentsPage />);
    await withSum();
    const grid = document.querySelector(".stu-body > .pg-split")!;
    expect(grid.classList.contains("sm")).toBe(true);
    expect(classes_(grid)).toEqual(["stu-main", "pg-aside sticky"]);
    expect(document.querySelector(".stu-pin")).toBeNull();
    const aside = grid.querySelector(".pg-aside")!;
    expect(aside.getAttribute("role")).toBe("complementary");
    expect(aside.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1");
    expect(aside.querySelector(".pg-card")!.querySelector('[aria-labelledby="sk-sum"]')).toBeTruthy();
    expect(grid.querySelectorAll(".stu-lrow").length).toBe(3);
  });

  it("a narrower body: the numbers pinned above the list, the other cards below it", async () => {
    boxWidth(40);
    render(<StudentsPage />);
    await withSum();
    const body = document.querySelector(".stu-body")!;
    expect(classes_(body)).toEqual(["stu-pin", "pg-split"]);
    expect(body.querySelector(".stu-pin")!.querySelector('[aria-labelledby="sk-sum"]')).toBeTruthy();
    const grid = body.querySelector(".pg-split")!;
    expect(grid.classList.contains("sm")).toBe(false);
    expect(classes_(grid)).toEqual(["stu-main", "pg-aside"]);
    expect(grid.querySelector('[aria-labelledby="sk-sum"]')).toBeNull(); // not twice
    expect(grid.querySelector(".pg-aside")!.textContent).toContain("สติกเกอร์ / QR ใหม่");
  });

  it("'sum' stays first even when the saved order puts another card before it", async () => {
    boxWidth(60);
    settings.value = baseSettings({ students_cards: layout(["qr", "sum", "moved", "recent"], ["qr", "sum"]) });
    render(<StudentsPage />);
    await withSum();
    const cards = [...document.querySelectorAll(".pg-aside .pg-card")];
    expect(cards[0].querySelector('[aria-labelledby="sk-sum"]')).toBeTruthy();
    expect(cards[1].textContent).toContain("สติกเกอร์ / QR ใหม่");
  });

  it("no card on: the list alone, no side column", async () => {
    boxWidth(90);
    settings.value = baseSettings({ students_cards: layout(STUDENT_ALL, []) });
    render(<StudentsPage />);
    await waitFor(() => expect(document.querySelectorAll(".stu-lrow").length).toBe(3));
    const grid = document.querySelector(".stu-body > .pg-split")!;
    expect(grid.classList.contains("sm")).toBe(false);
    expect(grid.querySelector(".pg-aside")).toBeNull();
    expect(document.querySelector(".pg-cols")).toBeNull();
  });

  it("the numbers keep their place while they load (the list does not change width when they arrive)", async () => {
    boxWidth(60);
    let release = () => {};
    get.mockImplementation((p: string) => (p.startsWith("/api/audit") ? Promise.resolve({ rows: [] }) : new Promise((r) => { release = () => r(payload()); })));
    settings.value = baseSettings({ students_cards: layout(STUDENT_ALL, ["sum"]) });
    render(<StudentsPage />);
    await waitFor(() => expect(document.querySelector(".stu-skel")).toBeTruthy());
    expect(document.querySelector(".stu-body > .pg-split")!.classList.contains("sm")).toBe(true);
    release();
    await withSum();
    expect(document.querySelector(".stu-skel")).toBeNull();
    expect(document.querySelector(".stu-body > .pg-split")!.classList.contains("sm")).toBe(true);
  });

  it("'ปรับการ์ด': the line about columns is shown and the arrows of the pinned 'สรุปห้อง' are off", async () => {
    render(<StudentsPage />);
    await withSum();
    fireEvent.click(screen.getByRole("button", { name: "ปรับการ์ด" }));
    expect(await screen.findByText("ใบแรกอยู่บนซ้าย · ใบถัดไปลงคอลัมน์ที่ยังสั้นกว่า")).toBeTruthy();
    expect((screen.getByRole("button", { name: "เลื่อน สรุปห้อง ขึ้น" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เลื่อน สรุปห้อง ลง" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เลื่อน สติกเกอร์ / QR ใหม่ ลง" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
