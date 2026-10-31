// gb-1b: the "คอลัมน์ (n/N)" menu, hiding without changing any total, jump buttons, minimap, bulk-confirm focus.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/preact";
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

// jsdom has no layout: give the scroll frame a width so the minimap decides there is something to scroll
function fakeLayout(clientWidth: number, scrollWidth: number) {
  const proto = HTMLElement.prototype;
  const dims: Record<string, number> = { clientWidth, scrollWidth };
  for (const k of Object.keys(dims)) {
    Object.defineProperty(proto, k, { configurable: true, get() { return (this as HTMLElement).classList?.contains("gb-scroll") ? dims[k] : 0; } });
  }
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get() { const c = (this as HTMLElement).classList; return c?.contains("name-col") ? 200 : c?.contains("tot-col") ? 80 : c?.contains("col-w") ? 120 : 0; } });
}
function clearLayout() { for (const k of ["clientWidth", "scrollWidth", "offsetWidth"]) delete (HTMLElement.prototype as any)[k]; }

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("ngankrob.gb.groupMode.v2", "type");
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/gradebook?class=c1&subject=math";
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
  workTypes.value = [
    { id: "w", name: "ใบงาน", icon: "x", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false },
    { id: "e", name: "แบบฝึกหัด", icon: "x", color: "aqua", is_exam: false, default_full: 10, sort: 2, archived: false },
    { id: "q", name: "สอบย่อย", icon: "x", color: "orange", is_exam: true, default_full: 10, sort: 3, archived: false },
  ] as any;
  const kids = [kid("k1", 1), kid("k2", 2)];
  students.value = kids;
  list = [asg("w1", "ใบงาน 1", "w", "2020-01-01", "2020-01-05"), asg("w2", "ใบงาน 2", "w", "2020-01-02", "2020-01-06"), asg("e1", "แบบฝึกหัด 1", "e", "2099-01-01")];
  const rows = [
    { assignment_id: "w1", student_id: "k1", status: "submitted", score: 8, late: false },
    { assignment_id: "w2", student_id: "k1", status: "submitted", score: 4, late: false },
    { assignment_id: "e1", student_id: "k1", status: "submitted", score: 5, late: false },
  ];
  get.mockImplementation(async () => ({ students: kids, assignments: list, submissions: rows }));
  post.mockImplementation(async () => ({ changed: 1, batchId: "b1" }));
});
afterEach(() => clearLayout());

