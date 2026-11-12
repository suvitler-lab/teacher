import { describe, it, expect } from "vitest";
import { PAGE_DEFS, defaultPageLayout } from "../../src/lib/pageCards";
import { parseLayout, serializeLayout, toggleLayoutCard, moveLayoutCard, visibleCards } from "../../src/lib/cardLayout";
import { defaultHomeCards, parseHomeCards } from "../../src/lib/homeCards";

describe("page card layouts (scan, attendance, random)", () => {
  it("defaults: scan shows 3 of 4 (T-38 adds 'unsent', on), attendance 6 of 6 (T-43: month added, todo and away on from the start), random 3 of 8 (T-45: left added, on)", () => {
    expect(visibleCards(defaultPageLayout("scan"))).toEqual(["recent", "unsent", "hid"]);
    expect(visibleCards(defaultPageLayout("attendance"))).toEqual(["sum", "week", "month", "scans", "todo", "away"]);
    expect(visibleCards(defaultPageLayout("random"))).toEqual(["hist", "left", "opts"]);
  });
  it("empty, broken or other-version text gives the default", () => {
    for (const raw of ["", "  ", "nope", "[]", '{"v":2,"order":[],"hidden":[]}', null, undefined]) {
      expect(parseLayout(PAGE_DEFS.scan, raw as never)).toEqual(defaultPageLayout("scan"));
    }
  });
  it("drops unknown keys and repeats, and adds a card the saved text did not know about", () => {
    const p = parseLayout(PAGE_DEFS.attendance, JSON.stringify({ v: 1, order: ["week", "x", "week", "sum"], hidden: ["x", "sum"] }));
    expect(p.order).toEqual(["week", "sum", "month", "scans", "todo", "away"]);
    expect(p.hidden.sort()).toEqual(["sum"]);   // new cards that start on appear
  });
  it("toggle and move round-trip through serialize", () => {
    let p = defaultPageLayout("random");
    p = toggleLayoutCard(p, "timer"); p = moveLayoutCard(moveLayoutCard(p, "opts", -1), "opts", -1);
    const back = parseLayout(PAGE_DEFS.random, serializeLayout(p));
    expect(back).toEqual(p);
    expect(visibleCards(back)).toEqual(["opts", "hist", "left", "timer"]);
    expect(moveLayoutCard(p, "opts", -1).order[0]).toBe("opts");  // already first: nothing changes
  });
  it("the home page's own helpers still behave the same", () => {
    expect(parseHomeCards("")).toEqual(defaultHomeCards());
  });
});
