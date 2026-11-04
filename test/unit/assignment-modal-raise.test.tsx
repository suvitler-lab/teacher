// C-02: raising an assignment's full score asks whether to raise the students who had the old full score.
import { describe, it, expect, beforeEach, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post, put: vi.fn() } };
});

import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { GradebookPage } from "@client/pages/Gradebook";
import { route } from "@client/router";
import { students } from "@client/store";
import { AssignmentModal } from "@client/components/AssignmentModal";
import { ApiError } from "@client/lib/api";
import { classes, subjects, workTypes, terms, currentTermId, selectedTermId, assignments } from "@client/store";
import { toasts } from "@client/lib/notify";
import type { Assignment } from "@shared/types";

const asg: Assignment = {
  id: "a1", term_id: "t1", subject_id: "s1", type_id: "w1", title: "ใบงานที่ 5", unit: null, full_score: 10,
  assigned_date: "2026-10-01", due_date: null, note: null, publish_scores: true, status: "open", class_ids: ["c1"],
  updated_at: 0,
} as any;

const NAME = "ปรับคนที่ได้เต็ม 3 คน?";
const raiseRequired = () => new ApiError(409, "raise_choice_required", "มี 3 คนได้คะแนนเต็มเดิม — อัปเดตแอปแล้วบันทึกอีกครั้ง", { count: 3, from: 10, to: 20 });
const bodyOf = (i: number) => post.mock.calls[i][1] as any;

let onReload: ReturnType<typeof vi.fn<() => void>>;
let onSaved: ReturnType<typeof vi.fn<(a: Assignment) => void>>, onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  post.mockReset(); toasts.value = [];
  onReload = vi.fn<() => void>(); onSaved = vi.fn<(a: Assignment) => void>(); onClose = vi.fn<() => void>();
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 } as any];
  currentTermId.value = "t1"; selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 10, archived: false, year: 2569, updated_at: 0 } as any];
  subjects.value = [{ id: "s1", code: null, name: "วิทย์", color: "blue", sort: 10, archived: false, updated_at: 0 } as any];
  workTypes.value = [{ id: "w1", name: "ใบงาน", icon: "file-text", color: "violet", is_exam: false, default_full: 10, sort: 10, archived: false, updated_at: 0 } as any];
  assignments.value = [asg];
});

