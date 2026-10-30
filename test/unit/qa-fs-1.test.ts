import { describe, it, expect } from "vitest";
import { parseFont, parseDensity, rowHeightPx } from "../../src/lib/display";

describe("qa fs-1 corrupt stored values", () => {
  for (const bad of ["abc", "99", "-1", "", "13", "25", "18.5", "NaN", null, undefined]) {
    it(`font ${JSON.stringify(bad)} -> default`, () => {
      expect(parseFont(bad as any, true)).toBe(18);
      expect(parseFont(bad as any, false)).toBe(16);
    });
  }
  it("valid values kept", () => { expect(parseFont("14", true)).toBe(14); expect(parseFont("24", false)).toBe(24); });
  it("bad density -> normal", () => { expect(parseDensity("zzz")).toBe("normal"); expect(parseDensity("")).toBe("normal"); });
  it("row height 18px: 47/58/70, floor 44 on touch", () => {
    expect(rowHeightPx(18, "compact", true)).toBe(47);
    expect(rowHeightPx(18, "normal", true)).toBe(58);
    expect(rowHeightPx(18, "roomy", true)).toBe(70);
    expect(rowHeightPx(14, "compact", true)).toBe(44);
  });
});
