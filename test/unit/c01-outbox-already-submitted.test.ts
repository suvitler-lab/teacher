// integrity-c01 BR-07 / AC-09 (written by QA before the fix): `already_submitted` is a final answer, not a failure.
// The queue drops the op like `ok`/`duplicate`, nothing goes to "ส่งไม่สำเร็จ", the cell is not marked failed and later
// ops for the same cell are not held back. Expected to FAIL on main 18759a2 (the outbox parks unknown results in failed).
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SubmissionOp } from "@shared/types";

const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post, put: vi.fn() } };
});

import {
  enqueueSubmission, flush, pendingCount, failedCount, failedPairKeys, onResult,
} from "@client/lib/outbox";
import { outboxAll, outboxRemove, failedAll, failedRemove } from "@client/lib/idb";
import { authRequired, syncPaused } from "@client/lib/session";

let n = 0;
function op(o: Partial<SubmissionOp> = {}): SubmissionOp {
  return {
    opId: "c01op" + ++n, scanSessionId: "R2", assignmentId: "a1", studentId: "s1",
    status: "submitted", score: 10, fullScoreAtScan: 10, method: "hid", clientTs: Date.now(), ...o,
  };
}
// what the server holds for ก: 7 from the gradebook
const stored = (o: SubmissionOp) => ({
  assignment_id: o.assignmentId, student_id: o.studentId, status: "submitted", score: 7, late: false, submitted_at: 900,
  method: "grid", device_id: "dev_pc", scan_session_id: null, updated_at: 900,
});
const answer = (pick: (o: SubmissionOp) => string) => async (_p: string, body: { ops: SubmissionOp[] }) => ({
  results: body.ops.map((o) => {
    const result = pick(o);
    return result === "already_submitted" ? { opId: o.opId, result, submission: stored(o) } : { opId: o.opId, result, submission: { ...stored(o), score: o.score } };
  }),
});

async function wipe() {
  for (const i of await outboxAll()) await outboxRemove(i.opId);
  for (const f of await failedAll()) await failedRemove(f.opId);
}

describe("C-01 outbox: already_submitted leaves the queue quietly", () => {
  beforeEach(async () => {
    post.mockReset();
    syncPaused.value = false;
    authRequired.value = false;
    await wipe();
    await flush();
  });

  it("AC-09 ฉ5: a queued scan answered already_submitted is removed — pending 1 → 0, failed stays 0, cell not marked", async () => {
    post.mockImplementation(answer(() => "already_submitted"));
    await enqueueSubmission(op());
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(await outboxAll()).toEqual([]);
    expect(pendingCount.value).toBe(0);
    expect(await failedAll()).toEqual([]);
    expect(failedCount.value).toBe(0);
    expect(failedPairKeys.value.size).toBe(0);
  });

  it("BR-07 example: 3 queued, one already_submitted -> all leave the queue, ส่งไม่สำเร็จ = 0", async () => {
    post.mockImplementation(answer((o) => (o.studentId === "s1" ? "already_submitted" : "ok")));
    await enqueueSubmission(op({ studentId: "s1" }));
    await enqueueSubmission(op({ studentId: "s2" }));
    await enqueueSubmission(op({ studentId: "s3" }));
    await flush();
    expect(pendingCount.value).toBe(0);
    expect(failedCount.value).toBe(0);
    expect(await failedAll()).toEqual([]);
  });

  it("AC-09: a gradebook op for the same cell made afterwards on this device still goes through (not blocked_by_earlier_failure)", async () => {
    post.mockImplementationOnce(answer(() => "already_submitted"));
    await enqueueSubmission(op());
    await flush();
    post.mockImplementation(answer(() => "ok"));
    const grade = op({ method: "grid", score: 9, scanSessionId: "gb", clientTs: Date.now() + 1 });
    await enqueueSubmission(grade);
    await flush();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1].ops.map((o: SubmissionOp) => o.opId)).toEqual([grade.opId]);
    expect(pendingCount.value).toBe(0);
    expect(failedCount.value).toBe(0);
    expect((await failedAll()).map((f) => f.reason)).toEqual([]);
  });

  it("[guard] AC-12 plumbing: the screen is told (listener gets the answer with the server's submission)", async () => {
    const seen: any[] = [];
    const off = onResult((r) => seen.push(r));
    post.mockImplementation(answer(() => "already_submitted"));
    const o = op();
    await enqueueSubmission(o);
    await flush();
    off();
    expect(seen).toEqual([expect.objectContaining({ opId: o.opId, result: "already_submitted", submission: expect.objectContaining({ score: 7 }) })]);
  });
});
