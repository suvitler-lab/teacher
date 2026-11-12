// T-51 (students page, redesign): hero numbers = BR-44 · search = BR-46 · hide names leaks nothing (BR-50) · the TV frame · the drawer's hide prop.
// The 8 children of BR-44: กานดา and ธีรา owe work (2 missing) → ส่งงานครบ 6 · มีงานค้าง 2 · มาเรียนเฉลี่ย 144/160 = 90%.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/store", async (orig) => ({ ...(await orig<typeof import("@client/store")>()), loadBootstrap: vi.fn(async () => {}) }));

import { StudentsPage } from "@client/pages/Students";
import { StudentDrawer } from "@client/components/StudentDrawer";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, qrRotatedAt } from "@client/store";
import { route } from "@client/router";
import { projectorOn, setPjHideNames } from "@client/lib/projector";
import { setHide } from "@client/lib/hideNames";
import { swrClear } from "@client/lib/swr";
import { heroNumbers, searchRoster, searchAllRooms, duplicateNumbers, withoutNumber, whoLabel } from "@client/components/students/studentsLogic";
import type { StudentReport } from "@client/lib/report";

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
const tileText = (label: string) => [...hero().querySelectorAll(".stu-tile")].find((t) => t.textContent?.includes(label))!.textContent ?? "";
const ready = () => waitFor(() => expect(hero().getAttribute("aria-busy")).toBeNull());

describe("BR-44 numbers (pure)", () => {
  const rep = (missing: number, p: number, l: number): StudentReport => ({ missing, attendance: { present: p, late: l, leave: 0, sick: 0, absent: 0, daysMarked: p + l } } as never);
  it("ส่งงานครบ = active − มีงานค้าง · มาเรียนเฉลี่ย pooled 144/160", () => {
    const reports = new Map<string, StudentReport>(KIDS.map((k) => [k.id, k.number === 5 || k.number === 8 ? rep(2, 15, 0) : rep(0, 19, 0)]));
    // the absent ones: add the missing days so each child has 20 marks
    for (const k of KIDS) { const r = reports.get(k.id)!; r.attendance.absent = 20 - r.attendance.present - r.attendance.late; }
    const n = heroNumbers(KIDS, reports);
    expect([n.total, n.withMissing, n.done, n.avgAtt, n.attended, n.sessions]).toEqual([8, 2, 6, 90, 144, 160]);
    expect(n.missingKids.map((k) => k.first_name)).toEqual(["กานดา", "ธีรา"]);
  });
  it("a new child with no work due counts as complete (9 children → 7 complete) and no stats at all is null", () => {
    const reports = new Map<string, StudentReport>(KIDS.map((k) => [k.id, rep(k.number === 5 || k.number === 8 ? 2 : 0, 1, 0)]));
    const n = heroNumbers([...KIDS, kid(9, "เด็กใหม่")], reports);
    expect([n.total, n.done, n.withMissing]).toEqual([9, 7, 2]);
    expect(heroNumbers(KIDS, new Map()).avgAtt).toBeNull();
  });
  it("search BR-46: '5' is child 5 only (not 15) · 'ดา' = ดวงดาว กานดา · hidden = number only · all rooms skips moved and hidden", () => {
    const all = [...KIDS, kid(15, "สิบห้า")];
    expect(searchRoster(all, "5", false).map((s) => s.number)).toEqual([5, 15].filter((n) => n === 5));
    expect(searchRoster(KIDS, "ดา", false).map((s) => s.first_name)).toEqual(["ดวงดาว", "กานดา"]);
    expect(searchRoster(KIDS, "6100", false)).toHaveLength(8);
    expect(searchRoster(KIDS, "ดา", true)).toHaveLength(0);
    expect(searchRoster(KIDS, "5", true).map((s) => s.number)).toEqual([5]);
    const other = [kid(3, "วิภา", { id: "w", class_id: "c2" }), kid(4, "วิภาดา", { id: "m", class_id: "c3", status: "moved" })];
    expect(searchAllRooms(other, ["c1", "c2"], "c1", "วิภา", false).map((s) => s.id)).toEqual(["w"]);
    expect(searchAllRooms(other, ["c1", "c2"], "c1", "วิภา", true)).toEqual([]);
  });
  it("BR-45: duplicates and missing numbers · A16 label", () => {
    const list = [kid(5, "กานดา"), kid(5, "ปวีณ", { id: "p5" }), kid(null, "ดวงดาว"), kid(null, "นภัส", { id: "n0" })];
    expect(duplicateNumbers(list).map(([n, k]) => [n, k.length])).toEqual([[5, 2]]);
    expect(withoutNumber(list)).toHaveLength(2);
    expect(whoLabel(kid(null, "ก"), true)).toBe("เลขที่ –");
  });
});

