// perf C: the gradebook works out the state of every (work x child) pair ONCE per change of its inputs, and the
// ~600 cells of a real class are drawn once (not again for the scroll-flag render or a cell focus).
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup, act } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({
  ...await orig<typeof import("@client/lib/api")>(), api: { get, post },
}));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
const { flush } = vi.hoisted(() => ({ flush: vi.fn(async () => {}) }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), flush }));
// count every WorkCell that is drawn (one per grid cell + the 9 legend samples)
const { drawn } = vi.hoisted(() => ({ drawn: { n: 0 } }));
vi.mock("@client/components/ui", async (orig) => {
  const real = await orig<typeof import("@client/components/ui")>();
  return { ...real, WorkCell: (p: Parameters<typeof real.WorkCell>[0]) => { drawn.n++; return real.WorkCell(p); } };
});

import { GradebookPage } from "@client/pages/Gradebook";
import { buildMatrix, matrixStats } from "@client/components/gradebook/matrix";
import { classes, currentTermId, selectedTermId, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";
import { workState, countWorkStates, studentSummary } from "@shared/metrics";

const N_KIDS = 44, N_WORK = 14;
const asg = (i: number): Assignment => ({
  id: "a" + i, title: "งาน " + i, publish_scores: i !== 5, term_id: "t1", subject_id: "math", type_id: "w", unit: null,
  full_score: 10, assigned_date: "2020-01-01", due_date: i % 3 === 0 ? "2020-01-05" : i % 3 === 1 ? "2099-01-01" : null, note: null, status: i === 7 ? "closed" : "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
const kid = (n: number): Student => ({
  id: "k" + n, code: "k" + n, qr_token: "k" + n, prefix: null, first_name: "เด็ก" + n, last_name: "สมมติ",
  nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const kids = Array.from({ length: N_KIDS }, (_, i) => kid(i + 1));
const works = Array.from({ length: N_WORK }, (_, i) => asg(i));
// a mix of handed in / scored / excused / void so every state is present
const rows = kids.flatMap((k, ki) => works.flatMap((a, ai) => {
  const r = (ki * 7 + ai * 3) % 5;
  if (r === 0) return [];
  return [{ assignment_id: a.id, student_id: k.id, status: r === 4 ? "excused" : "submitted", score: r === 1 ? null : r === 4 ? null : (ki + ai) % 11, late: r === 3 }];
}));

function fakeLayout(clientWidth: number, scrollWidth: number) {
  const proto = HTMLElement.prototype;
  const dims: Record<string, number> = { clientWidth, scrollWidth };
  for (const k of Object.keys(dims)) {
    Object.defineProperty(proto, k, { configurable: true, get() { return (this as HTMLElement).classList?.contains("gb-scroll") ? dims[k] : 0; } });
  }
}
function clearLayout() { for (const k of ["clientWidth", "scrollWidth"]) delete (HTMLElement.prototype as any)[k]; }

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
  workTypes.value = [{ id: "w", name: "ใบงาน", icon: "x", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false }] as any;
  students.value = kids;
  get.mockImplementation(async () => ({ students: kids, assignments: works, submissions: rows }));
  post.mockImplementation(async () => ({ changed: 1, batchId: "b1" }));
});
afterEach(() => clearLayout());

describe("buildMatrix", () => {
  const sub = (status: string, score: number | null, late = false) => ({ status, score, late });
  it("answers like the per-pair rules: queued edit beats the server, unsaved beats both, marks, counts, totals", () => {
    const a1 = works[0], a2 = works[1]; // a0 overdue, a1 not due yet
    const pk = (a: string, s: string) => `${a}\u0000${s}`;
    const m = buildMatrix({
      assignments: [a1, a2], students: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
      subs: new Map([["a0:s1", sub("submitted", 3)], ["a1:s2", sub("excused", null)], ["a0:s3", sub("submitted", 6, true)]]),
      unsaved: new Map([["a0:s2", { score: 4 }]]),
      pend: new Map([[pk("a0", "s1"), { status: "submitted", score: 9 } as any], [pk("a1", "s2"), { status: "void", score: null } as any]]),
      failed: new Set([pk("a0", "s3")]),
      today: "2026-11-04",
    });
    expect(m.sub("a0", "s1")?.score).toBe(9);             // queued 9 wins over the server's 3
    expect(m.mark("a0", "s1")).toBe("pend");
    expect(m.sub("a0", "s2")).toMatchObject({ status: "submitted", score: 4 }); // unsaved shows what was typed
    expect(m.mark("a0", "s2")).toBe("unsaved");
    expect(m.sub("a1", "s2")).toBeUndefined();            // queued "void" clears the excused cell
    expect(m.state("a1", "s2", a2)).toBe("pending");
    expect(m.mark("a0", "s3")).toBe("fail");
    expect(m.state("a0", "s3", a1)).toBe("late");
    expect(m.missing("s1")).toBe(false);
    expect(m.missing("s3")).toBe(false);
    expect(m.counts("a0")).toEqual(countWorkStates(["scored", "scored", "late"]));
    expect(m.total.total).toBe(6);
    expect(m.average("a0")).toBe(6.3);                    // (9 + 4 + 6) / 3
    expect(m.average("a1")).toBeNull();
    expect(m.summary("s1")).toEqual(studentSummary([a1, a2], (i) => (i === 0 ? { status: "submitted", score: 9, late: false } : undefined), "2026-11-04"));
    // a pair outside the grid still answers from the same rules
    expect(m.sub("a0", "gone")).toBeUndefined();
    expect(m.state("a0", "gone", a1)).toBe(workState(null, a1, "2026-11-04"));
  });
});

describe("GradebookPage 44 x 14", () => {
  it("builds the matrix once, draws each cell once, and a cell focus / keyboard move neither rebuilds nor redraws the table", async () => {
    fakeLayout(800, 3000); // wider than the frame: the scroll-flag render (edge shadow) really happens
    const filledBefore = matrixStats.filled;
    const { container } = render(<GradebookPage />);
    await waitFor(() => expect(container.querySelectorAll("td.cell").length).toBe(N_KIDS * N_WORK));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); // let the flag render and observers settle
    expect(matrixStats.filled - filledBefore).toBe(1);                      // once, not once per render
    const cellsDrawn = drawn.n;
    expect(cellsDrawn).toBe(N_KIDS * N_WORK + 9);            // every cell once (+ the 9 legend samples)
    const nodes = [...container.querySelectorAll("td.cell")];
    expect(container.querySelector(".gb-frame")?.className).toContain("can-r"); // the flag render did happen

    // focus a cell, then move with the arrows: only the two cells that gain / lose the stop are drawn again
    const first = container.querySelector('td[data-aid="a0"][data-sid="k1"]') as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.activeElement).toBe(container.querySelector('td[data-aid="a1"][data-sid="k2"]'));
    expect(matrixStats.filled - filledBefore).toBe(1);                      // no rebuild for focus changes
    expect(drawn.n - cellsDrawn).toBeLessThanOrEqual(8);                         // not ~616 per move
    expect([...container.querySelectorAll("td.cell")].every((el, i) => el === nodes[i])).toBe(true); // same DOM nodes: nothing remounted
  });

  it("header counts, row totals and the average row show the same numbers the cells imply", async () => {
    const { container } = render(<GradebookPage />);
    await waitFor(() => expect(container.querySelectorAll("td.cell").length).toBe(N_KIDS * N_WORK));
    // reference numbers computed the slow way from the raw rows
    const bySub = new Map(rows.map((r) => [`${r.assignment_id}:${r.student_id}`, r]));
    const today = new Date().toISOString().slice(0, 10);
    const refStates = (a: Assignment) => kids.map((k) => { const r = bySub.get(`${a.id}:${k.id}`); return workState(r ? { status: r.status, score: r.score, late: r.late } : null, a, today); });
    const a0 = works[0], c0 = countWorkStates(refStates(a0));
    const th = container.querySelector('th[data-aid="a0"]') as HTMLElement;
    expect(th.querySelector(".hs2")?.textContent).toBe(`ส่งแล้ว ${c0.submitted}/${c0.counted}`);
    const totCell = container.querySelector("tbody tr:first-child td.tot-col") as HTMLElement;
    const visible = works.filter((w) => w.publish_scores);
    const sum = studentSummary(visible, (i) => { const r = bySub.get(`${visible[i].id}:k1`); return r ? { status: r.status, score: r.score, late: r.late } : undefined; }, today);
    expect(totCell.textContent).toBe(`${sum.score}/${sum.fullScore}`);
    const strip = screen.getByRole("button", { name: /^ค้างส่ง \d+$/ });
    const missingAll = works.reduce((n, w) => n + refStates(w).filter((s) => s === "missing").length, 0);
    expect(strip.textContent).toBe(`ค้างส่ง ${missingAll}`);
  });
});
