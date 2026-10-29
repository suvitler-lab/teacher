import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { options } from "preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, enqueue } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enqueue: vi.fn() }));
vi.mock("@client/lib/api", async (original) => ({ ...await original<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/outbox", async (original) => ({ ...await original<typeof import("@client/lib/outbox")>(), enqueueSubmission: enqueue }));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));

import { GradebookPage } from "@client/pages/Gradebook";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { pendingOps, failedPairKeys } from "@client/lib/outbox";
import { route } from "@client/router";

const work: Assignment = {
  id: "a1", title: "แบบฝึกหัด iPad", term_id: "t1", subject_id: "science", type_id: null, unit: null,
  full_score: 10, assigned_date: "2026-10-01", due_date: null, note: null, publish_scores: true,
  status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const roster: Student[] = [1, 2].map((n) => ({
  id: `st${n}`, code: `00${n}`, qr_token: `token${n}`, prefix: null, first_name: `นักเรียน${n}`, last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
}));
const originalDebounce = options.debounceRendering;
afterEach(() => { options.debounceRendering = originalDebounce; });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=science";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "science", name: "วิทยาศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = roster;
  assignments.value = [work];
  pendingOps.value = new Map();
  failedPairKeys.value = new Set();
  get.mockResolvedValue({ students: roster, assignments: [work], submissions: [] });
  post.mockResolvedValue({});
  enqueue.mockResolvedValue(undefined);
});

async function openFirstCell() {
  render(<GradebookPage />);
  const table = await screen.findByRole("table");
  const rows = within(table).getAllByRole("row");
  fireEvent.click(rows[1].querySelector("td.cell")!);
  return await screen.findByRole("textbox", { name: "คะแนน" }) as HTMLInputElement;
}

describe("desktop gradebook keyboard entry", () => {
  it("keeps Enter on the next student when the render commits before the key event finishes bubbling", async () => {
    const input = await openFirstCell();
    // Render scheduling must not change which student receives the next score.
    options.debounceRendering = (render) => render();
    fireEvent.input(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "คะแนน" }).closest("tr")?.textContent).toContain("นักเรียน2"));
    const next = screen.getByRole("textbox", { name: "คะแนน" });
    fireEvent.input(next, { target: { value: "8" } });
    fireEvent.keyDown(next, { key: "Enter" });
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
    expect(enqueue.mock.calls.map(([op]) => [op.studentId, op.score])).toEqual([["st1", 7], ["st2", 8]]);
  });

  it("Enter commits to the first student and moves entry to the next student without overwriting the first", async () => {
    const first = await openFirstCell();
    fireEvent.input(first, { target: { value: "7" } });
    fireEvent.keyDown(first, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "คะแนน" }).closest("tr")?.textContent).toContain("นักเรียน2"));
    const second = screen.getByRole("textbox", { name: "คะแนน" }) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(second));
    fireEvent.input(second, { target: { value: "8" } });
    fireEvent.keyDown(second, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "คะแนน" })).toBeNull());
    expect(enqueue.mock.calls.map(([op]) => ({ studentId: op.studentId, score: op.score }))).toEqual([
      { studentId: "st1", score: 7 }, { studentId: "st2", score: 8 },
    ]);
  });

  it("Escape closes entry without saving or reopening the same cell", async () => {
    const input = await openFirstCell();
    fireEvent.input(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "คะแนน" })).toBeNull());
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("blur saves the typed score once and does not advance to a different student", async () => {
    const input = await openFirstCell();
    fireEvent.input(input, { target: { value: "6" } });
    fireEvent.blur(input);
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ studentId: "st1", score: 6 }));
    expect(screen.queryByRole("textbox", { name: "คะแนน" })).toBeNull();
  });
});
