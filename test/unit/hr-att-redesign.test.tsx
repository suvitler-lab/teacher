import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Student } from "@shared/types";

// T-41 (home-redesign): hero + ring (AC-81/82), "เปลี่ยนจาก … เป็น …" (AC-87), history bar (AC-83), away groups + copy (AC-90), month card (AC-85)
const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { classes, students, settings, terms, currentTermId } from "@client/store";
import { ApiError } from "@client/lib/api";
import { AttendancePage } from "@client/pages/Attendance";
import { route } from "@client/router";
import { draftAll, draftUpdate } from "@client/lib/idb";
import { bkkToday } from "@shared/time";
import { stopAttSync } from "@client/lib/attSync";
import { online } from "@client/lib/outbox";
import { serverReachable, authRequired } from "@client/lib/session";

const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: "น้อง" + n,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
let rows: { student_id: string; status: string; updated_at: number }[] = [];
let days: unknown[] = [];

beforeEach(async () => {
  stopAttSync(); authRequired.value = false; online.value = true; serverReachable.value = true;
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
  get.mockReset(); post.mockReset(); rows = []; days = [];
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days } : { rows }));
  post.mockImplementation(() => new Promise(() => {}));
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  settings.value = { school_name: "", late_after: "08:30", theme: "light", sound_enabled: false, accept_student_code_scan: false, onboarding_done: true, period_times: "{}",
    home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "" } as never;
});
const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;
const ready = () => waitFor(() => expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(false));

describe("attendance hero and ring", () => {
  it("shows the count and a ring that carries every number", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }, { student_id: "s2", status: "absent", updated_at: 1 }];
    render(h(AttendancePage, {}));
    const ring = await screen.findByRole("img", { name: /มา 1 สาย 0 ลา 0 ป่วย 0 ขาด 1 ยังไม่เช็ค 2 จาก 4 คน/ });
    expect(ring).toBeTruthy();
    expect(document.querySelector(".att-hero")?.textContent).toContain("เช็คแล้ว2จาก 4 คน");
    expect(document.querySelector(".att-hero")?.textContent).toContain("ยังไม่เช็ค 2");
  });
  it("says it is done when everyone is checked", async () => {
    rows = [1, 2, 3, 4].map((n) => ({ student_id: "s" + n, status: n === 4 ? "absent" : "present", updated_at: 1 }));
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.querySelector(".att-hero")?.textContent).toContain("เช็คครบแล้ว · มา 3 · ขาด 1"));
  });
});

describe("change message (BR-23)", () => {
  it("names the old and the new status, and just the status for an unchecked child", async () => {
    rows = [{ student_id: "s1", status: "absent", updated_at: 1 }];
    render(h(AttendancePage, {}));
    await ready();
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(document.querySelector(".att-live")?.textContent).toBe("เลขที่ 1 น้อง1 — เปลี่ยนจาก ขาด เป็น มา"));
    await act(async () => { fireEvent.click(tile(2)); });
    await waitFor(() => expect(document.querySelector(".att-live")?.textContent).toBe("เลขที่ 2 น้อง2 — มา"));
  });
});

describe("past day and month card", () => {
  it("shows the way back from a past day", async () => {
    route.value = "/attendance?date=2026-11-03";
    render(h(AttendancePage, {}));
    expect(await screen.findByText(/กำลังดูวันที่ผ่านมา/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /กลับเป็นวันนี้/ }).length).toBeGreaterThan(0);
  });
  it("month card: Σ(มา+สาย) ÷ Σเช็คแล้ว, one bar per checked day; empty wording", async () => {
    const d = bkkToday().slice(0, 8);
    days = [
      { date: d + "01", classId: "c1", present: 10, late: 0, leave: 0, sick: 0, absent: 0, marked: 10, total: 30 },
      { date: d + "02", classId: "c1", present: 0, late: 0, leave: 0, sick: 0, absent: 30, marked: 30, total: 30 },
      { date: d + "03", classId: "c1", present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 33 },
    ];
    render(h(AttendancePage, {}));
    expect(await screen.findByText(/เช็คแล้ว 2 วัน/)).toBeTruthy();
    expect(document.querySelector(".att-month-sum")?.textContent).toContain("25%"); // pooled (10+0)/(10+30)=25, NOT the mean of the daily % (100 and 0 = 50)
    expect(screen.getByRole("listitem", { name: "วันที่ 1 มาเรียน 100%" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "วันที่ 2 มาเรียน 0%" })).toBeTruthy();
  });
});

