// T-48: gradebook roving heads (AC-152), hidden names on every surface incl. the drawer (AC-148), drawer copy / pin (AC-149).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, exportExcel, okMock } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), exportExcel: vi.fn(), okMock: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: okMock, err: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/lib/reportExport", () => ({ exportTermExcel: exportExcel }));
vi.mock("@client/lib/outbox", async (orig) => ({
  ...await orig<typeof import("@client/lib/outbox")>(),
  flush: vi.fn(async () => {}),
  onResult: () => () => {},
}));

import { GradebookPage } from "@client/pages/Gradebook";
import { classes, currentTermId, selectedTermId, students, subjects, terms, workTypes } from "@client/store";
import { route } from "@client/router";
import { pendingOps } from "@client/lib/outbox";
import { setHide } from "@client/lib/hideNames";

const asg = (id: string, over: Partial<Assignment> = {}): Assignment => ({
  id, title: "งาน " + id, publish_scores: true, term_id: "t1", subject_id: "math", type_id: "w", unit: null,
  full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05", note: null, status: "open",
  class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null, ...over,
});
const kid = (id: string, n: number): Student => ({
  id, code: id, qr_token: id, prefix: null, first_name: "เด็ก" + n, last_name: "สมมติ", nickname: null, class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const sub = (a: string, s: string) => ({ assignment_id: a, student_id: s, status: "submitted", score: 5, late: false, submitted_at: Date.UTC(2020, 0, 2, 5), method: "camera", updated_at: 0 });
const kids = [kid("k1", 1), kid("k2", 2)];
let works: Assignment[], rows: ReturnType<typeof sub>[];

beforeEach(() => {
  cleanup(); vi.clearAllMocks(); localStorage.clear(); pendingOps.value = new Map(); setHide("gradebook", false);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  workTypes.value = [{ id: "w", name: "ใบงาน", icon: "x", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false }] as any;
  students.value = kids;
  works = [asg("w1")];
  rows = [sub("w1", "k1"), sub("w1", "k2")]; // everyone has handed in → a whole-class "all submitted" has nobody to change
  get.mockImplementation(async () => ({ students: kids, assignments: works, submissions: rows }));
  exportExcel.mockResolvedValue(undefined);
});


const tab = () => [...document.querySelectorAll<HTMLElement>("table.gb [tabindex='0']")];
const key = (el: Element, k: string) => fireEvent.keyDown(el, { key: k });

describe("AC-152 the table is ONE Tab stop, heads included", () => {
  beforeEach(() => { works = [asg("w1"), asg("w2")]; rows = [sub("w1", "k1"), sub("w2", "k1")]; });
  it("no work head or eye button is tabbable; one cell is", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    const stops = tab();
    expect(stops.length).toBe(1);
    expect(stops[0].tagName).toBe("TD");
    expect(document.querySelectorAll("th[data-aid][tabindex='0']").length).toBe(0);
    expect([...document.querySelectorAll<HTMLElement>("th[data-aid] .hs-eye")].every((b) => b.tabIndex === -1)).toBe(true);
  });
  it("ArrowUp from the first row moves onto the head (now the only stop); arrows move between heads; Enter picks; ArrowDown goes back down", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    const first = document.querySelector<HTMLElement>("td[data-aid='w1'][data-sid='k1']")!;
    first.focus(); key(first, "ArrowUp");
    const h1 = document.querySelector<HTMLElement>("th[data-aid='w1']")!;
    await waitFor(() => expect(document.activeElement).toBe(h1));
    await waitFor(() => expect(tab().map((e) => e.tagName + e.getAttribute("data-aid"))).toEqual(["THw1"]));
    // BR-34 picked the LAST open work (w2) on arrival, so Enter on w1's head must MOVE the pick
    expect(document.querySelector("th[data-aid='w2']")!.className).toContain("sel");
    expect(h1.className).not.toContain("sel");
    key(h1, "Enter");
    await waitFor(() => expect(document.querySelector("th[data-aid='w1']")!.className).toContain("sel"));
    expect(document.querySelector("th[data-aid='w2']")!.className).not.toContain("sel");
    key(h1, "ArrowRight");
    const h2 = document.querySelector<HTMLElement>("th[data-aid='w2']")!;
    await waitFor(() => expect(document.activeElement).toBe(h2));
    key(h2, "ArrowDown");
    await waitFor(() => expect(document.activeElement?.getAttribute("data-aid")).toBe("w2"));
    expect(document.activeElement?.tagName).toBe("TD");
    await waitFor(() => expect(tab().length).toBe(1));
    expect(tab()[0].tagName).toBe("TD");
  });
  it("a cell below the first row still moves up as before", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    const c = document.querySelector<HTMLElement>("td[data-aid='w1'][data-sid='k2']")!;
    c.focus(); key(c, "ArrowUp");
    await waitFor(() => expect(document.activeElement?.getAttribute("data-sid")).toBe("k1"));
    expect(document.activeElement?.tagName).toBe("TD");
  });
});

