import { describe, it, expect } from "vitest";
import {
  HOME_CARD_KEYS, defaultHomeCards, parseHomeCards, serializeHomeCards, toggleCard, moveCard, visibleOrder, isHidden,
} from "../../src/lib/homeCards";

describe("home card layout (settings.home_cards)", () => {
  it("an empty or missing value is the default layout: 5 cards on, 4 off, in the designed order", () => {
    for (const raw of [undefined, null, "", "   "]) {
      const p = parseHomeCards(raw);
      expect(p).toEqual(defaultHomeCards());
    }
    const d = defaultHomeCards();
    expect([...d.order]).toEqual([...HOME_CARD_KEYS]);
    expect(visibleOrder(d)).toEqual(["open", "att", "follow", "due", "absent"]);
    expect(d.hidden.sort()).toEqual(["backup", "classes", "queue", "term"]);
  });

  it("junk (not JSON, wrong shape, wrong version) falls back to the default instead of throwing", () => {
    for (const raw of ["{", "null", "[]", "123", '"x"', '{"v":2,"order":["open"],"hidden":[]}', '{"v":1,"order":"open","hidden":5}']) {
      expect(parseHomeCards(raw)).toEqual(defaultHomeCards());
    }
  });

  it("round-trips a saved layout", () => {
    const p = toggleCard(moveCard(defaultHomeCards(), "follow", -1), "classes");
    expect(parseHomeCards(serializeHomeCards(p))).toEqual(p);
  });

  it("drops unknown keys and duplicates, and appends cards that did not exist when it was saved (hidden if off by default)", () => {
    const raw = JSON.stringify({ v: 1, order: ["att", "bogus", "open", "att"], hidden: ["att", "bogus", "att"] });
    const p = parseHomeCards(raw);
    expect(p.order.slice(0, 2)).toEqual(["att", "open"]);
    expect(new Set(p.order).size).toBe(HOME_CARD_KEYS.length);       // every card exactly once
    expect(p.order).not.toContain("bogus" as never);
    expect(p.hidden.filter((k) => k === "att")).toHaveLength(1);
    expect(isHidden(p, "att")).toBe(true);
    expect(isHidden(p, "term")).toBe(true);                           // appended + off by default
    expect(isHidden(p, "due")).toBe(false);                           // appended + on by default
  });

  it("toggle flips visibility without touching the order, and is its own inverse", () => {
    const d = defaultHomeCards();
    const off = toggleCard(d, "open");
    expect(isHidden(off, "open")).toBe(true);
    expect(off.order).toEqual(d.order);
    expect(toggleCard(off, "open")).toEqual(d);
    expect(d.hidden).not.toContain("open");                           // the input is not mutated
  });

  it("move swaps with the neighbour and stops at both ends", () => {
    const d = defaultHomeCards();
    expect(moveCard(d, "att", -1).order.slice(0, 2)).toEqual(["att", "open"]);
    expect(moveCard(d, "open", -1)).toEqual(d);
    const last = d.order[d.order.length - 1];
    expect(moveCard(d, last, 1)).toEqual(d);
    expect(moveCard(d, "att", 1).order.slice(0, 3)).toEqual(["open", "follow", "att"]);
  });

  it("visibleOrder follows the saved order and skips hidden cards", () => {
    let p = defaultHomeCards();
    for (let i = 0; i < 3; i++) p = moveCard(p, "absent", -1);      // absent: 5th -> 2nd
    p = toggleCard(p, "att");
    expect(visibleOrder(p)).toEqual(["open", "absent", "follow", "due"]);
  });
});