async function open() {
  render(<GradebookPage />);
  await screen.findByRole("columnheader", { name: /แบบฝึกหัด 1/ });
}
/** Groups start open now; the teacher folds ใบงาน herself so the folded-total paths are still covered. */
async function openFolded() {
  await open();
  fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") === "true" && /ใบงาน/.test(b.textContent ?? ""))!);
  await screen.findByRole("columnheader", { name: /รวม ใบงาน/ });
}
const lastCells = (row: number) => [...document.querySelectorAll("table.gb tbody tr")[row].querySelectorAll("td")].map((c) => c.textContent);
const trigger = () => screen.getByRole("button", { name: /^คอลัมน์ \(/ });
const item = (name: RegExp) => screen.getByRole("checkbox", { name });

describe("คอลัมน์ (n/N) menu", () => {
  it("shows n/N, hides a type's columns, and leaves สะสม and the other group totals exactly as they were", async () => {
    await openFolded();
    expect(trigger().textContent).toContain("3/3");
    const before = lastCells(0);                       // [name, รวมใบงาน, แบบฝึกหัด 1, สะสม]
    expect(before.slice(1)).toEqual(["12/20", "5", "17/30"]);
    fireEvent.click(trigger());
    expect(screen.getByText(/สะสมคิดรวมทุกงาน แม้ซ่อนบางคอลัมน์/)).toBeTruthy();
    fireEvent.click(item(/แบบฝึกหัด/));
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: /แบบฝึกหัด 1/ })).toBeNull());
    expect(trigger().textContent).toContain("2/3");    // the two ใบงาน remain (folded into one stripe, still 2 works)
    const after = lastCells(0);
    expect(after[1]).toBe("12/20");                    // folded total of ใบงาน unchanged
    expect(after[after.length - 1]).toBe("17/30");     // สะสม still counts the hidden แบบฝึกหัด
    fireEvent.click(item(/แบบฝึกหัด/));
    await screen.findByRole("columnheader", { name: /แบบฝึกหัด 1/ });
    expect(trigger().textContent).toContain("3/3");
  });

  it("the last type still showing cannot be hidden", async () => {
    await open();
    fireEvent.click(trigger());
    fireEvent.click(item(/ใบงาน/));
    await waitFor(() => expect(trigger().textContent).toContain("1/3"));
    const last = item(/แบบฝึกหัด/);
    expect(last.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(last);
    expect(trigger().textContent).toContain("1/3");
    expect(screen.getByRole("columnheader", { name: /แบบฝึกหัด 1/ })).toBeTruthy();
  });

  it("hides สะสม and the progress bars; the choice survives a reload", async () => {
    await open();
    expect(document.querySelectorAll(".hbar").length).toBeGreaterThan(0);
    fireEvent.click(trigger());
    fireEvent.click(item(/คอลัมน์สะสม/));
    fireEvent.click(item(/แถบความคืบหน้า/));
    await waitFor(() => expect(document.querySelector("th.tot-col")).toBeNull());
    expect(document.querySelector(".hbar")).toBeNull();
    expect(document.querySelector(".gb-frame.no-tot")).toBeTruthy();
    cleanup();
    await open();
    expect(document.querySelector("th.tot-col")).toBeNull();
    expect(document.querySelector(".hbar")).toBeNull();
  });

  it("junk in storage shows everything", async () => {
    localStorage.setItem("ngankrob.gb.columns", "{not json");
    await open();
    expect(trigger().textContent).toContain("3/3");
    expect(document.querySelector("th.tot-col")).toBeTruthy();
  });

  it("a storage that throws never stops the page", async () => {
    const g = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const s = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await open();
    fireEvent.click(trigger());
    fireEvent.click(item(/คอลัมน์สะสม/));
    await waitFor(() => expect(document.querySelector("th.tot-col")).toBeNull());
    g.mockRestore(); s.mockRestore();
  });

  it("Esc closes the menu and the focus goes back to the button", async () => {
    await open();
    fireEvent.click(trigger());
    await waitFor(() => expect(document.activeElement?.getAttribute("role")).toBe("checkbox"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("group", { name: /แสดงคอลัมน์/ })).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });
});

describe("minimap and jump buttons", () => {
  it("no minimap when every column fits", async () => {
    fakeLayout(1000, 1000);
    await open();
    expect(document.querySelector(".gb-mini")).toBeNull();
    expect(document.querySelector(".gb-jump")).toBeNull();
  });

  it("with more than fits: stripes per drawn column, a frame, and jump buttons only for types that exist", async () => {
    fakeLayout(700, 1500);
    await openFolded();
    await waitFor(() => expect(document.querySelector(".gb-mini")).toBeTruthy());
    expect(document.querySelectorAll(".gb-mini > i").length).toBe(2);          // folded ใบงาน + แบบฝึกหัด 1
    expect(document.querySelector(".gb-mini-win")).toBeTruthy();
    expect([...document.querySelectorAll(".gb-jump")].map((b) => b.textContent)).toEqual(["ใบงาน", "แบบฝึกหัด"]); // no สอบย่อย: no work of that type
  });

  it("a hidden type loses its jump button and its stripe", async () => {
    fakeLayout(700, 1500);
    await open();
    fireEvent.click(trigger());
    fireEvent.click(item(/ใบงาน/));
    await waitFor(() => expect([...document.querySelectorAll(".gb-jump")].map((b) => b.textContent)).toEqual(["แบบฝึกหัด"]));
  });

  it("jump to a folded group opens it first, then scrolls to its first column", async () => {
    fakeLayout(700, 1500);
    const scrollTo = vi.fn();
    (HTMLElement.prototype as any).scrollTo = scrollTo;
    await openFolded();
    expect(screen.queryByRole("columnheader", { name: /^ใบงาน 1/ })).toBeNull();   // folded by the teacher
    await waitFor(() => expect(document.querySelector(".gb-jump")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "ไปที่ใบงาน" }));
    await screen.findByRole("columnheader", { name: /^ใบงาน 1/ });
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    delete (HTMLElement.prototype as any).scrollTo;
  });

  it("tap on the minimap moves the table", async () => {
    fakeLayout(700, 1500);
    await open();
    await waitFor(() => expect(document.querySelector(".gb-mini")).toBeTruthy());
    const mini = document.querySelector(".gb-mini") as HTMLElement;
    mini.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const sc = document.querySelector(".gb-scroll") as HTMLElement;
    // jsdom has no onpointerdown, so preact listens under the camel-case name there; real browsers use the lower-case one
    for (const n of ["pointerdown", "PointerDown"]) mini.dispatchEvent(new MouseEvent(n, { clientX: 100, bubbles: true }));
    expect(sc.scrollLeft).toBe(800);   // far right: clamped to scrollWidth - clientWidth
    for (const n of ["pointerup", "PointerUp"]) mini.dispatchEvent(new MouseEvent(n, { bubbles: true }));
  });
});