function openAndRaise() {
  render(<AssignmentModal existing={asg} onClose={onClose} onSaved={onSaved} onReload={onReload} />);
  fireEvent.input(screen.getByLabelText("คะแนนเต็ม"), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
}

describe("AssignmentModal field checks", () => {
  it("a full score that is not a whole number 1–100 says so (whole numbers only), and nothing is sent", () => {
    render(<AssignmentModal existing={asg} onClose={onClose} onSaved={onSaved} />);
    for (const bad of ["10.5", "0", "101"]) {
      fireEvent.input(screen.getByLabelText("คะแนนเต็ม"), { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
      expect(screen.getByText("คะแนนเต็มเป็นจำนวนเต็ม 1–100"), bad).toBeTruthy();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it("the title field stops at 200 characters and a longer pasted title is refused in Thai", () => {
    render(<AssignmentModal existing={asg} onClose={onClose} onSaved={onSaved} />);
    const title = screen.getByPlaceholderText(/เช่น ใบงานที่ 5/) as HTMLInputElement;
    expect(title.maxLength).toBe(200);
    fireEvent.input(title, { target: { value: "ก".repeat(201) } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
    expect(screen.getByText("ชื่องานยาวเกินไป — ไม่เกิน 200 ตัวอักษร")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("a copy of work whose type was put away starts on a type that can still be used", async () => {
    workTypes.value = [
      { id: "w0", name: "เก่า", icon: "file-text", color: "red", is_exam: false, default_full: 10, sort: 5, archived: true, updated_at: 0 } as any,
      ...workTypes.value,
    ];
    post.mockResolvedValue({ assignment: { ...asg, id: "n1" } });
    render(<AssignmentModal copyFrom={{ ...asg, type_id: "w0" }} defaultClassId="c1" onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(bodyOf(0).type_id).toBe("w1");
  });

  it("the server's Thai refusal of an archived type is shown as it is", async () => {
    post.mockRejectedValueOnce(new ApiError(422, "work_type_archived", "ประเภทงานนี้ถูกเก็บไปแล้ว — เลือกประเภทงานอื่น"));
    render(<AssignmentModal defaultClassId="c1" onClose={onClose} onSaved={onSaved} />);
    fireEvent.input(screen.getByPlaceholderText(/เช่น ใบงานที่ 5/), { target: { value: "งานใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
    expect(await screen.findByText("ประเภทงานนี้ถูกเก็บไปแล้ว — เลือกประเภทงานอื่น")).toBeTruthy();
  });
});

describe("AssignmentModal raise-full-score question", () => {
  it("first request has no raise_choice; 409 opens the question with server numbers", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    const dlg = await screen.findByRole("dialog", { name: NAME });
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(bodyOf(0).raise_choice).toBeUndefined();
    expect(dlg.textContent).toContain("ใบงานที่ 5");
    expect(dlg.textContent).toContain("10/10");
    expect(dlg.textContent).toContain("20/20");
    expect(screen.getByRole("button", { name: "คงไว้ 10/20" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ปรับเป็น 20/20" }).className).toContain("primary");
  });

  it("adjust resends with raise_choice + raise_from, then toasts with undo", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    await screen.findByRole("dialog", { name: NAME });
    post.mockResolvedValueOnce({ ok: true, assignment: { ...asg, full_score: 20 }, raise: { choice: "adjust", from: 10, to: 20, count: 3, batchId: "B1" } });
    fireEvent.click(screen.getByRole("button", { name: "ปรับเป็น 20/20" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(bodyOf(1)).toMatchObject({ raise_choice: "adjust", raise_from: 10, full_score: 20 });
    const t = toasts.value.find((x) => x.message === "บันทึกแล้ว · ปรับเป็นเต็มใหม่ 3 คน")!;
    expect(t.sticky).toBe(true);
    expect(t.action?.label).toBe("ย้อนกลับ");
    post.mockResolvedValueOnce({ ok: true, changed: 3 });
    await t.action!.run();
    expect(post.mock.calls[2][0]).toBe("/api/assignments/a1/bulk-undo");
    expect(bodyOf(2)).toEqual({ batchId: "B1" });
    expect(onSaved).toHaveBeenCalledTimes(1); // undo reloads via onReload, never re-closes a form
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("undo refused with modified_since shows our own message", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    await screen.findByRole("dialog", { name: NAME });
    post.mockResolvedValueOnce({ ok: true, assignment: asg, raise: { choice: "adjust", from: 10, to: 20, count: 3, batchId: "B1" } });
    fireEvent.click(screen.getByRole("button", { name: "ปรับเป็น 20/20" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const t = toasts.value.find((x) => x.action)!;
    post.mockRejectedValueOnce(new ApiError(409, "modified_since", "มีการแก้ไขหลังการล้าง"));
    await t.action!.run();
    expect(toasts.value.some((x) => x.message === "มีคะแนนถูกแก้หลังปรับ — ย้อนกลับไม่ได้ แก้ในสมุดคะแนนแทน")).toBe(true);
  });

  it("keep resends with keep and shows no undo toast", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    await screen.findByRole("dialog", { name: NAME });
    post.mockResolvedValueOnce({ ok: true, assignment: asg, raise: { choice: "keep", from: 10, to: 20, count: 3, batchId: null } });
    fireEvent.click(screen.getByRole("button", { name: "คงไว้ 10/20" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(bodyOf(1)).toMatchObject({ raise_choice: "keep", raise_from: 10 });
    expect(toasts.value.some((x) => x.action)).toBe(false);
  });

  it("cancel and Esc return to the form without a request", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    await screen.findByRole("dialog", { name: NAME });
    const ask = screen.getByRole("dialog", { name: NAME });
    fireEvent.click(Array.from(ask.querySelectorAll("button")).find((b) => b.textContent === "ยกเลิก")!);
    expect(screen.queryByRole("dialog", { name: NAME })).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("คะแนนเต็ม") as HTMLInputElement).value).toBe("20");
    // ask again, close with Esc
    post.mockRejectedValueOnce(raiseRequired());
    fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
    await screen.findByRole("dialog", { name: NAME });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: NAME })).toBeNull());
    expect(post).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("double click sends one request", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    await screen.findByRole("dialog", { name: NAME });
    post.mockReturnValueOnce(new Promise(() => {}));
    const btn = screen.getByRole("button", { name: "ปรับเป็น 20/20" });
    fireEvent.click(btn); fireEvent.click(btn);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("full_score_changed closes the question and shows the message in the form", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    await screen.findByRole("dialog", { name: NAME });
    post.mockRejectedValueOnce(new ApiError(409, "full_score_changed", "คะแนนเต็มของงานนี้เพิ่งถูกแก้จากเครื่องอื่น (ตอนนี้ 15) — ปิดแล้วเปิดแก้ไขงานใหม่", {}));
    fireEvent.click(screen.getByRole("button", { name: "ปรับเป็น 20/20" }));
    await screen.findByText(/ตอนนี้ 15/);
    expect(screen.queryByRole("dialog", { name: NAME })).toBeNull();
    expect((screen.getByLabelText("คะแนนเต็ม") as HTMLInputElement).value).toBe("20");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("a plain 200 (raise null) saves without any question", async () => {
    post.mockResolvedValueOnce({ ok: true, assignment: { ...asg, full_score: 20 }, raise: null });
    openAndRaise();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/ปรับคนที่ได้เต็ม/)).toBeNull();
    expect(toasts.value.length).toBe(0);
  });

  it("returns focus to the save button after the question closes (cancel, outside tap)", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    const ask = await screen.findByRole("dialog", { name: NAME });
    fireEvent.click(Array.from(ask.querySelectorAll("button")).find((b) => b.textContent === "ยกเลิก")!);
    const save = screen.getByRole("button", { name: /บันทึกงาน/ });
    await waitFor(() => expect(document.activeElement).toBe(save));
    post.mockRejectedValueOnce(raiseRequired());
    fireEvent.click(save);
    const ask2 = await screen.findByRole("dialog", { name: NAME });
    fireEvent.click(ask2.parentElement!); // tap outside the box
    expect(screen.queryByRole("dialog", { name: NAME })).toBeNull();
    expect(post).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(document.activeElement).toBe(save));
  });

  it("keeps the undo toast even when this device cannot store the saved work", async () => {
    post.mockRejectedValueOnce(raiseRequired());
    openAndRaise();
    await screen.findByRole("dialog", { name: NAME });
    assignments.value = [asg];
    const store = await import("@client/store");
    const spy = vi.spyOn(store, "upsertAssignment").mockResolvedValue(false);
    post.mockResolvedValueOnce({ ok: true, assignment: { ...asg, full_score: 20 }, raise: { choice: "adjust", from: 10, to: 20, count: 3, batchId: "B1" } });
    fireEvent.click(screen.getByRole("button", { name: "ปรับเป็น 20/20" }));
    await screen.findByText(/ข้อมูลในเครื่องเปลี่ยนระหว่างบันทึก/);
    expect(toasts.value.some((x) => x.action?.label === "ย้อนกลับ")).toBe(true);
    spy.mockRestore();
  });
});

describe("undo from the toast and the Gradebook page", () => {
  const A = { ...asg, id: "a1", title: "งาน A", class_ids: ["c1"] } as any;
  const B = { ...asg, id: "a2", title: "งาน B", class_ids: ["c1"] } as any;
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    route.value = "/gradebook?class=c1&subject=s1";
    classes.value = [
      { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 } as any,
      { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, archived: false, year: 2569, updated_at: 0 } as any,
    ];
    students.value = [];
    assignments.value = [A, B];
    get.mockReset();
    get.mockImplementation(async (path: string) => {
      const cls = new URLSearchParams(path.split("?")[1]).get("class");
      return { students: [], assignments: [{ ...(cls === "c1" ? A : B), class_ids: [cls] }], submissions: [] };
    });
  });

  const openEdit = () => { fireEvent.click(screen.getByRole("button", { name: "จัดการงาน" })); fireEvent.click(screen.getByRole("menuitem", { name: /แก้ไข/ })); };

  it("undo does not close a different form that is open, and keeps what was typed", async () => {
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /งาน A/ });
    openEdit();
    // the page-level form for A: raise it
    fireEvent.input(await screen.findByLabelText("คะแนนเต็ม"), { target: { value: "20" } });
    post.mockRejectedValueOnce(raiseRequired());
    fireEvent.click(screen.getByRole("button", { name: /บันทึกงาน/ }));
    await screen.findByRole("dialog", { name: NAME });
    post.mockResolvedValueOnce({ ok: true, assignment: { ...A, full_score: 20 }, raise: { choice: "adjust", from: 10, to: 20, count: 3, batchId: "B1" } });
    fireEvent.click(screen.getByRole("button", { name: "ปรับเป็น 20/20" }));
    await waitFor(() => expect(toasts.value.some((x) => x.action)).toBe(true));
    await waitFor(() => expect(screen.queryByLabelText("คะแนนเต็ม")).toBeNull());
    // open the form again and type something, then undo from the toast
    openEdit();
    const title = await screen.findByPlaceholderText(/ใบงานที่ 5/);
    fireEvent.input(title, { target: { value: "พิมพ์ค้างไว้" } });
    post.mockResolvedValueOnce({ ok: true, changed: 3 });
    await toasts.value.find((x) => x.action)!.action!.run();
    await waitFor(() => expect(post.mock.calls.at(-1)![0]).toBe("/api/assignments/a1/bulk-undo"));
    expect((screen.getByPlaceholderText(/ใบงานที่ 5/) as HTMLInputElement).value).toBe("พิมพ์ค้างไว้");
  });
});
