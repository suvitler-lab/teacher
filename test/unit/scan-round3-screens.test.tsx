// ui-redesign round 3 (scan): the end-of-round summary (close the work), the refused-hand-ins panel, and the TV mode
// (a child's score never reaches the DOM while projected).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const failed = vi.hoisted(() => ({ list: [] as any[] }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/dashboard", () => ({ dashboard: { value: null }, loadDashboard: vi.fn() }));
vi.mock("@client/lib/outbox", async (orig) => {
  const actual = await orig<typeof import("@client/lib/outbox")>();
  return { ...actual, enqueueSubmission: vi.fn(async () => {}), listFailed: vi.fn(async () => failed.list), discardFailed: vi.fn(async () => { failed.list = []; }), retryFailed: vi.fn(async () => {}) };
});
vi.mock("@client/lib/sound", () => ({ beep: { ok: vi.fn(), err: vi.fn(), dup: vi.fn(), undo: vi.fn() }, vibrate: vi.fn() }));

import { assignments, students, classes, deletedAssignmentIds } from "@client/store";
import { online, failedCount, pendingOps } from "@client/lib/outbox";
import { serverReachable } from "@client/lib/session";
import { projectorOn } from "@client/lib/projector";
import { ScanPage, __scan } from "@client/pages/Scan";

