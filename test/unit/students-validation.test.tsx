// QA-final A (B-A1, B-A3..B-A6): the add-student form checks its fields on screen before sending, and the import
// preview flags rows that would otherwise pass silently (no last name, bad class number, quoted CSV).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/store", async (orig) => ({ ...(await orig<typeof import("@client/store")>()), loadBootstrap: vi.fn(async () => {}) }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => <div /> }));

import { StudentsPage } from "@client/pages/Students";
import { classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { route } from "@client/router";

const safe = { rows: [], summary: { create: 1, update: 0, same: 0, move: 0, reactivate: 0 }, dupCodes: [], dupNumbers: [], numberClashes: [], blockedMoves: [] };
beforeEach(() => {
  vi.clearAllMocks(); route.value = "/students";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
  subjects.value = []; students.value = [];
  get.mockResolvedValue({ classId: "c1", range: { from: null, to: null, month: null, termId: "t1" }, students: [], assignments: [], submissions: [], attendanceSessions: [], attendance: [] });
  post.mockResolvedValue(safe);
});

const field = (k: string) => document.getElementById("stu-f-" + k) as HTMLInputElement;
const type = (k: string, v: string) => fireEvent.input(field(k), { target: { value: v } });
const openForm = () => { render(<StudentsPage />); fireEvent.click(screen.getAllByRole("button", { name: "เพิ่มนักเรียน" })[0]); };
const save = () => fireEvent.click(screen.getByRole("button", { name: /บันทึก/ }));
const studentPosts = () => post.mock.calls.filter(([path]) => path === "/api/students");

describe("add-student form (B-A1)", () => {
  it("a missing last name is caught on screen: Thai message under the field, focus on it, nothing sent", async () => {
    openForm();
    type("code", "S001"); type("first_name", "สมชาย");
    save();
    const msg = await screen.findByText("กรอกสกุล");
    expect(msg.getAttribute("role")).toBe("alert");
    expect(field("last_name").getAttribute("aria-invalid")).toBe("true");
    expect(field("last_name").getAttribute("aria-describedby")).toBe(msg.id);
    await waitFor(() => expect(document.activeElement).toBe(field("last_name")));
    // the summary names every required field, not just name and code
    expect(screen.getAllByRole("alert").some((a) => /ชื่อ.*สกุล.*รหัสนักเรียน/.test(a.textContent ?? ""))).toBe(true);
    expect(studentPosts()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/validation/);
  });

  it("whitespace-only fields count as empty; the first bad field in the form gets the focus", async () => {
    openForm();
    type("code", "   "); type("first_name", "  "); type("last_name", " ");
    save();
    await waitFor(() => expect(document.activeElement).toBe(field("code")));
    expect(screen.getByText("กรอกรหัสนักเรียน")).toBeTruthy();
    expect(screen.getByText("กรอกชื่อ")).toBeTruthy();
    expect(screen.getByText("กรอกสกุล")).toBeTruthy();
    expect(studentPosts()).toHaveLength(0);
  });

  it("the number must be a whole number from 1 (or empty); the message goes away when the field is edited", async () => {
    openForm();
    type("code", "S001"); type("first_name", "สมชาย"); type("last_name", "ใจดี"); type("number", "-5");
    save();
    const msg = await screen.findByText(/เลขที่ต้องเป็นจำนวนเต็ม/);
    expect(msg.getAttribute("role")).toBe("alert");
    expect(studentPosts()).toHaveLength(0);
    type("number", "2.5");
    expect(screen.queryByText(/เลขที่ต้องเป็นจำนวนเต็ม/)).toBeNull();
    save();
    await screen.findByText(/เลขที่ต้องเป็นจำนวนเต็ม/);
    expect(studentPosts()).toHaveLength(0);
  });

  it("a complete form is sent trimmed; an empty number is sent as null; a letters+digits code is fine", async () => {
    openForm();
    type("code", "  P001 "); type("first_name", " สมชาย "); type("last_name", " ใจดี ");
    save();
    await waitFor(() => expect(studentPosts()).toHaveLength(1));
    expect(studentPosts()[0][1]).toMatchObject({ code: "P001", first_name: "สมชาย", last_name: "ใจดี", number: null, class_id: "c1" });
  });
});

describe("import preview (B-A3 B-A4 B-A5 B-A6)", () => {
  async function paste(text: string) {
    render(<StudentsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "นำเข้า Excel" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: "วางข้อความ" }));
    fireEvent.input(screen.getByRole("textbox", { name: "รายชื่อนักเรียนที่คัดลอกจาก Excel" }), { target: { value: text } });
  }
  const table = () => document.querySelector(".imp-table")?.textContent ?? "";

  it("a quoted CSV row shows clean names (no quote characters) and is sent as prefix / first / last", async () => {
    await paste('P002,"ด.ญ. สมหญิง, รักเรียน",2');
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(table()).toContain("ด.ญ. สมหญิง รักเรียน");
    expect(table()).not.toContain('"');
    expect(post.mock.calls[0][1].students).toEqual([{ code: "P002", prefix: "ด.ญ.", first_name: "สมหญิง", last_name: "รักเรียน", number: 2 }]);
  });

  it("a row with no last name is not sent and is flagged with its count", async () => {
    await paste("10501\tด.ช. สมชาย ใจดี\t1\n10502\tด.ช. ไม่มีสกุล\t2\n10503\tด.ญ. สมหญิง");
    const warn = await screen.findByText(/ไม่มีสกุล 2 แถว/);
    expect(warn.closest(".imp-warn")?.getAttribute("role")).toBe("alert");
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].students.map((s: any) => s.code)).toEqual(["10501"]);
    expect(screen.getByRole("button", { name: "นำเข้า 1 คน" })).toBeTruthy();
  });

  it("a negative or decimal class number is flagged amber with the count and is not glued to the surname", async () => {
    await paste("10501\tด.ช. สมชาย ทดสอบ -3\n10502\tด.ช. สมศักดิ์ ทดสอบ 2.5\n10503\tด.ช. สมใจ ทดสอบ 7");
    const warn = await screen.findByText(/เลขที่ไม่ถูกต้อง 2 แถว/);
    expect(warn.closest(".imp-warn")).toBeTruthy();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].students.map((s: any) => [s.last_name, s.number])).toEqual([["ทดสอบ", null], ["ทดสอบ", null], ["ทดสอบ", 7]]);
  });

  it("letters+digits codes are read, and the hint states the rule", async () => {
    await paste("S001\tด.ช. สมชาย ใจดี\t1");
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].students[0].code).toBe("S001");
    expect(document.body.textContent).toContain("P001");
    expect(document.body.textContent).not.toContain("3 หลัก");
  });
});
