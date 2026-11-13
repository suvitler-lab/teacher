// T-72: test gap proved by QA-B mutation M52-4 (verify-qa-b.md): what is sent when a child comes back (R-5203, ST-S14, ST-S18).
// Fictitious names only. `api` is a mock; nothing is sent to a server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/store", async (orig) => ({ ...(await orig<typeof import("@client/store")>()), loadBootstrap: vi.fn(async () => {}) }));

import { StudentsPage } from "@client/pages/Students";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, qrRotatedAt } from "@client/store";
import { route } from "@client/router";
import { projectorOn, setPjHideNames } from "@client/lib/projector";
import { setHide } from "@client/lib/hideNames";
import { swrClear } from "@client/lib/swr";


const kid = (n: number | null, first: string, over: Partial<Student> = {}): Student => ({
  id: "s" + (n ?? first), code: "610" + String(n ?? 0).padStart(2, "0"), qr_token: "SECRETTOKEN" + n, prefix: null, first_name: first, last_name: "นามสมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0, ...over,
});
const KIDS = [kid(1, "สมชาย"), kid(2, "สมหญิง"), kid(3, "ภูมิ"), kid(4, "ดวงดาว", { nickname: "ดาว" }), kid(5, "กานดา", { nickname: "ดา", code: "61005" }), kid(6, "ปวีณ"), kid(7, "นภัส"), kid(8, "ธีรา")];
const A: Assignment = {
  id: "a1", title: "ใบงานที่ 4", term_id: "t1", subject_id: "math", type_id: null, unit: null, full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05",
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const payload = () => {
  const sessions = Array.from({ length: 20 }, (_, i) => ({ id: "d" + i, date: `2026-10-${String(i + 1).padStart(2, "0")}` }));
  const attendance = KIDS.flatMap((k) => sessions.map((s, i) => ({ session_id: s.id, student_id: k.id, status: (k.number === 5 || k.number === 8 ? i < 15 : i < 19) ? "present" : "absent" })));
  return {
    classId: "c1", range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" }, students: KIDS, assignments: [A],
    submissions: KIDS.filter((k) => k.number !== 5 && k.number !== 8).map((k) => ({ assignment_id: "a1", student_id: k.id, status: "submitted", score: 9, late: false })),
    attendanceSessions: sessions, attendance,
  };
};
const baseSettings = () => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false, accept_student_code_scan: false,
  parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
}) as never;

beforeEach(() => {
  vi.clearAllMocks(); cleanup(); swrClear(); route.value = "/students"; try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  projectorOn.value = false; setPjHideNames(false); setHide("students", false);
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [
    { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 },
    { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, year: 2569, archived: false, updated_at: 0 },
  ];
  subjects.value = []; settings.value = baseSettings(); qrRotatedAt.value = {};
  students.value = [...KIDS, kid(3, "วิภา", { id: "w3", class_id: "c2", number: 3, last_name: "แก้วใส", code: "62003" })];
  get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : p.startsWith("/api/students") ? { students: [] } : payload()));
  post.mockResolvedValue({});
});
afterEach(() => { cleanup(); projectorOn.value = false; });

const hero = () => document.querySelector(".stu-hero")!;
const ready = () => waitFor(() => expect(hero().getAttribute("aria-busy")).toBeNull());

import { toasts } from "@client/lib/notify";

const ApiErr = (code: string, message = "") => Object.assign(new Error(message), { code });
const gone = () => kid(9, "ภาพ", { id: "g9", status: "moved", left_at: "2026-11-12", class_id: "c1", nickname: "ภา", prefix: "ด.ช." });
const former = (list: Student[]) => get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : p.startsWith("/api/students") ? { students: list } : payload()));
const writes = () => post.mock.calls.filter((c) => c[0] === "/api/students");
async function pressComeBack() {
  render(<StudentsPage />); await ready();
  fireEvent.click(await screen.findByRole("button", { name: /ย้ายออก\/ไม่ใช้งาน 1/ }));
  fireEvent.click(await screen.findByRole("button", { name: /กลับมาใช้งาน/ }));
  return await screen.findByRole("alertdialog");
}

describe("M52-4 come back: the request body", () => {
  it("one POST with the child's own record, status active and left_at cleared; the same class and number; no QR token", async () => {
    former([gone()]);
    const ask = await pressComeBack();
    expect(writes().length).toBe(0); // asking sends nothing
    fireEvent.click(within(ask).getByRole("button", { name: "กลับมาใช้งาน" }));
    await waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0][1]).toEqual({
      id: "g9", code: "61009", prefix: "ด.ช.", first_name: "ภาพ", last_name: "นามสมมติ", nickname: "ภา",
      class_id: "c1", number: 9, status: "active", left_at: null,
    });
    expect(JSON.stringify(writes()[0][1])).not.toContain("SECRETTOKEN");
    await waitFor(() => expect(JSON.stringify(toasts.value)).toContain("กลับมาใช้งานแล้ว"));
  });

  it("a child who has no class yet keeps class_id null (nothing is invented)", async () => {
    former([kid(9, "ภาพ", { id: "g9", status: "inactive", left_at: "2026-11-12", class_id: null })]);
    const ask = await pressComeBack();
    fireEvent.click(within(ask).getByRole("button", { name: "กลับมาใช้งาน" }));
    await waitFor(() => expect(writes().length).toBe(1));
    expect((writes()[0][1] as any).class_id).toBeNull();
    expect((writes()[0][1] as any).status).toBe("active");
  });

  it("saying no sends nothing", async () => {
    former([gone()]);
    const ask = await pressComeBack();
    fireEvent.click(within(ask).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(writes().length).toBe(0);
  });

  it("a taken number: the fix box opens on the same child, and saving it sends active + left_at null + the same class with the new number", async () => {
    former([gone()]);
    post.mockRejectedValueOnce(ApiErr("number_taken"));
    const ask = await pressComeBack();
    fireEvent.click(within(ask).getByRole("button", { name: "กลับมาใช้งาน" }));
    const clash = await screen.findByRole("alertdialog", { name: "เลขที่ชน" });
    expect(writes().length).toBe(1); // the first try, refused
    expect((writes()[0][1] as any).class_id).toBe("c1");
    fireEvent.click(within(clash).getByRole("button", { name: "แก้เลขที่" }));
    const form = await screen.findByRole("dialog", { name: "นักเรียน" });
    expect((within(form).getByLabelText(/รหัสนักเรียน/) as HTMLInputElement).value).toBe("61009");
    fireEvent.input(document.querySelector("#stu-f-number")!, { target: { value: "5" } });
    expect(document.body.textContent).toContain("เลขที่ 5 มีกานดา"); // the clash is told before saving
    fireEvent.input(document.querySelector("#stu-f-number")!, { target: { value: "10" } });
    fireEvent.click(within(form).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(writes().length).toBe(2));
    const b = writes()[1][1] as any;
    expect(b).toMatchObject({ id: "g9", class_id: "c1", number: 10, status: "active", left_at: null });
  });

  it("any other failure: nothing changes on screen and the child stays in the list with an error message", async () => {
    former([gone()]);
    post.mockRejectedValueOnce(new Error("boom"));
    const ask = await pressComeBack();
    fireEvent.click(within(ask).getByRole("button", { name: "กลับมาใช้งาน" }));
    await waitFor(() => expect(JSON.stringify(toasts.value)).toContain("กลับมาใช้งานไม่สำเร็จ"));
    expect(screen.queryByRole("alertdialog", { name: "เลขที่ชน" })).toBeNull();
    expect(writes().length).toBe(1);
  });
});
