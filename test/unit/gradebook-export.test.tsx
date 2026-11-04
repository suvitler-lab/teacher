import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, ok, err, exportTermExcel } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), ok: vi.fn(), err: vi.fn(), exportTermExcel: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({
  ...await orig<typeof import("@client/lib/api")>(), api: { get, post },
}));
vi.mock("@client/lib/notify", () => ({ ok, err, notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/lib/reportExport", async (orig) => ({ ...await orig<typeof import("@client/lib/reportExport")>(), exportTermExcel }));

import { GradebookPage } from "@client/pages/Gradebook";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { online } from "@client/lib/outbox";
import { route } from "@client/router";

const assignment: Assignment = {
  id: "geometry", title: "เรขาคณิต", publish_scores: true, term_id: "t1", subject_id: "math", type_id: null, unit: null,
  full_score: 10, assigned_date: "2026-10-01", due_date: null, note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const student: Student = {
  id: "st1", code: "001", qr_token: "token", prefix: null, first_name: "นักเรียน", last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  online.value = true;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  students.value = [student];
  assignments.value = [assignment];
  get.mockResolvedValue({ students: [student], assignments: [assignment], submissions: [] });
  exportTermExcel.mockResolvedValue(undefined);
});
afterEach(() => { online.value = true; });

const exportBtn = () => screen.getByRole("button", { name: "ส่งออก Excel" }) as HTMLButtonElement;

describe("gradebook: ส่งออก Excel", () => {
  it("shows the button in the toolbar with its label", async () => {
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /เรขาคณิต/ });
    expect(exportBtn().closest(".gb-toolbar")).not.toBeNull();
    expect(exportBtn().textContent).toContain("ส่งออก Excel");
    expect(exportBtn().disabled).toBe(false);
  });

  it("exports the selected class, subject and term, then says so", async () => {
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /เรขาคณิต/ });
    fireEvent.click(exportBtn());
    await waitFor(() => expect(ok).toHaveBeenCalledWith("ดาวน์โหลด Excel แล้ว"));
    expect(exportTermExcel).toHaveBeenCalledTimes(1);
    expect(exportTermExcel).toHaveBeenCalledWith("c1", "math", "t1");
    expect(err).not.toHaveBeenCalled();
  });

  it("is disabled, with a reason in its title, while offline", async () => {
    online.value = false;
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /เรขาคณิต/ });
    expect(exportBtn().disabled).toBe(true);
    expect(exportBtn().title).toContain("ออนไลน์");
    fireEvent.click(exportBtn());
    expect(exportTermExcel).not.toHaveBeenCalled();
  });

  it("shows a busy state while building and a toast if it fails", async () => {
    let fail!: (e: Error) => void;
    exportTermExcel.mockImplementation(() => new Promise((_res, rej) => { fail = rej; }));
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /เรขาคณิต/ });
    fireEvent.click(exportBtn());
    await waitFor(() => expect(exportBtn().disabled).toBe(true));
    expect(exportBtn().getAttribute("aria-busy")).toBe("true");
    fail(new Error("boom"));
    await waitFor(() => expect(err).toHaveBeenCalledWith("สร้างไฟล์ Excel ไม่สำเร็จ — ลองอีกครั้ง"));
    await waitFor(() => expect(exportBtn().disabled).toBe(false));
    expect(ok).not.toHaveBeenCalled();
  });

  it("is disabled when there is no class", async () => {
    classes.value = [];
    route.value = "/gradebook";
    render(<GradebookPage />);
    await waitFor(() => expect(exportBtn().disabled).toBe(true));
    expect(exportBtn().title).toContain("ห้อง");
  });
});
