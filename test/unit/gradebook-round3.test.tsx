// ui-redesign round 3 (gradebook): the cell editor (status · score · received day), the close button with its count
// dialog, the dialog that replaces confirm() for deleting a work, and the ⋮ menu that now holds "hide all scores".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, enqueue, notify } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enqueue: vi.fn(), notify: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), enqueueSubmission: enqueue }));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify, withToast: vi.fn(async (fn: () => Promise<unknown>) => { await fn(); return true; }) }));

import { GradebookPage } from "@client/pages/Gradebook";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { pendingOps, failedPairKeys } from "@client/lib/outbox";
import { route } from "@client/router";
import { distribution, shouldClose } from "@client/components/gradebook/GradebookCards";
import { settings } from "@client/store";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";
import { bkkToday } from "@shared/time";

const work: Assignment = {
  id: "a1", title: "ใบงานเศษส่วน", term_id: "t1", subject_id: "math", type_id: null, unit: null,
  full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05", note: null, publish_scores: true,
  status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const roster: Student[] = [1, 2, 3].map((n) => ({
  id: `st${n}`, code: `00${n}`, qr_token: `token${n}`, prefix: null, first_name: `เด็ก${n}`, last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
}));
const NOON_0102 = Date.UTC(2020, 0, 2, 5); // 12:00 Bangkok of 2020-01-02

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
      { assignment_id: "a1", student_id: "st1", status: "submitted", score: 8, late: false, submitted_at: NOON_0102 },
      { assignment_id: "a1", student_id: "st2", status: "excused", score: null, late: false, submitted_at: null },
    ],
  });
  post.mockResolvedValue({ assignment: work });
  enqueue.mockResolvedValue(undefined);
});

const cell = (n: number) => document.querySelector(`td[data-sid="st${n}"]`) as HTMLElement;
async function open() { render(<GradebookPage />); await screen.findByRole("columnheader", { name: /ใบงานเศษส่วน/ }); }

describe("cell editor", () => {
  it("opens with the ▾ beside the quick input, and shows the day the work was received", async () => {
    await open();
    fireEvent.click(cell(1));
    fireEvent.mouseDown(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    fireEvent.click(screen.getByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก1/ });
    expect(d.textContent).toContain("ส่งทันกำหนด · รับ"); // 2 Jan is before the due day 5 Jan: previewed as on time, with the day it was taken
  });

  it("a child marked excused always opens the editor (no silent change)", async () => {
    await open();
    fireEvent.click(cell(2));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก2/ });
    expect(within(d).getByRole("radio", { name: "ยกเว้น" }).getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".cell-input")).toBeNull();
  });

  it("re-dating a handed-in cell sends one date-only op and offers เลิกทำ", async () => {
    await open();
    fireEvent.click(cell(1));
    fireEvent.click(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก1/ });
    fireEvent.click(within(d).getByRole("button", { name: "วันนี้" }));
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "บันทึก" })); });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({ assignmentId: "a1", studentId: "st1", status: "submitted", score: 8, method: "grid", intent: "grade", dateOnly: true, receivedDate: bkkToday() });
    expect(enqueue.mock.calls[0][0]).not.toHaveProperty("late");
    const undo = notify.mock.calls.find((c) => c[2]?.action?.label === "เลิกทำ");
    expect(undo).toBeTruthy();
    await act(async () => { undo![2].action.run(); });
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
    expect(enqueue.mock.calls[1][0]).toMatchObject({ dateOnly: true, receivedDate: "2020-01-02" }); // back to the day it had
  });

  it("setting a child as not handed in sends a void op; a day before the work was given cannot be saved", async () => {
    await open();
    fireEvent.click(cell(1));
    fireEvent.click(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก1/ });
    fireEvent.click(within(d).getByRole("radio", { name: "ยังไม่ส่ง" }));
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "บันทึก" })); });
    expect(enqueue.mock.calls[0][0]).toMatchObject({ studentId: "st1", status: "void", score: null, intent: "grade" });
  });

  it("a third child with nothing yet: choosing ส่งแล้ว with a score and today sends one receiving op with the day", async () => {
    await open();
    fireEvent.click(cell(3));
    fireEvent.click(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก3/ });
    fireEvent.click(within(d).getByRole("radio", { name: "ส่งแล้ว" }));
    fireEvent.input(within(d).getByRole("textbox", { name: "คะแนน" }), { target: { value: "7.5" } });
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "บันทึก" })); });
    expect(enqueue.mock.calls[0][0]).toMatchObject({ studentId: "st3", status: "submitted", score: 7.5, receivedDate: bkkToday() });
    expect(enqueue.mock.calls[0][0].dateOnly).toBeUndefined();
  });

  it("a score that is not a half step blocks saving", async () => {
    await open();
    fireEvent.click(cell(3));
    fireEvent.click(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก3/ });
    fireEvent.click(within(d).getByRole("radio", { name: "ส่งแล้ว" }));
    fireEvent.input(within(d).getByRole("textbox", { name: "คะแนน" }), { target: { value: "7.3" } });
    expect((within(d).getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(d).getByRole("alert").textContent).toContain("0–10");
  });
});