describe("bulk confirm gives the focus back", () => {
  it("after 'confirm' the focus is on 'ทำทั้งห้อง' again, even though the button was busy meanwhile", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /ทำทั้งห้อง/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ให้เต็มคนที่ส่ง/ }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: /ให้เต็ม \d+ คน/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /ทำทั้งห้อง/ })));
  });
});

describe("review fixes (gb-1b round 1)", () => {
  it("R-01: a score being typed in another cell keeps its focus and is NOT saved when a bulk action finishes", async () => {
    await open();
    let release!: () => void;
    post.mockImplementationOnce(() => new Promise((res) => { release = () => res({ changed: 1, batchId: "b1" }); }));
    fireEvent.click(screen.getByRole("button", { name: /ทำทั้งห้อง/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ให้เต็มคนที่ส่ง/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /ให้เต็ม \d+ คน/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));               // the dialog hand-back has long happened; the API is still slow
    const cell = document.querySelector("td.cell:not(.sel)") as HTMLElement;
    fireEvent.click(cell);
    const input = await waitFor(() => { const i = document.querySelector("input.cell-input") as HTMLInputElement; expect(i).toBeTruthy(); return i; });
    fireEvent.input(input, { target: { value: "8" } });
    expect(document.activeElement).toBe(input);
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(input);                 // not stolen
    expect(post).toHaveBeenCalledTimes(1);                       // and nothing else was sent
  });

  it("R-02: the column button is a disclosure (expanded + controls), not a menu", async () => {
    await open();
    expect(trigger().getAttribute("aria-haspopup")).toBeNull();
    fireEvent.click(trigger());
    const id = trigger().getAttribute("aria-controls")!;
    expect(document.getElementById(id)).toBeTruthy();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("R-03: snapping is switched back on when the pointer capture is lost, and when the minimap goes away mid-drag", async () => {
    fakeLayout(700, 1500);
    await open();
    await waitFor(() => expect(document.querySelector(".gb-mini")).toBeTruthy());
    const mini = document.querySelector(".gb-mini") as HTMLElement;
    mini.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const sc = document.querySelector(".gb-scroll") as HTMLElement;
    for (const n of ["pointerdown", "PointerDown"]) mini.dispatchEvent(new MouseEvent(n, { clientX: 50, bubbles: true }));
    expect(sc.style.scrollSnapType).toBe("none");
    for (const n of ["lostpointercapture", "LostPointerCapture"]) mini.dispatchEvent(new Event(n, { bubbles: true }));
    expect(sc.style.scrollSnapType).toBe("");
    // second drag, then every column fits (the minimap unmounts before any pointerup)
    for (const n of ["pointerdown", "PointerDown"]) mini.dispatchEvent(new MouseEvent(n, { clientX: 50, bubbles: true }));
    expect(sc.style.scrollSnapType).toBe("none");
    fakeLayout(1500, 1500);
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(document.querySelector(".gb-mini")).toBeNull());
    expect(sc.style.scrollSnapType).toBe("");
  });
});
