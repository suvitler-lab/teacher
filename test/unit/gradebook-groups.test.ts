// gb-1a: column grouping helpers — grouping, default folding, per-device memory (also when storage is broken).
import { describe, it, expect } from "vitest";
import {
  buildGroups, isCollapsed, loadGroupMode, saveGroupMode, GROUP_STORAGE_KEY, DEFAULT_GROUP_MODE,
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

describe("isCollapsed", () => {
  it("nothing is folded unless the teacher folded it (no automatic folding by age)", () => {
    expect(isCollapsed("w", new Map())).toBe(false);
    expect(isCollapsed("w", new Map([["w", true]]))).toBe(true);
    expect(isCollapsed("w", new Map([["w", false]]))).toBe(false);
  });
});

describe("gb-2 defaults", () => {
  it("a choice saved under the new key is kept; a value under the gb-1a key never counts", () => {
    const m = new Map<string, string>([["ngankrob.gb.groupMode", "month"]]);
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadGroupMode(st)).toBe("none");
    saveGroupMode("type", st);
    expect(loadGroupMode(st)).toBe("type");
  });
  it("the plain table is the default mode and the key is the v2 one", () => {
    expect(DEFAULT_GROUP_MODE).toBe("none");
    expect(GROUP_STORAGE_KEY).toBe("ngankrob.gb.groupMode.v2");
  });
  it("only a group the teacher folded is folded", () => {
    expect(isCollapsed("a", new Map([["b", true]]))).toBe(false);
  });
});

describe("group mode memory (per device)", () => {
  const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("defaults to the plain table (no groups), then remembers the choice", () => {
    const s = mem();
    expect(loadGroupMode(s)).toBe("none");
    s.m.set("ngankrob.gb.groupMode", "type");           // the value gb-1a saved on its own: ignored, not a real choice
    expect(loadGroupMode(s)).toBe("none");
    saveGroupMode("month", s);
    expect(s.m.get(GROUP_STORAGE_KEY)).toBe("month");
    expect(loadGroupMode(s)).toBe("month");
    saveGroupMode("none", s);
    expect(loadGroupMode(s)).toBe("none");
  });
  it("junk in storage -> default", () => {
    const s = mem(); s.m.set(GROUP_STORAGE_KEY, "{not json");
    expect(loadGroupMode(s)).toBe("none");
    s.m.set(GROUP_STORAGE_KEY, "weekly");
    expect(loadGroupMode(s)).toBe("none");
  });
  it("storage that throws (blocked / full) never breaks loading or saving", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(loadGroupMode(bad)).toBe("none");
    expect(() => saveGroupMode("none", bad)).not.toThrow();
    expect(loadGroupMode(null)).toBe("none");
  });
});