const asg: Assignment = {
  id: "A", term_id: null, subject_id: null, type_id: null, title: "ใบงานการคูณ", unit: null, full_score: 10, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const kid = (n: number, first: string): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q-" + n.toString().padStart(10, "A"), prefix: null, first_name: first, last_name: "สมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const sess = { id: "scn_x", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 10, mode: "later" } as never;
const sub = (score: number | null) => ({ status: "submitted", score, at: 1 }) as never;

beforeEach(() => {
  cleanup();
  get.mockReset(); post.mockReset(); get.mockResolvedValue({ submissions: [], serverTime: 100 });
  failed.list = []; failedCount.value = 0; pendingOps.value = new Map();
  online.value = true; serverReachable.value = true; projectorOn.value = false;
  deletedAssignmentIds.value = new Set();
  assignments.value = [asg]; students.value = [kid(1, "กิตติ"), kid(2, "ดาว"), kid(3, "มานี")]; classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  __scan.session.value = null; __scan.ended.value = null; __scan.feedback.value = null;
});

describe("end-of-round summary", () => {
  const openSummary = () => {
    __scan.subsBox.value = { aid: "A", map: new Map([["s1", sub(8)], ["s2", sub(null)]]), status: "ready", serverTime: 0 } as never;
    __scan.ended.value = sess;
    return render(h(ScanPage, {}));
  };

  it("lists who has not handed in and who has no score yet", () => {
    openSummary();
    expect(screen.getByText("จบรอบสแกน")).toBeTruthy();
    expect(screen.getByText(/ยังไม่ส่ง 1 คน/)).toBeTruthy();
    expect(screen.getByText(/ยังไม่มีคะแนน 1 คน/)).toBeTruthy();
    expect(screen.getByText(/3 มานี/)).toBeTruthy();
  });

  it("closing the work asks first, and only the confirm button posts", async () => {
    post.mockResolvedValue({ assignment: { ...asg, status: "closed" } });
    openSummary();
    fireEvent.click(screen.getByText("ปิดรับงาน"));
    expect(await screen.findByRole("alertdialog", { name: /ปิดรับ/ })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("ยังไม่ปิด"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("ปิดรับงาน"));
    fireEvent.click(within_alert("ปิดรับงาน"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ id: "A", status: "closed" });
  });

  it("cannot close while offline", () => {
    online.value = false;
    openSummary();
    expect((screen.getByText("ปิดรับงาน").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("ต้องออนไลน์ถึงปิดรับงานได้")).toBeTruthy();
  });
});
function within_alert(label: string) {
  const box = screen.getByRole("alertdialog");
  return [...box.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLElement;
}

describe("seat grid", () => {
  const liveWith = (map: Map<string, unknown>) => { __scan.session.value = sess; __scan.subsBox.value = { aid: "A", map, status: "ready", serverTime: 0 } as never; };
  it("a seat has a name for assistive tech; tapping one that is in asks first and leaves it if told no", async () => {
    // the page reads the round's hand-ins from the server when it opens: let the server say s1 handed in
    get.mockResolvedValue({ submissions: [{ assignment_id: "A", student_id: "s1", status: "submitted", score: 8, late: false, submitted_at: 1, method: "grid", device_id: "d", scan_session_id: null, updated_at: 1 }], serverTime: 100 });
    liveWith(new Map([["s1", sub(8)]]));
    render(h(ScanPage, {}));
    const seat = await screen.findByRole("button", { name: /เลขที่ 1 .*ส่งแล้ว/ });
    fireEvent.click(seat);
    const d = await screen.findByRole("dialog", { name: /ตัวเลือก เลขที่ 1/ });
    fireEvent.click(within(d).getByRole("button", { name: "ปิด" }));
    expect(screen.queryByRole("dialog", { name: /ตัวเลือก เลขที่ 1/ })).toBeNull();
    expect((__scan.subsBox.value as any).map.get("s1")?.status).toBe("submitted");
  });
  it("the mode can be switched in the middle of a round", async () => {
    liveWith(new Map());
    render(h(ScanPage, {}));
    fireEvent.click(await screen.findByRole("button", { name: /เต็ม 10 · รับงานก่อน/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "ให้คะแนนเต็ม" }));
    expect(__scan.session.value?.mode).toBe("full");
  });
});

describe("refused hand-ins panel", () => {
  const live = () => { __scan.session.value = sess; __scan.subsBox.value = { aid: "A", map: new Map(), status: "ready", serverTime: 0 } as never; };
  const item = { opId: "o1", reason: "received_date_future", failedAt: Date.now(), payload: { opId: "o1", assignmentId: "A", studentId: "s1", status: "submitted", score: null, method: "manual" } };

  it("says which child and why, in plain Thai", async () => {
    failed.list = [item]; failedCount.value = 1; live();
    render(h(ScanPage, {}));
    expect(await screen.findByText(/ส่งไม่สำเร็จ 1 รายการ/)).toBeTruthy();
    expect(screen.getByText(/เลขที่ 1 กิตติ สมมติ/)).toBeTruthy();
    expect(screen.getByText(/วันที่รับงานเป็นวันในอนาคต/)).toBeTruthy();
  });

  it("discarding asks first: “ไม่ทิ้ง” keeps it, “ทิ้ง” removes it", async () => {
    failed.list = [item]; failedCount.value = 1; live();
    render(h(ScanPage, {}));
    fireEvent.click(await screen.findByText("ทิ้ง"));
    expect(await screen.findByText(/ทิ้งรายการนี้\?/)).toBeTruthy();
    fireEvent.click(screen.getByText("เก็บไว้"));
    await waitFor(() => expect(screen.queryByText(/ทิ้งรายการนี้\?/)).toBeNull());
    expect(failed.list.length).toBe(1);
    fireEvent.click(screen.getByText("ทิ้ง"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByText("ทิ้ง"));
    await waitFor(() => expect(failed.list.length).toBe(0));
  });

  it("shows nothing when nothing was refused", async () => {
    live();
    render(h(ScanPage, {}));
    await act(async () => {});
    expect(screen.queryByText(/ส่งไม่สำเร็จ/)).toBeNull();
  });
});

describe("TV mode", () => {
  it("never puts a child's score in the page while projected", async () => {
    __scan.session.value = { ...(sess as object), mode: "full" } as never;
    __scan.subsBox.value = { aid: "A", map: new Map([["s1", sub(7)], ["s2", sub(9)]]), status: "ready", serverTime: 0 } as never;
    projectorOn.value = true;
    const { container } = render(h(ScanPage, {}));
    await act(async () => {});
    expect(container.textContent).toContain("ส่งแล้ว");
    expect(container.textContent).not.toMatch(/\b7\/10\b|\b9\/10\b/);
    expect(container.textContent).not.toMatch(/คะแนน\s*[:：]?\s*[79]\b/);
  });
});
