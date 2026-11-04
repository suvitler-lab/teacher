// ui-redesign audit B-07: a digit typed on a selected cell opens the quick input; Esc must give the focus back to that cell
// (not <body>) so the arrow keys keep working without a click.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
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
  id: "a1", title: "แบบฝึกหัด", term_id: "t1", subject_id: "science", type_id: null, unit: null,
  full_score: 10, assigned_date: "2026-10-01", due_date: null, note: null, publish_scores: true,
  status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const roster: Student[] = [1, 2].map((n) => ({
  id: `st${n}`, code: `00${n}`, qr_token: `token${n}`, prefix: null, first_name: `นักเรียน${n}`, last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=science";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "science", name: "วิทยาศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = roster; assignments.value = [work];
  pendingOps.value = new Map(); failedPairKeys.value = new Set();
  get.mockResolvedValue({ students: roster, assignments: [work], submissions: [] });
  post.mockResolvedValue({}); enqueue.mockResolvedValue(undefined);
});

describe("B-07 Esc after typing a digit on a cell", () => {
  for (const how of ["a digit", "Enter"] as const) {
    it(`${how} opens the input; Esc puts the focus back on the same cell and the arrows still move`, async () => {
      render(<GradebookPage />);
      const table = await screen.findByRole("table");
      const cells = () => within(table).getAllByRole("row").slice(1).map((r) => r.querySelector("td.cell") as HTMLElement);
      const first = cells()[0];
      first.focus();
      expect(document.activeElement).toBe(first);
      fireEvent.keyDown(first, how === "a digit" ? { key: "7" } : { key: "Enter" });
      const input = await screen.findByRole("textbox", { name: "คะแนน" });
      await waitFor(() => expect(document.activeElement).toBe(input));
      fireEvent.keyDown(input, { key: "Escape" });
      expect(document.activeElement).toBe(first); // at once — never a moment on <body> that a later timer has to repair
      await waitFor(() => expect(screen.queryByRole("textbox", { name: "คะแนน" })).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(cells()[0]));
      expect(enqueue).not.toHaveBeenCalled();
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      await waitFor(() => expect(document.activeElement).toBe(cells()[1]));
    });
  }
});
