// T-52 (students page, second half): add/edit form, move, leave, come back, QR text, import + sample file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/store", async (orig) => ({ ...(await orig<typeof import("@client/store")>()), loadBootstrap: vi.fn(async () => {}) }));

import { StudentsPage } from "@client/pages/Students";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, qrRotatedAt } from "@client/store";
import { route } from "@client/router";
import { projectorOn, setPjHideNames } from "@client/lib/projector";
import { setHide } from "@client/lib/hideNames";
import { swrClear } from "@client/lib/swr";


const kid = (n: number | null, first: string, over: Partial<Student> = {}): Student => ({
  id: "s" + (n ?? first), code: "610" + String(n ?? 0).padStart(2, "0"), qr_token: "SECRETTOKEN" + n, prefix: null, first_name: first, last_name: "นามสมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0, ...over,
});
const KIDS = [kid(1, "สมชาย"), kid(2, "สมหญิง"), kid(3, "ภูมิ"), kid(4, "ดวงดาว", { nickname: "ดาว" }), kid(5, "กานดา", { nickname: "ดา", code: "61005" }), kid(6, "ปวีณ"), kid(7, "นภัส"), kid(8, "ธีรา")];
const A: Assignment = {
  id: "a1", title: "ใบงานที่ 4", term_id: "t1", subject_id: "math", type_id: null, unit: null, full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-05",
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const payload = () => {
  const sessions = Array.from({ length: 20 }, (_, i) => ({ id: "d" + i, date: `2026-10-${String(i + 1).padStart(2, "0")}` }));
  const attendance = KIDS.flatMap((k) => sessions.map((s, i) => ({ session_id: s.id, student_id: k.id, status: (k.number === 5 || k.number === 8 ? i < 15 : i < 19) ? "present" : "absent" })));
  return {
    classId: "c1", range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" }, students: KIDS, assignments: [A],
    submissions: KIDS.filter((k) => k.number !== 5 && k.number !== 8).map((k) => ({ assignment_id: "a1", student_id: k.id, status: "submitted", score: 9, late: false })),
    attendanceSessions: sessions, attendance,
  };
};
const baseSettings = () => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false, accept_student_code_scan: false,
  parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
}) as never;

beforeEach(() => {
  vi.clearAllMocks(); cleanup(); swrClear(); route.value = "/students"; try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  projectorOn.value = false; setPjHideNames(false); setHide("students", false);
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [
    { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 },
    { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, year: 2569, archived: false, updated_at: 0 },
  ];
  subjects.value = []; settings.value = baseSettings(); qrRotatedAt.value = {};
  students.value = [...KIDS, kid(3, "วิภา", { id: "w3", class_id: "c2", number: 3, last_name: "แก้วใส", code: "62003" })];
  get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : p.startsWith("/api/students") ? { students: [] } : payload()));
  post.mockResolvedValue({});
});
afterEach(() => { cleanup(); projectorOn.value = false; });

const hero = () => document.querySelector(".stu-hero")!;
const ready = () => waitFor(() => expect(hero().getAttribute("aria-busy")).toBeNull());

import { buildTemplateBuffer, isHeaderLine, TEMPLATE_FILE_NAME } from "@client/lib/importTemplate";
import { parseImport } from "@client/lib/importParse";
import { online } from "@client/lib/outbox";
import { toasts } from "@client/lib/notify";

const rowMenu = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const openAdd = async () => { render(<StudentsPage />); await ready(); fireEvent.click(screen.getByRole("button", { name: "เพิ่มนักเรียน" })); return await screen.findByRole("dialog", { name: "นักเรียน" }); };
const ApiErr = (code: string, message = "") => Object.assign(new Error(message), { code });
const fillNew = (d: HTMLElement, code = "P0099") => {
  fireEvent.input(within(d).getByLabelText(/รหัสนักเรียน/), { target: { value: code } });
  fireEvent.input(within(d).getByLabelText("ชื่อ"), { target: { value: "ใหม่" } });
  fireEvent.input(within(d).getByLabelText("สกุล"), { target: { value: "สมมติ" } });
};

