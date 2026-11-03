// correctness-lows AC-04 (C-02 R-04): closing / hiding a piece of work from the gradebook must not send the full score
// the screen holds — it may be stale (another device lowered it), and the server would read it as a raise (409).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, ok, err } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), ok: vi.fn(), err: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({
  ...await orig<typeof import("@client/lib/api")>(), api: { get, post },
}));
vi.mock("@client/lib/notify", () => ({ ok, err, notify: vi.fn(), withToast: vi.fn() }));

import { GradebookPage } from "@client/pages/Gradebook";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { route } from "@client/router";

// the screen still thinks the full score is 20; the server holds 10
const stale: Assignment = {
  id: "geometry", title: "เรขาคณิต", publish_scores: true, term_id: "t1", subject_id: "math", type_id: null, unit: null,
  full_score: 20, assigned_date: "2026-10-01", due_date: null, note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const student: Student = {
  id: "st1", code: "001", qr_token: "token", prefix: null, first_name: "นักเรียน", last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = [student];
  assignments.value = [stale];
  get.mockImplementation(async () => ({
    students: [student], assignments: [stale],
    submissions: [{ assignment_id: stale.id, student_id: student.id, status: "submitted", score: 7, late: false }],
  }));
  // the server answers with what it stores: full score 10
  post.mockImplementation(async (_path, body) => ({ assignment: { ...stale, ...body, full_score: 10 } }));
});

describe("AC-04: saveAsgPatch sends no full_score", () => {
  it("hiding one column's scores posts the change without full_score, and the screen takes the server's full score", async () => {
    render(<GradebookPage />);
    const col = await screen.findByRole("columnheader", { name: /เรขาคณิต/ });
    fireEvent.click(within(col).getByRole("button", { name: "ซ่อนคะแนนของงานนี้" }));
    await waitFor(() => expect(ok).toHaveBeenCalledWith("ซ่อนคะแนนแล้ว"));
    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/api/assignments");
    expect(body).toMatchObject({ id: "geometry", publish_scores: false, class_ids: ["c1"] });
    expect("full_score" in body).toBe(false);
    expect(err).not.toHaveBeenCalled();
    await waitFor(() => expect(assignments.value.find((a) => a.id === "geometry")?.full_score).toBe(10));
  });
});
