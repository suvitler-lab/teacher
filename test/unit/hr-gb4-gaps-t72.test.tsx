// T-72: test gaps proved by QA-B mutation on the gradebook drawer (verify-qa-b.md M48-1, M48-3, M48-5, M48-10).
// The pill counts only the drawer cards that are on (R-4805); the drawer lists are capped at 8 on screen but the copied list is not (BR-36);
// the order is most-waiting first. Fictitious names only; `api` is a mock.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, cleanup, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/lib/reportExport", () => ({ exportTermExcel: vi.fn() }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), flush: vi.fn(async () => {}), onResult: () => () => {} }));

import { GradebookPage } from "@client/pages/Gradebook";
import { drawerLists } from "@client/components/gradebook/GradebookCards";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";
import { pendingOps } from "@client/lib/outbox";
import { setHide } from "@client/lib/hideNames";

const asg = (id: string, over: Partial<Assignment> = {}): Assignment => ({
  id, title: "งาน " + id, publish_scores: true, term_id: "t1", subject_id: "math", type_id: "w", unit: null,
  full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05", note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null, ...over,
});
const kid = (n: number): Student => ({
  id: "m" + n, code: "m" + n, qr_token: "m" + n, prefix: null, first_name: "เด็ก" + n, last_name: "สมมติ", nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
// score null = handed in, waiting for a score ("awaiting"); a number = scored
const sub = (a: string, s: string, score: number | null = 5) => ({ assignment_id: a, student_id: s, status: "submitted", score, late: false, submitted_at: Date.UTC(2020, 0, 2, 5), method: "camera", updated_at: 0 });
type Sub = ReturnType<typeof sub>;

const feed = (k: Student[], w: Assignment[], r: Sub[]) => { students.value = k; get.mockImplementation(async () => ({ students: k, assignments: w, submissions: r })); };
const layout = (hidden: string[]) => { settings.value = { ...(settings.value as object), gradebook_cards: JSON.stringify({ v: 1, order: ["summary", "awaiting", "close", "legend", "shortcuts", "follow", "dist", "recent"], hidden }) } as never; };
const written = () => (navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

beforeEach(() => {
  cleanup(); vi.clearAllMocks(); localStorage.clear(); pendingOps.value = new Map(); setHide("gradebook", false);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  workTypes.value = [{ id: "w", name: "ใบงาน", icon: "x", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false }] as any;
  layout([]);
});

const pill = () => document.querySelector(".gbh-pill") as HTMLElement;
const openDrawer = async () => { render(<GradebookPage />); await screen.findByRole("table"); fireEvent.click(pill()); return screen.findByRole("dialog", { name: "สรุปสมุดคะแนน" }); };
const card = (dlg: HTMLElement, name: string) => dlg.querySelector(`section[aria-label="${name}"]`) as HTMLElement | null;
const rowsOf = (sec: HTMLElement) => [...sec.querySelectorAll<HTMLElement>("button.gc-row, div.gc-row")];

describe("M48-1/3 the pill counts only the drawer cards that are on (R-4805)", () => {
  // w1: overdue, m1 handed in and waits for a score, m2 handed in nothing -> 1 waiting, 1 to close, 1 child behind
  const fixture = () => feed([kid(1), kid(2)], [asg("w1")], [sub("w1", "m1", null)]);

  it("all three on: the three parts and the short form add up to 3", async () => {
    fixture();
    render(<GradebookPage />); await screen.findByRole("table");
    expect(pill().getAttribute("aria-label")).toBe("รอตรวจ 1 งาน · ควรปิดรับ 1 · ต้องติดตาม 1 คน");
    expect(pill().querySelector(".sht")!.textContent).toBe("ดูสรุป (3)");
  });

  it("each part leaves the pill (label, long text and short sum) when its card is hidden, and only that part", async () => {
    const cases: [string, RegExp][] = [["awaiting", /รอตรวจ/], ["close", /ควรปิดรับ/], ["follow", /ต้องติดตาม/]];
    for (const [hidden, gone] of cases) {
      cleanup(); fixture(); layout([hidden]);
      render(<GradebookPage />); await screen.findByRole("table");
      const label = pill().getAttribute("aria-label")!;
      expect(label, hidden).not.toMatch(gone);
      expect(pill().querySelector(".lng")!.textContent, hidden).not.toMatch(gone);
      expect(pill().querySelector(".sht")!.textContent, hidden).toBe("ดูสรุป (2)");
      for (const [other, re] of cases) if (other !== hidden) expect(label, `${hidden} hidden keeps ${other}`).toMatch(re);
    }
  });

  it("all three hidden: the pill falls back to ดูสรุป without a number", async () => {
    fixture(); layout(["awaiting", "close", "follow"]);
    render(<GradebookPage />); await screen.findByRole("table");
    expect(pill().getAttribute("aria-label")).toBe("ดูสรุป");
    expect(pill().querySelector(".sht")!.textContent).toBe("ดูสรุป");
  });

  it("the drawer agrees with the pill: a hidden card is not drawn, a shown one is", async () => {
    fixture(); layout(["close"]);
    const dlg = await openDrawer();
    expect(card(dlg, "ควรปิดรับ")).toBeNull();
    expect(card(dlg, "รอตรวจ")).toBeTruthy();
    expect(card(dlg, "ต้องติดตาม")).toBeTruthy();
  });
});

describe("M48-5 cap of 8 on screen, none in the copied list (BR-36)", () => {
  // ten children; odd numbers miss 3 works, even numbers miss 2 (they handed in w1)
  const ten = () => {
    const k = Array.from({ length: 10 }, (_, i) => kid(i + 1));
    feed(k, [asg("w1"), asg("w2"), asg("w3")], k.filter((s) => s.number! % 2 === 0).map((s) => sub("w1", s.id)));
  };

  it("the follow card draws 8 rows and says 8 of 10; the head count is all 10", async () => {
    ten();
    const dlg = await openDrawer();
    const follow = card(dlg, "ต้องติดตาม")!;
    expect(rowsOf(follow).length).toBe(8);
    expect(follow.textContent).toContain("แสดง 8 คนแรกจาก 10 คน");
    expect(follow.querySelector(".gd-n")!.textContent).toBe("10");
    expect(pill().getAttribute("aria-label")).toContain("ต้องติดตาม 10 คน");
  });

  it("the copied list holds all 10 children, not 8", async () => {
    ten();
    const dlg = await openDrawer();
    await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: /คัดลอกรายชื่อ/ })); });
    const text = written();
    expect(text.split("\n").length).toBe(1 + 10);
    expect(text).toContain("10 เด็ก10 สมมติ (ค้าง 2)");
  });

  it("8 children: no 'first 8 of n' note", async () => {
    const k = Array.from({ length: 8 }, (_, i) => kid(i + 1));
    feed(k, [asg("w1")], []);
    const dlg = await openDrawer();
    expect(rowsOf(card(dlg, "ต้องติดตาม")!).length).toBe(8);
    expect(card(dlg, "ต้องติดตาม")!.textContent).not.toContain("คนแรกจาก");
  });

  it("nine works waiting: the waiting card draws 8 rows", async () => {
    const k = [kid(1)];
    const w = Array.from({ length: 9 }, (_, i) => asg("w" + (i + 1)));
    feed(k, w, w.map((a) => sub(a.id, "m1", null)));
    const dlg = await openDrawer();
    expect(rowsOf(card(dlg, "รอตรวจ")!).length).toBe(8);
  });

  it("drawerLists: the waiting list is cut at 8 (9 works waiting); the follow list shows 8 but keeps all 9", () => {
    const w = Array.from({ length: 9 }, (_, i) => asg("w" + (i + 1)));
    const k = Array.from({ length: 9 }, (_, i) => kid(i + 1));
    const l = drawerLists({ assignments: w, students: k, today: "2020-02-01", stateOf: () => "awaiting" });
    expect(l.awaitingBy.length).toBe(8);
    const l2 = drawerLists({ assignments: w, students: k, today: "2020-02-01", stateOf: () => "missing" });
    expect(l2.missingAll.length).toBe(9);
    expect(l2.missingBy.length).toBe(8);
  });
});