describe("AC-148/149 hidden names reach the drawer; copy is closed with its reason", () => {
  beforeEach(() => { rows = []; });
  it("names shown: copy list works with every child behind (not cut at 8)", async () => {
    const many = Array.from({ length: 11 }, (_, i) => kid("m" + (i + 1), i + 1));
    students.value = many;
    get.mockImplementation(async () => ({ students: many, assignments: works, submissions: [] }));
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<GradebookPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /ต้องติดตาม/ }));
    const copy = await screen.findByRole("button", { name: /คัดลอกรายชื่อ/ });
    expect((copy as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(copy); });
    const text = (writeText.mock.calls[0] as unknown as string[])[0];
    expect(text.split(String.fromCharCode(10))[0]).toBe("ป.6/1 · คณิตศาสตร์ · ค้างส่ง");
    expect(text.split(String.fromCharCode(10)).length).toBe(1 + 11); // head + all 11, never 8
    expect(text).toContain("1 เด็ก1 สมมติ (ค้าง 1)");
    expect(text).toContain("11 เด็ก11 สมมติ (ค้าง 1)");
  });
  it("names hidden: copy disabled with 'ปิดไว้ขณะซ่อนชื่อ'; no name anywhere in the drawer, table, titles or labels", async () => {
    setHide("gradebook", true);
    render(<GradebookPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /ต้องติดตาม/ }));
    const copy = await screen.findByRole("button", { name: /คัดลอกรายชื่อ/ });
    expect((copy as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("ปิดไว้ขณะซ่อนชื่อ")).toBeTruthy();
    const all = document.body.innerHTML;
    expect(all).not.toContain("เด็ก1");
    expect(all).not.toContain("สมมติ");
    expect(all).toContain("เลขที่ 1");
  });
});

describe("AC-149 pin: only on a wide mouse screen, starts unpinned", () => {
  it("no pin button on touch / narrow", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /ต้องติดตาม/ }));
    await screen.findByRole("dialog", { name: "สรุปสมุดคะแนน" });
    expect(screen.queryByRole("button", { name: /ปักไว้ข้างตาราง/ })).toBeNull();
  });
  it("wide mouse: pin docks the drawer (no dialog, page makes room); Esc closes", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("min-width: 1100px") && q.includes("hover: hover"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<GradebookPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /ต้องติดตาม/ }));
    const pin = await screen.findByRole("button", { name: "ปักไว้ข้างตาราง" });
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pin);
    await waitFor(() => expect(document.querySelector("aside.gb-drawer.pinned")).toBeTruthy());
    // R-4804: focus stays in the drawer, on the pin button — it does not fall back to the hero pill
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "เลิกปักไว้ข้างตาราง" })));
    expect(screen.queryByRole("dialog", { name: "สรุปสมุดคะแนน" })).toBeNull();
    expect(document.querySelector(".gb-page.gb-pinned")).toBeTruthy();
    key(document.querySelector("aside.gb-drawer")!, "Escape");
    await waitFor(() => expect(document.querySelector("aside.gb-drawer")).toBeNull());
    expect(document.querySelector(".gb-page.gb-pinned")).toBeNull();
  });
});

describe("R-4801 phone: copy / close straight on the work card", () => {
  it("both buttons are on the card (not only inside the manage menu); close is disabled offline", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width: 720px") || q.includes("pointer: coarse"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<GradebookPage />);
    await waitFor(() => expect(document.querySelector(".gb-mbtns")).toBeTruthy());
    const bar = document.querySelector(".gb-mbtns") as HTMLElement;
    expect(bar.textContent).toContain("คัดลอกงาน");
    const close = [...bar.querySelectorAll("button")].find((b) => /ปิดรับ/.test(b.textContent ?? ""))!;
    expect(close).toBeTruthy();
    expect((close as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("R-4802 grouped mode: folded group heads / totals / bars are not Tab stops", () => {
  it("only ONE stop in the whole table after folding a group", async () => {
    localStorage.setItem("ngankrob.gb.groupMode.v2", "type");
    works = [asg("w1"), asg("w2")];
    rows = [sub("w1", "k1")];
    render(<GradebookPage />);
    await screen.findByRole("table");
    const bar = document.querySelector<HTMLElement>(".gh-btn")!;
    expect(bar.tabIndex).toBe(-1);
    fireEvent.click(bar); // fold
    await waitFor(() => expect(document.querySelector("th.sumcol")).toBeTruthy());
    expect(document.querySelector<HTMLElement>("th.sumcol")!.tabIndex).toBe(-1);
    expect([...document.querySelectorAll<HTMLElement>("td.sumc")].every((c) => c.tabIndex === -1)).toBe(true);
    const stops = [...document.querySelectorAll<HTMLElement>("table.gb button, table.gb [tabindex]")].filter((e) => e.tabIndex >= 0 && !(e as HTMLButtonElement).disabled);
    expect(stops.length).toBeLessThanOrEqual(1);
    // the folded head is reachable by keyboard: ↓ from the bar, Enter unfolds
    key(bar, "ArrowDown");
    const head = document.querySelector<HTMLElement>("th.sumcol")!;
    await waitFor(() => expect(document.activeElement).toBe(head));
    expect(head.tabIndex).toBe(0);
    key(head, "Enter");
    await waitFor(() => expect(document.querySelector("th.sumcol")).toBeNull());
  });
});

describe("R-4803 row heads (kept as td role=rowheader: th would shift the first-td offsets of 9 locked tests outside this task)", () => {
  it("each child row starts with a row header", async () => {
    render(<GradebookPage />);
    await screen.findByRole("table");
    expect(document.querySelectorAll("tbody [role='rowheader'].name-col").length).toBe(2);
  });
});

describe("R-4805 the pill only counts what the drawer shows", () => {
  it("a teacher who hid 'ต้องติดตาม' sees no such part on the pill", async () => {
    const { settings } = await import("@client/store");
    settings.value = { ...(settings.value as object), gradebook_cards: JSON.stringify({ v: 1, order: ["summary", "awaiting", "close", "legend", "shortcuts", "follow", "dist", "recent"], hidden: ["follow", "dist", "recent"] }) } as never;
    rows = [];
    render(<GradebookPage />);
    await screen.findByRole("table");
    const pill = document.querySelector(".gbh-pill")!;
    expect(pill.getAttribute("aria-label")).not.toContain("ต้องติดตาม");
    expect(pill.getAttribute("aria-label")).toContain("ควรปิดรับ");
    settings.value = { ...(settings.value as object), gradebook_cards: "" } as never;
  });
});