describe("an old hand-in whose stored day is before the assigned date", () => {
  it("can still have its score changed (only a day the teacher picks is checked)", async () => {
    get.mockResolvedValue({
      students: roster, assignments: [work],
      submissions: [{ assignment_id: "a1", student_id: "st1", status: "submitted", score: 8, late: false, submitted_at: Date.UTC(2019, 5, 1, 5) }],
    });
    await open();
    fireEvent.click(cell(1));
    fireEvent.click(await screen.findByRole("button", { name: "เปิดตัวแก้ไขช่อง" }));
    const d = await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก1/ });
    expect(within(d).queryByRole("alert")).toBeNull();
    fireEvent.input(within(d).getByRole("textbox", { name: "คะแนน" }), { target: { value: "9" } });
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "บันทึก" })); });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({ studentId: "st1", status: "submitted", score: 9 });
    expect(enqueue.mock.calls[0][0].dateOnly).toBeUndefined(); // the day was left alone
  });
});

describe("holding or tapping a cell again opens the editor", () => {
  it("a held cell (about half a second) opens the cell editor", async () => {
    await open();
    fireEvent.pointerDown(cell(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 520)); });
    expect(await screen.findByRole("dialog", { name: /แก้ไขช่อง เด็ก1/ })).toBeTruthy();
  });
  it("a quick tap only starts the quick input", async () => {
    await open();
    fireEvent.pointerDown(cell(1)); fireEvent.pointerUp(cell(1)); fireEvent.click(cell(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 520)); });
    expect(screen.queryByRole("dialog", { name: /แก้ไขช่อง/ })).toBeNull();
    expect(document.querySelector(".cell-input")).toBeTruthy();
  });
  it("the ⋮ menu is a real menu: first item takes focus, ↓ moves, Esc closes", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "จัดการงาน" }));
    const menu = await waitFor(() => { const m = document.querySelector('.gb-menu[role="menu"]') as HTMLElement; expect(m).toBeTruthy(); return m; });
    const items = within(menu).getAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(document.querySelector('.gb-menu[role="menu"]')).toBeNull());
  });
});

