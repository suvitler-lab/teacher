// gb-1a: grouped columns, folded-group totals, group-mode memory, and the "ทำทั้งห้อง" menu + confirm dialog.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({
  ...await orig<typeof import("@client/lib/api")>(), api: { get, post },
}));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
const { flush } = vi.hoisted(() => ({ flush: vi.fn(async () => {}) }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), flush }));

import { GradebookPage, bulkAffectedCount } from "@client/pages/Gradebook";
import { classes, currentTermId, selectedTermId, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";

const asg = (id: string, title: string, type_id: string, assigned_date: string, due_date: string | null = null): Assignment => ({
  id, title, publish_scores: true, term_id: "t1", subject_id: "math", type_id, unit: null,
  full_score: 10, assigned_date, due_date, note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
const kid = (id: string, number: number, status = "active"): Student => ({
  id, code: id, qr_token: id, prefix: null, first_name: "เด็ก" + number, last_name: "สมมติ",
  nickname: null, class_id: "c1", number, status: status as any, left_at: null, updated_at: 0,
});
let rows: { assignment_id: string; student_id: string; status: string; score: number | null; late: boolean }[];
let list: Assignment[];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  workTypes.value = [
    { id: "w", name: "ใบงาน", icon: "x", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false },
    { id: "e", name: "แบบฝึกหัด", icon: "x", color: "aqua", is_exam: false, default_full: 10, sort: 2, archived: false },
  ] as any;
  const kids = [kid("k1", 1), kid("k2", 2), kid("k3", 3)];
  students.value = kids;
  // ใบงาน: two old pieces of work (2020, always older than a month) · แบบฝึกหัด: one far-future piece (never old)
  list = [asg("w1", "ใบงาน 1", "w", "2020-01-01", "2020-01-05"), asg("w2", "ใบงาน 2", "w", "2020-01-02", "2020-01-06"), asg("e1", "แบบฝึกหัด 1", "e", "2099-01-01")];
  rows = [
    { assignment_id: "w1", student_id: "k1", status: "submitted", score: 8, late: false },   // k1: 8 of w1, w2 missing (counts 0) -> 8/20
    { assignment_id: "w1", student_id: "k2", status: "submitted", score: 7.5, late: false }, // k2: 7.5 + 4.5 -> 12/20 (half points exact)
    { assignment_id: "w2", student_id: "k2", status: "submitted", score: 4.5, late: false },
    { assignment_id: "w1", student_id: "k3", status: "excused", score: null, late: false },  // k3: both excused/none -> "–"
    { assignment_id: "w2", student_id: "k3", status: "excused", score: null, late: false },
    { assignment_id: "e1", student_id: "k1", status: "submitted", score: 5, late: false },
  ];
  get.mockImplementation(async () => ({ students: kids, assignments: list, submissions: rows }));
  post.mockImplementation(async () => ({ changed: 1, batchId: "b1" }));
});

async function open() {
  render(<GradebookPage />);
  await screen.findByRole("columnheader", { name: /แบบฝึกหัด 1/ });
}
const bodyRow = (n: number) => [...document.querySelectorAll("table.gb tbody tr")][n].querySelectorAll("td");
const text = (n: number) => [...bodyRow(n)].map((c) => c.textContent);

describe("grouped gradebook columns", () => {
  it("defaults to by-type: the old group is folded to one 'รวม' column holding the BR-05 total; the recent group stays open", async () => {
    await open();
    expect(screen.getByRole("columnheader", { name: /รวม ใบงาน/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /^ใบงาน 1/ })).toBeNull();
    // [name, รวมใบงาน, แบบฝึกหัด 1, สะสม]
    expect(text(0)[1]).toBe("8/20");      // missing w2 counts as 0 of 10
    expect(text(1)[1]).toBe("12/20");     // 7.5 + 4.5 exactly
    expect(text(2)[1]).toBe("–");         // only excused: no score at all is a dash, not 0
    expect(text(0).length).toBe(4);
  });

  it("the folded total equals the สะสม rule over the same work (k1: 8/20 + 5/10 = 13/30)", async () => {
    await open();
    expect(text(0)[3]).toBe("13/30");
  });

  it("tap a group header to open it, tap again to fold it back; 'กางทั้งหมด' / 'พับทั้งหมด' do all at once", async () => {
    await open();
    const btn = () => screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") !== null && /ใบงาน/.test(b.textContent ?? ""))!;
    expect(btn().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn());
    await screen.findByRole("columnheader", { name: /^ใบงาน 1/ });
    expect(text(0).slice(1, 3)).toEqual(["8", "–"]);
    fireEvent.click(btn());
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: /^ใบงาน 1/ })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /พับทั้งหมด/ }));
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /รวม แบบฝึกหัด/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /กางทั้งหมด/ }));
    await screen.findByRole("columnheader", { name: /^ใบงาน 1/ });
    expect(screen.getByRole("columnheader", { name: /แบบฝึกหัด 1/ })).toBeTruthy();
  });

  it("'ไม่จัดกลุ่ม' shows every column flat, remembers the choice on this device, and a reload keeps it", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "ไม่จัดกลุ่ม" }));
    await screen.findByRole("columnheader", { name: /^ใบงาน 1/ });
    expect(document.querySelector("tr.gh")).toBeNull();
    expect(localStorage.getItem("ngankrob.gb.groupMode")).toBe("none");
    cleanup();
    await open();
    await screen.findByRole("columnheader", { name: /^ใบงาน 2/ });
    expect(screen.getByRole("button", { name: "ไม่จัดกลุ่ม" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("by month: one group per month", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "ตามเดือน" }));
    await waitFor(() => expect(document.querySelectorAll("tr.gh .gh-btn").length).toBe(2));
  });

  it("a broken localStorage never stops the page", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "ตามเดือน" }));
    await waitFor(() => expect(document.querySelectorAll("tr.gh .gh-btn").length).toBe(2));
    spy.mockRestore(); set.mockRestore();
  });

  it("the eye in a column header still hides only that column's scores", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /^ใบงาน/ }));
    const head = await screen.findByRole("columnheader", { name: /^ใบงาน 1/ });
    fireEvent.click(within(head).getByRole("button", { name: "ซ่อนคะแนนของงานนี้" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ id: "w1", publish_scores: false });
  });
});

