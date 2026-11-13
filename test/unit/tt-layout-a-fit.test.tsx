// V-40..V-44 (final QA): layout ก keeps the whole 5-day week in its frame on 1536×729 at the 18px touch text size,
// marks a frame that still scrolls (taller or wider than the screen) with a focusable region + hint + soft edge,
// and the "ตอนนี้" word never takes the name's width (layout ข too).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/preact";
import { classes, currentTermId, subjects, terms } from "@client/store";
import { setClock } from "@client/lib/timetable/clock";
import { ttSeedBootstrap } from "@client/lib/timetable/state";
import { resetTimetableStoreForTests } from "@client/lib/timetable/store";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { LayoutA } from "@client/components/timetable/a";

const css = (f: string) => readFileSync(resolve(__dirname, "../../src/styles", f), "utf8");
const props = () => ({ termId: TERM_2_2569.id, slots: F_T1, frame: FRAME, readOnly: false, offline: false, onCell: vi.fn(), onDelete: vi.fn() });

/** Fake the frame's scroll box (jsdom has no layout). */
function box(el: HTMLElement, b: { sw: number; cw: number; sh: number; ch: number; top?: number; left?: number }) {
  Object.defineProperty(el, "scrollWidth", { configurable: true, get: () => b.sw });
  Object.defineProperty(el, "clientWidth", { configurable: true, get: () => b.cw });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => b.sh });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => b.ch });
  el.scrollTop = b.top ?? 0; el.scrollLeft = b.left ?? 0;
}

beforeEach(() => {
  resetTimetableStoreForTests();
  terms.value = [TERM_2_2569]; currentTermId.value = TERM_2_2569.id; classes.value = CLASSES; subjects.value = SUBJECTS;
  ttSeedBootstrap({ termId: TERM_2_2569.id, rev: 7, readOnly: false, slots: F_T1 }, { live: true, at: 0, epoch: 1 });
  setClock(Date.parse("2026-11-11T09:45:00+07:00"));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); setClock(null); vi.unstubAllGlobals(); });

describe("V-40 the week fits / a cut week is marked", () => {
  it("wide screens reserve only the header + summary (≤ 10rem), so 1536×729 at 18px leaves ≥ 540px for the frame", () => {
    const wide = css("timetable-a.css").split("@media (min-width: 1100px)").slice(1).join("");
    const m = /\.tta-frame \{ max-height: calc\(100dvh - ([\d.]+)rem\); \}/.exec(wide);
    expect(m).not.toBeNull();
    const reserve = Number(m![1]);
    expect(reserve).toBeLessThanOrEqual(10);
    // measured: 5 days × 7 periods + header with the now badge in the corner = 481px at 18px (was 498px with the badge on its own line)
    expect(729 - reserve * 18).toBeGreaterThanOrEqual(481);
  });

  it("a frame taller than the screen becomes a focusable region with a hint and a bottom edge; scrolled to the end the edge goes", () => {
    render(<LayoutA {...props()} />);
    const frame = document.querySelector(".tta-frame") as HTMLElement;
    const wrap = document.querySelector(".tta-wrap") as HTMLElement;
    expect(frame.getAttribute("tabindex")).toBeNull();
    box(frame, { sw: 1390, cw: 1390, sh: 498, ch: 457 });
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(frame.getAttribute("tabindex")).toBe("0");
    expect(frame.getAttribute("role")).toBe("region");
    expect(frame.getAttribute("aria-label")).toBe("ตารางสอน เลื่อนดูด้านล่างได้");
    expect(document.querySelector(".tta-hint")?.textContent).toContain("เลื่อนตารางลง");
    expect(wrap.hasAttribute("data-more-y")).toBe(true);
    expect(wrap.hasAttribute("data-more-x")).toBe(false);
    box(frame, { sw: 1390, cw: 1390, sh: 498, ch: 457, top: 41 });
    act(() => { frame.dispatchEvent(new Event("scroll")); });
    expect(wrap.hasAttribute("data-more-y")).toBe(false);
    expect(frame.getAttribute("tabindex")).toBe("0");
  });

  it("V-43 a wider week keeps the right-hand hint and edge", () => {
    render(<LayoutA {...props()} />);
    const frame = document.querySelector(".tta-frame") as HTMLElement;
    box(frame, { sw: 710, cw: 675, sh: 751, ch: 751 });
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(frame.getAttribute("aria-label")).toBe("ตารางสอน เลื่อนดูทางขวาได้");
    expect(document.querySelector(".tta-hint")?.textContent).toBe("เลื่อนตารางไปทางขวาเพื่อดูคาบที่เหลือ ›");
    expect(document.querySelector(".tta-wrap")!.hasAttribute("data-more-x")).toBe(true);
    expect(css("timetable-a.css")).toMatch(/\.tta-wrap\[data-more-x\]::after, \.tta-wrap\[data-more-y\]::before \{ opacity: 0\.55; \}/);
  });
});

describe("V-41/V-42 the now word does not take the name's width", () => {
  it("layout ก: badge in the bottom-right corner, room kept on the chip's last line only, no cell-wide padding", () => {
    const a = css("timetable-a.css");
    expect(a).not.toMatch(/\.tta-c\.now \{ padding-right/);
    expect(a).toMatch(/\.tta-c\.now > \.tta-now \{ position: absolute; right: 5px; bottom: 5px;/);
    expect(a).toMatch(/\.tta-c\.now \.ttp > :last-child \{ padding-right: 3\.5rem; \}/);
    render(<LayoutA {...props()} />);
    const now = document.querySelector(".tta-c.now") as HTMLElement;
    expect(now.querySelector(":scope > .tta-now")?.textContent).toBe("ตอนนี้");
  });
  it("layout ข: same placement, and compact density can no longer undo it", () => {
    const b = css("timetable-b.css");
    expect(b).not.toMatch(/\.ttb-c\.now \{ padding-right/);
    expect(b).toMatch(/\.ttb-c\.now > \.ttb-tag \{ position: absolute; right: 5px; bottom: 2px;/);
    expect(b).toMatch(/\.ttb-c\.now \.ttp > :last-child \{ padding-right: 3\.5rem; \}/);
  });
});

describe("V-44 narrow cells show the whole subject", () => {
  it("below 1100px (normal density) the name flows beside the icon and the subject may take two lines; text stays token-sized", () => {
    const a = css("timetable-a.css");
    const narrow = a.slice(a.indexOf("@media (max-width: 1099px)"));
    expect(narrow).toMatch(/\.ttp-l1 \{ display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;/);
    expect(narrow.slice(0, narrow.indexOf("/* V-43"))).not.toMatch(/font-size/);
  });
});
