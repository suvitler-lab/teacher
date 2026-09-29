import { describe, it, expect, beforeEach, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get: vi.fn(), post, put: vi.fn() } };
});

import { ApiError } from "@client/lib/api";
import {
  draftEdit, flushDraft, flushAllDrafts, resolveConflict, ctxKey, stopAttSync, reviewResend, reviewDiscard,
  attDraftCount, attDrafts, refreshAttDraftCount, onAttEvent, type AttCtx,
} from "@client/lib/attSync";
import { draftAll, draftGet, draftUpdate } from "@client/lib/idb";
import { authRequired, syncPaused, dataEpoch } from "@client/lib/session";

const A: AttCtx = { date: "2026-09-10", classId: "cA", subjectId: null, period: null };
const B: AttCtx = { date: "2026-09-10", classId: "cB", subjectId: null, period: null };
const edit = (studentId: string, status: "present" | "late" | "absent", base: number | null = null) =>
  ({ studentId, status, method: "grid" as const, baseUpdatedAt: base });

let updatedAt = 1000;
const good = async () => ({ ok: true, updatedAt: ++updatedAt });
const bodies = () => post.mock.calls.map((c) => c[1] as any);

async function wipe() {
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
}

describe("attendance drafts are bound to their own context", () => {
  beforeEach(async () => {
    post.mockReset();
    stopAttSync();
    syncPaused.value = false;
    authRequired.value = false;
    await wipe();
  });

  it("class A → switch to B → leave at once: each room's rows go to that room, nothing crosses", async () => {
    post.mockImplementation(good);
    await draftEdit(A, [edit("a1", "present")]);
    await draftEdit(B, [edit("b1", "late")]); // teacher switched class, tapped, left the page
    await flushAllDrafts();

    const sent = bodies();
    expect(sent).toHaveLength(2);
    const toA = sent.find((b) => b.classId === "cA");
    const toB = sent.find((b) => b.classId === "cB");
    expect(toA.rows.map((r: any) => r.studentId)).toEqual(["a1"]);
    expect(toB.rows.map((r: any) => r.studentId)).toEqual(["b1"]);
    expect(toB.rows[0].status).toBe("late");
    expect(await draftAll()).toHaveLength(0);
  });

  it("offline: A's rows stay under A and never leak into B's draft", async () => {
    post.mockRejectedValue(new ApiError(0, "network", "offline"));
    await draftEdit(A, [edit("a1", "present")]);
    await flushDraft(ctxKey(A)); // fails, backs off

    await draftEdit(B, [edit("b1", "absent")]);
    const dB = await draftGet(ctxKey(B));
    expect(Object.keys(dB!.rows)).toEqual(["b1"]);
    expect(dB!.ctx).toEqual(B);
    const dA = await draftGet(ctxKey(A));
    expect(Object.keys(dA!.rows)).toEqual(["a1"]);
  });

  it("sends the retry with the SAME op id, and the time/method of the tap", async () => {
    post.mockRejectedValueOnce(new ApiError(503, "x", "down"));
    post.mockImplementation(good);
    await draftEdit(A, [{ ...edit("a1", "present"), method: "hid" }]);
    await flushDraft(ctxKey(A));
    await flushDraft(ctxKey(A), { manual: true });

    const [first, second] = bodies();
    expect(second.rows[0].opId).toBe(first.rows[0].opId);
    expect(second.rows[0].method).toBe("hid");
    expect(typeof second.rows[0].time).toBe("number");
  });

  it("an ack removes only the rows it carried; a tap made mid-flight survives and is re-based", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    post.mockImplementation(async () => { if (++calls === 1) await gate; return { ok: true, updatedAt: 5000 + calls }; });

    await draftEdit(A, [edit("a1", "present")]);
    const p = flushDraft(ctxKey(A));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await draftEdit(A, [edit("a1", "absent")]); // changed her mind while the save is in flight
    release();
    await p;

    const sent = bodies();
    expect(sent).toHaveLength(2);
    expect(sent[0].rows[0].status).toBe("present");
    expect(sent[1].rows[0].status).toBe("absent");
    expect(sent[1].rows[0].baseUpdatedAt).toBe(5001); // builds on what the first save wrote → no self-clash
    expect(await draftAll()).toHaveLength(0);
  });

  it("a clash holds only the clashing student; the rest are saved; picking a side sends it", async () => {
    post.mockImplementationOnce(async () => {
      throw new ApiError(409, "conflict", "x", {
        conflicts: [{ studentId: "a1", draft: { status: "present" }, server: { status: "absent", updatedAt: 9000, deviceName: "iPad" } }],
      });
    });
    post.mockImplementation(good);

    await draftEdit(A, [edit("a1", "present"), edit("a2", "late")]);
    await flushDraft(ctxKey(A));

    expect(bodies()[1].rows.map((r: any) => r.studentId)).toEqual(["a2"]); // resent without the clash
    let d = await draftGet(ctxKey(A));
    expect(Object.keys(d!.rows)).toEqual(["a1"]);
    expect(d!.conflicts).toHaveLength(1);

    await resolveConflict(ctxKey(A), "a1", "draft");
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(bodies()[2].rows[0]).toMatchObject({ studentId: "a1", status: "present", baseUpdatedAt: 9000 });
    await vi.waitFor(async () => expect(await draftAll()).toHaveLength(0));
    d = await draftGet(ctxKey(A));
    expect(d).toBeUndefined();
  });

  it("choosing the server's side drops our edit", async () => {
    post.mockImplementationOnce(async () => {
      throw new ApiError(409, "conflict", "x", {
        conflicts: [{ studentId: "a1", draft: { status: "present" }, server: { status: "absent", updatedAt: 9000, deviceName: null } }],
      });
    });
    await draftEdit(A, [edit("a1", "present")]);
    await flushDraft(ctxKey(A));
    await resolveConflict(ctxKey(A), "a1", "server");
    expect(await draftGet(ctxKey(A))).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("a student who left the room is SET ASIDE for the teacher — kept whole, not dropped — and the rest still go", async () => {
    post.mockImplementationOnce(async () => {
      throw new ApiError(422, "not_in_class", "x", { error: "not_in_class", studentIds: ["ghost"] });
    });
    post.mockImplementation(good);
    await draftEdit(A, [edit("a1", "present"), edit("ghost", "late")]);
    await flushDraft(ctxKey(A));

    expect(bodies()[1].rows.map((r: any) => r.studentId)).toEqual(["a1"]); // the rest went
    const d = await draftGet(ctxKey(A));
    expect(Object.keys(d!.rows)).toEqual([]);
    expect(d!.review).toHaveLength(1);
    expect(d!.review![0]).toMatchObject({ studentId: "ghost", status: "late", reason: "not_in_class", method: "grid" });
    // the tap is not lost, and it is counted so the teacher is warned about it
    await refreshAttDraftCount();
    expect(attDraftCount.value).toBe(1);
    expect(attDrafts.value).toEqual([{ key: ctxKey(A), ctx: A, rows: 0, held: 0, review: 1 }]);
    // and it is NOT resent by itself
    post.mockClear();
    await flushAllDrafts();
    expect(post).not.toHaveBeenCalled();
  });

  it("the teacher can send a set-aside tap again (a fresh op), or throw it away", async () => {
    post.mockImplementationOnce(async () => { throw new ApiError(422, "not_in_class", "x", { error: "not_in_class", studentIds: ["ghost"] }); });
    post.mockImplementation(good);
    await draftEdit(A, [edit("ghost", "late")]);
    await flushDraft(ctxKey(A));
    const firstOp = bodies()[0].rows[0].opId;

    await reviewResend(ctxKey(A), "ghost");
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(bodies()[1].rows[0]).toMatchObject({ studentId: "ghost", status: "late" });
    expect(bodies()[1].rows[0].opId).not.toBe(firstOp); // a new tap, not a replay

    // discard path
    post.mockReset();
    post.mockImplementationOnce(async () => { throw new ApiError(422, "not_in_class", "x", { error: "not_in_class", studentIds: ["g2"] }); });
    await draftEdit(B, [edit("g2", "absent")]);
    await flushDraft(ctxKey(B));
    expect((await draftGet(ctxKey(B)))!.review).toHaveLength(1);
    await reviewDiscard(ctxKey(B), "g2");
    expect(await draftGet(ctxKey(B))).toBeUndefined();
  });

  it("taps made before a restore are set aside (epoch_changed), and new taps carry the current epoch", async () => {
    dataEpoch.value = 1;
    await draftEdit(A, [edit("a1", "present"), edit("a2", "late")]);
    expect((await draftGet(ctxKey(A)))!.rows.a1.epoch).toBe(1);

    // the server has moved on to epoch 2 (a restore) and refuses the whole batch
    post.mockRejectedValueOnce(new ApiError(409, "epoch_changed", "x", { error: "epoch_changed", studentIds: ["a1", "a2"] }));
    await flushDraft(ctxKey(A));
    const d = await draftGet(ctxKey(A));
    expect(Object.keys(d!.rows)).toEqual([]);
    expect(d!.review!.map((r) => r.studentId).sort()).toEqual(["a1", "a2"]);
    expect(d!.review!.every((r) => r.reason === "epoch_changed")).toBe(true);

    // after the client reloads it knows epoch 2; a new tap is stamped with it and goes out
    dataEpoch.value = 2;
    post.mockImplementation(good);
    await draftEdit(A, [edit("a3", "present")]);
    await flushDraft(ctxKey(A));
    expect(bodies().at(-1).rows[0]).toMatchObject({ studentId: "a3", dataEpoch: 2 });
    // …while the old taps are still waiting for the teacher
    expect((await draftGet(ctxKey(A)))!.review).toHaveLength(2);
    dataEpoch.value = null;
  });

  it("a whole-batch epoch refusal without a student list sets aside everything", async () => {
    await draftEdit(A, [edit("a1", "present"), edit("a2", "late")]);
    post.mockRejectedValueOnce(new ApiError(409, "epoch_changed", "x", { error: "epoch_changed" }));
    await flushDraft(ctxKey(A));
    expect((await draftGet(ctxKey(A)))!.review).toHaveLength(2);
  });

  it("re-bases an edit made mid-flight on the version the SERVER gave that row, not one shared number", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    post.mockImplementation(async () => {
      if (++calls === 1) { await gate; return { ok: true, updatedAt: 9000, rows: { a1: 9007, a2: 9003 } }; }
      return { ok: true, updatedAt: 9100, rows: { a1: 9100 } };
    });
    await draftEdit(A, [edit("a1", "present"), edit("a2", "late")]);
    const p = flushDraft(ctxKey(A));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await draftEdit(A, [edit("a1", "absent")]); // tapped again while the first save is in flight
    release();
    await p;

    // the second send builds on a1's OWN version (9007) — with one shared number it would be 9000 and clash with itself
    expect(bodies()[1].rows[0]).toMatchObject({ studentId: "a1", status: "absent", baseUpdatedAt: 9007 });
  });

  it("backs off after a failure, but the network coming back sends immediately", async () => {
    post.mockRejectedValueOnce(new ApiError(0, "network", "offline"));
    post.mockImplementation(good);
    await draftEdit(A, [edit("a1", "present")]);

    await flushDraft(ctxKey(A));
    expect(post).toHaveBeenCalledTimes(1);

    await flushDraft(ctxKey(A)); // still inside the backoff window
    expect(post).toHaveBeenCalledTimes(1);

    await flushDraft(ctxKey(A), { skipBackoff: true }); // "online" event
    expect(post).toHaveBeenCalledTimes(2);
    expect(await draftAll()).toHaveLength(0);
  });

  it("a 401 or sign-out keeps the draft untouched and sends nothing more", async () => {
    post.mockRejectedValue(new ApiError(401, "unauthorized", "x"));
    await draftEdit(A, [edit("a1", "present")]);
    await flushDraft(ctxKey(A));
    expect((await draftGet(ctxKey(A)))!.rows.a1.status).toBe("present");

    post.mockReset();
    syncPaused.value = true;
    await flushAllDrafts();
    expect(post).not.toHaveBeenCalled();
  });

  it("a storage failure on tap throws, so the page can undo instead of pretending it saved", async () => {
    const orig = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...a: Parameters<typeof orig>) {
      if (this.name === "attDrafts") throw new DOMException("full", "QuotaExceededError");
      return orig.apply(this, a);
    });
    try {
      await expect(draftEdit(A, [edit("a1", "present")])).rejects.toBeTruthy();
    } finally {
      spy.mockRestore();
    }
    expect(await draftAll()).toHaveLength(0);
  });
});