describe("students page — hero and search", () => {
  it("shows 8 · 6 · 2 · 90% (AC-176) with the names of those who owe, and the filter works (AC-177)", async () => {
    render(<StudentsPage />); await ready();
    expect(tileText("นักเรียน")).toContain("8 คน");
    expect(tileText("ส่งงานครบ")).toContain("6 คน");
    expect(tileText("มีงานค้าง")).toContain("2 คน");
    expect(tileText("มีงานค้าง")).toContain("กานดา ธีรา");
    expect(tileText("มาเรียนเฉลี่ย")).toContain("90%");
    const done = screen.getByRole("button", { name: /ส่งงานครบ 6 คน/ });
    fireEvent.click(done);
    expect(done.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll(".stu-lrow")).toHaveLength(6);
    fireEvent.click(done);
    expect(document.querySelectorAll(".stu-lrow")).toHaveLength(8);
  });
  it("search '5' finds child 5 only and placeholder/empty text follow BR-46 (AC-178)", async () => {
    render(<StudentsPage />); await ready();
    const box = screen.getByLabelText("ค้นหานักเรียน");
    fireEvent.input(box, { target: { value: "5" } });
    expect(document.querySelectorAll(".stu-lrow")).toHaveLength(1);
    fireEvent.input(box, { target: { value: "วิภา" } });
    expect(await screen.findByText("ไม่พบนักเรียนที่ค้นหา")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ค้นในทุกห้อง/ }));
    expect(await screen.findByText(/วิภา.*แก้วใส · ป.6\/2 · เลขที่ 3/)).toBeTruthy();
  });
});

