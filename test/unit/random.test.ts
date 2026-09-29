import { describe, it, expect } from "vitest";
import { pickNext, attendancePool, remainingInRound, shuffle } from "@client/lib/random";

const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "s" + (i + 1) }));
// deterministic "random"
function lcg(seed = 1) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

describe("pickNext (no repeat)", () => {
  it("never repeats anyone until everybody has been drawn", () => {
    const pool = kids(6);
    let called = new Set<string>();
    const seen: string[] = [];
    const rand = lcg(7);
    for (let i = 0; i < 6; i++) {
      const r = pickNext(pool, 1, called, true, rand);
      seen.push(r.picks[0].id);
      called = r.called;
    }
    expect(new Set(seen).size).toBe(6); // all six, once each
  });

  it("uses everyone left FIRST, then starts a new round for the remaining places", () => {
    const pool = kids(5);
    const called = new Set(["s1", "s2", "s3", "s4"]); // only s5 is left
    const r = pickNext(pool, 3, called, true, lcg(3));

    expect(r.picks).toHaveLength(3);
    expect(r.picks.map((p) => p.id)).toContain("s5");             // the one who was left is drawn
    expect(new Set(r.picks.map((p) => p.id)).size).toBe(3);        // nobody twice in one draw
    // the new round begins with the fill only, not with s5 (he closed the previous round)
    const fill = r.picks.map((p) => p.id).filter((id) => id !== "s5");
    expect([...r.called].sort()).toEqual(fill.sort());
    expect(r.called.has("s5")).toBe(false);
  });

  it("a finished round just starts a new one (nothing wasted)", () => {
    const pool = kids(3);
    const r = pickNext(pool, 1, new Set(["s1", "s2", "s3"]), true, lcg(2));
    expect(r.picks).toHaveLength(1);
    expect([...r.called]).toEqual([r.picks[0].id]);
  });

  it("asking for more than the pool has returns everyone once", () => {
    const r = pickNext(kids(2), 5, new Set(), true);
    expect(r.picks.map((p) => p.id).sort()).toEqual(["s1", "s2"]);
  });

  it("an empty pool draws nobody and leaves the history alone", () => {
    const called = new Set(["s1"]);
    const r = pickNext([], 2, called, true);
    expect(r.picks).toEqual([]);
    expect(r.called).toBe(called);
  });

  it("ids in the history that aren't in the pool (someone absent today) don't block the round", () => {
    const pool = kids(3);
    const r = pickNext(pool, 3, new Set(["gone-1", "gone-2"]), true);
    expect(r.picks).toHaveLength(3);
  });
});

describe("pickNext (repeats allowed)", () => {
  it("can draw anyone, and records them", () => {
    const r = pickNext(kids(4), 2, new Set(["s1"]), false, lcg(9));
    expect(r.picks).toHaveLength(2);
    expect(r.called.has("s1")).toBe(true);
    for (const p of r.picks) expect(r.called.has(p.id)).toBe(true);
  });
});

describe("attendancePool — 'only those who came'", () => {
  const all = kids(4);
  const present = (ids: string[], marked = 4) => ({ status: "ready" as const, marked, present: new Set(ids) });

  it("draws only from those marked present or late", () => {
    const r = attendancePool(all, present(["s1", "s3"]));
    expect(r.blocker).toBe("none");
    expect(r.pool.map((p) => p.id)).toEqual(["s1", "s3"]);
  });

  it("everyone absent: nobody can be drawn (it used to fall back to the whole class, absent kids included)", () => {
    const r = attendancePool(all, present([]));
    expect(r.blocker).toBe("nobody");
    expect(r.pool).toEqual([]);
  });

  it("attendance not taken yet: says so instead of drawing from the whole class", () => {
    const r = attendancePool(all, { status: "ready", marked: 0, present: new Set() });
    expect(r.blocker).toBe("unchecked");
    expect(r.pool).toEqual([]);
  });

  it("loading and failed loads are their own states", () => {
    expect(attendancePool(all, { status: "loading", marked: 0, present: new Set() }).blocker).toBe("loading");
    expect(attendancePool(all, { status: "error", marked: 0, present: new Set() }).blocker).toBe("error");
  });

  it("a partly checked class draws only from the marked-present kids", () => {
    const r = attendancePool(all, present(["s2"], 2));
    expect(r.pool.map((p) => p.id)).toEqual(["s2"]);
  });
});

describe("helpers", () => {
  it("remainingInRound counts who hasn't been drawn", () => {
    expect(remainingInRound(kids(5), new Set(["s1", "s2"]))).toBe(3);
  });
  it("shuffle keeps every element", () => {
    expect(shuffle([1, 2, 3, 4, 5], lcg(4)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
