// ui-redesign round 3 (students): sort kept on the device, a ⋮ on each row (edit · new QR · move class · move out),
// dialogs that say how many (instead of confirm()), a file tab for the import, and the cards above the list.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/store", async (orig) => ({ ...(await orig<typeof import("@client/store")>()), loadBootstrap: vi.fn(async () => {}) })); // a save reloads the bootstrap: not under test
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: ({ studentId }: { studentId: string }) => <div role="dialog" aria-label="รายละเอียดนักเรียน">{studentId}</div> }));

import { StudentsPage } from "@client/pages/Students";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, qrRotatedAt } from "@client/store";
import { route } from "@client/router";
import { sortRoster, rotatedIn } from "@client/components/students/StudentParts";
import { fileToText, parseImport, rowsToText } from "@client/lib/importParse";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";
import type { StudentReport } from "@client/lib/report";

const kid = (n: number, first: string, over: Partial<Student> = {}): Student => ({
  id: "s" + n, code: "1050" + n, qr_token: "Q" + n, prefix: "ด.ช.", first_name: first, last_name: "สมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0, ...over,
});
const safe = { rows: [{ code: "10501", action: "move" }], summary: { create: 0, update: 0, same: 0, move: 1, reactivate: 0 }, dupCodes: [], dupNumbers: [], numberClashes: [], blockedMoves: [] };
const baseSettings = (over: Record<string, string> = {}) => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
}) as never;
const report = (kids: Student[], extra: Record<string, unknown> = {}) => ({
  classId: "c1", range: { from: null, to: null, month: null, termId: "t1" }, students: kids, assignments: [], submissions: [], attendanceSessions: [], attendance: [], ...extra,
});

beforeEach(() => {
  vi.clearAllMocks(); route.value = "/students"; try { localStorage.clear(); } catch { /* ignore */ }
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [
    { id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 },
    { id: "c2", name: "ป.6/2", grade: "ป.6", sort: 2, year: 2569, archived: false, updated_at: 0 },
  ];
  subjects.value = []; settings.value = baseSettings(); qrRotatedAt.value = {};
  students.value = [kid(1, "ธนา"), kid(2, "กมล"), kid(3, "ปรีชา")];
  get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : report(students.value)));
  post.mockResolvedValue(safe);
});

const names = () => [...document.querySelectorAll(".stu-lrow .name")].map((e) => e.textContent?.replace(/\s+/g, " ").trim().split(" ")[0] ?? "");
const rowMenuOf = (n: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`จัดการ.*${n}`) }));

describe("pure helpers", () => {
  const reports = new Map<string, StudentReport>([
    ["s1", { missing: 0, attendance: { present: 1, late: 0, leave: 0, sick: 0, absent: 3, daysMarked: 4 } } as never],
    ["s2", { missing: 3, attendance: { present: 4, late: 0, leave: 0, sick: 0, absent: 0, daysMarked: 4 } } as never],
  ]);
  const list = [kid(3, "ปรีชา"), kid(1, "ธนา"), kid(2, "กมล")];
  it("sorts by number, name, attendance (least first, unchecked last) and missing (most first)", () => {
    expect(sortRoster(list, reports, "number").map((s) => s.number)).toEqual([1, 2, 3]);
    expect(sortRoster(list, reports, "name").map((s) => s.first_name)).toEqual(["กมล", "ธนา", "ปรีชา"]);
    expect(sortRoster(list, reports, "att").map((s) => s.number)).toEqual([1, 2, 3]); // 25%, 100%, unchecked
    expect(sortRoster(list, reports, "missing").map((s) => s.number)).toEqual([2, 1, 3]);
  });
  it("rotatedIn keeps only the children whose QR was reissued", () => {
    expect(rotatedIn(list, { s1: 5 }).map((s) => s.number)).toEqual([1]);
  });
});

describe("file import", () => {
  it("rowsToText joins the cells of a worksheet row with tabs and drops empty rows", () => {
    expect(rowsToText([["10501", "ด.ช. สมชาย ทดสอบ", 1], [null, "", ""], ["10502", "ด.ญ. สมหญิง ทดสอบ", 2]])).toBe("10501\tด.ช. สมชาย ทดสอบ\t1\n10502\tด.ญ. สมหญิง ทดสอบ\t2");
  });
  it("reads a .csv (with a BOM) and an .xlsx into rows the paste box would also accept", async () => {
    // jsdom's File has no text()/arrayBuffer() (a real browser does): read through FileReader, which it does have
    const read = (f: Blob, as: "text" | "buffer") => new Promise<any>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); as === "text" ? r.readAsText(f) : r.readAsArrayBuffer(f); });
    (File.prototype as any).text = function () { return read(this, "text"); };
    (File.prototype as any).arrayBuffer = function () { return read(this, "buffer"); };
    const csv = new File(["﻿10501,ด.ช. สมชาย ทดสอบ,1\n10502,ด.ญ. สมหญิง ทดสอบ,2\n"], "list.csv", { type: "text/csv" });
    expect(parseImport(await fileToText(csv)).rows.map((r) => [r.code, r.first_name, r.number])).toEqual([["10501", "สมชาย", 1], ["10502", "สมหญิง", 2]]);
    const ExcelJS: any = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("s");
    ws.addRow(["รหัส", "ชื่อ", "เลขที่"]); ws.addRow([10503, "ด.ช. สมศักดิ์ ใจดี", 3]);
    const buf: ArrayBuffer = await wb.xlsx.writeBuffer();
    const x = new File([buf], "list.xlsx");
    const parsed = parseImport(await fileToText(x));
    expect(parsed.rows.map((r) => [r.code, r.first_name, r.number])).toEqual([["10503", "สมศักดิ์", 3]]);
    expect(parsed.skipped.length).toBe(1); // the header row is shown as unreadable, not silently dropped
    await expect(fileToText(new File(["x"], "old.xls"))).rejects.toThrow(/xlsx/);
  }, 30_000); // exceljs is a big library: loading it takes a while the first time
});

