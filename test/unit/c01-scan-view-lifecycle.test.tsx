// integrity-c01 R-01: the repeat card/sound for `already_submitted` shows only while the scan page is on screen
// (Gate 1 Q2). Off the page, the answer still updates the cache (subsBox) but is silent.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Assignment, Student } from "@shared/types";
import { h } from "preact";
import { render, cleanup } from "@testing-library/preact";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post, put: vi.fn() } };
});
const listeners = vi.hoisted(() => [] as ((r: any, op: any) => void)[]);
vi.mock("@client/lib/outbox", async (orig) => {
  const actual = await orig<typeof import("@client/lib/outbox")>();
  return { ...actual, enqueueSubmission: vi.fn(async () => {}), onResult: (cb: any) => { listeners.push(cb); return actual.onResult(cb); } };
});
const vib = vi.hoisted(() => vi.fn());
const sounds = vi.hoisted(() => ({ ok: vi.fn(), err: vi.fn(), dup: vi.fn(), undo: vi.fn() }));
vi.mock("@client/lib/sound", () => ({ beep: sounds, vibrate: vib }));

import { assignments, deletedAssignmentIds, students, classes } from "@client/store";
import { pendingOps, online, syncing, pendingCount } from "@client/lib/outbox";
import { serverReachable } from "@client/lib/session";
import { __scan, ScanPage } from "@client/pages/Scan";

const asg: Assignment = {
  id: "A", term_id: null, subject_id: null, type_id: null, title: "A", unit: null, full_score: 10, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const ko: Student = {
  id: "st1", code: "101", qr_token: "Q-AAAAAAAAAA", prefix: "ด.ช.", first_name: "กิตติ", last_name: "วงศ์", nickname: null,
  class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};
const op = { opId: "o1", assignmentId: "A", studentId: "st1" };
const answer = () => {
  const r = { opId: "o1", result: "already_submitted", submission: { assignment_id: "A", student_id: "st1", status: "submitted", score: 7, late: false, submitted_at: 900, method: "grid", device_id: "d", scan_session_id: null, updated_at: 900 } };
  for (const cb of listeners) cb(r, op);
};

beforeEach(async () => {
  cleanup();
  get.mockReset(); post.mockReset(); vib.mockClear();
  for (const s of Object.values(sounds)) s.mockClear();
  get.mockResolvedValue({ submissions: [], serverTime: 100 });
  post.mockResolvedValue({});
  assignments.value = [asg]; deletedAssignmentIds.value = new Set(); students.value = [ko]; classes.value = [];
  pendingOps.value = new Map(); online.value = true; serverReachable.value = true; syncing.value = false; pendingCount.value = 0;
  __scan.feedback.value = null;
});

// a round restored from storage (never started in this run) whose page was never opened
const restoredSession = () => {
  __scan.session.value = { id: "scn_x", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 10, mode: "full" } as any;
  __scan.subsBox.value = { aid: "A", map: new Map(), status: "ready", serverTime: 0 };
};

describe("C-01 R-01: already_submitted card only while the scan page is mounted", () => {
  it("(a) never mounted: cache updates, no card / sound / vibration", () => {
    restoredSession();
    answer();
    expect(__scan.subsBox.value.map.get("st1")).toMatchObject({ status: "submitted", score: 7 });
    expect(__scan.feedback.value).toBeNull();
    expect(sounds.dup).not.toHaveBeenCalled();
    expect(vib).not.toHaveBeenCalled();
  });
  it("(b) mounted then unmounted: silent, cache updates", () => {
    restoredSession();
    const { unmount } = render(h(ScanPage, {}));
    unmount();
    answer();
    expect(__scan.subsBox.value.map.get("st1")?.score).toBe(7);
    expect(__scan.feedback.value).toBeNull();
    expect(sounds.dup).not.toHaveBeenCalled();
    expect(vib).not.toHaveBeenCalled();
  });
  it("(c) mounted: the repeat card, sound and vibration", () => {
    restoredSession();
    render(h(ScanPage, {}));
    answer();
    expect(__scan.feedback.value?.sub).toBe("ส่งไปแล้ว — ไม่บันทึกซ้ำ");
    expect(__scan.feedback.value?.score).toBe("7/10");
    expect(sounds.dup).toHaveBeenCalledTimes(1);
    expect(vib).toHaveBeenCalledWith(60);
  });
});

describe("C-01 R-03: an answer that arrives off the page leaves nothing wrong behind", () => {
  it("unmount -> answer -> mount again: no 10/10 row, no stale success card, cell = server's 7", async () => {
    get.mockResolvedValue({ submissions: [], serverTime: 100 });
    await __scan.startSession("A", "c1", "full");
    const first = render(h(ScanPage, {}));
    __scan.commitStudent(ko, "hid");
    const opId = (__scan.feedback.value as any).opId as string;
    expect(opId).toBeTruthy();
    expect(__scan.feedback.value?.score).toBe("10/10");
    first.unmount();
    for (const cb of listeners) cb({ opId, result: "already_submitted", submission: { assignment_id: "A", student_id: "st1", status: "submitted", score: 7, late: false, submitted_at: 900, method: "grid", device_id: "d", scan_session_id: null, updated_at: 900 } }, { opId, assignmentId: "A", studentId: "st1" });
    expect(sounds.dup).not.toHaveBeenCalled();
    const again = render(h(ScanPage, {}));
    expect(__scan.feedback.value).toBeNull();
    expect(again.container.textContent ?? "").not.toContain("10/10");
    expect(again.container.textContent ?? "").toContain("รอบนี้ 0 คน");
    expect(__scan.effSub("st1")?.score).toBe(7);
  });
});
