// gb-1b: the pure parts of the minimap, jump buttons and the "คอลัมน์" choices.
import { describe, expect, it } from "vitest";
import {
  COLUMNS_STORAGE_KEY, DEFAULT_COLUMN_PREFS, loadColumnPrefs, saveColumnPrefs, effectiveHidden, makeIsShown, toggleType,
  columnCounts, displayGroups, jumpTargets, jumpScrollLeft, minimapWindow, minimapScrollFor, edgeState, fitsAll, minimapSegments,
  type ScrollInfo,
} from "@client/lib/gbColumns";

const a = (id: string, type_id: string | null) => ({ id, title: id, type_id });
const list = [a("w1", "w"), a("w2", "w"), a("e1", "e"), a("q1", "q"), a("n1", null)];
const mem = (v: string | null) => ({ getItem: () => v, setItem: () => {} });

describe("column choices memory", () => {
  it("nothing saved / junk / wrong shape → show everything", () => {
    for (const raw of [null, "", "{", "[]", "null", '{"hiddenTypes":"w","showTotal":true,"showBars":true}', '{"hiddenTypes":[1],"showTotal":true,"showBars":true}', '{"hiddenTypes":[],"showTotal":"yes","showBars":true}']) {
      expect(loadColumnPrefs(mem(raw))).toEqual(DEFAULT_COLUMN_PREFS);
    }
  });
  it("a storage that throws never throws", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(loadColumnPrefs(bad)).toEqual(DEFAULT_COLUMN_PREFS);
    expect(() => saveColumnPrefs(DEFAULT_COLUMN_PREFS, bad)).not.toThrow();
    expect(loadColumnPrefs(null)).toEqual(DEFAULT_COLUMN_PREFS);
  });
  it("round-trips a good value", () => {
    const store: Record<string, string> = {};
    const s = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    saveColumnPrefs({ hiddenTypes: ["w", "e"], showTotal: false, showBars: true }, s);
    expect(store[COLUMNS_STORAGE_KEY]).toBeTruthy();
    expect(loadColumnPrefs(s)).toEqual({ hiddenTypes: ["w", "e"], showTotal: false, showBars: true });
  });
});

describe("hiding columns is display-only", () => {
  const keys = ["w", "e", "q", ""];
  it("hidden types disappear from the drawn list but the full list is untouched", () => {
    const hidden = effectiveHidden({ ...DEFAULT_COLUMN_PREFS, hiddenTypes: ["w"] }, keys);
    const shown = makeIsShown<typeof list[number]>(hidden);
    expect(list.filter(shown).map((x) => x.id)).toEqual(["e1", "q1", "n1"]);
    expect(columnCounts(list, shown)).toEqual({ shown: 3, total: 5 });
    expect(list.length).toBe(5);
  });
  it("displayGroups keeps the FULL group (what totals are computed from) next to the part that is drawn", () => {
    const groups = [{ key: "w", items: [list[0], list[1]] }, { key: "e", items: [list[2]] }];
    const shown = makeIsShown<typeof list[number]>(new Set(["e"]));
    const dg = displayGroups(groups, shown);
    expect(dg.length).toBe(1);
    expect(dg[0].group.items.length).toBe(2);   // full group, not filtered
    expect(dg[0].shown.map((x) => x.id)).toEqual(["w1", "w2"]);
    const part = displayGroups([{ key: "m", items: list.slice(0, 3) }], makeIsShown(new Set(["w"])));
    expect(part[0].group.items.length).toBe(3); // a month group with some hidden: totals still see all three
    expect(part[0].shown.length).toBe(1);
  });
  it("stale keys are ignored and hiding every type present hides nothing", () => {
    expect([...effectiveHidden({ ...DEFAULT_COLUMN_PREFS, hiddenTypes: ["gone"] }, keys)]).toEqual([]);
    expect(effectiveHidden({ ...DEFAULT_COLUMN_PREFS, hiddenTypes: keys }, keys).size).toBe(0);
  });
  it("toggleType hides and shows, but never the last type showing", () => {
    let p = toggleType(DEFAULT_COLUMN_PREFS, "w", ["w", "e"]);
    expect(p.hiddenTypes).toEqual(["w"]);
    expect(toggleType(p, "e", ["w", "e"])).toBe(p);          // last one: refused
    p = toggleType(p, "w", ["w", "e"]);
    expect(p.hiddenTypes).toEqual([]);
  });
});

