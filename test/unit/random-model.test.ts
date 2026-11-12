import { describe, it, expect } from "vitest";
import { roundCounts, groupPlan, optionSummary } from "@client/components/random/model";

// BR-24 / BR-26 figures of the random-name page, from the one place that computes them (T-44).
const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "s" + (i + 1) }));

describe("roundCounts (BR-24)", () => {
  it("drawn n = N - m, not the length of the history (people outside the pool are not counted)", () => {
    // pool of 41; history holds 20 ids, 3 of them outside the pool (absent today, drawn while the whole room was the base)
    const pool = kids(41);
    const called = new Set([...pool.slice(0, 17).map((p) => p.id), "x1", "x2", "x3"]);
    const c = roundCounts(pool, called, true);
    expect(c).toMatchObject({ N: 41, m: 24, n: 17, full: false, pct: 41 }); // 1700 / 41 = 41.46 -> 41
  });
  it("full only when everybody in the pool is drawn and no-repeat is on", () => {
    const pool = kids(3), all = new Set(pool.map((p) => p.id));
    expect(roundCounts(pool, all, true).full).toBe(true);
    expect(roundCounts(pool, all, false).full).toBe(false);
    expect(roundCounts([], new Set(), true).full).toBe(false);
    expect(roundCounts([], new Set(), true).pct).toBeNull();
  });
});

describe("groupPlan (BR-26)", () => {
  it("how many groups = min(N, setting); group size = round(N / k)", () => {
    expect(groupPlan(41, 6, true)).toEqual({ k: 6, size: 7 });
    expect(groupPlan(3, 8, true)).toEqual({ k: 3, size: 1 });
  });
  it("group size mode: k = round(N / size), at least 1", () => {
    expect(groupPlan(41, 4, false)).toEqual({ k: 10, size: 4 });
    expect(groupPlan(7, 4, false)).toEqual({ k: 2, size: 4 });
    expect(groupPlan(1, 4, false).k).toBe(1);
  });
});

describe("optionSummary", () => {
  it("names only what is on", () => {
    expect(optionSummary({ want: 3, pair: false, noRepeat: true, timer: 30, range: null })).toBe("สุ่ม 3 คน · ไม่ซ้ำจนครบ · จับเวลา 30 วิ");
    expect(optionSummary({ want: 1, pair: true, noRepeat: false, timer: null, range: [1, 20] })).toBe("จับคู่ 2 คน · ซ้ำได้ · ช่วงเลขที่ 1–20");
  });
});