describe("the screen shows what the SERVER holds (B03)", () => {
  beforeEach(async () => {
    post.mockReset();
    stopAttSync();
    syncPaused.value = false;
    authRequired.value = false;
    await wipe();
  });
  const events = () => { const seen: any[] = []; const off = onAttEvent((e) => seen.push(e)); return { seen, off }; };

  it("a retry of an edit that already landed, when another device changed the student since: adopts the server's status, clears the tap, and says it was overridden", async () => {
    // this device sent 'present' (reply lost); another device made it 'absent'; the retry is answered "already applied"
    post.mockResolvedValue({ ok: true, changed: 0, updatedAt: 30, rows: { a1: 20 }, state: { a1: { status: "absent", updatedAt: 20 } } });
    const { seen, off } = events();
    await draftEdit(A, [edit("a1", "present")]);
    await flushDraft(ctxKey(A));
    off();

    const saved = seen.find((e) => e.type === "saved");
    expect(saved.acked.a1).toBe("absent");            // NOT 'present'
    expect(saved.changedByOthers).toEqual(["a1"]);
    expect(saved.versions.a1).toBe(20);
    expect(await draftAll()).toHaveLength(0);          // the op was applied server-side: nothing left to send
  });

  it("when the server agrees, nobody is told anything changed", async () => {
    post.mockResolvedValue({ ok: true, changed: 1, updatedAt: 31, rows: { a1: 31 }, state: { a1: { status: "late", updatedAt: 31 } } });
    const { seen, off } = events();
    await draftEdit(A, [edit("a1", "late")]);
    await flushDraft(ctxKey(A));
    off();
    const saved = seen.find((e) => e.type === "saved");
    expect(saved.acked.a1).toBe("late");
    expect(saved.changedByOthers).toEqual([]);
  });

  it("a row the server did NOT vouch for stays in the draft (never dropped on a maybe) and is retried", async () => {
    post.mockResolvedValueOnce({ ok: true, changed: 1, updatedAt: 40, rows: { a1: 40 }, state: { a1: { status: "present", updatedAt: 40 } } }); // says nothing about a2
    post.mockResolvedValue({ ok: true, changed: 1, updatedAt: 41, rows: { a1: 40, a2: 41 }, state: { a1: { status: "present", updatedAt: 40 }, a2: { status: "late", updatedAt: 41 } } });
    const { seen, off } = events();
    await draftEdit(A, [edit("a1", "present"), edit("a2", "late")]);
    await flushDraft(ctxKey(A));

    const first = seen.find((e) => e.type === "saved");
    expect(Object.keys(first.acked)).toEqual(["a1"]);  // only what was confirmed
    const d = await draftGet(ctxKey(A));
    expect(Object.keys(d!.rows)).toEqual(["a2"]);      // the unconfirmed tap is still here

    await flushDraft(ctxKey(A), { manual: true });      // and goes out again
    off();
    expect(await draftAll()).toHaveLength(0);
  });
});
