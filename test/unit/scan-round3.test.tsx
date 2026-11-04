// ui-redesign round 3 (scan): a back-dated hand-in says so in the recent list; the picker fills its defaults when the
// lists arrive after the page opened (link opened first); the scan field gets focus back on a keyboard device only.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/lib/dashboard", () => ({ dashboard: { value: null }, loadDashboard: vi.fn() }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...(await orig<typeof import("@client/lib/outbox")>()), enqueueSubmission: vi.fn(async () => {}) }));
vi.mock("@client/lib/sound", () => ({ beep: { ok: vi.fn(), err: vi.fn(), dup: vi.fn(), undo: vi.fn() }, vibrate: vi.fn() }));

import { assignments, students, classes, deletedAssignmentIds } from "@client/store";
import { ScanPage, __scan } from "@client/pages/Scan";

const asg: Assignment = {
  id: "A", term_id: null, subject_id: null, type_id: null, title: "งานทดสอบ", unit: null, full_score: 10, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const kid: Student = {
  id: "st1", code: "101", qr_token: "Q-AAAAAAAAAA", prefix: null, first_name: "กิตติ", last_name: "วงศ์", nickname: null,
  class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};
const cls = { id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never;

beforeEach(() => {
  cleanup();
  get.mockReset(); get.mockResolvedValue({ submissions: [], serverTime: 100 });
  __scan.session.value = null; __scan.recvDate.value = null; __scan.feedback.value = null;
  deletedAssignmentIds.value = new Set();
  assignments.value = [asg]; students.value = [kid]; classes.value = [cls];
});

describe("recent list: back-dated hand-in", () => {
  const live = () => {
    __scan.session.value = { id: "scn_x", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 10, mode: "later" } as never;
    __scan.subsBox.value = { aid: "A", map: new Map(), status: "ready", serverTime: 0 };
  };

  it("adds “· รับ 30 ต.ค.” only when the received day is not today", async () => {
    live();
    render(h(ScanPage, {}));
    await act(async () => { __scan.handleScan("Q-AAAAAAAAAA", "manual"); });
    expect(await screen.findByText(/^\d\d:\d\d · รอคะแนน$/)).toBeTruthy(); // taken today: no suffix
    expect(screen.queryByText(/รับ 30 ต\.ค\./)).toBeNull();

    __scan.recvDate.value = "2026-10-30";
    await act(async () => { __scan.undo("st1"); });
    await act(async () => { __scan.handleScan("Q-AAAAAAAAAA", "manual"); });
    expect(await screen.findByText(/^\d\d:\d\d · รอคะแนน · รับ 30 ต\.ค\./)).toBeTruthy();
  });
});

describe("picker defaults", () => {
  it("picks the work and the room once the lists arrive after the page opened empty", async () => {
    assignments.value = []; classes.value = [];
    const { container } = render(h(ScanPage, {}));
    expect(container.querySelector(".sc-asg.on")).toBeNull();
    await act(async () => { assignments.value = [asg]; classes.value = [cls]; });
    expect(container.querySelector(".sc-asg.on")).not.toBeNull();
    expect(container.querySelector(".sc-step ~ * .pill.on, .pill.on")).not.toBeNull();
  });
});

describe("scan field focus (P-2)", () => {
  const live = () => {
    __scan.session.value = { id: "scn_x", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 10, mode: "later" } as never;
    __scan.subsBox.value = { aid: "A", map: new Map(), status: "ready", serverTime: 0 };
  };
  const coarse = (on: boolean) => Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: (q: string) => ({ matches: on && q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });

  it("a keyboard device focuses the field on arrival and again after a click on empty space", async () => {
    coarse(false); live();
    render(h(ScanPage, {}));
    const input = screen.getByLabelText("รหัสนักเรียน") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    input.blur();
    fireEvent.focusOut(input, { relatedTarget: null });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(document.activeElement).toBe(input);
  });

  it("a touch-only device is left alone (no on-screen keyboard popping up)", async () => {
    coarse(true); live();
    render(h(ScanPage, {}));
    const input = screen.getByLabelText("รหัสนักเรียน") as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
  });
});
