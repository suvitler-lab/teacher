// C-06: a child the teacher marked ยกเว้น comes to hand the work in — ask before turning the exemption into a hand-in.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Assignment, Student } from "@shared/types";
import { h } from "preact";
import { render } from "@testing-library/preact";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn(async (_op?: unknown) => {}));
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post, put: vi.fn() } };
});
const resultListeners = vi.hoisted(() => [] as ((r: any, op: any) => void)[]);
vi.mock("@client/lib/outbox", async (orig) => {
  const actual = await orig<typeof import("@client/lib/outbox")>();
  return {
    ...actual, enqueueSubmission: enqueue,
    onResult: (cb: (r: any, op: any) => void) => { resultListeners.push(cb); return actual.onResult(cb); },
  };
});
const sounds = vi.hoisted(() => ({ ok: vi.fn(), err: vi.fn(), dup: vi.fn(), undo: vi.fn() }));
vi.mock("@client/lib/sound", () => ({ beep: sounds, vibrate() {} }));

import { assignments, deletedAssignmentIds, students, classes } from "@client/store";
import { pendingOps, online, syncing, pendingCount } from "@client/lib/outbox";
import { serverReachable } from "@client/lib/session";
import { __scan, ScanPage } from "@client/pages/Scan";

const asg = (id: string): Assignment => ({
  id, term_id: null, subject_id: null, type_id: null, title: id, unit: null, full_score: 10, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
// a 30-character name (AC-12: long names) — fictional
const ko: Student = {
  id: "st1", code: "101", qr_token: "Q-AAAAAAAAAA", prefix: "ด.ช.", first_name: "กิตติศักดิ์ศรีสวัสดิ์", last_name: "วงศ์ไพบูลย์", nickname: null,
  class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};
const excusedRow = () => ({
  assignment_id: "A", student_id: "st1", status: "excused", score: null, late: false, submitted_at: 900,
  method: "grid", device_id: "dev_pc", scan_session_id: null, updated_at: 900,
});

beforeEach(() => {
  get.mockReset(); post.mockReset(); enqueue.mockClear();
  for (const s of Object.values(sounds)) s.mockClear();
  post.mockResolvedValue({});
  assignments.value = [asg("A")];
  deletedAssignmentIds.value = new Set();
  students.value = [ko];
  classes.value = [];
  __scan.session.value = null;
  __scan.feedback.value = null;
  pendingOps.value = new Map();
  online.value = true;
  serverReachable.value = true;
  syncing.value = false;
  pendingCount.value = 0;
});

describe("C-06: an excused child scans", () => {
  const start = async (mode: "full" | "later" | "type" = "full") => {
    get.mockResolvedValue({ submissions: [excusedRow()], serverTime: 100 });
    await __scan.startSession("A", "c1", mode);
    expect(__scan.effSub("st1")).toMatchObject({ status: "excused" }); // precondition
  };
  it("asks first: nothing queued, exemption kept, warning card + sound", async () => {
    await start();
    __scan.commitStudent(ko, "hid");
    expect(enqueue).not.toHaveBeenCalled();
    expect(__scan.excusedAsk.value?.student.id).toBe("st1");
    expect(__scan.effSub("st1")).toMatchObject({ status: "excused" });
    expect(__scan.feedback.value).toMatchObject({ kind: "warning" });
    expect(__scan.feedback.value?.sub).toContain("ยกเว้น");
    expect(sounds.dup).toHaveBeenCalledTimes(1);
    expect(sounds.ok).not.toHaveBeenCalled();
  });
  it("the card has both answers; 'รับงานนี้' queues a normal hand-in", async () => {
    await start();
    __scan.commitStudent(ko, "hid");
    const { container, getByText } = render(h(ScanPage, {}));
    expect(container.textContent).toContain("รับงานจริงไหม");
    getByText("รับงานนี้").closest("button")!.click();
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0][0]).toMatchObject({ studentId: "st1", status: "submitted", score: 10 });
    expect(__scan.excusedAsk.value).toBeNull();
    expect(__scan.effSub("st1")).toMatchObject({ status: "submitted" });
  });
  it("'ไม่รับ คงยกเว้น' changes nothing", async () => {
    await start();
    __scan.commitStudent(ko, "hid");
    const { getByText } = render(h(ScanPage, {}));
    getByText("ไม่รับ คงยกเว้น").closest("button")!.click();
    await vi.waitFor(() => expect(__scan.excusedAsk.value).toBeNull());
    expect(enqueue).not.toHaveBeenCalled();
    expect(__scan.effSub("st1")).toMatchObject({ status: "excused" });
  });
  it("scanning someone else replaces an unanswered question; a not-excused child is accepted at once", async () => {
    await start();
    __scan.commitStudent(ko, "hid");
    expect(__scan.excusedAsk.value).not.toBeNull();
    __scan.excusedAsk.value = null;
    const other = { ...ko, id: "st2", code: "102", qr_token: "Q-BBBBBBBBBB", number: 2 };
    students.value = [ko, other];
    __scan.commitStudent(other, "hid");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(__scan.excusedAsk.value).toBeNull();
  });
});
