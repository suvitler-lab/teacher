import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { render, screen, fireEvent } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

// T-37: the work picker (AC-51..53), the due label in words (BR-15) and the "ต่อรอบเดิม" bar (AC-54).
const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/lib/dashboard", () => ({ dashboard: { value: null }, loadDashboard: vi.fn() }));

import { assignments, students, classes } from "@client/store";
import { ScanPage, __scan } from "@client/pages/Scan";
import { dueWord, resumedRound } from "@client/components/scan/state";

const asg = (over: Partial<Assignment>): Assignment => ({
  id: "A", term_id: null, subject_id: null, type_id: null, title: "งานทดสอบ", unit: null, full_score: 20, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null, ...over,
});
const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "ก" + n, last_name: "ข", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ submissions: [] });
  __scan.session.value = null;
  __scan.ended.value = null;
  __scan.recent.value = [];
  __scan.feedback.value = null;
  resumedRound.value = false;
  __scan.subsBox.value = { aid: null, map: new Map(), status: "loading", serverTime: 0 };
  assignments.value = [asg({})];
  students.value = [kid(1), kid(2), kid(3)];
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
});

describe("BR-15 dueWord", () => {
  it("says the due day in words", () => {
    expect(dueWord(0)).toBe("ครบกำหนดวันนี้");
    expect(dueWord(1)).toBe("ครบกำหนดพรุ่งนี้");
    expect(dueWord(2)).toBe("อีก 2 วัน");
    expect(dueWord(-2)).toBe("เลยกำหนด 2 วัน");
    expect(dueWord(null)).toBe("");
  });
});

describe("scan setup (S1)", () => {
  it("summarises the round in one line and explains a disabled start (AC-52)", async () => {
    render(h(ScanPage, {}));
    expect(await screen.findByText(/รอบนี้:/)).toBeTruthy();
    const start = screen.getByRole("button", { name: /เริ่มสแกน/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
  });

  it("a work with no active room explains why and links to the room settings (AC-53)", async () => {
    assignments.value = [asg({ class_ids: ["gone"] })];
    render(h(ScanPage, {}));
    expect(await screen.findByText("งานนี้ยังไม่มีห้องที่ใช้งานอยู่")).toBeTruthy();
    expect(screen.getByText("เพิ่มห้องในตั้งค่า หรือเลือกงานอื่น")).toBeTruthy();
    expect((screen.getByRole("button", { name: /เริ่มสแกน/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("เลือกห้องก่อน")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าห้องเรียน" }));
    expect(location.hash).toContain("/settings");
    expect(location.hash).toContain("section=catalog");
  });

  it("marks the numbers as old when the live count cannot be read (AC-53)", async () => {
    get.mockRejectedValue(new Error("offline"));
    render(h(ScanPage, {}));
    expect(await screen.findByText("ข้อมูลเก่า")).toBeTruthy();
  });
});

describe("scan setup: rooms and stale numbers", () => {
  it("never starts on an archived room, even from a ?class= link (D15)", async () => {
    assignments.value = [asg({ class_ids: ["c2", "c1"] })];
    classes.value = [
      { id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never,
      { id: "c2", name: "ป.6/2", year: 2569, grade: null, archived: true } as never,
    ];
    location.hash = "#/scan?class=c2";
    render(h(ScanPage, {}));
    expect(await screen.findByRole("button", { name: "เริ่มสแกน ป.6/1" })).toBeTruthy();
    location.hash = "";
  });

  it("an old request that fails after another work loaded does not mark that work as old (R-3702)", async () => {
    assignments.value = [asg({ id: "A", title: "งาน A" }), asg({ id: "B", title: "งาน B" })];
    let failA: (e: Error) => void = () => {};
    get.mockImplementation((url: string) => url.includes("/A/")
      ? new Promise((_, rej) => { failA = rej; })
      : Promise.resolve({ submissions: [] }));
    render(h(ScanPage, {}));
    fireEvent.click(await screen.findByRole("button", { name: /งาน B/ }));
    await new Promise((r) => setTimeout(r, 20));
    failA(new Error("late"));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("ข้อมูลเก่า")).toBeNull();
  });
});

describe("resumed round bar (AC-54)", () => {
  it("never says 0 while the count is unknown (R-3701)", async () => {
    __scan.session.value = { id: "scn_1", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 20, mode: "full" };
    resumedRound.value = true;
    get.mockRejectedValue(new Error("offline"));
    render(h(ScanPage, {}));
    const bar = await screen.findByText(/ต่อรอบเดิม/);
    await new Promise((r) => setTimeout(r, 30));
    expect(bar.textContent).not.toMatch(/ส่งแล้ว 0 จาก/);
    expect(bar.textContent).toContain("ส่งแล้ว … จาก …");
  });

  it("stays closed after the first scan is taken back (R-3703)", async () => {
    __scan.session.value = { id: "scn_1", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 20, mode: "full" };
    resumedRound.value = true;
    render(h(ScanPage, {}));
    expect(await screen.findByText(/ต่อรอบเดิม/)).toBeTruthy();
    __scan.recent.value = [{ studentId: "s1", at: Date.now(), score: 20 }];
    await vi.waitFor(() => expect(screen.queryByText(/ต่อรอบเดิม/)).toBeNull());
    __scan.recent.value = [];
    __scan.feedback.value = null;
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText(/ต่อรอบเดิม/)).toBeNull();
  });

  it("shows 'ต่อรอบเดิม' with x of y, closes on [สแกนต่อ]", async () => {
    __scan.session.value = { id: "scn_1", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 20, mode: "full" };
    resumedRound.value = true;
    get.mockResolvedValue({ submissions: [{ student_id: "s1", status: "submitted", score: 20, updated_at: 1 }], snapshot: true, serverTime: 1 });
    await __scan.loadSubs("A");
    render(h(ScanPage, {}));
    const bar = await screen.findByText(/ต่อรอบเดิม/);
    expect(bar.textContent).toContain("งานทดสอบ");
    expect(bar.textContent).toContain("ป.6/1");
    await vi.waitFor(() => expect(screen.getByText(/ต่อรอบเดิม/).textContent).toContain("ส่งแล้ว 1 จาก 3"));
    fireEvent.click(screen.getByRole("button", { name: "สแกนต่อ" }));
    expect(screen.queryByText(/ต่อรอบเดิม/)).toBeNull();
  });

  it("goes away by itself on the first scan", async () => {
    __scan.session.value = { id: "scn_1", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 20, mode: "full" };
    resumedRound.value = true;
    render(h(ScanPage, {}));
    expect(await screen.findByText(/ต่อรอบเดิม/)).toBeTruthy();
    __scan.recent.value = [{ studentId: "s1", at: Date.now(), score: 20 }];
    await vi.waitFor(() => expect(screen.queryByText(/ต่อรอบเดิม/)).toBeNull());
  });
});