describe("students page", () => {
  it("sorts by the chosen column and remembers it on this device", async () => {
    const { unmount } = render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(3));
    expect(names()).toEqual(["ด.ช.ธนา", "ด.ช.กมล", "ด.ช.ปรีชา"].map((n) => n)); // by number
    fireEvent.input(screen.getByRole("combobox", { name: "เรียงรายชื่อ" }), { target: { value: "name" } });
    await waitFor(() => expect(names()[0]).toContain("กมล"));
    unmount();
    render(<StudentsPage />);
    await waitFor(() => expect(names()[0]).toContain("กมล")); // kept
  });

  it("each row has a ⋮ menu with edit · new QR · move class · move out, next to (not inside) the name button", async () => {
    render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(3));
    const open = screen.getByRole("button", { name: /ดูข้อมูล.*ธนา/ });
    expect(open.querySelector("button")).toBeNull();
    rowMenuOf("ธนา");
    const menu = await screen.findByRole("menu");
    for (const w of ["แก้ไข", "ออก QR ใหม่…", "ย้ายห้อง…", "ย้ายออก/ไม่ใช้งาน…"]) expect(within(menu).getByRole("menuitem", { name: new RegExp(w) })).toBeTruthy();
  });

  it("new QR for the whole class says how many and asks first; for one child asks and names them", async () => {
    render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(3));
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มเติม" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ออก QR ใหม่ทั้งห้อง/ }));
    const d = await screen.findByRole("alertdialog", { name: /ออก QR ใหม่ทั้งห้อง ป.6\/1/ });
    expect(d.textContent).toContain("3 คน");
    fireEvent.click(within(d).getByRole("button", { name: "ยกเลิก" }));
    expect(post.mock.calls.filter((c) => String(c[0]).includes("/qr/rotate"))).toHaveLength(0);

    rowMenuOf("ธนา");
    fireEvent.click(await screen.findByRole("menuitem", { name: /ออก QR ใหม่…/ }));
    const d2 = await screen.findByRole("alertdialog", { name: /ออก QR ใหม่ให้/ });
    await act(async () => { fireEvent.click(within(d2).getByRole("button", { name: "ออก QR ใหม่" })); });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/students/s1/qr/rotate"));
  });

  it("move class: asks the server first; a blocked child cannot be moved; an allowed one is saved to the chosen class", async () => {
    post.mockImplementation(async (p: string) => (p === "/api/students/import/preview" ? { ...safe, blockedMoves: [{ studentId: "s1", code: "10501", fromClassId: "c1", toClassId: "c2", reason: "has_history" }] } : {}));
    render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(3));
    rowMenuOf("ธนา");
    fireEvent.click(await screen.findByRole("menuitem", { name: /ย้ายห้อง…/ }));
    const d = await screen.findByRole("dialog", { name: /ย้ายห้อง/ });
    await within(d).findByRole("alert");
    expect(within(d).getByRole("alert").textContent).toContain("ย้ายไม่ได้");
    expect((within(d).getByRole("button", { name: /ย้ายห้อง$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(d).getByRole("button", { name: "ยกเลิก" }));

    post.mockImplementation(async () => safe);
    rowMenuOf("กมล");
    fireEvent.click(await screen.findByRole("menuitem", { name: /ย้ายห้อง…/ }));
    const d2 = await screen.findByRole("dialog", { name: /ย้ายห้อง/ });
    await waitFor(() => expect((within(d2).getByRole("button", { name: /ย้ายห้อง$/ }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(within(d2).getByRole("button", { name: /ย้ายห้อง$/ })); });
    await waitFor(() => expect(post.mock.calls.some((c) => c[0] === "/api/students" && (c[1] as any).id === "s2" && (c[1] as any).class_id === "c2")).toBe(true));
  });

  it("move out / not in use saves the chosen status", async () => {
    render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(3));
    rowMenuOf("ปรีชา");
    fireEvent.click(await screen.findByRole("menuitem", { name: /ย้ายออก\/ไม่ใช้งาน…/ }));
    const d = await screen.findByRole("dialog", { name: /ย้ายออก/ });
    fireEvent.click(within(d).getByRole("button", { name: "ไม่ใช้งาน" }));
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "บันทึก" })); });
    await waitFor(() => expect(post.mock.calls.some((c) => c[0] === "/api/students" && (c[1] as any).id === "s3" && (c[1] as any).status === "inactive")).toBe(true));
  });

  it("import opens on the file tab; the paste tab is one tap away", async () => {
    render(<StudentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "นำเข้า Excel" }));
    expect(screen.getByLabelText("ไฟล์รายชื่อนักเรียน")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "รายชื่อนักเรียนที่คัดลอกจาก Excel" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "วางข้อความ" }));
    expect(screen.getByRole("textbox", { name: "รายชื่อนักเรียนที่คัดลอกจาก Excel" })).toBeTruthy();
  });

  it("two children on one number: the names are buttons that open the child", async () => {
    students.value = [kid(1, "ธนา"), kid(1, "กมล", { id: "s9", code: "10509" })];
    render(<StudentsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("เลขที่ 1");
    fireEvent.click(within(alert).getByRole("button", { name: /แก้ไข.*กมล/ }));
    expect(await screen.findByRole("dialog", { name: "นักเรียน" })).toBeTruthy();
  });

  it("cards: the summary and the QR card are on; 'moved' and 'recent' are off; 'พิมพ์เฉพาะ QR ใหม่' only when some QR is new", async () => {
    render(<StudentsPage />);
    expect(await screen.findByText("สรุปห้อง")).toBeTruthy();
    expect(screen.getByText("สติกเกอร์ / QR ใหม่")).toBeTruthy();
    expect(screen.queryByText(/^ย้ายออก \/ ไม่ใช้งาน/)).toBeNull();
    expect(screen.queryByText("เพิ่ม/แก้ล่าสุด")).toBeNull();
    expect(screen.queryByRole("button", { name: /พิมพ์เฉพาะ QR ใหม่/ })).toBeNull();
  });

  it("a new QR shows its count and a print button; a hidden card is not drawn", async () => {
    qrRotatedAt.value = { s1: Date.now(), s2: Date.now() };
    settings.value = baseSettings({ students_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("students"), "sum")) });
    render(<StudentsPage />);
    expect(await screen.findByRole("button", { name: /พิมพ์เฉพาะ QR ใหม่ \(2\)/ })).toBeTruthy();
    expect(screen.queryByText("สรุปห้อง")).toBeNull();
  });

  it("'finished' is not a status to pick by hand (only shown for a child who already has it)", async () => {
    render(<StudentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มนักเรียน" }));
    const d = await screen.findByRole("dialog", { name: "นักเรียน" });
    expect(within(d).queryByRole("option", { name: "จบปีการศึกษา" })).toBeNull();
  });
});

