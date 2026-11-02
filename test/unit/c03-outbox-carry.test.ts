// c03-submit-date (D-c03-submit-date-07, BR-07): the offline queue sends the whole op, so the new fields reach the
// server unchanged — and "ลองใหม่" keeps the picked date while giving the op a new id and time. Written by QA (T-01);
// expected to PASS on 0312e8d already (src/ is not changed in this job) — a guard for ui-redesign.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SubmissionOp } from "@shared/types";

const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post, put: vi.fn() } };
});

import { enqueueSubmission, flush, retryFailed } from "@client/lib/outbox";
import { outboxAll, outboxRemove, failedAll, failedRemove } from "@client/lib/idb";
import { authRequired, syncPaused } from "@client/lib/session";

let n = 0;
// built through a variable so the object type stays valid before T-02 adds the fields to SubmissionOp
const dated = { receivedDate: "2026-10-30" };
const redate = { receivedDate: "2026-10-30", dateOnly: true };
function op(extra: Record<string, unknown>, o: Partial<SubmissionOp> = {}): SubmissionOp {
  const base = {
    opId: "c03o" + ++n, scanSessionId: "scn", assignmentId: "a1", studentId: "s1",
    status: "submitted", score: 7, fullScoreAtScan: 10, method: "grid", clientTs: Date.now() - 60_000, ...o,
  };
  return { ...base, ...extra } as SubmissionOp;
}

/** enqueueSubmission starts its own flush; keep flushing until the queue is empty (or 5 rounds). */
async function drain() {
  for (let i = 0; i < 5 && (await outboxAll()).length > 0; i++) await flush();
}

async function wipe() {
  for (const i of await outboxAll()) await outboxRemove(i.opId);
  for (const f of await failedAll()) await failedRemove(f.opId);
}

describe("outbox carries receivedDate / dateOnly (TC-41)", () => {
  beforeEach(async () => {
    post.mockReset();
    syncPaused.value = false;
    authRequired.value = false;
    await wipe();
    await flush();
  });

  it("a hand-in with a received date and a re-date op are sent with their new fields", async () => {
    const bodies: any[] = [];
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => {
      bodies.push(body);
      return { results: body.ops.map((o) => ({ opId: o.opId, result: "ok" })) };
    });
    const a = op(dated, { method: "hid", studentId: "s1" });
    const b = op(redate, { studentId: "s2" });
    await enqueueSubmission(a);
    await enqueueSubmission(b);
    await drain();
    const sent = bodies.flatMap((x) => x.ops) as any[];
    expect(sent.find((x) => x.opId === a.opId)).toMatchObject({ receivedDate: "2026-10-30", method: "hid" });
    expect(sent.find((x) => x.opId === b.opId)).toMatchObject({ receivedDate: "2026-10-30", dateOnly: true, method: "grid", score: 7 });
    expect(await outboxAll()).toEqual([]);
  });

  it("ลองใหม่ after an invalid received_date_* keeps the date, with a new opId and a newer clientTs", async () => {
    post.mockImplementationOnce(async (_p: string, body: { ops: SubmissionOp[] }) => ({
      results: body.ops.map((o) => ({ opId: o.opId, result: "invalid", reason: "received_date_before_assigned" })),
    }));
    const a = op(dated, { method: "hid" });
    await enqueueSubmission(a);
    await flush();
    const parked = await failedAll();
    // 0312e8d parks the RESULT ("invalid") as the reason; the server's detail (received_date_*) is not kept — showing the
    // 5 new reasons in Thai is ui-redesign work (plan.md "ส่วน UI ที่เลื่อน" Q3), noted in qa-report.
    expect(parked.map((f) => f.reason)).toEqual(["invalid"]);
    expect((parked[0].payload as any).receivedDate).toBe("2026-10-30");

    const bodies: any[] = [];
    post.mockImplementation(async (_p: string, body: { ops: SubmissionOp[] }) => {
      bodies.push(body);
      return { results: body.ops.map((o) => ({ opId: o.opId, result: "ok" })) };
    });
    await retryFailed(a.opId);
    await drain();
    const resent = bodies.flatMap((x) => x.ops) as any[];
    expect(resent).toHaveLength(1);
    expect(resent[0].receivedDate).toBe("2026-10-30");
    expect(resent[0].opId).not.toBe(a.opId);
    expect(resent[0].clientTs).toBeGreaterThan(a.clientTs);
    expect(await failedAll()).toEqual([]);
  });
});
