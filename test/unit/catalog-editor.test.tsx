// Settings ▸ พื้นฐาน: rename, recolour, default full score and ordering of classes / subjects / work types
// (the API always took these; the screen only offered "add" and "archive").
import { describe, it, expect, beforeEach, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post, put: vi.fn() } };
});

import { render, screen, fireEvent, waitFor, within } from "@testing-library/preact";
import { CatalogEditor } from "@client/components/CatalogEditor";
import { classes, subjects, workTypes, terms, currentTermId } from "@client/store";
import type { Class, Subject, WorkType } from "@shared/types";

const cls = (o: Partial<Class>): Class => ({ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 10, archived: false, year: 2569, updated_at: 0, ...o });
const sub = (o: Partial<Subject>): Subject => ({ id: "s1", code: "ว16101", name: "วิทย์", color: "blue", sort: 10, archived: false, updated_at: 0, ...o });
const wt = (o: Partial<WorkType>): WorkType => ({ id: "w1", name: "ใบงาน", icon: "file-text", color: "violet", is_exam: false, default_full: 10, sort: 10, archived: false, updated_at: 0, ...o });

function bootstrapOf() {
  return {
    settings: { theme: "light" }, terms: terms.value, currentTermId: currentTermId.value,
    classes: classes.value, subjects: subjects.value, workTypes: workTypes.value,
    students: [], revokedTokens: {}, qrRotatedAt: {}, assignments: [], dataEpoch: 1, serverTime: Date.now(),
  };
}

beforeEach(() => {
  get.mockReset(); post.mockReset();
  post.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 } as any];
  currentTermId.value = "t1";
  classes.value = [cls({})];
  subjects.value = [sub({}), sub({ id: "s2", name: "คณิต", code: null, color: "green", sort: 20 })];
  workTypes.value = [wt({}), wt({ id: "w2", name: "สอบ", is_exam: true, default_full: 20, sort: 20 })];
  get.mockImplementation(async () => bootstrapOf());
});

const tab = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const posted = () => post.mock.calls.map(([path, body]) => ({ path, ...(body as object) })) as any[];

describe("catalog editor", () => {
  it("shows the academic year of every class", () => {
    render(<CatalogEditor />);
    expect(screen.getByText(/ปีการศึกษา 2569/)).toBeTruthy();
  });

  it("renames a class and keeps its grade when the new name has no slash", async () => {
    render(<CatalogEditor />);
    fireEvent.click(screen.getByRole("button", { name: "แก้ไข" }));
    fireEvent.input(screen.getByLabelText("ชื่อห้อง ป.6/1"), { target: { value: "ป.6 ก" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(posted()[0]).toMatchObject({ path: "/api/classes", id: "c1", name: "ป.6 ก", grade: "ป.6", sort: 10, archived: false });
  });

  it("changes a subject's name and colour, and keeps everything else about it", async () => {
    render(<CatalogEditor />);
    tab("วิชา");
    fireEvent.click(screen.getAllByRole("button", { name: "แก้ไข" })[0]);
    fireEvent.input(screen.getByLabelText("ชื่อวิชา วิทย์"), { target: { value: "วิทยาศาสตร์" } });
    fireEvent.input(screen.getByLabelText("สีของ วิทย์"), { target: { value: "red" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(posted()[0]).toMatchObject({ path: "/api/subjects", id: "s1", name: "วิทยาศาสตร์", code: "ว16101", color: "red", sort: 10, archived: false });
  });

  it("saving stays off until something changed", () => {
    render(<CatalogEditor />);
    tab("วิชา");
    fireEvent.click(screen.getAllByRole("button", { name: "แก้ไข" })[0]);
    expect((screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a work type's default full score must be a whole number 1–100", async () => {
    render(<CatalogEditor />);
    tab("ประเภทงาน");
    fireEvent.click(screen.getAllByRole("button", { name: "แก้ไข" })[0]);
    const full = screen.getByLabelText("คะแนนเต็มเริ่มต้นของ ใบงาน");
    const save = () => screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement;
    for (const bad of ["0", "101", "", "7.5", "-3"]) {
      fireEvent.input(full, { target: { value: bad } });
      expect(save().disabled, `"${bad}" must not be savable`).toBe(true);
    }
    fireEvent.input(full, { target: { value: "25" } });
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(posted()[0]).toMatchObject({ path: "/api/work-types", id: "w1", default_full: 25, is_exam: false, icon: "file-text" });
  });

  it("moving a row up swaps its order with its neighbour — and only those two rows are written", async () => {
    render(<CatalogEditor />);
    tab("วิชา");
    fireEvent.click(screen.getByRole("button", { name: "เลื่อน คณิต ขึ้น" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const byId = Object.fromEntries(posted().map((p) => [p.id, p.sort]));
    expect(byId).toEqual({ s2: 10, s1: 20 });
  });

  it("rows that all share one order number are renumbered, so a move always changes the order", async () => {
    subjects.value = [sub({ id: "a", name: "ก", sort: 0 }), sub({ id: "b", name: "ข", sort: 0 }), sub({ id: "c", name: "ค", sort: 0 })];
    render(<CatalogEditor />);
    tab("วิชา");
    fireEvent.click(screen.getByRole("button", { name: "เลื่อน ข ขึ้น" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(Object.fromEntries(posted().map((p) => [p.id, p.sort]))).toEqual({ b: 10, a: 20, c: 30 });
  });

  it("the first row cannot move up and the last cannot move down", () => {
    render(<CatalogEditor />);
    tab("วิชา");
    expect((screen.getByRole("button", { name: "เลื่อน วิทย์ ขึ้น" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เลื่อน คณิต ลง" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เลื่อน วิทย์ ลง" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a failed save says so and leaves the editor open with what was typed", async () => {
    post.mockRejectedValueOnce(new Error("boom"));
    render(<CatalogEditor />);
    tab("วิชา");
    fireEvent.click(screen.getAllByRole("button", { name: "แก้ไข" })[0]);
    fireEvent.input(screen.getByLabelText("ชื่อวิชา วิทย์"), { target: { value: "ใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText("ชื่อวิชา วิทย์") as HTMLInputElement).value).toBe("ใหม่");
    expect(within(document.body).getAllByRole("button", { name: "บันทึก" }).length).toBe(1);
  });
});