describe("hide names (AC-196, BR-50)", () => {
  it("leaks no name / nickname / code / token anywhere in text, aria-label or title; no all-rooms button; copy closed", async () => {
    setHide("students", true);
    render(<StudentsPage />); await ready();
    const box = screen.getByLabelText("ค้นหานักเรียน") as HTMLInputElement;
    expect(box.placeholder).toBe("ค้นหาด้วยเลขที่");
    const html = document.body.innerHTML;
    for (const secret of ["สมชาย", "กานดา", "นามสมมติ", "61005", "SECRETTOKEN"]) expect(html).not.toContain(secret);
    expect(screen.getByRole("button", { name: /^ดูข้อมูล เลขที่ 5 / })).toBeTruthy();
    expect(screen.getByText("ซ่อนชื่อนักเรียนอยู่ · แสดงเฉพาะเลขที่")).toBeTruthy();
    expect(tileText("มีงานค้าง")).toContain("เลขที่ 5 เลขที่ 8");
    fireEvent.input(box, { target: { value: "ดา" } });
    expect(await screen.findByText("ตอนซ่อนชื่อค้นได้ด้วยเลขที่เท่านั้น")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ค้นในทุกห้อง/ })).toBeNull();
  });
  it("the switch is this page's own and announces", async () => {
    render(<StudentsPage />); await ready();
    const btn = screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" });
    fireEvent.click(btn);
    expect(localStorage.getItem("ngankrob-hide-names-students")).toBe("1");
    expect(localStorage.getItem("ngankrob-hide-names")).toBeNull();
    expect(await screen.findByText("ซ่อนชื่อนักเรียนแล้ว")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ซ่อนชื่ออยู่/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("the drawer follows: 'เลขที่ 5' title, no name/code, copy closed", async () => {
    setHide("students", true);
    render(<StudentsPage />); await ready();
    fireEvent.click(screen.getByRole("button", { name: /^ดูข้อมูล เลขที่ 5 / }));
    const d = await screen.findByRole("dialog", { name: "ข้อมูล เลขที่ 5" });
    await waitFor(() => expect(within(d).getByText(/ค้างส่ง 1 ชิ้น/)).toBeTruthy());
    for (const secret of ["กานดา", "61005", "นามสมมติ"]) expect(d.innerHTML).not.toContain(secret);
    expect((within(d).getByRole("button", { name: /ปิดอยู่ตอนซ่อนชื่อ/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("TV frame (AC-197): no name, code or per-child number whatever the switches", () => {
  for (const [pjHide, pageHide] of [[false, false], [true, false], [false, true], [true, true]] as const) {
    it(`pjHideNames=${pjHide} page hide=${pageHide}`, async () => {
      setPjHideNames(pjHide); setHide("students", pageHide); projectorOn.value = true;
      render(<StudentsPage />); await ready().catch(() => {});
      const pj = await screen.findByRole("region", { name: "โหมดฉายจอ: นักเรียน" });
      await waitFor(() => expect(pj.textContent).toContain("มีงานค้าง"));
      expect(pj.textContent).toContain("ป.6/1 · ทุกวิชา · ทั้งเทอม");
      expect(pj.textContent).toContain("ไม่มีชื่อนักเรียนบนจอนี้");
      for (const secret of ["สมชาย", "กานดา", "นามสมมติ", "61005", "ดา", "เลขที่"]) expect(pj.textContent!.replace("ปิดอยู่ตอนฉายจอ", "").replace(/นักเรียน/g, "")).not.toContain(secret);
      expect(pj.innerHTML).not.toContain("SECRETTOKEN");
      expect(document.querySelector(".stu-page")!.hasAttribute("inert") || !!document.querySelector("[inert]")).toBe(true);
    });
  }
});

describe("StudentDrawer (shared with reports)", () => {
  const model = async () => { const { computeReport } = await import("@client/lib/report"); const p = payload() as never; return { model: computeReport(p), payload: p }; };
  it("default hide=false keeps the old look; 2 works with one title are matched by id (AC-184)", async () => {
    const dup = payload();
    const B = { ...A, id: "a2", subject_id: "sci" };
    (dup as any).assignments = [B, A]; // the work the child owes (A) comes SECOND: title-only matching would pick B
    (dup as any).submissions = (dup.submissions as any[]).filter((s) => s.student_id !== "s5").concat([{ assignment_id: "a2", student_id: "s5", status: "submitted", score: 5, late: false }]);
    const { computeReport } = await import("@client/lib/report");
    render(<StudentDrawer studentId="s5" classId="c1" from="students" onClose={() => {}} onEdit={() => {}} data={{ model: computeReport(dup as never), payload: dup as never }} />);
    const link = await screen.findByRole("button", { name: /ไปสมุดคะแนน งาน ใบงานที่ 4/ });
    expect(link.textContent).toContain("ใบงานที่ 4");
    fireEvent.click(link);
    expect(location.hash).toContain("asg=a1"); // matched by id, not by the first work with that title
    expect(screen.getByRole("heading", { name: /เลขที่ 5 กานดา/ })).toBeTruthy();
  });
  it("past year: no write button, with the read-only note (AC-185)", async () => {
    render(<StudentDrawer studentId="s5" classId="c1" from="students" readOnly onClose={() => {}} onEdit={() => {}} onRotate={() => {}} onMove={() => {}} onLeave={() => {}} data={await model()} />);
    await screen.findByText(/ปีการศึกษาเก่า — อ่านอย่างเดียว/);
    for (const n of [/แก้ไขข้อมูล/, /ออก QR ใหม่/, /ย้ายห้อง/, /ย้ายออก/]) expect(screen.queryByRole("button", { name: n })).toBeNull();
  });
  it("this year: edit · new QR · move · leave · gradebook all present; a failed copy says so", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    render(<StudentDrawer studentId="s5" classId="c1" from="students" onClose={() => {}} onEdit={() => {}} onRotate={() => {}} onMove={() => {}} onLeave={() => {}} data={await model()} />);
    for (const n of [/แก้ไขข้อมูล/, /ออก QR ใหม่…/, /ย้ายห้อง…/, /ย้ายออก\/ไม่ใช้งาน…/, /ไปสมุดคะแนน$/]) expect(await screen.findByRole("button", { name: n })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /คัดลอกไป LINE/ }));
    expect(await screen.findByText("คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเอง")).toBeTruthy();
  });
});

describe("review fixes (R-5101, R-5102)", () => {
  it("R-5101: the address changes while the page stays mounted → room and drawer follow", async () => {
    render(<StudentsPage />); await ready();
    expect(document.querySelectorAll(".stu-lrow")).toHaveLength(8);
    route.value = "/students?class=c2&student=w3";
    await waitFor(() => expect(document.querySelectorAll(".stu-lrow")).toHaveLength(1));
    expect(await screen.findByRole("dialog", { name: /ข้อมูล/ })).toBeTruthy();
  });
  it("R-5102: a child missing from the loaded set is never shown as 'ส่งงานครบ' — unknown, and the header is that child's own room", async () => {
    const { computeReport } = await import("@client/lib/report");
    const p = payload() as never;
    const stranger = kid(3, "วิภา", { id: "w3", class_id: "c2", number: 3, last_name: "แก้วใส" });
    get.mockImplementation(async (u: string) => (u.startsWith("/api/audit") ? { rows: [] } : { ...(payload() as object), classId: "c2", students: [], attendance: [], submissions: [] }));
    render(<StudentDrawer studentId={stranger.id} classId="c1" from="students" onClose={() => {}} onEdit={() => {}} data={{ model: computeReport(p), payload: p }} />);
    await screen.findByText(/ยังไม่ทราบ/);
    expect(screen.queryByText("ส่งงานครบ")).toBeNull();
    expect(screen.getByText(/ป.6\/2 · ทุกวิชา/)).toBeTruthy();
    expect(get.mock.calls.some((c) => String(c[0]).includes("class=c2"))).toBe(true); // asked for its own class
  });
});