describe("M48-10 order: most waiting first (BR-36)", () => {
  it("drawer: waiting works go wB (3), wC (2), wA (1); children go most behind first; the copy keeps that order", async () => {
    const k = [kid(1), kid(2), kid(3), kid(4)];
    // waiting per work: wA 1 (m1) · wB 3 (m1 m2 m3) · wC 2 (m1 m2); m4 handed in nothing (behind on 3), m3 behind on wA wC (2), m2 on wA (1), m1 none
    feed(k, [asg("wA"), asg("wB"), asg("wC")], [sub("wA", "m1", null), sub("wB", "m1", null), sub("wB", "m2", null), sub("wB", "m3", null), sub("wC", "m1", null), sub("wC", "m2", null)]);
    const dlg = await openDrawer();
    expect(rowsOf(card(dlg, "รอตรวจ")!).map((r) => r.textContent)).toEqual(["งาน wB3", "งาน wC2", "งาน wA1"]);
    expect(rowsOf(card(dlg, "ต้องติดตาม")!).map((r) => r.textContent)).toEqual(["4 เด็ก4 สมมติค้าง 3", "3 เด็ก3 สมมติค้าง 2", "2 เด็ก2 สมมติค้าง 1"]);
    await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: /คัดลอกรายชื่อ/ })); });
    expect(written()).toBe(["ป.6/1 · คณิตศาสตร์ · ค้างส่ง", "4 เด็ก4 สมมติ (ค้าง 3)", "3 เด็ก3 สมมติ (ค้าง 2)", "2 เด็ก2 สมมติ (ค้าง 1)"].join("\n"));
  });

  it("drawerLists: the children kept are the ones with the most; ties keep the table order", () => {
    const k = Array.from({ length: 10 }, (_, i) => kid(i + 1));
    const w = ["a", "b", "c", "d"].map((id) => asg(id));
    // child n is missing (n % 4) + 1 of the 4 works
    const l = drawerLists({ assignments: w, students: k, today: "2020-02-01", stateOf: (aid, sid) => (w.findIndex((x) => x.id === aid) <= Number(sid.slice(1)) % 4 ? "missing" : "scored") });
    const ns = l.missingAll.map((x) => x.n);
    expect(ns).toEqual([...ns].sort((a, b) => b - a));
    expect(l.missingBy.map((x) => x.st.number)).toEqual([3, 7, 2, 6, 10, 1, 5, 9]);
  });

  it("drawerLists: with 10 works waiting, the 8 kept are the biggest, biggest first", () => {
    const w = Array.from({ length: 10 }, (_, i) => asg("w" + (i + 1)));
    const k = Array.from({ length: 10 }, (_, i) => kid(i + 1));
    // work wN is waiting for children 1..N
    const l = drawerLists({ assignments: w, students: k, today: "2020-02-01", stateOf: (aid, sid) => (Number(sid.slice(1)) <= Number(aid.slice(1)) ? "awaiting" : "scored") });
    expect(l.awaitingBy.map((x) => x.n)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  });
});