describe("add / edit form (AC-186/187/189)", () => {
  it("a new child starts at ไม่ระบุ and sends prefix null; the next number is 9 after 8 children", async () => {
    const d = await openAdd();
    expect((within(d).getByLabelText("คำนำหน้า") as unknown as HTMLSelectElement).value).toBe("ไม่ระบุ");
    fillNew(d);
    fireEvent.click(within(d).getByRole("button", { name: "ใช้เลขที่ถัดไป (9)" }));
    fireEvent.click(within(d).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls.find((c) => c[0] === "/api/students")![1] as any;
    expect(body.prefix).toBeNull(); expect(body.number).toBe(9); expect(body.status).toBe("active");
  });
  it("a number that is taken says who has it and does not send", async () => {
    const d = await openAdd();
    fillNew(d);
    fireEvent.input(d.querySelector("#stu-f-number")!, { target: { value: "5" } });
    expect(d.textContent).toContain("เลขที่ 5 มีกานดา นามสมมติอยู่แล้ว — ใช้เลขอื่น หรือแก้เลขที่ของคนนั้นก่อน");
    fireEvent.click(within(d).getByRole("button", { name: "บันทึก" }));
    expect(post).not.toHaveBeenCalledWith("/api/students", expect.anything());
  });
  it("hidden names: the duplicate message has no name", async () => {
    setHide("students", true);
    const d = await openAdd();
    fireEvent.input(d.querySelector("#stu-f-number")!, { target: { value: "5" } });
    expect(d.textContent).toContain("เลขที่ 5 ถูกใช้แล้ว"); expect(d.textContent).not.toContain("มีกานดา");
  });
  it("409 code_taken lands under the code field with focus", async () => {
    post.mockRejectedValueOnce(ApiErr("code_taken"));
    const d = await openAdd();
    fillNew(d, "61001");
    fireEvent.click(within(d).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(d.textContent).toContain("รหัสนี้มีอยู่แล้ว"));
    await waitFor(() => expect(document.activeElement?.id).toBe("stu-f-code"));
    expect(d.querySelector("#stu-f-code")!.getAttribute("aria-invalid")).toBe("true");
  });
  it("5xx keeps the form and the typed values with the ST-S10 words", async () => {
    post.mockRejectedValueOnce(new Error("boom"));
    const d = await openAdd();
    fillNew(d);
    fireEvent.click(within(d).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(within(d).getByRole("alert").textContent).toBe("บันทึกไม่สำเร็จ — ข้อมูลเดิมยังอยู่ ตรวจเน็ตแล้วลองอีกครั้ง"));
    expect((within(d).getByLabelText("ชื่อ") as HTMLInputElement).value).toBe("ใหม่");
  });
  it("closing with typed values asks first (focus on กลับไปแก้); closing untouched is silent", async () => {
    const d = await openAdd();
    fireEvent.click(within(d).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "นักเรียน" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มนักเรียน" }));
    const d2 = await screen.findByRole("dialog", { name: "นักเรียน" });
    fireEvent.input(within(d2).getByLabelText("ชื่อ"), { target: { value: "x" } });
    fireEvent.click(within(d2).getByRole("button", { name: "ยกเลิก" }));
    const ask = await screen.findByRole("alertdialog", { name: "ยังไม่ได้บันทึก" });
    await waitFor(() => expect(document.activeElement?.textContent).toBe("กลับไปแก้"));
    fireEvent.click(within(ask).getByRole("button", { name: "ปิดโดยไม่บันทึก" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "นักเรียน" })).toBeNull());
  });
  it("an old child with no prefix stays without one; no status field; QR text follows BR-47 and shows no token", async () => {
    qrRotatedAt.value = { s3: Date.now() - 3 * 86400000 };
    render(<StudentsPage />); await ready();
    rowMenu(/จัดการ ภูมิ/); fireEvent.click(await screen.findByRole("menuitem", { name: /แก้ไข/ }));
    const d = await screen.findByRole("dialog", { name: "นักเรียน" });
    expect(d.textContent).toMatch(/บัตร QR: ออกใหม่ล่าสุด/); expect(d.textContent).toContain("กำลังเรียน · เปลี่ยนที่");
    expect(document.body.innerHTML).not.toContain("SECRETTOKEN");
    expect(within(d).queryByLabelText("สถานะ")).toBeNull();
    fireEvent.click(within(d).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((post.mock.calls.find((c) => c[0] === "/api/students")![1] as any).prefix).toBeNull();
  });
  it("rotate inside the form keeps it open with the typed value; failure says the old card still works", async () => {
    render(<StudentsPage />); await ready();
    rowMenu(/จัดการ สมชาย/); fireEvent.click(await screen.findByRole("menuitem", { name: /แก้ไข/ }));
    const d = await screen.findByRole("dialog", { name: "นักเรียน" });
    fireEvent.input(within(d).getByLabelText("ชื่อ"), { target: { value: "สมชายแก้" } });
    fireEvent.click(within(d).getByRole("button", { name: /ออก QR ใหม่/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ออก QR ใหม่" }));
    await waitFor(() => expect(d.textContent).toContain("ออก QR ใหม่แล้ว — พิมพ์สติกเกอร์ใหม่"));
    expect((within(d).getByLabelText("ชื่อ") as HTMLInputElement).value).toBe("สมชายแก้");
    post.mockRejectedValueOnce(new Error("x"));
    fireEvent.click(within(d).getByRole("button", { name: /ออก QR ใหม่/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ออก QR ใหม่" }));
    await waitFor(() => expect(within(d).getByRole("alert").textContent).toBe("ออก QR ใหม่ไม่สำเร็จ — บัตรเดิมยังใช้ได้อยู่"));
  });
});

describe("move / leave / come back (AC-190/191, AC-200)", () => {
  beforeEach(() => {
    online.value = true;
    post.mockImplementation(async (p: string) => (p.includes("import/preview") ? { blockedMoves: [] } : {}));
  });
  it("move: checks first, then the check mark and the button opens; hidden names show เลขที่ in the box", async () => {
    setHide("students", true);
    render(<StudentsPage />); await ready();
    rowMenu(/จัดการ เลขที่ 5/); fireEvent.click(await screen.findByRole("menuitem", { name: /ย้ายห้อง/ }));
    const d = await screen.findByRole("dialog", { name: /ย้ายห้อง/ });
    await waitFor(() => expect(d.textContent).toContain("ตรวจแล้ว ย้ายไป ป.6/2 ได้"));
    expect(d.textContent).toContain("จาก ป.6/1 · เลขที่เดิม 5 (ตั้งเลขที่ใหม่ในห้องปลายทางหลังย้าย)");
    expect(d.textContent).not.toContain("กานดา");
    fireEvent.click(within(d).getByRole("button", { name: "ย้ายห้อง" }));
    await waitFor(() => expect(post.mock.calls.some((c) => c[0] === "/api/students" && (c[1] as any).class_id === "c2" && (c[1] as any).number === null)).toBe(true));
  });
  it("move offline: the button is off and says ย้ายห้องต้องออนไลน์", async () => {
    render(<StudentsPage />); await ready();
    rowMenu(/จัดการ กานดา/); fireEvent.click(await screen.findByRole("menuitem", { name: /ย้ายห้อง/ }));
    const d = await screen.findByRole("dialog", { name: /ย้ายห้อง/ });
    online.value = false;
    await waitFor(() => expect(d.textContent).toContain("ย้ายห้องต้องออนไลน์"));
    expect((within(d).getByRole("button", { name: "ย้ายห้อง" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("leave: focus starts on ยกเลิก and the main button says ย้ายออก / ตั้งเป็นไม่ใช้งาน", async () => {
    render(<StudentsPage />); await ready();
    rowMenu(/จัดการ กานดา/); fireEvent.click(await screen.findByRole("menuitem", { name: /ย้ายออก\/ไม่ใช้งาน…/ }));
    const d = await screen.findByRole("dialog", { name: /ย้ายออก/ });
    await waitFor(() => expect(document.activeElement?.textContent).toBe("ยกเลิก"));
    fireEvent.click(within(d).getByRole("button", { name: "ไม่ใช้งาน" }));
    expect(within(d).getByRole("button", { name: "ตั้งเป็นไม่ใช้งาน" })).toBeTruthy();
  });
  it("come back asks first with the ST-S18 words; a taken number opens the fix box", async () => {
    const gone = kid(9, "ภาพ", { id: "g9", status: "moved", left_at: "2026-11-12" });
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : p.startsWith("/api/students") ? { students: [gone] } : payload()));
    render(<StudentsPage />); await ready();
    fireEvent.click(await screen.findByRole("button", { name: /ย้ายออก\/ไม่ใช้งาน 1/ }));
    post.mockRejectedValueOnce(ApiErr("number_taken"));
    fireEvent.click(await screen.findByRole("button", { name: /กลับมาใช้งาน/ }));
    const ask = await screen.findByRole("alertdialog");
    expect(ask.textContent).toContain("กลับเข้า ป.6/1 เลขที่ 9 · นับในสถิติและสแกนรับงานได้อีกครั้ง");
    fireEvent.click(within(ask).getByRole("button", { name: "กลับมาใช้งาน" }));
    const clash = await screen.findByRole("alertdialog", { name: "เลขที่ชน" });
    expect(clash.textContent).toContain("ใช้เลขอื่น หรือแก้เลขที่ของคนนั้นก่อน");
    fireEvent.click(within(clash).getByRole("button", { name: "แก้เลขที่" }));
    expect(await screen.findByRole("dialog", { name: "นักเรียน" })).toBeTruthy();
  });
});

describe("import + sample file (AC-194/195)", () => {
  it("the sample .xlsx is built in the browser, has the head + two made-up rows and reads back as exactly two rows with no warning", async () => {
    expect(TEMPLATE_FILE_NAME).toBe("ตัวอย่างรายชื่อ.xlsx");
    const buf = await buildTemplateBuffer();
    const ExcelJS: any = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const rows: unknown[][] = [];
    wb.worksheets[0].eachRow((r: any) => rows.push(r.values.slice(1)));
    expect(rows[0]).toEqual(["รหัส", "คำนำหน้า", "ชื่อ", "สกุล", "เลขที่"]); expect(rows.length).toBe(3);
    const p = parseImport(rows.map((r) => r.join("\t")).join("\n"));
    expect(p.rows.length).toBe(2); expect(p.noLastName).toEqual([]); expect(p.badNumber).toEqual([]);
    expect(p.skipped.filter((l) => !isHeaderLine(l))).toEqual([]);
  });
  it("the box offers the sample; a pasted run ends with the BR-49 summary toast", async () => {
    online.value = true;
    post.mockImplementation(async (p: string) => (p.includes("import/preview") ? { rows: [{ code: "70001", action: "create" }, { code: "70002", action: "update" }], summary: { create: 1, update: 1, same: 0, move: 0, reactivate: 0 }, dupCodes: [], dupNumbers: [], numberClashes: [] } : { ok: true, imported: 2, created: 1 }));
    render(<StudentsPage />); await ready();
    fireEvent.click(screen.getByRole("button", { name: "นำเข้า Excel" }));
    const d = await screen.findByRole("dialog", { name: "นำเข้านักเรียน" });
    expect(within(d).getByRole("button", { name: /ดาวน์โหลดไฟล์ตัวอย่าง/ })).toBeTruthy();
    fireEvent.click(within(d).getByRole("tab", { name: "วางข้อความ" }));
    fireEvent.input(within(d).getByRole("textbox"), { target: { value: "70001\tด.ช. ก ข\t9\n70002\tด.ญ. ค ง\t10" } });
    await waitFor(() => expect((within(d).getByRole("button", { name: /นำเข้า 2 คน/ }) as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(within(d).getByRole("button", { name: /นำเข้า 2 คน/ }));
    await waitFor(() => expect(toasts.value.map((t) => t.message)).toContain("นำเข้าแล้ว — เพิ่มใหม่ 1 · แก้ข้อมูล 1 · เหมือนเดิม 0"));
  });
  it("offline: the import button is off", async () => {
    online.value = false;
    render(<StudentsPage />);
    expect((screen.getByRole("button", { name: "นำเข้า Excel" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

beforeEach(() => { online.value = true; });
describe("review round (R-5201..R-5211)", () => {
  const other = () => kid(3, "วิภา", { id: "w3", class_id: "c2", number: 3, last_name: "แก้ไข", code: "62003", status: "active" });
  it("R-5201: editing a child of another room keeps that room (no silent move); the move box never offers the child's own room", async () => {
    const { StudentModal } = await import("@client/pages/Students");
    const { MoveStudentDialog } = await import("@client/components/students/StudentParts");
    render(<StudentModal student={other()} classId="c1" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("ป.6/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((post.mock.calls.find((c) => c[0] === "/api/students")![1] as any).class_id).toBe("c2");
    cleanup();
    render(<MoveStudentDialog student={other()} fromClassId="c2" onClose={() => {}} onDone={() => {}} />);
    const opts = [...screen.getByLabelText("ห้องปลายทาง").querySelectorAll("option")].map((o) => o.textContent);
    expect(opts).toEqual(["ป.6/1"]);
  });
  it("R-5203: the fix-number box from come-back saves as active with left_at cleared", async () => {
    const { StudentModal } = await import("@client/pages/Students");
    render(<StudentModal student={kid(9, "ภาพ", { id: "g9", status: "moved", left_at: "2026-11-12" })} classId="c1" roster={KIDS} reactivating onClose={() => {}} onSaved={() => {}} />);
    fireEvent.input(document.querySelector("#stu-f-number")!, { target: { value: "5" } });
    expect(document.body.textContent).toContain("เลขที่ 5 มีกานดา");
    fireEvent.input(document.querySelector("#stu-f-number")!, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const b = post.mock.calls.find((c) => c[0] === "/api/students")![1] as any;
    expect(b.status).toBe("active"); expect(b.left_at).toBeNull(); expect(b.number).toBe(10);
  });
  it("R-5205: hidden names — a 409 number_taken never shows the other child's name", async () => {
    const { StudentModal } = await import("@client/pages/Students");
    post.mockRejectedValueOnce(ApiErr("number_taken", "เลขที่ 4 ถูกใช้โดย ดวงดาว นามสมมติ"));
    render(<StudentModal student={null} classId="c1" hide roster={[]} onClose={() => {}} onSaved={() => {}} />);
    fillNew(document.body, "P0098");
    fireEvent.input(document.querySelector("#stu-f-number")!, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(document.body.textContent).toContain("เลขที่ 4 ถูกใช้แล้ว"));
    expect(document.body.textContent).not.toContain("ดวงดาว");
  });
  it("R-5206: the QR date is the Thai day (00:30 on 9 Nov Bangkok = 8 Nov UTC)", async () => {
    const { StudentModal } = await import("@client/pages/Students");
    qrRotatedAt.value = { s3: Date.UTC(2026, 10, 8, 18, 30) };
    render(<StudentModal student={KIDS[2]} classId="c1" roster={KIDS} onClose={() => {}} onSaved={() => {}} />);
    expect(document.body.textContent).toContain("ออกใหม่ล่าสุด 9 พ.ย. 2569");
  });
  it("R-5202: the [บัตร QR] menu on the computer: print all, print new-only (off at 0), rotate all", async () => {
    render(<StudentsPage />); await ready();
    fireEvent.click(screen.getByRole("button", { name: "บัตร QR" }));
    const m = await screen.findByRole("menu");
    expect(within(m).getByRole("menuitem", { name: /พิมพ์สติกเกอร์ทั้งห้อง · 8 คน/ })).toBeTruthy();
    expect((within(m).getByRole("menuitem", { name: /ยังไม่มี QR ใหม่ใน 60 วัน/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(m).getByRole("menuitem", { name: /ออก QR ใหม่ทั้งห้อง/ })).toBeTruthy();
  });
  it("R-5211/AC-200: the leave button stays pressable offline; the answer is the ST-S10 failure with the old data kept", async () => {
    render(<StudentsPage />); await ready();
    rowMenu(/จัดการ กานดา/); fireEvent.click(await screen.findByRole("menuitem", { name: /ย้ายออก\/ไม่ใช้งาน…/ }));
    const d = await screen.findByRole("dialog", { name: /ย้ายออก/ });
    online.value = false; post.mockRejectedValueOnce(new Error("offline"));
    await new Promise((r) => setTimeout(r, 60));
    const btn = within(d).getAllByRole("button", { name: "ย้ายออก" }).at(-1) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(within(d).getByRole("alert").textContent?.trim()).toBe("บันทึกไม่สำเร็จ — ข้อมูลเดิมยังอยู่ ตรวจเน็ตแล้วลองอีกครั้ง"));
  });
});
