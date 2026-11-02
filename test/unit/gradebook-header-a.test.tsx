// gb-header-a ("A: tint head"): the head names the work type in words (title / aria-label), carries a shape per type, a calendar + due date, a lock when closed; the progress bar stays.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({
  ...await orig<typeof import("@client/lib/api")>(), api: { get, post },
}));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
const { flush } = vi.hoisted(() => ({ flush: vi.fn(async () => {}) }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), flush }));

import { GradebookPage } from "@client/pages/Gradebook";
import { classes, currentTermId, selectedTermId, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";

const asg = (id: string, title: string, type_id: string, assigned_date: string, due_date: string | null = null): Assignment => ({
  id, title, publish_scores: true, term_id: "t1", subject_id: "math", type_id, unit: null,
  full_score: 10, assigned_date, due_date, note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
const kid = (id: string, number: number): Student => ({
  id, code: id, qr_token: id, prefix: null, first_name: "เด็ก" + number, last_name: "สมมติ",
  nickname: null, class_id: "c1", number, status: "active", left_at: null, updated_at: 0,
});
let list: Assignment[];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("ngankrob.gb.groupMode.v2", "none");
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
  const kids = [kid("k1", 1), kid("k2", 2)];
  students.value = kids;
  list = [asg("w1", "ใบงาน 1", "w", "2020-01-01", "2020-01-05"), { ...asg("e1", "แบบฝึกหัด 1", "e", "2020-01-01", null), status: "closed", publish_scores: false }];
  get.mockImplementation(async () => ({ students: kids, assignments: list, submissions: [{ assignment_id: "w1", student_id: "k1", status: "submitted", score: 8, late: false }] }));
});

describe("gradebook column heads (A: tint head)", () => {
  it("title and aria-label start with the type name; the submit rate and flags ride in the title", async () => {
    render(<GradebookPage />);
    const head = await screen.findByRole("columnheader", { name: /^ใบงาน: ใบงาน 1/ });
    expect(head.getAttribute("aria-label")).toBe(head.getAttribute("title"));
    expect(head.getAttribute("aria-label")).toMatch(/^ใบงาน: ใบงาน 1 · เต็ม 10 · ส่งแล้ว [0-9]+%$/);
    expect(head.getAttribute("title")).toMatch(/^ใบงาน: ใบงาน 1 · เต็ม 10 · ส่งแล้ว [0-9]+%$/);
    const closed = screen.getByRole("columnheader", { name: /^แบบฝึกหัด: แบบฝึกหัด 1/ });
    expect(closed.getAttribute("title")).toMatch(/^แบบฝึกหัด: แบบฝึกหัด 1 · เต็ม 10 · ปิดรับ · ซ่อนคะแนน · ส่งแล้ว [0-9]+%$/);
  });

  it("the ground is the type's tint, the ink of shape / bar is its dark colour; a shape (not colour alone) leads the title", async () => {
    render(<GradebookPage />);
    const head = await screen.findByRole("columnheader", { name: /^ใบงาน: ใบงาน 1/ });
    expect(head.getAttribute("style")).toContain("--hb: var(--tint-violet-bg)");
    expect(head.getAttribute("style")).toContain("--f: var(--tint-violet-fg)");
    const shapes = [...document.querySelectorAll("th[data-aid] .ttl svg.tshape")].map((x) => x.innerHTML);
    expect(shapes.length).toBe(2);
    expect(shapes[0]).not.toBe(shapes[1]);   // violet and aqua do not share a shape
    expect(head.querySelector(".ttl svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("meta line: full score, a calendar icon and the due date; no due date shows a dash", async () => {
    render(<GradebookPage />);
    const head = await screen.findByRole("columnheader", { name: /^ใบงาน: ใบงาน 1/ });
    const span = head.querySelector(".hs > span")!;
    expect(span.textContent).toBe("เต็ม 105 ม.ค.");   // full score 10, then the calendar icon, then "5 ม.ค."
    expect(span.querySelector("i.ti-calendar")).toBeTruthy();
    const none = screen.getByRole("columnheader", { name: /^แบบฝึกหัด: แบบฝึกหัด 1/ });
    expect(none.querySelector(".hs > span")!.textContent).toBe("เต็ม 10—");
  });

  it("closed = a lock in the corner; the eye shows on a column that hides its scores, and on the picked one only otherwise", async () => {
    render(<GradebookPage />);
    const head = await screen.findByRole("columnheader", { name: /^ใบงาน: ใบงาน 1/ });
    const closed = screen.getByRole("columnheader", { name: /^แบบฝึกหัด: แบบฝึกหัด 1/ });
    expect(closed.classList.contains("closed")).toBe(true);
    expect(closed.classList.contains("x")).toBe(true);
    expect(closed.querySelector(".hd-corner i.ti-lock")).toBeTruthy();
    expect(closed.querySelector(".hd-corner .hs-eye.off")).toBeTruthy();   // scores hidden -> crossed eye
    expect(head.querySelector("i.ti-lock")).toBeNull();
    expect(head.classList.contains("sel") && head.classList.contains("x")).toBe(true);   // the first column is the picked one: its eye shows
    fireEvent.click(closed);
    expect(head.classList.contains("sel") || head.classList.contains("x")).toBe(false);  // not picked, scores showing, open: nothing in the corner (the CSS keeps its eye hidden)
  });

  it("the progress bar is still in the head (and still obeys the menu)", async () => {
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /^ใบงาน: ใบงาน 1/ });
    expect(document.querySelectorAll("th[data-aid] .hbar").length).toBe(2);
    expect(document.querySelector("th[data-aid] .hbar")!.getAttribute("title")).toMatch(/^ส่งแล้ว [0-9]+%$/);
  });

  it("ungrouped: no legend (the shape + the title carry the type)", async () => {
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /^ใบงาน: ใบงาน 1/ });
    expect(document.querySelector(".gb-tlegend")).toBeNull();
  });

  it("grouped by type: the bar carries shape + type name; a one-column group hides its count so the name is never cut", async () => {
    localStorage.setItem("ngankrob.gb.groupMode.v2", "type");
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /^ใบงาน: ใบงาน 1/ });
    const bars = [...document.querySelectorAll("tr.gh .gh-cell")];
    expect(bars.map((b) => b.querySelector(".gh-label")!.textContent)).toEqual(["ใบงาน", "แบบฝึกหัด"]);
    expect(bars.every((b) => b.querySelector("svg.tshape"))).toBe(true);
    expect(bars.every((b) => b.classList.contains("nar"))).toBe(true);
    expect(bars[0].querySelector("button")!.getAttribute("title")).toBe("ใบงาน · 1 งาน");
  });
});
