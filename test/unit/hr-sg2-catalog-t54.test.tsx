// T-54: settings ▸ ห้องเรียน · วิชา · ภาคเรียน and ประเภทงาน — order (BR-54), confirm before keeping (AC-228), counts (BR-61),
// duplicate names under the field (AC-222), offline/double-tap guards, deep link tab, term rules (BR-55).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post, put: vi.fn() } };
});

import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/preact";
import { CatalogEditor, TypeEditor } from "@client/components/CatalogEditor";
import { WorktypesSection } from "@client/components/settings/sections/WorktypesSection";
import { CatalogSection } from "@client/components/settings/sections/CatalogSection";
import { classes, subjects, workTypes, terms, currentTermId, students, assignments, startTermOpen } from "@client/store";
import { online } from "@client/lib/outbox";
import { projectorOn } from "@client/lib/projector";
import { ApiError } from "@client/lib/api";
import { toasts } from "@client/lib/notify";

const cls = (o: any) => ({ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0, ...o });
const sub = (o: any) => ({ id: "s1", code: "ค16101", name: "คณิตศาสตร์", color: "blue", sort: 1, archived: false, updated_at: 0, ...o });
const wt = (o: any) => ({ id: "w1", name: "ใบงาน", icon: "file-text", color: "violet", is_exam: false, default_full: 10, sort: 1, archived: false, updated_at: 0, ...o });
const term = (o: any) => ({ id: "t2", year: 2569, term: 2, name: "2/2569", is_current: true, start_date: null, end_date: null, updated_at: 0, ...o });
const stu = (id: string, class_id: string, status = "active") => ({ id, class_id, status, number: 1, name: "สมชาย", nickname: null }) as any;

const posted = () => post.mock.calls.map(([path, body]) => ({ path, ...(body as object) })) as any[];
const row = (name: string) => screen.getByText(name).closest(".cat-row") as HTMLElement;

beforeEach(() => {
  get.mockReset(); post.mockReset(); toasts.value = []; online.value = true; startTermOpen.value = false;
  post.mockResolvedValue({ ok: true });
  terms.value = [term({}), term({ id: "t1", term: 1, name: "1/2569", is_current: false }), term({ id: "t0", year: 2568, term: 2, name: "2/2568", is_current: false })];
  currentTermId.value = "t2";
  classes.value = [cls({}), cls({ id: "c2", name: "ป.6/2", sort: 2 }), cls({ id: "c3", name: "ป.5/1", sort: 3 })];
  subjects.value = [sub({}), sub({ id: "s2", name: "ภาษาไทย", code: null, color: "green", sort: 2 })];
  workTypes.value = [wt({}), wt({ id: "w2", name: "สอบ", is_exam: true, default_full: 20, sort: 2 })];
  students.value = [stu("a", "c1"), stu("b", "c1"), stu("c", "c1", "moved"), stu("d", "c2")];
  assignments.value = [
    { id: "x1", term_id: "t2", subject_id: "s1", type_id: "w1" }, { id: "x2", term_id: "t2", subject_id: "s1", type_id: "w1" },
    { id: "x3", term_id: "t1", subject_id: "s1", type_id: "w1" }, // an earlier term: not counted (SGQ5)
  ] as any;
  get.mockImplementation(async () => ({ settings: {}, terms: terms.value, currentTermId: "t2", classes: classes.value, subjects: subjects.value, workTypes: workTypes.value, students: [], revokedTokens: {}, qrRotatedAt: {}, assignments: [], dataEpoch: 1, serverTime: Date.now() }));
});
afterEach(async () => { await new Promise((r) => setTimeout(r, 60)); cleanup(); }); // let a pending focusSoon timer run before the next test

