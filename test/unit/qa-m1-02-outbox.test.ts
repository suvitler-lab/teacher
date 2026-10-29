// QA (black-box on the outbox) for M1-02, flag 🔄: ops queued OFFLINE for a student who is moved out of the class
// before the device comes back. The server is a small stand-in that applies BR-02 the way the real route does
// (expected results from docs/team/jobs/2026-10-30-m1-02-inactive-student-guard/evidence/qa-expected-from-br.md S-05).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import type { SubmissionOp, SubmissionOpResult } from "@shared/types";

const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post, put: vi.fn() } };
});

import { ApiError } from "@client/lib/api";
import { enqueueSubmission, flush, onResult, pendingCount, failedCount, failedPairKeys, pairKey, retryFailed } from "@client/lib/outbox";
import { outboxAll, outboxRemove, outboxUpdate, failedAll, failedRemove } from "@client/lib/idb";
import { authRequired, syncPaused } from "@client/lib/session";
import { FailedPanel } from "@client/components/Overlays";

let n = 0;
function op(studentId: string, o: Partial<SubmissionOp> = {}): SubmissionOp {
  return {
    opId: "qa" + ++n, scanSessionId: "scn", assignmentId: "a1", studentId,
    status: "submitted", score: null, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
async function wipe() {
  for (const i of await outboxAll()) await outboxRemove(i.opId);
  for (const f of await failedAll()) await failedRemove(f.opId);
}
const elapse = async () => { for (const it of await outboxAll()) await outboxUpdate({ ...it, nextAt: 0 }); };

// --- a tiny server with BR-02: s1 has been MOVED (running term, no end date); everyone else is active -------------
const moved = new Set<string>();
const cells = new Set<string>(); // pairs that already have a row
const received: SubmissionOp[] = [];
function serverJudge(o: SubmissionOp): SubmissionOpResult {
  const intent = o.intent ?? (["camera", "hid", "manual"].includes(o.method) ? "receive" : "grade");
  const receive = o.status === "submitted" && intent === "receive";
  const k = pairKey(o);
  if (moved.has(o.studentId) && (receive || !cells.has(k))) return { opId: o.opId, result: "student_inactive" };
  cells.add(k);
  return { opId: o.opId, result: "ok", submission: {} as any };
}
let offline = false;
post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => {
  if (offline) throw new ApiError(0, "network", "offline");
  received.push(...body.ops);
  return { results: body.ops.map(serverJudge) };
});

describe("QA M1-02 offline replay: ops queued for a student who was moved while the device was offline", () => {
  beforeEach(async () => {
    post.mockClear();
    received.length = 0;
    moved.clear();
    cells.clear();
    offline = false;
    syncPaused.value = false;
    authRequired.value = false;
    await wipe();
    await flush();
  });

  it("offline scans of s1 (moved meanwhile) and s2: back online -> s1 parked at once (no retry), s2 lands; a later s1 op is held back", async () => {
    // offline in the classroom: two hand-ins queue up
    offline = true;
    const a1 = op("s1");
    const b1 = op("s2");
    await enqueueSubmission(a1);
    await enqueueSubmission(b1);
    await flush();
    expect(pendingCount.value).toBe(2);
    expect(await failedAll()).toEqual([]);

    // meanwhile another device moved s1 out of the class; this device comes back online
    moved.add("s1");
    offline = false;
    await elapse();
    const seen: SubmissionOpResult[] = [];
    const off = onResult((r) => seen.push(r));
    await flush();
    off();

    expect(received.map((o) => o.opId).sort()).toEqual([a1.opId, b1.opId].sort());
    expect(seen.find((r) => r.opId === a1.opId)?.result).toBe("student_inactive"); // the scan page hears it (feedback)
    expect(seen.find((r) => r.opId === b1.opId)?.result).toBe("ok");
    const parked = await failedAll();
    expect(parked.map((f) => [f.opId, f.reason])).toEqual([[a1.opId, "student_inactive"]]);
    expect(await outboxAll()).toEqual([]); // b1 delivered, a1 not left in the queue for a retry
    expect(pendingCount.value).toBe(0);
    expect(failedCount.value).toBe(1);
    expect(failedPairKeys.value.has(pairKey(a1))).toBe(true);

    // more flushes (the periodic tick / reconnect) never send a1 again
    const calls = post.mock.calls.length;
    await flush();
    await flush();
    expect(post.mock.calls.length).toBe(calls);

    // the teacher now types a score for s1 on the same cell: held back behind the parked failure, NOT sent
    const a2 = op("s1", { method: "grid", score: 8 });
    await enqueueSubmission(a2);
    await flush();
    expect(received.some((o) => o.opId === a2.opId)).toBe(false);
    expect((await failedAll()).map((f) => [f.opId, f.reason]).sort()).toEqual(
      [[a1.opId, "student_inactive"], [a2.opId, "blocked_by_earlier_failure"]].sort(),
    );

    // other students keep flowing
    const b2 = op("s2", { method: "grid", score: 9 });
    await enqueueSubmission(b2);
    await flush();
    expect(received.some((o) => o.opId === b2.opId)).toBe(true);
    expect(pendingCount.value).toBe(0);
  });

  it("the parked ops survive a reload (they are in IndexedDB), and 'ลองใหม่' after the student is active again delivers them in order", async () => {
    moved.add("s1");
    const a1 = op("s1", { clientTs: 1000 });
    await enqueueSubmission(a1);
    await flush();
    const a2 = op("s1", { method: "grid", score: 8, clientTs: 2000 });
    await enqueueSubmission(a2);
    await flush();
    // a reload reads the same stores: both are still parked, nothing was lost
    expect((await failedAll()).map((f) => f.reason).sort()).toEqual(["blocked_by_earlier_failure", "student_inactive"]);

    // the teacher made s1 active again (mistake), then taps "ลองใหม่" on the newer one
    moved.delete("s1");
    received.length = 0;
    await retryFailed(a2.opId);
    await flush();
    expect(received.map((o) => o.score)).toEqual([null, 8]); // the scan first, then the score: order kept
    expect(await failedAll()).toEqual([]);
    expect(pendingCount.value).toBe(0);
  });

  it("an offline grade on s1's EXISTING cell still lands after the move (D15), while a scan in the same flush is parked", async () => {
    cells.add(pairKey({ assignmentId: "a1", studentId: "s1" })); // scored before the move
    offline = true;
    const scan = op("s1", { assignmentId: "a1" });
    const grade = op("s1", { assignmentId: "a1", method: "grid", score: 7 });
    await enqueueSubmission(scan);
    await enqueueSubmission(grade);
    await flush();
    moved.add("s1");
    offline = false;
    await elapse();
    await flush();
    // both were in the same request (one chunk), so the grade was already on its way when the scan was refused
    expect((await failedAll()).map((f) => [f.opId, f.reason])).toEqual([[scan.opId, "student_inactive"]]);
    expect(received.map((o) => o.opId)).toEqual([scan.opId, grade.opId]);
    expect(await outboxAll()).toEqual([]);
  });

  it("the 'ส่งไม่สำเร็จ' panel explains student_inactive in Thai", async () => {
    moved.add("s1");
    await enqueueSubmission(op("s1", { score: 6, method: "manual" }));
    await flush();
    expect(failedCount.value).toBe(1);
    render(h(FailedPanel, {}));
    fireEvent.click(screen.getByText(/ส่งไม่สำเร็จ 1/));
    await waitFor(() => expect(screen.getByText(/นักเรียนไม่อยู่ในห้องแล้ว \(ย้าย\/ไม่ใช้งาน\/จบปี\)/)).toBeTruthy());
  });
});
