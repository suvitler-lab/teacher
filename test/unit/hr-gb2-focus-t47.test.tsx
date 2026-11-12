// T-47 review round: first focus of confirm dialogs, Excel focus return, (reuses the t47 page set-up)
// original header: gradebook work bar / work form / bulk / Excel label / page states (AC-137..147) — only what T-46 did not already pin.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, exportExcel, okMock } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), exportExcel: vi.fn(), okMock: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: okMock, err: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/lib/reportExport", () => ({ exportTermExcel: exportExcel }));
vi.mock("@client/lib/outbox", async (orig) => ({
  ...await orig<typeof import("@client/lib/outbox")>(),
  flush: vi.fn(async () => {}),
  onResult: () => () => {},
}));

import { GradebookPage } from "@client/pages/Gradebook";
import { classes, currentTermId, selectedTermId, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";
import { pendingOps } from "@client/lib/outbox";
import { setHide } from "@client/lib/hideNames";
import { Dialog } from "@client/components/Dialog";
import { useConfirm } from "@client/components/ConfirmDialog";

const asg = (id: string, over: Partial<Assignment> = {}): Assignment => ({
  id, title: "งาน " + id, publish_scores: true, term_id: "t1", subject_id: "math", type_id: "w", unit: null,
  full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05", note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null, ...over,
});
const kid = (id: string, n: number): Student => ({
  id, code: id, qr_token: id, prefix: null, first_name: "เด็ก" + n, last_name: "สมมติ", nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const sub = (a: string, s: string) => ({ assignment_id: a, student_id: s, status: "submitted", score: 5, late: false, submitted_at: Date.UTC(2020, 0, 2, 5), method: "camera", updated_at: 0 });
const kids = [kid("k1", 1), kid("k2", 2)];
let works: Assignment[], rows: ReturnType<typeof sub>[];

beforeEach(() => {
  cleanup(); vi.clearAllMocks(); localStorage.clear(); pendingOps.value = new Map(); setHide("gradebook", false);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  workTypes.value = [{ id: "w", name: "ใบงาน", icon: "x", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false }] as any;
  students.value = kids;
  works = [asg("w1")];
  rows = [sub("w1", "k1"), sub("w1", "k2")]; // everyone has handed in → a whole-class "all submitted" has nobody to change
  get.mockImplementation(async () => ({ students: kids, assignments: works, submissions: rows }));
  exportExcel.mockResolvedValue(undefined);
});


function Ask({ danger }: { danger?: boolean }) {
  const { ask, node } = useConfirm();
  return <div><button onClick={() => { void ask({ title: "ลบงาน?", body: "x", yes: "ลบงาน", danger }); }}>เปิด</button>{node}</div>;
}

describe("R-4701 first focus of a confirm dialog", () => {
  it("lands on the safe answer, not the close button", async () => {
    render(<Ask danger />);
    fireEvent.click(screen.getByRole("button", { name: "เปิด" }));
    const d = await screen.findByRole("alertdialog");
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "ยกเลิก" }));
  });
  it("a Dialog without data-autofocus still starts on its first focusable", () => {
    render(<Dialog label="x" onClose={() => {}}><button>แรก</button><button>สอง</button></Dialog>);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "แรก" }));
  });
});

describe("R-4702 whole-class 'all submitted' with people to change", () => {
  it("opens focused on ยกเลิก, not on วันนี้", async () => {
    rows = [sub("w1", "k1")]; // k2 has not handed in
    render(<GradebookPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /ทำทั้งห้อง/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /ทั้งห้องส่งแล้ว/ }));
    const d = await screen.findByRole("dialog", { name: /ทั้งห้องส่งแล้ว 1 คน\?/ });
    expect(within(d).getByRole("button", { name: "วันนี้" })).toBeTruthy();
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "ยกเลิก" }));
  });
});

describe("R-4703 Excel focus return", () => {
  it("does not take focus from where the teacher has moved to meanwhile", async () => {
    let done!: () => void;
    exportExcel.mockImplementation(() => new Promise<void>((r) => { done = r; }));
    render(<GradebookPage />);
    await screen.findByRole("table");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ส่งออก Excel" })); });
    const other = screen.getByRole("button", { name: /^ตัวกรอง/ });
    other.focus();
    await act(async () => { done(); });
    await waitFor(() => expect(okMock).toHaveBeenCalled());
    expect(document.activeElement).toBe(other);
  });
});
