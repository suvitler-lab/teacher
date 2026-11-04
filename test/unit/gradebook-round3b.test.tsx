// ui-redesign round 3 (gradebook), the parts "as designed": the work panel, the keyboard grid (roving tabindex, arrows,
// a digit starts the input), the filter's reset, undo toast for every whole-class action, and the cell editor's
// warnings / unknown received day.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, enqueue, notify } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enqueue: vi.fn(), notify: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), enqueueSubmission: enqueue }));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify, withToast: vi.fn(async (fn: () => Promise<unknown>) => { await fn(); return true; }) }));

import { GradebookPage } from "@client/pages/Gradebook";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { pendingOps, failedPairKeys } from "@client/lib/outbox";
import { route } from "@client/router";
import { shouldClose, daysLate } from "@client/components/gradebook/GradebookCards";
import { quickScores, dateLine } from "@client/components/CellEditor";

const work: Assignment = {
  id: "a1", title: "ใบงานเศษส่วน", term_id: "t1", subject_id: "math", type_id: null, unit: null,
  full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05", note: null, publish_scores: true,
  status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const roster: Student[] = [1, 2, 3].map((n) => ({
  id: `st${n}`, code: `00${n}`, qr_token: `token${n}`, prefix: null, first_name: `เด็ก${n}`, last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = roster;
  assignments.value = [work];
  pendingOps.value = new Map(); failedPairKeys.value = new Set();
  get.mockResolvedValue({
    students: roster, assignments: [work],
    submissions: [
      { assignment_id: "a1", student_id: "st1", status: "submitted", score: 8, late: false, submitted_at: Date.UTC(2020, 0, 2, 5) },
      { assignment_id: "a1", student_id: "st2", status: "excused", score: null, late: false, submitted_at: null },
    ],
  });
  post.mockResolvedValue({ assignment: work });
  enqueue.mockResolvedValue(undefined);
});

const cell = (n: number) => document.querySelector(`td[data-sid="st${n}"]`) as HTMLElement;
async function open() { render(<GradebookPage />); await screen.findByRole("columnheader", { name: /ใบงานเศษส่วน/ }); }

describe("the work panel", () => {
  it("is one labelled section: name, full score, due chip, the counts and the buttons", async () => {
    await open();
    const p = screen.getByRole("region", { name: "งานที่เลือก" });
    expect(p.textContent).toContain("ใบงานเศษส่วน");
    expect(p.textContent).toContain("เต็ม 10");
    expect(p.textContent).toContain("เลยกำหนด");
    expect(p.textContent).toContain("ส่งแล้ว 1/2 (50%)"); // st1 handed in; st2 is excused and left out; st3 is missing
    expect(p.textContent).toContain("ค้าง 1");
    for (const name of ["ทำทั้งห้อง", "ปิดรับงาน", "ซ่อนคะแนนบนจอ", "จัดการงาน"]) expect(within(p).getByRole("button", { name: new RegExp(name) })).toBeTruthy();
    expect(within(p).getByRole("button", { name: "จัดการงาน" }).getAttribute("aria-haspopup")).toBe("menu");
  });
});

describe("keyboard on the grid", () => {
  it("only one cell is in the Tab order; the arrows move it", async () => {
    await open();
    const stops = () => [...document.querySelectorAll("td.cell")].filter((c) => (c as HTMLElement).tabIndex === 0);
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toBe(cell(1));
    cell(1).focus();
    fireEvent.keyDown(cell(1), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell(2));
    await waitFor(() => expect(stops()).toEqual([cell(2)]));
    fireEvent.keyDown(cell(2), { key: "End" });
    fireEvent.keyDown(cell(2), { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell(1));
  });

  it("a digit on a focused cell opens the quick input with that digit; on an excused cell it opens the editor instead", async () => {
    await open();
    cell(3).focus();
    fireEvent.keyDown(cell(3), { key: "7" });
    const input = await waitFor(() => { const i = document.querySelector(".cell-input") as HTMLInputElement; expect(i).toBeTruthy(); return i; });
    expect(input.value).toBe("7");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".cell-input")).toBeNull());
    fireEvent.keyDown(cell(2), { key: "5" });
    expect(await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก2/ })).toBeTruthy();
    expect(document.querySelector(".cell-input")).toBeNull();
  });

  it("every cell says its state, not only its score", async () => {
    await open();
    expect(cell(1).getAttribute("aria-label")).toContain("8");
    expect(cell(2).getAttribute("aria-label")).toContain("ยกเว้น");
    expect(cell(3).getAttribute("aria-label")).toContain("ค้างส่ง");
  });
});