describe("jump buttons", () => {
  it("one per type that has a drawn column, first column of each, in order; none for types with no work or hidden", () => {
    const all = jumpTargets(list, () => true);
    expect(all.map((j) => [j.typeKey, j.firstId, j.count])).toEqual([["w", "w1", 2], ["e", "e1", 1], ["q", "q1", 1], ["", "n1", 1]]);
    const some = jumpTargets(list, makeIsShown(new Set(["w"])));
    expect(some.map((j) => j.typeKey)).toEqual(["e", "q", ""]);
    expect(jumpTargets([], () => true)).toEqual([]);
    expect(jumpTargets(list.filter((x) => x.type_id !== "q"), () => true).some((j) => j.typeKey === "q")).toBe(false);
  });
  it("jumpScrollLeft puts the column right after the locked name, clamped to the scrollable range", () => {
    expect(jumpScrollLeft(1000, 200, 3000, 1000)).toBe(800);
    expect(jumpScrollLeft(100, 200, 3000, 1000)).toBe(0);
    expect(jumpScrollLeft(2900, 200, 3000, 1000)).toBe(2000);
    expect(jumpScrollLeft(500, 200, 800, 1000)).toBe(0);     // nothing to scroll
  });
});

describe("minimap position", () => {
  // name 200 + 10 columns of 100 + total 100 = 1300 wide, frame 700 wide → sliding span 1000, view 400
  const s = (scrollLeft: number): ScrollInfo => ({ scrollLeft, clientWidth: 700, scrollWidth: 1300, nameW: 200, totW: 100 });
  it("the frame follows the scroll and stays inside the track", () => {
    expect(minimapWindow(s(0))).toEqual({ left: 0, width: 0.4 });
    expect(minimapWindow(s(300))).toEqual({ left: 0.3, width: 0.4 });
    const end = minimapWindow(s(600));
    expect(end.left).toBeCloseTo(0.6, 10);
    expect(end.left + end.width).toBeCloseTo(1, 10);
  });
  it("a tap centres the frame on the pointer; the ends clamp", () => {
    expect(minimapScrollFor(0.5, s(0))).toBe(300);     // 0.5*1000 - 400/2
    expect(minimapScrollFor(0, s(0))).toBe(0);
    expect(minimapScrollFor(1, s(0))).toBe(600);       // max = 1300 - 700
    expect(minimapScrollFor(-3, s(0))).toBe(0);
    expect(minimapScrollFor(NaN, s(0))).toBe(0);
  });
  it("tapping where the frame is, and reading the frame back, agree", () => {
    for (const x of [0, 120, 333, 600]) {
      const w = minimapWindow(s(x));
      expect(minimapScrollFor(w.left + w.width / 2, s(0))).toBe(x);
    }
  });
  it("no total column: the frame is wider and still reaches both ends", () => {
    const n: ScrollInfo = { scrollLeft: 0, clientWidth: 700, scrollWidth: 1200, nameW: 200, totW: 0 };
    expect(minimapWindow(n).width).toBeCloseTo(0.5, 10);
    expect(minimapScrollFor(1, n)).toBe(500);
  });
  it("hidden when every column fits; edge shadows only where there is more", () => {
    expect(fitsAll({ clientWidth: 1000, scrollWidth: 1000 })).toBe(true);
    expect(fitsAll({ clientWidth: 1000, scrollWidth: 1001 })).toBe(true);   // sub-pixel rounding
    expect(fitsAll({ clientWidth: 1000, scrollWidth: 1400 })).toBe(false);
    expect(edgeState(s(0))).toEqual({ left: false, right: true });
    expect(edgeState(s(300))).toEqual({ left: true, right: true });
    expect(edgeState(s(600))).toEqual({ left: true, right: false });
    expect(edgeState({ ...s(0), scrollWidth: 700 })).toEqual({ left: false, right: false });
  });
  it("a tiny or empty frame never divides by zero", () => {
    const z: ScrollInfo = { scrollLeft: 0, clientWidth: 0, scrollWidth: 0, nameW: 0, totW: 0 };
    const w = minimapWindow(z);
    expect(Number.isFinite(w.left) && Number.isFinite(w.width)).toBe(true);
    expect(minimapScrollFor(0.5, z)).toBe(0);
  });
});

describe("minimap stripes", () => {
  it("one per drawn column, a folded group as one stripe, hidden columns absent", () => {
    const groups = [
      { group: { key: "w", label: "ใบงาน", color: "violet", items: [list[0], list[1]] }, shown: [list[0], list[1]] },
      { group: { key: "e", label: "แบบฝึกหัด", color: "aqua", items: [list[2]] }, shown: [list[2]] },
    ];
    const segs = minimapSegments(groups, (g) => g.key === "w", (x) => (x.type_id === "e" ? "aqua" : "violet"));
    expect(segs.map((x) => [x.key, x.color])).toEqual([["g:w", "violet"], ["e1", "aqua"]]);
    const open = minimapSegments(groups, () => false, (x) => (x.type_id === "e" ? "aqua" : "violet"));
    expect(open.length).toBe(3);
  });
});