describe("who is away", () => {
  it("groups ขาด → ป่วย → ลา and copies the list", async () => {
    rows = [{ student_id: "s1", status: "leave", updated_at: 1 }, { student_id: "s2", status: "absent", updated_at: 1 }, { student_id: "s3", status: "sick", updated_at: 1 }];
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { attendanceLayout } = await import("@client/lib/pageCards");
    expect(attendanceLayout).toBeTruthy();
    settings.value = { ...(settings.value as object), attendance_cards: JSON.stringify({ v: 1, order: ["week", "sum", "scans", "todo", "away"], hidden: [] }) } as never;
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("ขาด 1 คน"));
    const heads = [...document.querySelectorAll(".att-gh")].map((e) => e.textContent?.trim());
    expect(heads).toEqual(["ขาด 1 คน", "ป่วย 1 คน", "ลา 1 คน"]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /คัดลอกรายชื่อ/ })); });
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = (writeText.mock.calls[0] as unknown as string[])[0];
    expect(text.split("\n")[0]).toMatch(/^รายชื่อไม่มาเรียน ป\.6\/1 /);
    expect(text).toContain("2. เด็ก2 ทดสอบ (ขาด)");
  });
});

describe("review fixes (R-4101..R-4103)", () => {
  it("R-4101: a clash is not 'not checked' — the ring, the pill and the button agree (4 kids, 1 clash → 3)", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "conflict", "conflict", {
      error: "conflict", conflicts: [{ studentId: "s1", draft: { status: "present" }, server: { status: "absent", updatedAt: 50, deviceName: "iPad" } }],
    }));
    render(h(AttendancePage, {}));
    await ready();
    await act(async () => { fireEvent.click(tile(1)); });
    await screen.findByText(/ข้อมูลชนกับอีกเครื่อง 1 รายการ/, {}, { timeout: 3000 });
    expect(screen.getByRole("img", { name: /ยังไม่เช็ค 3 ต้องตรวจสอบ 1 จาก 4 คน/ })).toBeTruthy();
    expect(document.querySelector(".att-hero")?.textContent).toContain("ยังไม่เช็ค 3");
    expect((screen.getByRole("button", { name: /มาทั้งห้อง/ })).textContent).toContain("3 คน");
  });
  it("R-4102: a tap that cannot be written (before the start of the year) is not announced as done", async () => {
    route.value = "/attendance?date=2026-11-03";
    render(h(AttendancePage, {}));
    await ready();
    await act(async () => { terms.value = [{ id: "t1", year: 2569, name: "1/2569", start_date: "2026-11-10", end_date: "2027-03-31" } as never]; currentTermId.value = "t1"; });
    await act(async () => { fireEvent.click(tile(1)); });
    expect(document.querySelector(".att-live")?.textContent).toBe("");
    expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
  });
  it("R-4103: tapping a number chip moves focus to that child's tile", async () => {
    const { attendanceLayout } = await import("@client/lib/pageCards");
    expect(attendanceLayout).toBeTruthy();
    settings.value = { ...(settings.value as object), attendance_cards: JSON.stringify({ v: 1, order: ["week", "sum", "scans", "todo", "away"], hidden: [] }) } as never;
    render(h(AttendancePage, {}));
    await ready();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /ไปที่เลขที่ 3 /})); });
    expect(document.activeElement?.id).toBe("att-t-s3");
  });
});
