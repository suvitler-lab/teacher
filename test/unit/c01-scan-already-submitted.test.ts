// integrity-c01 AC-12 / BR-07 (written by QA before the fix): the scan screen on a STALE copy shows ก "ยังไม่ส่ง",
// the scan is queued, and the server answers `already_submitted` with what it holds (7/10). The screen must then look
// exactly like a local repeat scan: same card ("ส่งไปแล้ว — ไม่บันทึกซ้ำ" + the stored score), the repeat sound, the
// cell = the server's 7, the score pad (type mode) closed, no "ส่งไม่สำเร็จ" message.
// Expected to FAIL on main 18759a2 (the screen treats the unknown answer as a refusal: error card + error sound).
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
const serverHolds = (score: number | null) => ({
  assignment_id: "A", student_id: "st1", status: "submitted", score, late: false, submitted_at: 900,
  method: "grid", device_id: "dev_pc", scan_session_id: null, updated_at: 900,
});
const answerAlready = (op: any, score: number | null = 7) => {
  for (const cb of resultListeners) cb({ opId: op.opId, result: "already_submitted", submission: serverHolds(score) }, op);
};

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

describe("C-01: the server says already_submitted to a scan made on a stale copy", () => {
  for (const mode of ["full", "later", "type"] as const) {
    it(`AC-12 (${mode}): card + sound = a local repeat scan, the cell shows the server's 7/10`, async () => {
      get.mockResolvedValue({ submissions: [], serverTime: 100 }); // stale: ก looks "not handed in"
      await __scan.startSession("A", "c1", mode);
      __scan.commitStudent(ko, "hid");
      expect(enqueue).toHaveBeenCalledTimes(1); // precondition: the stale screen queued it
      const op = enqueue.mock.calls[0][0] as any;
      sounds.ok.mockClear(); sounds.dup.mockClear(); sounds.err.mockClear();

      answerAlready(op);
      expect(__scan.effSub("st1")).toMatchObject({ status: "submitted", score: 7 });
      const card = __scan.feedback.value;
      expect(card?.sub).toBe("ส่งไปแล้ว — ไม่บันทึกซ้ำ");
      expect(card?.sub ?? "").not.toContain("ส่งไม่สำเร็จ");
      expect(sounds.dup).toHaveBeenCalledTimes(1);
      expect(sounds.err).not.toHaveBeenCalled();

      // "the same card as a repeat scan on this device": scanning ก again now must produce an identical card
      __scan.feedback.value = null;
      __scan.commitStudent(ko, "hid");
      expect(enqueue).toHaveBeenCalledTimes(1); // nothing new queued
      expect(__scan.feedback.value).toEqual(card);
    });
  }

  it("AC-12 (type): the score pad opened by the stale scan closes when the answer arrives", async () => {
    get.mockResolvedValue({ submissions: [], serverTime: 100 });
    await __scan.startSession("A", "c1", "type");
    const { container } = render(h(ScanPage, {}));
    __scan.commitStudent(ko, "hid");
    await vi.waitFor(() => expect(container.querySelector(".sc-pad")).not.toBeNull()); // precondition
    const op = enqueue.mock.calls[0][0] as any;
    answerAlready(op);
    await vi.waitFor(() => expect(container.querySelector(".sc-pad")).toBeNull());
    expect(container.textContent ?? "").not.toContain("ส่งไม่สำเร็จ");
  });

  it("AC-12 (later): ก held 7 -> the screen must not keep showing รอตรวจ/ว่าง for ก", async () => {
    get.mockResolvedValue({ submissions: [], serverTime: 100 });
    await __scan.startSession("A", "c1", "later");
    __scan.commitStudent(ko, "hid");
    expect(__scan.effSub("st1")).toMatchObject({ status: "submitted", score: null }); // what the stale screen assumed
    answerAlready(enqueue.mock.calls[0][0]);
    expect(__scan.effSub("st1")?.score).toBe(7);
  });
});
