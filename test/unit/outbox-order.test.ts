import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SubmissionOp } from "@shared/types";

// A controllable stand-in for the server. Only `post` matters to the outbox.
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post, put: vi.fn() } };
});

import { ApiError } from "@client/lib/api";
import {
  enqueueSubmission, flush, retryFailed, pendingCount, failedCount, pendingOps, pairKey, failedPairKeys,
} from "@client/lib/outbox";
import { outboxAll, outboxRemove, outboxUpdate, failedAll, failedRemove } from "@client/lib/idb";
import { authRequired, syncPaused, dataEpoch } from "@client/lib/session";

let n = 0;
function op(score: number | null, o: Partial<SubmissionOp> = {}): SubmissionOp {
  return {
    opId: "op" + ++n, scanSessionId: "scn", assignmentId: "a1", studentId: "s1",
    status: "submitted", score, fullScoreAtScan: 10, method: "grid", clientTs: Date.now(), ...o,
  };
}
const networkDown = () => new ApiError(0, "network", "offline");
const ok = (ops: SubmissionOp[]) => ({ results: ops.map((o) => ({ opId: o.opId, result: "ok" })) });

async function wipe() {
  for (const i of await outboxAll()) await outboxRemove(i.opId);
  for (const f of await failedAll()) await failedRemove(f.opId);
}