describe("ทำทั้งห้อง menu", () => {
  const openMenu = async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /ทำทั้งห้อง/ }));
  };

  it("has ส่งแล้ว, ให้เต็ม, a separator and a red clear at the bottom", async () => {
    await openMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.trim())).toEqual(["ทั้งห้องส่งแล้ว…", "ให้เต็มคนที่ส่ง…", "ล้างคะแนนทั้งงาน…"]);
    expect(screen.getByRole("separator")).toBeTruthy();
    expect((items[2] as HTMLElement).style.color).toContain("danger");
  });

  it("clear: dialog counts what will really be cleared (excused left out), opens on 'ยกเลิก', cancel changes nothing", async () => {
    await openMenu();                                  // selected work = w1: k1 submitted, k2 submitted, k3 excused
    fireEvent.click(screen.getByRole("menuitem", { name: /ล้างคะแนนทั้งงาน/ }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText(/ล้างคะแนนทั้งงาน 2 คน\?/)).toBeTruthy();
    expect(document.activeElement).toBe(within(dlg).getByRole("button", { name: "ยกเลิก" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it("clear: confirm calls the same bulk endpoint as before", async () => {
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /ล้างคะแนนทั้งงาน/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "ล้าง 2 คน" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/assignments/w1/bulk", { action: "clear", classId: "c1" }));
  });

  it("ส่งแล้ว counts only children not handed in and not excused; ให้เต็ม only handed-in ones not already full", async () => {
    await openMenu();                                  // w1: k1 8, k2 7.5 submitted; k3 excused -> nobody left to mark submitted
    fireEvent.click(screen.getByRole("menuitem", { name: /ทั้งห้องส่งแล้ว/ }));
    const d1 = await screen.findByRole("dialog");
    expect(within(d1).getByText(/ทั้งห้องส่งแล้ว 0 คน\?/)).toBeTruthy();
    expect((within(d1).getByRole("button", { name: "ส่งแล้ว 0 คน" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(d1).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /ทำทั้งห้อง/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ให้เต็มคนที่ส่ง/ }));
    const d2 = await screen.findByRole("dialog");
    expect(within(d2).getByText(/ให้เต็ม 2 คน\?/)).toBeTruthy();
    fireEvent.click(within(d2).getByRole("button", { name: "ให้เต็ม 2 คน" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/assignments/w1/bulk", { action: "full-score", classId: "c1" }));
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("bulkAffectedCount", () => {
  const sub = (status: string, score: number | null = null) => ({ status, score });
  it("matches the server rules", () => {
    const cells = [sub("submitted", 10), sub("submitted", 4), sub("submitted"), sub("excused"), sub("void"), undefined];
    expect(bulkAffectedCount("all-submitted", cells, 10)).toBe(2);   // void + never touched; excused and submitted left alone
    expect(bulkAffectedCount("full-score", cells, 10)).toBe(2);      // 4 and unscored; already-full and excused left alone
    expect(bulkAffectedCount("clear", cells, 10)).toBe(3);
  });
});
