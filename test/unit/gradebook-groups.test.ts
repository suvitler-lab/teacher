// gb-1a: column grouping helpers — grouping, default folding, per-device memory (also when storage is broken).
import { describe, it, expect } from "vitest";
import {
  buildGroups, defaultCollapsed, oneMonthBefore, isCollapsed, loadGroupMode, saveGroupMode, GROUP_STORAGE_KEY,
} from "../../src/lib/gbGroups";

const A = (id: string, type_id: string | null, assigned_date: string) => ({ id, type_id, assigned_date });
const typeInfo = (id: string | null) => id === "w" ? { name: "ใบงาน", color: "violet" } : id === "e" ? { name: "แบบฝึกหัด", color: "aqua" } : { name: "ไม่ระบุประเภท", color: "violet" };
const monthLabel = (ym: string) => "m" + ym;
const list = [A("1", "w", "2026-08-10"), A("2", "e", "2026-10-02"), A("3", "w", "2026-10-20"), A("4", null, "2026-10-21")];

describe("buildGroups", () => {
  it("none: one flat group with everything in order", () => {
    const g = buildGroups(list, "none", typeInfo, monthLabel);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((a) => a.id)).toEqual(["1", "2", "3", "4"]);
  });
  it("by type: first appearance order, work keeps its order, no type gets its own group", () => {
    const g = buildGroups(list, "type", typeInfo, monthLabel);
    expect(g.map((x) => [x.key, x.label, x.items.map((a) => a.id)])).toEqual([
      ["w", "ใบงาน", ["1", "3"]], ["e", "แบบฝึกหัด", ["2"]], ["", "ไม่ระบุประเภท", ["4"]],
    ]);
  });
  it("by month: YYYY-MM keys", () => {
    const g = buildGroups(list, "month", typeInfo, monthLabel);
    expect(g.map((x) => [x.key, x.label, x.items.length])).toEqual([["2026-08", "m2026-08", 1], ["2026-10", "m2026-10", 3]]);
  });
  it("no work -> no groups", () => { expect(buildGroups([], "type", typeInfo, monthLabel)).toEqual([]); });
});

describe("oneMonthBefore", () => {
  it("steps back a month, clamps the day, crosses the year", () => {
    expect(oneMonthBefore("2026-10-30")).toBe("2026-09-30");
    expect(oneMonthBefore("2026-03-31")).toBe("2026-02-28");
    expect(oneMonthBefore("2024-03-31")).toBe("2024-02-29");
    expect(oneMonthBefore("2026-01-15")).toBe("2025-12-15");
  });
});

describe("defaultCollapsed", () => {
  const g = (items: ReturnType<typeof A>[]) => buildGroups(items, "type", typeInfo, monthLabel);
  it("folds a group whose every work is older than one month, keeps one with any recent work", () => {
    const groups = g(list);
    // today 2026-10-30: cutoff 2026-09-30. w has 2026-10-20 (recent) -> open; e 10-02 -> open; none -> open
    expect([...defaultCollapsed(groups, "2026-10-30")]).toEqual([]);
    const old = g([A("1", "w", "2026-08-10"), A("2", "w", "2026-08-12"), A("3", "e", "2026-10-02")]);
    expect([...defaultCollapsed(old, "2026-10-30")]).toEqual(["w"]);
  });
  it("exactly one month old is not older: it stays open", () => {
    const groups = g([A("1", "w", "2026-09-30"), A("2", "e", "2026-10-30")]);
    expect([...defaultCollapsed(groups, "2026-10-30")]).toEqual([]);
  });
  it("never folds everything: when all are old the newest group stays open", () => {
    const groups = g([A("1", "w", "2026-05-01"), A("2", "e", "2026-06-01")]);
    expect([...defaultCollapsed(groups, "2026-10-30")]).toEqual(["w"]);
  });
  it("a single group is never folded", () => {
    expect([...defaultCollapsed(g([A("1", "w", "2025-01-01")]), "2026-10-30")]).toEqual([]);
  });
  it("the teacher's tap wins over the default, both ways", () => {
    const d = new Set(["w"]);
    expect(isCollapsed("w", d, new Map())).toBe(true);
    expect(isCollapsed("w", d, new Map([["w", false]]))).toBe(false);
    expect(isCollapsed("e", d, new Map([["e", true]]))).toBe(true);
  });
});

describe("group mode memory (per device)", () => {
  const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("defaults to by-type, then remembers the choice", () => {
    const s = mem();
    expect(loadGroupMode(s)).toBe("type");
    saveGroupMode("month", s);
    expect(s.m.get(GROUP_STORAGE_KEY)).toBe("month");
    expect(loadGroupMode(s)).toBe("month");
    saveGroupMode("none", s);
    expect(loadGroupMode(s)).toBe("none");
  });
  it("junk in storage -> default", () => {
    const s = mem(); s.m.set(GROUP_STORAGE_KEY, "{not json");
    expect(loadGroupMode(s)).toBe("type");
    s.m.set(GROUP_STORAGE_KEY, "weekly");
    expect(loadGroupMode(s)).toBe("type");
  });
  it("storage that throws (blocked / full) never breaks loading or saving", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(loadGroupMode(bad)).toBe("type");
    expect(() => saveGroupMode("none", bad)).not.toThrow();
    expect(loadGroupMode(null)).toBe("type");
  });
});
