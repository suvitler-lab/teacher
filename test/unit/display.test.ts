import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clampFont, defaultFont, parseFont, parseDensity, rowHeightPx, applyDisplay, applyStoredDisplay,
  setFontSize, resetFontSize, setDensity, getFontSize, getDensity, FONT_MIN, FONT_MAX,
} from "../../src/lib/display";

function coarse(on: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("coarse"), media: q }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-density");
  coarse(false);
});

describe("font size", () => {
  it("clamps to 14-24 and rounds to whole px", () => {
    expect(clampFont(10)).toBe(FONT_MIN);
    expect(clampFont(99)).toBe(FONT_MAX);
    expect(clampFont(17.6)).toBe(18);
    expect(clampFont(NaN)).toBe(16);
  });
  it("defaults to 18 on touch and 16 on desktop", () => {
    expect(defaultFont(true)).toBe(18);
    expect(defaultFont(false)).toBe(16);
    coarse(true);
    expect(getFontSize()).toBe(18);
    coarse(false);
    expect(getFontSize()).toBe(16);
  });
  it("falls back to the default on broken stored values", () => {
    for (const bad of ["abc", "13", "25", "-5", "", "18px", "1e1", "NaN", "18.5"]) expect(parseFont(bad, false)).toBe(16);
    expect(parseFont(null, true)).toBe(18);
    expect(parseFont("20", false)).toBe(20);
    localStorage.setItem("ngankrob-font-size", "999");
    expect(getFontSize()).toBe(16);
  });
  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });
    expect(getFontSize()).toBe(16);
    expect(setFontSize(20)).toBe(20);
    expect(document.documentElement.style.fontSize).toBe("20px");
    expect(() => resetFontSize()).not.toThrow();
  });
});

describe("density", () => {
  it("parses only the three known values", () => {
    expect(parseDensity("compact")).toBe("compact");
    expect(parseDensity("roomy")).toBe("roomy");
    expect(parseDensity("airy")).toBe("normal");
    expect(parseDensity(null)).toBe("normal");
  });
  it("row height is 2.6/3.2/3.9 x size, at least 44 on touch only", () => {
    expect(rowHeightPx(18, "compact", true)).toBe(47);
    expect(rowHeightPx(18, "normal", true)).toBe(58);
    expect(rowHeightPx(18, "roomy", true)).toBe(70);
    expect(rowHeightPx(14, "compact", true)).toBe(44);
    expect(rowHeightPx(14, "compact", false)).toBe(36);
  });
});

describe("apply", () => {
  it("sets html font-size, --fs, --row-k and data-density", () => {
    applyDisplay(20, "roomy");
    const root = document.documentElement;
    expect(root.style.fontSize).toBe("20px");
    expect(root.style.getPropertyValue("--fs")).toBe("20px");
    expect(root.style.getPropertyValue("--row-k")).toBe("3.9");
    expect(root.getAttribute("data-density")).toBe("roomy");
  });
  it("setFontSize / setDensity / reset save and apply at once", () => {
    expect(setFontSize(30)).toBe(24);
    expect(localStorage.getItem("ngankrob-font-size")).toBe("24");
    expect(setDensity("compact")).toBe("compact");
    expect(getDensity()).toBe("compact");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(resetFontSize()).toBe(16);
    expect(document.documentElement.style.fontSize).toBe("16px");
    expect(localStorage.getItem("ngankrob-font-size")).toBeNull();
  });
  it("applyStoredDisplay uses what is stored, else the touch default", () => {
    coarse(true);
    applyStoredDisplay();
    expect(document.documentElement.style.fontSize).toBe("18px");
    localStorage.setItem("ngankrob-font-size", "22");
    localStorage.setItem("ngankrob-density", "compact");
    applyStoredDisplay();
    expect(document.documentElement.style.fontSize).toBe("22px");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });
});