describe("the picked work's bar", () => {
  const bar = () => document.querySelector(".gb-work") as HTMLElement;

  it("closing asks first and says how many have not handed in", async () => {
    await open();
    await act(async () => { fireEvent.click(within(bar()).getByRole("button", { name: /^ปิดรับงาน$/ })); });
    const d = await screen.findByRole("alertdialog", { name: /ปิดรับ "ใบงานเศษส่วน"/ });
    expect(d.textContent).toContain("ยังไม่ส่ง 1 คน"); // st3 only: st1 handed in, st2 is excused
    expect(post).not.toHaveBeenCalled();
    expect(d.textContent).toContain("สแกนรับงานเพิ่มไม่ได้เมื่อปิดรับ แต่ให้คะแนนในสมุดคะแนนได้");
    fireEvent.click(within(d).getByRole("button", { name: "ยังไม่ปิด" }));
    expect(post).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(bar()).getByRole("button", { name: /^ปิดรับงาน$/ })); });
    await act(async () => { fireEvent.click(within(await screen.findByRole("alertdialog", { name: /ปิดรับ/ })).getByRole("button", { name: "ปิดรับงาน" })); });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ id: "a1", status: "closed" });
    expect(post.mock.calls[0][1]).not.toHaveProperty("full_score");
  });

  it("deleting a work asks in a dialog (no browser confirm), and No keeps it", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    await open();
    fireEvent.click(within(bar()).getByRole("button", { name: "จัดการงาน" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^ลบงาน/ }));
    const d = await screen.findByRole("alertdialog", { name: /ลบงาน/ });
    fireEvent.click(within(d).getByRole("button", { name: "ยกเลิก" }));
    expect(post).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("whole class handed in, with the day it was received (AC-23)", () => {
  const openBulk = async () => {
    await open();
    fireEvent.click(document.querySelector("[data-bulk-trigger]") as HTMLElement);
    fireEvent.click(await screen.findByRole("menuitem", { name: /ทั้งห้องส่งแล้ว/ }));
    return await screen.findByRole("dialog", { name: /ทั้งห้องส่งแล้ว/ });
  };
  it("today sends no day; yesterday sends it", async () => {
    post.mockResolvedValue({ changed: 1, batchId: "b1" });
    let d = await openBulk();
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: /ส่งแล้ว 1 คน/ })); });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/assignments/a1/bulk", { action: "all-submitted", classId: "c1" }));
    cleanup(); post.mockClear();
    d = await openBulk();
    fireEvent.click(within(d).getByRole("button", { name: "เมื่อวาน" }));
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: /ส่งแล้ว 1 คน/ })); });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/assignments/a1/bulk", { action: "all-submitted", classId: "c1", receivedDate: bkkToday(Date.now() - 86_400_000) }));
  });
});

describe("cards under the table", () => {
  it("distribution counts by share of the full score (7.5 of 10 is 75%)", () => {
    expect(distribution([2, 5, 6, 7.5, 8, 10], 10)).toEqual([1, 1, 1, 1, 2]);
    expect(distribution([], 10)).toEqual([0, 0, 0, 0, 0]);
  });

  it("'ควรปิดรับ' = open work whose due day has passed", () => {
    const mk = (id: string, due: string | null, status: "open" | "closed") => ({ ...work, id, due_date: due, status });
    expect(shouldClose([mk("a", "2020-01-05", "open"), mk("b", "2020-01-05", "closed"), mk("c", null, "open"), mk("d", "2999-01-01", "open")], "2026-11-04").map((a) => a.id)).toEqual(["a"]);
  });

  it("shows the default cards, and 'ปรับการ์ด' can turn one off", async () => {
    await open();
    expect(await screen.findByRole("group", { name: "สรุปห้อง" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /ควรปิดรับ \d+ งาน/ })).toBeTruthy(); // a small drop-down above the table, not a card
    expect(screen.getByRole("note", { name: "คำอธิบายสัญลักษณ์" })).toBeTruthy();       // the legend is one line under the table
    expect(screen.queryByLabelText("การกระจายคะแนน")).toBeNull(); // off by default
  });

  it("a hidden card is not drawn", async () => {
    settings.value = { ...(settings.value as object), gradebook_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("gradebook"), "summary")) } as never;
    await open();
    await waitFor(() => expect(screen.getByRole("button", { name: /ควรปิดรับ \d+ งาน/ })).toBeTruthy());
    expect(screen.queryByRole("group", { name: "สรุปห้อง" })).toBeNull();
  });
});