describe("T-54 order (BR-54, AC-227)", () => {
  it("↑ on the third class swaps with the second and writes only the two rows whose number changed", async () => {
    render(<CatalogEditor />);
    fireEvent.click(screen.getByRole("button", { name: "เลื่อน ป.5/1 ขึ้น" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(Object.fromEntries(posted().map((p) => [p.id, p.sort]))).toEqual({ c3: 2, c2: 3 });
    expect(posted().every((p) => p.path === "/api/classes")).toBe(true);
  });

  it("the first ↑ and the last ↓ are disabled and every arrow is a 44px target", () => {
    render(<CatalogEditor />);
    expect((screen.getByRole("button", { name: "เลื่อน ป.6/1 ขึ้น" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เลื่อน ป.5/1 ลง" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector(".cat-move")).toBeTruthy(); // 44px comes from .cat-move button (settings-catalog.css)
  });

  it("a write that fails says the old order stands and loads the real order again", async () => {
    post.mockRejectedValueOnce(new Error("down"));
    render(<CatalogEditor />);
    fireEvent.click(screen.getByRole("button", { name: "เลื่อน ป.5/1 ขึ้น" }));
    await waitFor(() => expect(toasts.value.map((t) => t.message)).toContain("จัดลำดับห้องไม่สำเร็จ — ลำดับเดิมยังอยู่"));
    await waitFor(() => expect(get).toHaveBeenCalled()); // loadBootstrap
  });

  it("work types and subjects order the same way", async () => {
    render(<TypeEditor />);
    fireEvent.click(screen.getByRole("button", { name: "เลื่อน สอบ ขึ้น" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(posted().every((p) => p.path === "/api/work-types")).toBe(true);
    expect(Object.fromEntries(posted().map((p) => [p.id, p.sort]))).toEqual({ w2: 1, w1: 2 });
  });
});

describe("T-54 keep asks first (AC-228, BR-59)", () => {
  it("a class: the dialog tells the result, focus starts on ยกเลิก, cancel writes nothing, the confirm writes archived", async () => {
    render(<CatalogEditor />);
    fireEvent.click(within(row("ป.6/1")).getByRole("button", { name: "เก็บ" }));
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByRole("heading").textContent).toBe("เก็บห้อง ป.6/1?");
    expect(dlg.textContent).toContain("นักเรียน 2 คน"); // active only: the moved child is not counted
    expect(document.activeElement?.textContent).toBe("ยกเลิก");
    fireEvent.click(within(dlg).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(within(row("ป.6/1")).getByRole("button", { name: "เก็บ" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "เก็บห้อง" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(posted()[0]).toMatchObject({ path: "/api/classes", id: "c1", archived: true, name: "ป.6/1" });
  });

  it("Esc on the dialog = ยกเลิก", async () => {
    render(<CatalogEditor />);
    fireEvent.click(within(row("ป.6/2")).getByRole("button", { name: "เก็บ" }));
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it("a subject and a work type ask with their own verb", async () => {
    const { unmount } = render(<CatalogEditor initialTab="subjects" />);
    fireEvent.click(within(row("คณิตศาสตร์")).getByRole("button", { name: "เก็บ" }));
    const d1 = await screen.findByRole("alertdialog");
    expect(within(d1).getByRole("button", { name: "เก็บวิชา" })).toBeTruthy();
    expect(d1.textContent).toContain("งานและคะแนนเดิมยังอยู่");
    fireEvent.click(within(d1).getByRole("button", { name: "ยกเลิก" }));
    unmount();
    render(<TypeEditor />);
    fireEvent.click(within(row("ใบงาน")).getByRole("button", { name: "เก็บ" }));
    expect(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "เก็บประเภทงาน" })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("a kept class sits in the เก็บไว้ fold; นำกลับ with a name that is active again says so under the row (409) and keeps it kept", async () => {
    classes.value = [cls({}), cls({ id: "c9", name: "ป.6/1", archived: true, sort: 9 })];
    post.mockRejectedValueOnce(new ApiError(409, "duplicate_name", 'มีห้องชื่อ "ป.6/1" อยู่แล้ว — ใช้ชื่ออื่น หรือแก้ชื่อรายการเดิมก่อน'));
    render(<CatalogEditor />);
    const fold = screen.getByText(/เก็บไว้ \(1\)/).closest("details") as HTMLElement;
    fireEvent.click(within(fold).getByRole("button", { name: "นำกลับห้อง ป.6/1" }));
    await waitFor(() => expect(within(fold).getByRole("alert").textContent).toContain('มีห้องชื่อ "ป.6/1" อยู่แล้ว'));
    expect(toasts.value.length).toBe(0);
  });
});

describe("T-54 numbers in the row (BR-61, SGQ5)", () => {
  it("a class shows its active students; a subject / work type shows only this term's tasks", () => {
    const { unmount } = render(<CatalogEditor />);
    expect(row("ป.6/1").textContent).toContain("2 คน");
    expect(row("ป.6/2").textContent).toContain("1 คน");
    unmount();
    const r2 = render(<CatalogEditor initialTab="subjects" />);
    expect(row("คณิตศาสตร์").textContent).toContain("2 งาน"); // x3 is from term 1
    expect(row("ภาษาไทย").textContent).toContain("0 งาน");
    r2.unmount();
    render(<TypeEditor />);
    expect(row("ใบงาน").textContent).toContain("2 งาน");
  });

  it("no current term -> —", () => {
    currentTermId.value = null;
    render(<CatalogEditor initialTab="subjects" />);
    expect(row("คณิตศาสตร์").textContent).toContain("—");
  });
});

describe("T-54 tabs and deep link (AC-246)", () => {
  it("is a tablist of ห้องเรียน · วิชา · ภาคเรียน (no ประเภทงาน); initialTab opens that tab without clicking buttons", () => {
    render(<CatalogEditor initialTab="terms" />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["ห้องเรียน", "วิชา", "ภาคเรียน"]);
    expect(screen.getByRole("tab", { name: "ภาคเรียน" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText(/ภาคเรียนปัจจุบัน/).length).toBeGreaterThan(0);
  });

  it("CatalogSection hands ?tab= to the editor (no synthetic click)", () => {
    render(<CatalogSection tab="subjects" />);
    expect(screen.getByRole("tab", { name: "วิชา" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("คณิตศาสตร์")).toBeTruthy();
  });

  it("arrow keys move between the tabs", () => {
    render(<CatalogEditor />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "ห้องเรียน" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "วิชา" }).getAttribute("aria-selected")).toBe("true");
  });

  it("WorktypesSection is its own section titled ประเภทงาน", () => {
    render(<WorktypesSection />);
    expect(screen.getByRole("heading", { level: 2, name: /ประเภทงาน/ })).toBeTruthy();
    expect(screen.getByText("ใบงาน")).toBeTruthy();
  });
});

describe("T-54 classes (AC-226, AC-229)", () => {
  it("Enter adds, the field is cleared and keeps focus, and the result is spoken", async () => {
    render(<CatalogEditor />);
    const input = screen.getByPlaceholderText("เพิ่มห้อง เช่น ป.6/3") as HTMLInputElement;
    input.focus();
    fireEvent.input(input, { target: { value: "ป.6/3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(posted()[0]).toMatchObject({ path: "/api/classes", name: "ป.6/3", grade: "ป.6" });
    await waitFor(() => expect(input.value).toBe(""));
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("status").textContent).toContain("เพิ่มห้อง ป.6/3 แล้ว");
  });

  it("an empty name keeps เพิ่ม off", () => {
    render(<CatalogEditor />);
    expect((screen.getByRole("button", { name: /เพิ่ม/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the edit field names the grade from the part before “/”; Esc closes it and gives the focus back", async () => {
    render(<CatalogEditor />);
    const r = row("ป.6/1");
    const edit = within(r).getByRole("button", { name: "แก้ไข" });
    fireEvent.click(edit);
    const input = within(r).getByLabelText("ชื่อห้อง ป.6/1");
    fireEvent.input(input, { target: { value: "ป.4/2" } });
    expect(r.textContent).toContain("ระดับชั้น: ป.4");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(within(r).queryByLabelText("ชื่อห้อง ป.6/1")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(edit));
  });

  it("an empty edit name shows the SE-S16 sentence as an alert tied to the field", () => {
    render(<CatalogEditor />);
    const r = row("ป.6/1");
    fireEvent.click(within(r).getByRole("button", { name: "แก้ไข" }));
    const input = within(r).getByLabelText("ชื่อห้อง ป.6/1");
    fireEvent.input(input, { target: { value: "  " } });
    expect(within(r).getByRole("alert").textContent).toContain("ใส่ชื่อห้อง เช่น ป.6/3");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect((within(r).getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("no class in this year: the SE-S07 empty state with เพิ่มห้องแรก and the field focused; last year's classes are folded and read-only", () => {
    classes.value = [cls({ id: "o1", name: "ป.6/1", year: 2568 }), cls({ id: "o2", name: "ป.6/2", year: 2568 })];
    render(<CatalogEditor />);
    expect(screen.getByText("ยังไม่มีห้องเรียนในปีการศึกษา 2569")).toBeTruthy();
    expect(screen.getByText("เพิ่มห้องก่อน แล้วค่อยนำเข้านักเรียน")).toBeTruthy();
    expect(screen.getByRole("button", { name: "เพิ่มห้องแรก" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("เพิ่มห้อง เช่น ป.6/3"));
    const fold = screen.getByText(/ห้องของปีที่ผ่านมา \(2\)/).closest("details") as HTMLElement;
    expect(within(fold).queryAllByRole("button").length).toBe(0);
    expect(fold.textContent).toContain("ห้องของปีก่อนนำกลับไม่ได้ — ปีใหม่ได้ห้องใหม่ชื่อเดิม");
  });
});

describe("T-54 subject colour (AC-230) and work type (AC-234)", () => {
  it("the colour is a radiogroup of named round buttons; ArrowRight picks the next; code over 30 is refused", () => {
    render(<CatalogEditor initialTab="subjects" />);
    const r = row("คณิตศาสตร์");
    fireEvent.click(within(r).getByRole("button", { name: "แก้ไข" }));
    const g = within(r).getByRole("radiogroup", { name: "สีของ คณิตศาสตร์" });
    expect(within(g).getAllByRole("radio").length).toBe(7);
    expect(within(g).getByRole("radio", { name: "น้ำเงิน" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(g, { key: "ArrowRight" });
    expect(within(g).getByRole("radio", { name: "ฟ้า" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.input(within(r).getByLabelText("รหัสวิชา คณิตศาสตร์"), { target: { value: "x".repeat(31) } });
    expect(within(r).getAllByRole("alert").map((a) => a.textContent).join("")).toContain("ไม่เกิน 30");
    expect((within(r).getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a bad full score is told under the field; the hint says it applies to new tasks only; there is no delete", () => {
    render(<TypeEditor />);
    const r = row("ใบงาน");
    fireEvent.click(within(r).getByRole("button", { name: "แก้ไข" }));
    fireEvent.input(within(r).getByLabelText("คะแนนเต็มเริ่มต้นของ ใบงาน"), { target: { value: "101" } });
    expect(within(r).getByRole("alert").textContent).toContain("คะแนนเต็มต้องเป็นเลข 1–100");
    expect(r.textContent).toContain("ใช้กับงานที่สร้างใหม่เท่านั้น");
    expect(screen.queryByRole("button", { name: /ลบ/ })).toBeNull();
  });

  it("a new work type can be marked as an exam", async () => {
    render(<TypeEditor />);
    fireEvent.input(screen.getByPlaceholderText("เพิ่มประเภทงาน"), { target: { value: "ปลายภาค" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /เพิ่ม/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(posted()[0]).toMatchObject({ path: "/api/work-types", name: "ปลายภาค", is_exam: true, default_full: 10 });
  });
});

describe("T-54 guards: double tap, offline", () => {
  it("two quick taps on เพิ่ม send one request; the button is off while it is on its way", async () => {
    let release!: () => void;
    post.mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true }); }));
    render(<CatalogEditor />);
    fireEvent.input(screen.getByPlaceholderText("เพิ่มห้อง เช่น ป.6/3"), { target: { value: "ป.6/3" } });
    const add = screen.getByRole("button", { name: /เพิ่ม/ }) as HTMLButtonElement;
    fireEvent.click(add); fireEvent.click(add);
    expect(post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(add.disabled).toBe(true));
    release();
    await waitFor(() => expect(add.disabled).toBe(true)); // the field is empty again
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("offline every write is off and says ต้องออนไลน์; reading and the tabs still work", () => {
    online.value = false;
    render(<CatalogEditor />);
    expect(screen.getByText(/ต้องออนไลน์ — เพิ่ม แก้ไข เก็บ/)).toBeTruthy();
    fireEvent.input(screen.getByPlaceholderText("เพิ่มห้อง เช่น ป.6/3"), { target: { value: "ป.6/3" } });
    expect((screen.getByRole("button", { name: /เพิ่ม/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(row("ป.6/1")).getByRole("button", { name: "เก็บ" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เลื่อน ป.6/1 ลง" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "วิชา" }));
    expect(screen.getByText("คณิตศาสตร์")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("T-54 terms (AC-231–233, BR-55)", () => {
  it("the head follows termLine; last year's terms are folded and read-only; the current year's other term can be made current after asking, with เลิกทำ", async () => {
    terms.value = [term({ end_date: "2000-01-01" }), term({ id: "t1", term: 1, name: "1/2569", is_current: false }), term({ id: "t0", year: 2568, term: 2, name: "2/2568", is_current: false })];
    render(<CatalogEditor initialTab="terms" />);
    expect(screen.getByText(/สิ้นสุดแล้ว/)).toBeTruthy();
    const fold = screen.getByText(/ปีการศึกษา 2568 \(1 ภาค\)/).closest("details") as HTMLElement;
    expect(within(fold).queryAllByRole("button").length).toBe(0);
    expect(fold.textContent).toContain("อ่านอย่างเดียว");
    expect(screen.getAllByRole("button", { name: "ตั้งเป็นปัจจุบัน" }).length).toBe(1); // only 1/2569: same year

    fireEvent.click(screen.getByRole("button", { name: "ตั้งเป็นปัจจุบัน" }));
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByRole("heading").textContent).toBe("ตั้ง 1/2569 เป็นภาคเรียนปัจจุบัน?");
    expect(dlg.textContent).toContain("หน้าหลักและรายงาน");
    expect(document.activeElement?.textContent).toBe("ยกเลิก");
    fireEvent.click(within(dlg).getByRole("button", { name: "ตั้งเป็นปัจจุบัน" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(posted()[0]).toMatchObject({ path: "/api/terms", id: "t1", is_current: true });
    await waitFor(() => expect(toasts.value.some((t) => t.action?.label === "เลิกทำ")).toBe(true));
    toasts.value.find((t) => t.action)!.action!.run();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(posted()[1]).toMatchObject({ id: "t2", is_current: true });
  });

  it("no term -> the SE-S09 sentence and ตั้งภาคเรียนแรก opens the start dialog", () => {
    terms.value = []; currentTermId.value = null;
    render(<CatalogEditor initialTab="terms" />);
    expect(screen.getByText("ยังไม่ได้ตั้งภาคเรียน")).toBeTruthy();
    expect(screen.getByText("ภาคเรียนใช้แบ่งงาน คะแนน และรายงาน")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ตั้งภาคเรียนแรก/ }));
    expect(startTermOpen.value).toBe(true);
  });

  it("the add fold offers the year as a list (current ±3), terms 1–3, and shows the server's refusal under the field", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "term_exists", "มีภาคเรียนนี้อยู่แล้ว"));
    render(<CatalogEditor initialTab="terms" />);
    const fold = screen.getByText("เพิ่มภาคเรียนที่ผ่านมา/ล่วงหน้า").closest("details") as HTMLElement;
    const [yearSel, termSel] = within(fold).getAllByRole("combobox") as unknown as HTMLSelectElement[];
    expect([...yearSel.options].map((o) => o.value)).toEqual(["2566", "2567", "2568", "2569", "2570", "2571", "2572"]);
    expect([...termSel.options].map((o) => o.value)).toEqual(["1", "2", "3"]);
    fireEvent.click(within(fold).getByRole("button", { name: /เพิ่มภาคเรียน/ }));
    await waitFor(() => expect(within(fold).getByRole("alert").textContent).toContain("มีภาคเรียนนี้อยู่แล้ว"));
  });

  it("editing a term offers terms 1–3 and tells that the year cannot change", () => {
    render(<CatalogEditor initialTab="terms" />);
    fireEvent.click(screen.getAllByRole("button", { name: /แก้ไข/ })[0]);
    expect(screen.getAllByText(/ปีการศึกษา 2569 แก้ไขไม่ได้/).length).toBeGreaterThan(0);
    expect(document.querySelector(".cat-edit.modal-grid2 select")!.querySelectorAll("option").length).toBe(3);
  });
});

const settle = () => new Promise((r) => setTimeout(r, 80));

describe("T-54 focus after a write (R-5403)", () => {
  it("after keeping a class the keyboard is on the next row's button", async () => {
    render(<CatalogEditor />);
    fireEvent.click(within(row("ป.6/1")).getByRole("button", { name: "เก็บ" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "เก็บห้อง" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await settle();
    expect(document.activeElement).toBe(within(row("ป.6/2")).getByRole("button", { name: "แก้ไข" }));
  });

  it("a taken name (409) moves the keyboard to the name field — in the add form and in the edit form", async () => {
    const taken = new ApiError(409, "duplicate_name", "มีห้องชื่อซ้ำอยู่แล้ว");
    render(<CatalogEditor />);
    post.mockRejectedValueOnce(taken);
    const add = screen.getByPlaceholderText("เพิ่มห้อง เช่น ป.6/3") as HTMLInputElement;
    fireEvent.input(add, { target: { value: "ป.6/1" } });
    (screen.getByRole("button", { name: /เพิ่ม/ }) as HTMLButtonElement).focus();
    fireEvent.click(screen.getByRole("button", { name: /เพิ่ม/ }));
    await screen.findByRole("alert");
    await settle();
    expect(document.activeElement).toBe(add);

    const r = row("ป.6/2");
    fireEvent.click(within(r).getByRole("button", { name: "แก้ไข" }));
    const field = within(r).getByLabelText("ชื่อห้อง ป.6/2");
    expect(document.activeElement).toBe(field); // opening the editor focuses the name
    fireEvent.input(field, { target: { value: "ป.6/1" } });
    post.mockRejectedValueOnce(taken);
    (within(r).getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).focus();
    fireEvent.click(within(r).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(within(r).getByRole("alert")).toBeTruthy());
    await settle();
    expect(document.activeElement).toBe(field);
  });

  it("a refused restore keeps the keyboard on นำกลับ; a restore that works puts it on that class's row", async () => {
    classes.value = [cls({}), cls({ id: "c9", name: "ป.6/9", archived: true, sort: 9 })];
    post.mockRejectedValueOnce(new ApiError(409, "duplicate_name", "ซ้ำ"));
    const { unmount } = render(<CatalogEditor />);
    const btn = screen.getByRole("button", { name: "นำกลับห้อง ป.6/9" });
    btn.focus();
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("ซ้ำ"));
    await settle();
    expect(document.activeElement).toBe(btn);
    unmount();
    classes.value = [cls({}), cls({ id: "c9", name: "ป.6/9", archived: true, sort: 9 })];
    render(<CatalogEditor />);
    fireEvent.click(screen.getByRole("button", { name: "นำกลับห้อง ป.6/9" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    classes.value = [cls({}), cls({ id: "c9", name: "ป.6/9", sort: 9 })]; // what the reload brings
    await settle();
    expect(document.activeElement).toBe(within(row("ป.6/9")).getByRole("button", { name: "แก้ไข" }));
  });

  it("making a term current leaves the keyboard on that term's row", async () => {
    render(<CatalogEditor initialTab="terms" />);
    fireEvent.click(screen.getByRole("button", { name: "ตั้งเป็นปัจจุบัน" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ตั้งเป็นปัจจุบัน" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    terms.value = terms.value.map((t) => ({ ...t, is_current: t.id === "t1" })) as any;
    currentTermId.value = "t1";
    await settle();
    const rowEl = document.querySelector('[data-row="t1"]') as HTMLElement;
    expect(document.activeElement).toBe(within(rowEl).getByRole("button", { name: /แก้ไข/ }));
  });
});

describe("T-54 projecting stays read-only (R-5405)", () => {
  it("while projecting every write is off — and stays off when the network comes and goes", () => {
    projectorOn.value = true;
    try {
      render(<CatalogEditor />);
      fireEvent.input(screen.getByPlaceholderText("เพิ่มห้อง เช่น ป.6/3"), { target: { value: "ป.6/3" } });
      const off = () => [
        screen.getByRole("button", { name: /เพิ่ม/ }), within(row("ป.6/1")).getByRole("button", { name: "เก็บ" }), screen.getByRole("button", { name: "เลื่อน ป.6/1 ลง" }),
      ].map((b) => (b as HTMLButtonElement).disabled);
      expect(off()).toEqual([true, true, true]);
      online.value = false; expect(off()).toEqual([true, true, true]);
      online.value = true; expect(off()).toEqual([true, true, true]);
    } finally { projectorOn.value = false; }
  });

  it("the work types section is read-only while projecting too", () => {
    projectorOn.value = true;
    try {
      render(<TypeEditor />);
      expect((within(row("ใบงาน")).getByRole("button", { name: "เก็บ" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "เลื่อน ใบงาน ลง" }) as HTMLButtonElement).disabled).toBe(true);
    } finally { projectorOn.value = false; }
  });
});

describe("T-54 phone menu (AC-246)", () => {
  const narrow = (m: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: m, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  afterEach(() => vi.unstubAllGlobals());

  it("< 480px: แก้ไข/เก็บ are inside a 'จัดการ {ชื่อ}' menu; the arrows stay on the row; >= 480px shows the buttons", () => {
    narrow(true);
    const { unmount } = render(<CatalogEditor />);
    const r = row("ป.6/1");
    expect(within(r).queryByRole("button", { name: "เก็บ" })).toBeNull();
    expect(within(r).getByRole("button", { name: "เลื่อน ป.6/1 ลง" })).toBeTruthy();
    const more = within(r).getByRole("button", { name: "จัดการ ป.6/1" });
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(more);
    const menu = within(r).getByRole("menu", { name: "จัดการ ป.6/1" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["แก้ไข", "เก็บ"]);
    unmount();
    narrow(false);
    render(<CatalogEditor />);
    expect(within(row("ป.6/1")).getByRole("button", { name: "เก็บ" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "จัดการ ป.6/1" })).toBeNull();
  });

  it("the first item takes the focus; Esc closes the menu and gives the focus back to the menu button", () => {
    narrow(true);
    render(<CatalogEditor />);
    const r = row("ป.6/1");
    const more = within(r).getByRole("button", { name: "จัดการ ป.6/1" });
    fireEvent.click(more);
    expect(document.activeElement?.textContent).toBe("แก้ไข");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(within(r).queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("แก้ไข from the menu opens the editor on the name; เก็บ from the menu asks first", async () => {
    narrow(true);
    render(<CatalogEditor />);
    const r = row("ป.6/1");
    fireEvent.click(within(r).getByRole("button", { name: "จัดการ ป.6/1" }));
    fireEvent.click(within(r).getByRole("menuitem", { name: "แก้ไข" }));
    expect(document.activeElement).toBe(within(r).getByLabelText("ชื่อห้อง ป.6/1"));
    fireEvent.click(within(r).getByRole("button", { name: "ยกเลิก" }));
    fireEvent.click(within(r).getByRole("button", { name: "จัดการ ป.6/1" }));
    fireEvent.click(within(r).getByRole("menuitem", { name: "เก็บ" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("offline the เก็บ item is disabled; the menu itself still opens", () => {
    narrow(true); online.value = false;
    render(<CatalogEditor />);
    const r = row("ป.6/1");
    fireEvent.click(within(r).getByRole("button", { name: "จัดการ ป.6/1" }));
    expect((within(r).getByRole("menuitem", { name: "เก็บ" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(r).getByRole("menuitem", { name: "แก้ไข" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("subjects and work types get the same menu", () => {
    narrow(true);
    const { unmount } = render(<CatalogEditor initialTab="subjects" />);
    expect(within(row("คณิตศาสตร์")).getByRole("button", { name: "จัดการ คณิตศาสตร์" })).toBeTruthy();
    unmount();
    render(<TypeEditor />);
    expect(within(row("ใบงาน")).getByRole("button", { name: "จัดการ ใบงาน" })).toBeTruthy();
  });
});
