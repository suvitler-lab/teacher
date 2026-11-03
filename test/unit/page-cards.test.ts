import { describe, it, expect } from "vitest";
import { PAGE_DEFS, defaultPageLayout } from "../../src/lib/pageCards";
import { parseLayout, serializeLayout, toggleLayoutCard, moveLayoutCard, visibleCards } from "../../src/lib/cardLayout";
import { defaultHomeCards, parseHomeCards } from "../../src/lib/homeCards";

describe("page card layouts (scan, attendance, random)", () => {
  it("defaults: scan shows 2 of 3, attendance 3 of 5, random 2 of 7", () => {
    expect(visibleCards(defaultPageLayout("scan"))).toEqual(["recent", "hid"]);
    expect(visibleCards(defaultPageLayout("attendance"))).toEqual(["sum", "week", "scans"]);
    expect(visibleCards(defaultPageLayout("random"))).toEqual(["hist", "opts"]);
  });
  it("empty, broken or other-version text gives the default", () => {
    for (const raw of ["", "  ", "nope", "[]", '{"v":2,"order":[],"hidden":[]}', null, undefined]) {
      expect(parseLayout(PAGE_DEFS.scan, raw as never)).toEqual(defaultPageLayout("scan"));
    }
  });
  it("drops unknown keys and repeats, and adds a card the saved text did not know about", () => {
    const p = parseLayout(PAGE_DEFS.attendance, JSON.stringify({ v: 1, order: ["week", "x", "week", "sum"], hidden: ["x", "sum"] }));
    expect(p.order).toEqual(["week", "sum", "scans", "todo", "away"]);
    expect(p.hidden.sort()).toEqual(["away", "sum", "todo"]);   // new cards that start off stay off
  });
  it("toggle and move round-trip through serialize", () => {
    let p = defaultPageLayout("random");
    p = toggleLayoutCard(p, "timer"); p = moveLayoutCard(p, "opts", -1);
    const back = parseLayout(PAGE_DEFS.random, serializeLayout(p));
    expect(back).toEqual(p);
    expect(visibleCards(back)).toEqual(["opts", "hist", "timer"]);
    expect(moveLayoutCard(p, "opts", -1).order[0]).toBe("opts");  // already first: nothing changes
  });
  it("the home page's own helpers still behave the same", () => {
    expect(parseHomeCards("")).toEqual(defaultHomeCards());
  });
});