describe("the filter panel", () => {
  it("has a reset that puts the defaults back", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /^ตัวกรอง/ }));
    const panel = await screen.findByLabelText("ตัวกรองสมุดคะแนน");
    fireEvent.click(within(panel).getByRole("button", { name: "ตามประเภท" }));
    expect(screen.getByRole("button", { name: /^ตัวกรอง \(1\)/ })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: /คืนค่า/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^ตัวกรอง$/ })).toBeTruthy());
  });
});

describe("whole-class actions offer undo", () => {
  it("the whole class handed in names the day and keeps a ย้อนกลับ toast", async () => {
    post.mockResolvedValue({ changed: 1, batchId: "b1" });
    await open();
    fireEvent.click(document.querySelector("[data-bulk-trigger]") as HTMLElement);
    fireEvent.click(await screen.findByRole("menuitem", { name: /ทั้งห้องส่งแล้ว/ }));
    const d = await screen.findByRole("dialog", { name: /ทั้งห้องส่งแล้ว/ });
    expect(d.textContent).toContain("→ ส่งช้า"); // today is long after the 2020 due day
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: /ส่งแล้ว 1 คน/ })); });
    await waitFor(() => expect(notify.mock.calls.some((c) => c[2]?.action?.label === "ย้อนกลับ" && /ทั้งห้องส่งแล้ว 1 คน/.test(c[1]))).toBe(true));
  });

  it("a closed work cannot be handed in for the whole class", async () => {
    const closed = { ...work, status: "closed" as const };
    get.mockResolvedValue({ students: roster, assignments: [closed], submissions: [] });
    assignments.value = [closed];
    await open();
    fireEvent.click(document.querySelector("[data-bulk-trigger]") as HTMLElement);
    expect((await screen.findByRole("menuitem", { name: /ทั้งห้องส่งแล้ว/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a hand-in whose day is unknown", () => {
  it("is not stamped with today when only the score changes", async () => {
    get.mockResolvedValue({ students: roster, assignments: [work], submissions: [{ assignment_id: "a1", student_id: "st1", status: "submitted", score: 8, late: false, submitted_at: null }] });
    await open();
    fireEvent.click(cell(1));
    fireEvent.click(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก1/ });
    expect(d.textContent).toContain("ไม่ทราบวันที่รับ");
    fireEvent.input(within(d).getByRole("textbox", { name: "คะแนน" }), { target: { value: "9" } });
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "บันทึก" })); });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({ status: "submitted", score: 9 });
    expect(enqueue.mock.calls[0][0].dateOnly).toBeUndefined();
    expect(enqueue.mock.calls[0][0].receivedDate).toBeUndefined();
  });
});

describe("the cell editor", () => {
  it("is a radiogroup, warns before a score is cleared, and offers quick scores", async () => {
    await open();
    fireEvent.click(cell(1));
    fireEvent.click(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก1/ });
    expect(within(d).getByRole("radiogroup")).toBeTruthy();
    expect(within(d).getByRole("group", { name: "คะแนนลัด" })).toBeTruthy();
    fireEvent.click(within(d).getByRole("radio", { name: "ยังไม่ส่ง" }));
    expect(d.textContent).toContain("คะแนน 8 จะถูกล้าง");
  });
  it("tells a child going from excused to handed in", async () => {
    await open();
    fireEvent.click(cell(2));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก2/ });
    fireEvent.click(within(d).getByRole("radio", { name: "ส่งแล้ว" }));
    expect(d.textContent).toContain("จะเปลี่ยนจากยกเว้นเป็นส่งแล้ว");
  });
  it("quickScores gives full, full−1, full−2 and half, each once", () => {
    expect(quickScores(10)).toEqual([10, 9, 8, 5]);
    expect(quickScores(2)).toEqual([2, 1, 0]);
    expect(dateLine("2020-01-08", "2020-01-05", "2026-11-04")).toBe("ส่งช้า 3 วัน · รับ 8 ม.ค. 2563");
  });
});

describe("cards", () => {
  it("'ควรปิดรับ' also takes a work everyone has handed in", () => {
    const o = { ...work, due_date: "2999-01-01" };
    expect(shouldClose([o], "2026-11-04").length).toBe(0);
    expect(shouldClose([o], "2026-11-04", () => true).length).toBe(1);
    expect(daysLate("2026-11-01", "2026-11-04")).toBe(3);
    expect(daysLate("2999-01-01", "2026-11-04")).toBe(0);
  });
});
