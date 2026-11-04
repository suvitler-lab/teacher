import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { render, screen } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

// The work picker's "ส่งแล้ว x/y" for the picked work is read fresh from the server; y leaves out excused children.
const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/lib/dashboard", () => ({ dashboard: { value: null }, loadDashboard: vi.fn() }));

import { assignments, students, classes } from "@client/store";
import { ScanPage, __scan } from "@client/pages/Scan";

const asg: Assignment = {
  id: "A", term_id: null, subject_id: null, type_id: null, title: "งานทดสอบ", unit: null, full_score: 10, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "ก" + n, last_name: "ข", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});

beforeEach(() => {
  get.mockReset();
  __scan.session.value = null;
  assignments.value = [asg];
  students.value = [kid(1), kid(2), kid(3), kid(4)];
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
});

describe("scan setup: live x/y", () => {
  it("counts hand-ins from the server and leaves excused children out of y", async () => {
    get.mockResolvedValue({ submissions: [
      { student_id: "s1", status: "submitted" }, { student_id: "s2", status: "submitted" }, { student_id: "s3", status: "excused" },
    ] });
    render(h(ScanPage, {}));
    expect(await screen.findByText(/ส่งแล้ว 2\/3 · ยกเว้น 1/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/assignments/A/submissions");
  });
});