describe("students page: layout round 3 fixes", () => {
  it("the class number must match whole: searching 1 does not show 10–19", async () => {
    students.value = [kid(1, "ธนา"), kid(10, "กมล", { id: "s10", code: "10510" })];
    render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(2));
    fireEvent.input(screen.getByRole("textbox", { name: "ค้นหานักเรียน" }), { target: { value: "1" } });
    await waitFor(() => expect(names().length).toBe(1));
    expect(names()[0]).toContain("ธนา");
  });

  it("the 'มีงานค้าง' tile filters the list; clearing brings everyone back", async () => {
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : report(students.value, {
      assignments: [{ id: "a1", title: "งาน", term_id: "t1", subject_id: null, type_id: null, unit: null, full_score: 10, assigned_date: "2020-01-01", due_date: "2020-01-02", note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null }],
      submissions: [{ assignment_id: "a1", student_id: "s1", status: "submitted", score: 5, late: false }, { assignment_id: "a1", student_id: "s2", status: "submitted", score: 5, late: false }],
    })));
    render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(3));
    fireEvent.click(await screen.findByRole("button", { name: /มีงานค้าง/ }));
    await waitFor(() => expect(names().length).toBe(1));
    expect(names()[0]).toContain("ปรีชา");
    fireEvent.click(screen.getByRole("button", { name: "ล้าง" }));
    await waitFor(() => expect(names().length).toBe(3));
  });

  it("a column head sorts, and a second tap flips; Esc in a row menu puts focus back on its ⋮", async () => {
    render(<StudentsPage />);
    await waitFor(() => expect(names().length).toBe(3));
    fireEvent.click(screen.getByRole("button", { name: "เรียงตามเลขที่" }));
    await waitFor(() => expect(names()[0]).toContain("ปรีชา"));
    rowMenuOf("กมล");
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement?.id).toBe("stu-more-s2");
  });

  it("the import has a sheet picker when the workbook has several sheets, and a drop zone", async () => {
    render(<StudentsPage />);
    fireEvent.click(screen.getByRole("button", { name: "นำเข้า Excel" }));
    expect(document.querySelector(".imp-drop")).toBeTruthy();
    expect(screen.queryByLabelText("ชีตที่นำเข้า")).toBeNull();
  });
});
