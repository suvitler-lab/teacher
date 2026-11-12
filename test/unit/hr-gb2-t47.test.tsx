// T-47: gradebook work bar / work form / bulk / Excel label / page states (AC-137..147) — only what T-46 did not already pin.
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
import { AssignmentModal } from "@client/components/AssignmentModal";
import { classes, currentTermId, selectedTermId, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";
import { pendingOps } from "@client/lib/outbox";
import { setHide } from "@client/lib/hideNames";

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

describe("AC-145 Excel scope label + hidden-names warning", () => {
  it("says what the file holds; with names hidden it warns, and the toast says so", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    expect(screen.getByText("Excel: ห้อง+วิชาบนจอ · ทั้งเทอม")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ส่งออก Excel" })); });
    await waitFor(() => expect(okMock).toHaveBeenCalledWith("ดาวน์โหลด Excel แล้ว"));
    cleanup();
    setHide("gradebook", true);
    render(<GradebookPage />);
    await screen.findByRole("table");
    expect(screen.queryByText("Excel: ห้อง+วิชาบนจอ · ทั้งเทอม")).toBeNull();
    expect(screen.getAllByText(/ไฟล์ Excel มีชื่อนักเรียน/).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ส่งออก Excel" })); });
    await waitFor(() => expect(okMock).toHaveBeenCalledWith("ดาวน์โหลด Excel แล้ว · ไฟล์ Excel มีชื่อนักเรียน"));
    // no confirmation is asked, and focus is back on the button once it is enabled again
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "ส่งออก Excel" })));
  });
});

describe("AC-144 whole-class with nobody to change", () => {
  it("says there is nothing to change and the confirm button is disabled", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /ทำทั้งห้อง/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /ทั้งห้องส่งแล้ว/ }));
    const d = await screen.findByRole("dialog", { name: /ทั้งห้องส่งแล้ว 0 คน\?/ });
    expect(d.textContent).toContain("ไม่มีรายการที่ต้องเปลี่ยน");
    expect((within(d).getByRole("button", { name: /ส่งแล้ว 0 คน/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AC-146 ST-04 loading", () => {
  it("shows a faint table frame with aria-busy and the words, not old data", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    render(<GradebookPage />);
    const box = await waitFor(() => { const e = document.querySelector(".gb-skel"); expect(e).toBeTruthy(); return e as HTMLElement; });
    expect(box.getAttribute("aria-busy")).toBe("true");
    expect(box.textContent).toContain("กำลังโหลด…");
    expect(document.querySelector("table.gb")).toBeNull();
  });
});

describe("AC-140/141 work form", () => {
  const open = (extra: Record<string, unknown> = {}) => render(<AssignmentModal defaultClassId="c1" onClose={vi.fn()} onSaved={vi.fn()} {...extra as any} />);
  it("a copy is headed 'คัดลอกงาน' with the copy bar, a new one 'สร้างงานใหม่'", () => {
    open({ copyFrom: asg("w1", { title: "ใบงานที่ 4" }) });
    expect(screen.getByRole("dialog", { name: "คัดลอกงาน" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "คัดลอกงาน" })).toBeTruthy();
    expect(screen.getByText(/คัดลอกจาก “ใบงานที่ 4” — วันที่สั่ง = วันนี้ · ไม่มีกำหนดส่ง · ไม่คัดลอกคะแนนและการส่ง/)).toBeTruthy();
    cleanup();
    open();
    expect(screen.getByRole("heading", { name: "สร้างงานใหม่" })).toBeTruthy();
    expect(screen.queryByText(/คัดลอกจาก/)).toBeNull();
  });
  it("opens with the cursor on the title; a wrong value is announced in a role=alert under the buttons", async () => {
    open();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/เช่น ใบงานที่ 5/));
    fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
    const al = screen.getAllByRole("alert").find((e) => e.textContent?.includes("ใส่ชื่องาน"));
    expect(al).toBeTruthy();
    const foot = document.querySelector(".asg-foot")!;
    expect(foot.contains(al!)).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("AC-143 / AC-146 page states", () => {
  it("?asg= naming a work that is gone falls back to the BR-34 pick (last open work)", async () => {
    works = [asg("w1"), asg("w2"), asg("w3", { status: "closed" })];
    route.value = "/gradebook?class=c1&subject=math&asg=ghost";
    render(<GradebookPage />);
    await screen.findByRole("table");
    await waitFor(() => expect(document.querySelector("th.sel")?.getAttribute("data-aid")).toBe("w2"));
  });
  it("ST-03 no work + a filter: says how many filters and offers to put them back", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    works = []; rows = [];
    fireEvent.click(screen.getByRole("button", { name: /^ตัวกรอง/ }));
    fireEvent.input(await screen.findByLabelText("ประเภทงาน"), { target: { value: "w" } });
    await screen.findByText(/ยังไม่มีงานในเงื่อนไขนี้ · ตัวกรอง 1 รายการ/);
    expect(screen.getAllByRole("button", { name: /คืนค่าตัวกรอง/ }).length).toBeGreaterThan(0);
  });
  it("ST-05 load failed: message + retry that loads again", async () => {
    get.mockRejectedValueOnce(new Error("x"));
    render(<GradebookPage />);
    await screen.findByText("โหลดข้อมูลไม่สำเร็จ");
    fireEvent.click(screen.getByRole("button", { name: /ลองอีกครั้ง/ }));
    await screen.findByRole("table");
  });
  it("ST-01 no class: the way to add one goes to settings, no hero numbers", async () => {
    classes.value = []; route.value = "/gradebook";
    render(<GradebookPage />);
    await screen.findByText(/ยังไม่มีห้องเรียนในปีนี้/);
    expect(screen.getByRole("button", { name: /เพิ่มห้องเรียน/ })).toBeTruthy();
    expect(document.querySelector(".gbh")).toBeNull();
  });
});