describe("outbox ordering & durability", () => {
  beforeEach(async () => {
    post.mockReset();
    syncPaused.value = false;
    authRequired.value = false;
    await wipe();
    await flush(); // settle counters
  });

  it("3 → network hiccup → 9: the older score is never sent after the newer one", async () => {
    const sent: (number | null)[] = [];
    post.mockImplementationOnce(async () => { throw networkDown(); });
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => {
      for (const o of body.ops) sent.push(o.score);
      return ok(body.ops);
    });

    await enqueueSubmission(op(3));
    await flush();
    expect(post).toHaveBeenCalledTimes(1); // the failed attempt for 3

    // 9 arrives while 3 is waiting out its backoff
    await enqueueSubmission(op(9));
    await flush();
    expect(post).toHaveBeenCalledTimes(1); // held back — must NOT overtake
    expect(sent).toEqual([]);
    expect(pendingCount.value).toBe(2);
    expect(pendingOps.value.get(pairKey({ assignmentId: "a1", studentId: "s1" }))?.score).toBe(9);

    // backoff elapses
    for (const it of await outboxAll()) await outboxUpdate({ ...it, nextAt: 0 });
    await flush();
    expect(sent).toEqual([3, 9]); // in order → the server's last write is 9
    expect(pendingCount.value).toBe(0);
  });

  it("ops for other students are not held back by one student's backoff", async () => {
    post.mockImplementationOnce(async () => { throw networkDown(); });
    await enqueueSubmission(op(3, { studentId: "s1" }));
    await flush();

    const sent: string[] = [];
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => {
      for (const o of body.ops) sent.push(o.studentId);
      return ok(body.ops);
    });
    await enqueueSubmission(op(7, { studentId: "s2" }));
    await flush();
    expect(sent).toEqual(["s2"]);
  });

  it("a response with no verdict for an op does not drop it", async () => {
    post.mockResolvedValue({ results: [] });
    await enqueueSubmission(op(5));
    await flush();
    expect(pendingCount.value).toBe(1);
    expect((await outboxAll()).length).toBe(1);
  });

  it("a queued op made while a flush is running is sent without waiting for the next tick", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sent: (number | null)[] = [];
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => {
      await gate;
      for (const o of body.ops) sent.push(o.score);
      return ok(body.ops);
    });

    await enqueueSubmission(op(1, { studentId: "s1" })); // starts a flush that blocks on the gate
    await new Promise((r) => setTimeout(r, 20));
    await enqueueSubmission(op(2, { studentId: "s2" })); // arrives mid-flight
    release();
    await vi.waitFor(() => expect(sent.sort()).toEqual([1, 2]));
  });

  it("a rejected op is parked in failed, not lost — and retry keeps it if storage refuses", async () => {
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => ({
      results: body.ops.map((o) => ({ opId: o.opId, result: "not_in_class" })),
    }));
    const o = op(6);
    await enqueueSubmission(o);
    await flush();
    expect(failedCount.value).toBe(1);
    expect(pendingCount.value).toBe(0);

    // storage refuses the write into the outbox
    const orig = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...a: Parameters<typeof orig>) {
      if (this.name === "outbox") throw new DOMException("full", "QuotaExceededError");
      return orig.apply(this, a);
    });
    try {
      await expect(retryFailed(o.opId)).rejects.toBeTruthy();
    } finally {
      spy.mockRestore();
    }
    expect((await failedAll()).length).toBe(1); // still there
    expect((await outboxAll()).length).toBe(0);

    // and once storage works again the retry goes through
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => ok(body.ops));
    await retryFailed(o.opId);
    await flush();
    expect((await failedAll()).length).toBe(0);
    expect(pendingCount.value).toBe(0);
  });

  it("retrying one failed op re-queues every parked op for that student+work, oldest first", async () => {
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => ({
      results: body.ops.map((o) => ({ opId: o.opId, result: "invalid" })),
    }));
    const first = op(3, { clientTs: 1000 });
    const second = op(9, { clientTs: 2000 });
    await enqueueSubmission(first);
    await flush();
    await enqueueSubmission(second); // blocked behind the failed one → parked too
    await flush();
    expect(failedCount.value).toBe(2);

    const seen: (number | null)[] = [];
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => {
      for (const o of body.ops) seen.push(o.score);
      return ok(body.ops);
    });
    await retryFailed(second.opId); // the NEWER one was clicked
    await flush();
    expect(seen).toEqual([3, 9]);
    expect(failedCount.value).toBe(0);
  });

  it("does nothing while signed out, and keeps the queue", async () => {
    syncPaused.value = true;
    await enqueueSubmission(op(4));
    await flush();
    expect(post).not.toHaveBeenCalled();
    expect(pendingCount.value).toBe(1);

    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => ok(body.ops));
    syncPaused.value = false;
    await flush();
    expect(pendingCount.value).toBe(0);
  });

  it("a 401 keeps the queue and asks for a re-login", async () => {
    post.mockImplementation(async () => { throw new ApiError(401, "unauthorized", "x"); });
    await enqueueSubmission(op(8));
    await flush();
    expect(authRequired.value).toBe(true);
    expect(pendingCount.value).toBe(1);
  });

  it("stamps the data epoch on what it queues, and a retry re-stamps it with the current one", async () => {
    dataEpoch.value = 3;
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => ({
      results: body.ops.map((o) => ({ opId: o.opId, result: "epoch_changed" })),
    }));
    const o = op(6);
    await enqueueSubmission(o);
    await flush();
    const parked = (await failedAll())[0];
    expect(parked.payload.dataEpoch).toBe(3);
    expect(parked.reason).toBe("epoch_changed");

    dataEpoch.value = 4; // the screen reloaded after the restore
    post.mockReset();
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => ok(body.ops));
    await retryFailed(parked.opId);
    await flush();
    expect(post.mock.calls[0][1].ops[0]).toMatchObject({ dataEpoch: 4, score: 6 });
    expect(post.mock.calls[0][1].ops[0].opId).not.toBe(o.opId);
    dataEpoch.value = null;
  });

  it("a superseded op is parked but does not block (or mark) that cell; a later op still goes through", async () => {
    post.mockImplementationOnce(async (_p: string, body: { ops: SubmissionOp[] }) => ({
      results: body.ops.map((o) => ({ opId: o.opId, result: "superseded" })),
    }));
    await enqueueSubmission(op(3));
    await flush();
    expect(failedCount.value).toBe(1);
    expect(failedPairKeys.value.size).toBe(0); // the cell isn't shown as failed — it just holds the newer value

    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => ok(body.ops));
    await enqueueSubmission(op(9)); // a newer decision for the same cell
    await flush();
    expect(pendingCount.value).toBe(0);
    expect(failedCount.value).toBe(1); // only the superseded one is still parked (not "blocked_by_earlier_failure")
    expect((await failedAll())[0].reason).toBe("superseded");
  });

  it("an ordinary rejection still blocks later ops for that cell (order matters there)", async () => {
    post.mockImplementationOnce(async (_p: string, body: { ops: SubmissionOp[] }) => ({
      results: body.ops.map((o) => ({ opId: o.opId, result: "invalid" })),
    }));
    await enqueueSubmission(op(3));
    await flush();
    await enqueueSubmission(op(9));
    await flush();
    expect((await failedAll()).map((f) => f.reason).sort()).toEqual(["blocked_by_earlier_failure", "invalid"]);
    expect(failedPairKeys.value.size).toBe(1);
  });

  it("a whole-request epoch refusal (409) parks the ops as epoch_changed instead of retrying forever", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "epoch_changed", "x", { error: "epoch_changed" }));
    await enqueueSubmission(op(5));
    await flush();
    expect((await failedAll())[0].reason).toBe("epoch_changed");
    expect(pendingCount.value).toBe(0);
  });
});
