// Final QA fixes (2026-11-04): B-F7 (the address changes while the gradebook is open), B-F8 (a refused score keeps the editor
// on its cell), long names carry a title, and the coarse-pointer 44px rules (B2-2).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within, act } from "@testing-library/preact";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Assignment, Student } from "@shared/types";

const { get, post, enqueue } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enqueue: vi.fn() }));
vi.mock("@client/lib/api", async (original) => ({ ...await original<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/outbox", async (original) => ({ ...await original<typeof import("@client/lib/outbox")>(), enqueueSubmission: enqueue }));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));

import { GradebookPage } from "@client/pages/Gradebook";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { pendingOps, failedPairKeys } from "@client/lib/outbox";
import { route } from "@client/router";

const work = (id: string, title: string, subject = "science", classIds = ["c1"]): Assignment => ({
  id, title, term_id: "t1", subject_id: subject, type_id: null, unit: null,
  full_score: 10, assigned_date: "2026-10-01", due_date: null, note: null, publish_scores: true,
  status: "open", class_ids: classIds, created_at: 0, updated_at: 0, deleted_at: null,
});
const A1 = work("a1", "แบบฝึกหัด 1"), A2 = work("a2", "แบบฝึกหัด 2"), A3 = work("a3", "งานคณิต", "math"), B1 = work("b1", "งานห้องสอง", "science", ["c2"]);
const LONG = "กมลวรรณชนกพรนภสรอรอัญชลีพรรณนิภาภัทร";
const kid = (n: number, cls = "c1", first = `นักเรียน${n}`): Student => ({
  id: `${cls}st${n}`, code: `${cls}00${n}`, qr_token: `token${cls}${n}`, prefix: null, first_name: first, last_name: "ทดสอบ",
  nickname: null, class_id: cls, number: n, status: "active", left_at: null, updated_at: 0,
});
const roster1 = [kid(1, "c1", LONG), kid(2)], roster2 = [kid(1, "c2")];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=science";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [
    { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 },
    { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, archived: false, year: 2569, updated_at: 0 },
  ];
  subjects.value = [
    { id: "science", name: "วิทยาศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 },
    { id: "math", name: "คณิตศาสตร์", code: null, color: "green", sort: 2, archived: false, updated_at: 0 },
  ];
  students.value = [...roster1, ...roster2];
  assignments.value = [A1, A2, A3, B1];
  pendingOps.value = new Map();
  failedPairKeys.value = new Set();
  // the server answers by the class and subject asked for
  get.mockImplementation(async (url: string) => {
    const q = new URL(url, "http://x").searchParams;
    const cls = q.get("class"), subj = q.get("subject");
    const all = cls === "c2" ? [B1] : [A1, A2, A3];
    return { students: cls === "c2" ? roster2 : roster1, assignments: all.filter((a) => !subj || a.subject_id === subj), submissions: [] };
  });
  post.mockResolvedValue({});
  enqueue.mockResolvedValue(undefined);
});

const selectedAid = () => document.querySelector("table.gb thead th.sel")?.getAttribute("data-aid");
const goto = (r: string) => act(() => { route.value = r; });

describe("B-F7: a link used while the gradebook is already open", () => {
  it("picks the work named by the new address (same class and subject)", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    await waitFor(() => expect(selectedAid()).toBe("a1"));
    goto("/gradebook?class=c1&subject=science&asg=a2");
    await waitFor(() => expect(selectedAid()).toBe("a2"));
  });

  it("changes class and picks the work there", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    goto("/gradebook?class=c2&asg=b1");
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes("class=c2"))).toBe(true));
    await waitFor(() => expect(selectedAid()).toBe("b1"));
    expect(screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent).toContain("ป.6/2");
  });

  it("lifts the subject filter when the link names no subject and the work is in another one (Reports link)", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    goto("/gradebook?class=c1&asg=a3"); // a3 is a maths work; the page was showing science
    await waitFor(() => expect(selectedAid()).toBe("a3"));
  });

  it("falls back to the first work when the named one does not exist", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    goto("/gradebook?class=c1&subject=science&asg=gone");
    await waitFor(() => expect(selectedAid()).toBe("a1"));
  });
});

describe("B-F8: a refused score keeps the editor on its cell", () => {
  async function openFirstCell() {
    render(<GradebookPage />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    fireEvent.click(rows[1].querySelector("td.cell")!);
    return await screen.findByRole("textbox", { name: "คะแนน" }) as HTMLInputElement;
  }

  it("11 of 10 + Enter: same cell, Thai message, text selected, nothing sent", async () => {
    const input = await openFirstCell();
    const row = input.closest("tr");
    fireEvent.input(input, { target: { value: "11" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("คะแนนต้อง 0–10 (ทีละ 0.5)");
    const still = screen.getByRole("textbox", { name: "คะแนน" }) as HTMLInputElement;
    expect(still.closest("tr")).toBe(row); // it did not move to the next child
    expect(still.value).toBe("11");
    expect(still.selectionStart).toBe(0);
    expect(still.selectionEnd).toBe(2);
    expect(document.activeElement).toBe(still);
    expect(enqueue).not.toHaveBeenCalled();
    // ...and the corrected score goes through and then moves on
    fireEvent.input(still, { target: { value: "9" } });
    fireEvent.keyDown(still, { key: "Enter" });
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0][0].score).toBe(9);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "คะแนน" }).closest("tr")?.textContent).toContain("นักเรียน2"));
  });
});

describe("long names carry their full text in a title", () => {
  it("the gradebook name column", async () => {
    render(<GradebookPage />);
    const table = await screen.findByRole("table");
    const cell = within(table).getAllByRole("row")[1].querySelector("td.name-col")!;
    expect(cell.getAttribute("title")).toContain(LONG);
  });
});

describe("touch targets (pointer: coarse)", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "../../src/styles", f), "utf8");
  /** the inside of every `@media (pointer: coarse) { ... }` block (braces matched, so the rules nested in it stay whole) */
  const coarse = (text: string) => {
    const out: string[] = [];
    for (let at = text.indexOf("@media (pointer: coarse)"); at >= 0; at = text.indexOf("@media (pointer: coarse)", at + 1)) {
      const open = text.indexOf("{", at);
      let depth = 0, i = open;
      for (; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) break; }
      out.push(text.slice(open + 1, i));
    }
    return out.join("\n");
  };
  it("the term picker pill, the pills and the segmented buttons reach var(--tap)", () => {
    const ui = coarse(css("ui.css"));
    expect(ui).toMatch(/\.pill\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(ui).toMatch(/label\.pill select\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(ui).toMatch(/\.seg button\s*\{[^}]*min-height:\s*var\(--tap\)/);
  });
  it("the gradebook page numbers and the header eye reach 44px", () => {
    const g = css("grade.css");
    expect(coarse(g)).toMatch(/\.gb-tile\.sum \.gb-n\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(coarse(g)).toMatch(/\.hs-eye\s*\{[^}]*height:\s*var\(--tap\);\s*width:\s*var\(--tap\)/);
    // the tap rule sits AFTER the one that zeroes min-height, or it would lose on equal specificity
    const zeroed = g.indexOf("min-height: 0; text-decoration: underline dotted");
    expect(zeroed).toBeGreaterThan(0);
    expect(g.indexOf("@media (pointer: coarse) { .gb-tile.sum .gb-n")).toBeGreaterThan(zeroed);
  });
  it("reports and students sort buttons / selects", () => {
    expect(coarse(css("report.css"))).toMatch(/\.rp-sel/);
    expect(coarse(css("students.css"))).toMatch(/\.stu-hbtn/);
  });
});
