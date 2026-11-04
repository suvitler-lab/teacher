import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async orig => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put: vi.fn() } }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: ({ studentId }: { studentId: string }) => <div role="dialog" aria-label="รายละเอียดนักเรียน">{studentId}</div> }));
import { StudentsPage } from "@client/pages/Students";
import { classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { route } from "@client/router";

const safe = {
  rows: [{ code: "10501", action: "same" }],
  summary: { create: 0, update: 0, same: 1, move: 0, reactivate: 0 },
  dupCodes: [], dupNumbers: [], numberClashes: [], blockedMoves: [],
};
beforeEach(() => {
  vi.clearAllMocks(); route.value = "/students";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
  subjects.value = [];
  students.value = [{ id: "s1", code: "10501", qr_token: "test", prefix: "ด.ช.", first_name: "สมชาย", last_name: "ทดสอบ", nickname: null, class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0 }];
  get.mockResolvedValue({ classId: "c1", range: { from: null, to: null, month: null, termId: "t1" }, students: [], assignments: [], submissions: [], attendanceSessions: [], attendance: [] });
  post.mockResolvedValue(safe);
});

async function openPaste() {
  render(<StudentsPage />);
  fireEvent.click(screen.getByRole("button", { name: "นำเข้า Excel" }));
  fireEvent.click(screen.getByRole("tab", { name: "วางข้อความ" })); // the file tab comes first (round 3)
  fireEvent.input(screen.getByRole("textbox", { name: "รายชื่อนักเรียนที่คัดลอกจาก Excel" }), { target: { value: "10501\tด.ช. สมชาย ทดสอบ\t1" } });
}

describe("student import and keyboard entry", () => {
  it("exposes a named native student button and an accessible search field", async () => {
    render(<StudentsPage />);
    expect(screen.getByRole("textbox", { name: "ค้นหานักเรียน" })).toBeTruthy();
    const button = screen.getByRole("button", { name: /ดูข้อมูล.*สมชาย/ });
    expect(button.tagName).toBe("BUTTON");
    button.focus(); expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "รายละเอียดนักเรียน" }).textContent).toBe("s1");
  });

  it("shows blocked moves and never enables import even when the paste is otherwise valid", async () => {
    post.mockResolvedValue({ ...safe, blockedMoves: [{ studentId: "s1", code: "10501", fromClassId: "old", toClassId: "c1", reason: "cross_year" }] });
    await openPaste();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("ย้ายไม่ได้ 1 คน");
    const submit = screen.getByRole("button", { name: "นำเข้า 1 คน" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(post.mock.calls.filter(([path]) => path === "/api/students/import")).toHaveLength(0);
  });

  it("can retry a failed preview without changing the pasted student list", async () => {
    post.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(safe);
    await openPaste();
    const retry = await screen.findByRole("button", { name: "ตรวจอีกครั้ง" });
    fireEvent.click(retry);
    await waitFor(() => expect((screen.getByRole("button", { name: "นำเข้า 1 คน" }) as HTMLButtonElement).disabled).toBe(false));
    expect(post.mock.calls).toHaveLength(2);
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
  });
});
