import { describe, expect, it } from "vitest";
import { colsFor, splitColumns } from "../../src/lib/pageColumns";

describe("colsFor", () => {
  it("fits columns to the region, never more than max or the card count", () => {
    expect(colsFor(37.6, 3, 5)).toBe(1);
    expect(colsFor(57.1, 3, 5)).toBe(2);
    expect(colsFor(87, 3, 5)).toBe(3);
    expect(colsFor(96, 3, 2)).toBe(2);
    expect(colsFor(20, 3, 5, 20)).toBe(1);
    expect(colsFor(0, 3, 5)).toBe(1);
  });
});
describe("splitColumns", () => {
  const w = (k: string) => ({ a: 4, b: 1, c: 2, d: 2, e: 1 } as Record<string, number>)[k];
  it("puts the first n cards in columns 0..n-1 and the next on the lightest column", () => {
    expect(splitColumns(["a", "b", "c", "d"], 2, w)).toEqual([["a"], ["b", "c", "d"]]);
  });
  it("never moves earlier cards when later ones are added", () => {
    const short = splitColumns(["a", "b", "c"], 2, w), long = splitColumns(["a", "b", "c", "d", "e"], 2, w);
    expect(long[0].slice(0, short[0].length)).toEqual(short[0]);
    expect(long[1].slice(0, short[1].length)).toEqual(short[1]);
  });
  it("hidden cards are absent; no cards gives empty columns; one column keeps order", () => {
    expect(splitColumns([], 2, w)).toEqual([[], []]);
    expect(splitColumns(["b", "a"], 1, w)).toEqual([["b", "a"]]);
  });
  it("swapping two cards changes only their columns", () => {
    expect(splitColumns(["a", "b", "c"], 2, w)).toEqual([["a"], ["b", "c"]]);
    expect(splitColumns(["b", "a", "c"], 2, w)).toEqual([["b", "c"], ["a"]]);
  });
});
