import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Assignment, Student } from "@shared/types";

// B02: switching to another work while the network is slow or down must never leave the previous
// work's hand-ins on screen — the scanner would tell the teacher "already handed in" and queue nothing.
const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn(async (_op?: unknown) => {}));
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post, put: vi.fn() } };
});
vi.mock("@client/lib/outbox", async (orig) => ({ ...(await orig<typeof import("@client/lib/outbox")>()), enqueueSubmission: enqueue }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { ApiError } from "@client/lib/api";
import { assignments, students, classes } from "@client/store";
import { __scan } from "@client/pages/Scan";

const asg = (id: string): Assignment => ({
  id, term_id: null, subject_id: null, type_id: null, title: id, unit: null, full_score: 10, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
});
const stu: Student = {
  id: "st1", code: "101", qr_token: "Q-AAAAAAAAAA", prefix: null, first_name: "ก", last_name: "ข", nickname: null,
  class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};
const handedIn = (score: number) => ({ submissions: [{ student_id: "st1", status: "submitted", score, updated_at: 100 }], serverTime: 100 });
const offline = () => new ApiError(0, "network", "offline");
const urls = () => get.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  get.mockReset(); post.mockReset(); enqueue.mockClear();
  post.mockResolvedValue({});
  assignments.value = [asg("A"), asg("B")];
  students.value = [stu];
  classes.value = [];
  __scan.session.value = null;
  __scan.feedback.value = null;
});

describe("the scan round belongs to ONE assignment", () => {
  it("switching A→B again before A has finished saving doesn't leave B stuck 'loading' (A's late continuation must not steal the load)", async () => {
    get.mockResolvedValue({ submissions: [], serverTime: 700 });
    const a = __scan.startSession("A", "c1", "full");   // not awaited: A is still saving its round …
    const b = __scan.startSession("B", "c1", "full");   // … when the teacher picks B
    await Promise.all([a, b]);
    expect(__scan.session.value?.assignmentId).toBe("B");
    expect(__scan.subsBox.value).toMatchObject({ aid: "B", status: "ready", serverTime: 700 });
    expect(urls().filter((u) => u.includes("/assignments/A/"))).toEqual([]); // A never asked the server for anything
  });

  it("switching to another work while offline shows nothing of the previous work, says it doesn't know, and still queues the scan", async () => {
    get.mockResolvedValueOnce(handedIn(8));
    await __scan.startSession("A", "c1", "full");
    expect(__scan.effSub("st1")).toMatchObject({ status: "submitted", score: 8 });

    get.mockRejectedValue(offline());
    await __scan.startSession("B", "c1", "full");
    expect(__scan.session.value?.assignmentId).toBe("B");
    expect(__scan.effSub("st1")).toBeUndefined();                  // A's 8/10 is gone
    expect(__scan.subsBox.value).toMatchObject({ aid: "B", status: "unknown" });

    __scan.commitStudent(stu, "manual");
    expect(__scan.feedback.value?.sub ?? "").not.toContain("ส่งไปแล้ว");   // not "already handed in — not recorded"
    expect(enqueue).toHaveBeenCalledTimes(1);                     // it went into the queue
    expect(enqueue.mock.calls[0][0]).toMatchObject({ assignmentId: "B", studentId: "st1", status: "submitted" });
  });

  it("clears the previous work at once — before the new work's answer arrives", async () => {
    get.mockResolvedValueOnce(handedIn(8));
    await __scan.startSession("A", "c1", "full");
    let release!: (v: unknown) => void;
    get.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const starting = __scan.startSession("B", "c1", "full");
    expect(__scan.effSub("st1")).toBeUndefined();             // gone immediately, not when B's answer arrives
    expect(__scan.subsBox.value.status).toBe("loading");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release({ submissions: [], serverTime: 200 });
    await starting;
    expect(__scan.subsBox.value).toMatchObject({ aid: "B", status: "ready" });
  });

  it("a slow answer for the OLD work that arrives after switching is thrown away", async () => {
    let releaseA!: (v: unknown) => void;
    get.mockImplementationOnce(() => new Promise((r) => (releaseA = r)));
    const loadingA = __scan.startSession("A", "c1", "full");
    await vi.waitFor(() => expect(releaseA).toBeTypeOf("function")); // A's request is out
    get.mockResolvedValueOnce({ submissions: [], serverTime: 300 });
    await __scan.startSession("B", "c1", "full");

    releaseA(handedIn(8));
    await loadingA;
    expect(__scan.session.value?.assignmentId).toBe("B");
    expect(__scan.effSub("st1")).toBeUndefined();
    expect(__scan.subsBox.value).toMatchObject({ aid: "B", status: "ready", serverTime: 300 });
  });

  it("a change-poll for the old work that lands after switching is thrown away too", async () => {
    get.mockResolvedValueOnce(handedIn(8));
    await __scan.startSession("A", "c1", "full");
    let releasePoll!: (v: unknown) => void;
    get.mockImplementationOnce(() => new Promise((r) => (releasePoll = r)));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const polling = __scan.pollSubs();
    get.mockResolvedValueOnce({ submissions: [], serverTime: 400 });
    await __scan.startSession("B", "c1", "full");

    releasePoll({ submissions: [{ student_id: "st1", status: "submitted", score: 9, updated_at: 500 }], serverTime: 500 });
    await polling;
    expect(__scan.effSub("st1")).toBeUndefined();
    expect(__scan.subsBox.value.serverTime).toBe(400);
  });

  it("if the new work never loaded, polling asks for EVERYTHING — not 'changes since' the other work's clock", async () => {
    get.mockResolvedValueOnce({ submissions: [], serverTime: 12345 });
    await __scan.startSession("A", "c1", "full");
    get.mockRejectedValueOnce(offline());
    await __scan.startSession("B", "c1", "full");
    expect(__scan.subsBox.value.status).toBe("unknown");

    get.mockResolvedValueOnce(handedIn(6));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await __scan.pollSubs();
    await Promise.resolve();
    const last = urls().at(-1)!;
    expect(last).toContain("/api/assignments/B/submissions");
    expect(last).not.toContain("since=");
    expect(__scan.subsBox.value.status).toBe("ready");
    expect(__scan.effSub("st1")).toMatchObject({ score: 6 });
  });

  it("a refresh that fails does not throw away what we already knew for this work", async () => {
    get.mockResolvedValueOnce(handedIn(8));
    await __scan.startSession("A", "c1", "full");
    get.mockRejectedValueOnce(offline());
    await expect(__scan.loadSubs("A")).rejects.toBeTruthy();
    expect(__scan.subsBox.value.status).toBe("ready");
    expect(__scan.effSub("st1")).toMatchObject({ score: 8 });
  });
});
