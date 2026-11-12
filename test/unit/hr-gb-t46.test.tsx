// T-46: the new behaviour of the gradebook page — BR-30 percent, BR-34 first pick, BR-35 way/time, drawer copy text.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
const holder = vi.hoisted(() => ({ cb: null as null | ((r: unknown, op: unknown) => void) }));
vi.mock("@client/lib/outbox", async (orig) => ({
  ...await orig<typeof import("@client/lib/outbox")>(),
  flush: vi.fn(async () => {}),
  onResult: (cb: (r: unknown, op: unknown) => void) => { holder.cb = cb; return () => { holder.cb = null; }; },
}));

import { GradebookPage, defaultSelection } from "@client/pages/Gradebook";
import { followCopyText } from "@client/components/gradebook/GradebookCards";
import { receivedByLine } from "@client/components/CellEditor";
import { classes, currentTermId, selectedTermId, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";
import { pendingOps } from "@client/lib/outbox";
import { bkkToday } from "@shared/time";

const asg = (id: string, full: number, due: string | null, over: Partial<Assignment> = {}): Assignment => ({
  id, title: "งาน " + id, publish_scores: true, term_id: "t1", subject_id: "math", type_id: "w", unit: null,
  full_score: full, assigned_date: "2020-01-01", due_date: due, note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null, ...over,
});
const kid = (id: string, n: number): Student => ({
  id, code: id, qr_token: id, prefix: null, first_name: "เด็ก" + n, last_name: "สมมติ", nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const sub = (a: string, s: string, score: number | null, status = "submitted") => ({ assignment_id: a, student_id: s, status, score, late: false, submitted_at: Date.UTC(2020, 0, 2, 5), method: "camera", updated_at: 0 });

let works: Assignment[], rows: ReturnType<typeof sub>[];
const kids = [kid("k1", 1), kid("k2", 2), kid("k3", 3)];

beforeEach(() => {
  cleanup(); vi.clearAllMocks(); localStorage.clear(); pendingOps.value = new Map();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  workTypes.value = [{ id: "w", name: "ใบงาน", icon: "x", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false }] as any;
  students.value = kids;
  // BR-30 example: W1 /10 · W2 /20 · W3 /15 · W4 /10, all long past due
  works = [asg("w1", 10, "2020-01-05"), asg("w2", 20, "2020-01-06"), asg("w3", 15, "2020-01-07"), asg("w4", 10, "2020-01-08", { status: "closed" })];
  rows = [
    sub("w1", "k1", 9), sub("w2", "k1", 18), sub("w3", "k1", 14), sub("w4", "k1", 8),          // 49/55 → 89%
    sub("w1", "k2", 7.5), sub("w2", "k2", 16), sub("w3", "k2", null, "excused"), sub("w4", "k2", 6), // 29.5/40 → 74%
  ];
  get.mockImplementation(async () => ({ students: kids, assignments: works, submissions: rows }));
});

const totCell = (row: number) => document.querySelectorAll("table.gb tbody tr")[row].querySelector("td.tot-col") as HTMLElement;

describe("BR-30 cumulative + percent", () => {
  it("49/55 shows 89%, 29.5/40 shows 74%, with a spoken form", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    expect(totCell(0).querySelector(".tot-pct")?.textContent).toBe("89%");
    expect(totCell(0).getAttribute("aria-label")).toBe("สะสม 49 จาก 55 · 89 เปอร์เซ็นต์");
    expect(totCell(1).querySelector(".tot-pct")?.textContent).toBe("74%");
    expect(totCell(1).getAttribute("aria-label")).toBe("สะสม 29.5 จาก 40 · 74 เปอร์เซ็นต์");
  });

  it("a full mark of 0 shows 0/0 and NO percent (not 0%)", async () => {
    works = [asg("w1", 10, "2999-01-01")]; rows = [];          // not due yet: nothing counts
    render(<GradebookPage />);
    await screen.findByRole("table");
    expect(totCell(0).querySelector(".tot-pct")).toBeNull();
    expect(totCell(0).getAttribute("aria-label")).toBe("สะสม 0 จาก 0");
    expect(totCell(0).textContent).toBe("0/0");
  });

  it("every work hidden shows ••• and no percent", async () => {
    works = works.map((w) => ({ ...w, publish_scores: false }));
    render(<GradebookPage />);
    await screen.findByRole("table");
    expect(totCell(0).textContent).toBe("•••");
    expect(totCell(0).querySelector(".tot-pct")).toBeNull();
  });
});

describe("BR-34 the work picked on arrival", () => {
  const w = (id: string, status: string) => ({ id, status });
  it("last OPEN work; none open → last work; empty → null", () => {
    expect(defaultSelection([w("a", "open"), w("b", "open"), w("c", "closed")])).toBe("b");
    expect(defaultSelection([w("a", "closed"), w("b", "closed")])).toBe("b");
    expect(defaultSelection([])).toBeNull();
    expect(defaultSelection([w("a", "open")])).toBe("a");
  });
  it("the page opens on W3 (W4 is closed) and a link ?asg= wins", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    await waitFor(() => expect(document.querySelector("th.sel")?.getAttribute("data-aid")).toBe("w3"));
    cleanup();
    route.value = "/gradebook?class=c1&subject=math&asg=w1";
    render(<GradebookPage />);
    await waitFor(() => expect(document.querySelector("th.sel")?.getAttribute("data-aid")).toBe("w1"));
  });
});

describe("BR-35 way + last edit", () => {
  it("maps the methods to words", () => {
    const t = Date.UTC(2026, 10, 11, 7, 2); // 14:02 Bangkok
    const today = "2026-11-11";
    expect(receivedByLine("grid", t, today)).toBe("รับด้วย: กรอก · แก้ล่าสุด 14:02");
    expect(receivedByLine("manual", t, today)).toContain("กรอก");
    expect(receivedByLine("camera", t, today)).toContain("สแกน");
    expect(receivedByLine("hid", t, today)).toContain("สแกน");
    expect(receivedByLine("bulk", t, today)).toContain("ทั้งห้อง");
    expect(receivedByLine("import", t, today)).toContain("นำเข้า");
    expect(receivedByLine("restore", t, today)).toContain("กู้คืน");
    expect(receivedByLine(null, t, today)).toContain("รับด้วย: –");
    expect(receivedByLine("grid", t, "2026-11-12")).toMatch(/แก้ล่าสุด .+ 14:02$/); // another day carries its date
    expect(receivedByLine("grid", null, today)).toBe("รับด้วย: กรอก");
  });

  it("keeps the way and the time after the queue delivers a typed score (R-4601)", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    const t = Date.UTC(Number(bkkToday().slice(0, 4)), Number(bkkToday().slice(5, 7)) - 1, Number(bkkToday().slice(8, 10)), 7, 2);
    act(() => holder.cb!({ result: "ok", opId: "o", submission: { assignment_id: "w1", student_id: "k1", status: "submitted", score: 7.5, late: false, submitted_at: Date.UTC(2020, 0, 2, 5), method: "grid", updated_at: t } },
      { assignmentId: "w1", studentId: "k1" }));
    const cell = document.querySelector('td[data-aid="w1"][data-sid="k1"]') as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "Enter", altKey: true });
    expect(await screen.findByText("รับด้วย: กรอก · แก้ล่าสุด 14:02")).toBeTruthy();
  });
});

describe("BR-36 copied list", () => {
  it("first line names room and subject, then one line per child, not cut at 8", () => {
    expect(followCopyText("ป.6/1 · คณิตศาสตร์ · ค้างส่ง", [{ number: 5, name: "กานดา เพชรดี", n: 2 }, { number: 8, name: "ธีรา จันทร์เพ็ญ", n: 2 }]))
      .toBe("ป.6/1 · คณิตศาสตร์ · ค้างส่ง\n5 กานดา เพชรดี (ค้าง 2)\n8 ธีรา จันทร์เพ็ญ (ค้าง 2)");
    const many = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, name: "ก", n: 1 }));
    expect(followCopyText("h", many).split("\n").length).toBe(13);
  });
});
