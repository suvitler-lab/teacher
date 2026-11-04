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

const assignment = (id: string, title: string, publish_scores = true): Assignment => ({
  id, title, publish_scores, term_id: "t1", subject_id: "math", type_id: null, unit: null,
  full_score: 10, assigned_date: "2026-10-01", due_date: null, note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
const student: Student = {
  id: "st1", code: "001", qr_token: "token", prefix: null, first_name: "นักเรียน", last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};
let tableAssignments: Assignment[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = [student];
  tableAssignments = [assignment("geometry", "เรขาคณิต"), assignment("fractions", "เศษส่วน")];
  assignments.value = [...tableAssignments, assignment("outside", "งานนอกตัวกรอง")];
  get.mockImplementation(async () => ({
    students: [student], assignments: tableAssignments,
    submissions: tableAssignments.map((a, i) => ({ assignment_id: a.id, student_id: student.id, status: "submitted", score: 7 + i, late: false })),
  }));
  post.mockImplementation(async (_path, body) => ({
    assignment: { ...tableAssignments.find((a) => a.id === body.id), ...body },
  }));
});

async function openTable() {
  render(<GradebookPage />);
  await screen.findByRole("columnheader", { name: /เศษส่วน/ });
  // "ซ่อน/แสดงคะแนนทั้งหมด" lives in the ⋮ menu of the picked work (round 3); it stays open while the columns are saved
  fireEvent.click(screen.getByRole("button", { name: "จัดการงาน" }));
}
const hideAll = () => screen.getByRole("menuitem", { name: "ซ่อนคะแนนทั้งหมด" }) as HTMLButtonElement;
const showAll = () => screen.getByRole("menuitem", { name: "แสดงคะแนนทั้งหมด" }) as HTMLButtonElement;
const cells = () => within(screen.getByRole("table")).getAllByRole("row")[1].querySelectorAll("td");

describe("gradebook score visibility", () => {
  it("hides and shows every displayed column, including fractions, and updates totals and averages", async () => {
    await openTable();
    fireEvent.click(hideAll());
    await waitFor(() => expect(showAll().disabled).toBe(false));
    expect(post.mock.calls.map(([, b]) => [b.id, b.publish_scores])).toEqual([["geometry", false], ["fractions", false]]);
    expect([...cells()].slice(1).map((c) => c.textContent)).toEqual(["•••", "•••", "•••"]);
    expect(document.querySelectorAll("tr.avg td")[1].textContent).toContain("•••");
    expect(document.querySelectorAll("tr.avg td")[2].textContent).toContain("•••");
    expect(assignments.value.find((a) => a.id === "outside")?.publish_scores).toBe(true);

    fireEvent.click(showAll());
    await waitFor(() => expect(hideAll().disabled).toBe(false));
    expect([...cells()].slice(1).map((c) => c.textContent)).toEqual(["7", "8", "15/20"]);
    expect(post.mock.calls.slice(2).map(([, b]) => [b.id, b.publish_scores])).toEqual([["geometry", true], ["fractions", true]]);
  });

  it("hides the remaining visible column when the selected column is already hidden", async () => {
    tableAssignments[0] = { ...tableAssignments[0], publish_scores: false };
    await openTable();
    fireEvent.click(hideAll());
    await waitFor(() => expect(showAll().disabled).toBe(false));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ id: "fractions", publish_scores: false });
    expect(cells()[2].textContent).toBe("•••");
  });

  it("keeps the eye button scoped to its own column", async () => {
    await openTable();
    const fractions = screen.getByRole("columnheader", { name: /เศษส่วน/ });
    fireEvent.click(within(fractions).getByRole("button", { name: "ซ่อนคะแนนของงานนี้" }));
    await waitFor(() => expect(ok).toHaveBeenCalledWith("ซ่อนคะแนนบนจอแล้ว"));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ id: "fractions", publish_scores: false });
    expect([...cells()].slice(1).map((c) => c.textContent)).toEqual(["7", "•••", "7/10"]);
  });

  it("disables competing visibility actions while all columns are being saved", async () => {
    const finish: (() => void)[] = [];
    post.mockImplementation((_path, body) => new Promise((resolve) => {
      finish.push(() => resolve({ assignment: { ...tableAssignments.find((a) => a.id === body.id), ...body } }));
    }));
    await openTable();
    const button = hideAll();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(post).toHaveBeenCalledTimes(2);
    expect(showAll().disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: "แสดงคะแนนของงานนี้" }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    finish.forEach((done) => done());
    await waitFor(() => expect(showAll().disabled).toBe(false));
  });

  it("restores a failed column and allows retry without claiming all scores were hidden", async () => {
    post.mockImplementation(async (_path, body) => {
      if (body.id === "fractions") throw new Error("บันทึกไม่สำเร็จ");
      return { assignment: { ...tableAssignments[0], ...body } };
    });
    await openTable();
    fireEvent.click(hideAll());
    await waitFor(() => expect(hideAll().disabled).toBe(false));
    expect(err).toHaveBeenCalledWith("บันทึกไม่สำเร็จ");
    expect(ok).not.toHaveBeenCalled();
    expect([...cells()].slice(1).map((c) => c.textContent)).toEqual(["•••", "8", "8/10"]);
  });
});
