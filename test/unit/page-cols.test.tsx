// Wide-screen card layout: <PageCols> measures its own box (rem of the user's text size), spreads the cards in the teacher's
// order over the columns that fit, and never stretches one lone column.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { PageCols } from "@client/components/PageCols";

const W = (k: string) => ({ a: 4, b: 1, c: 2, d: 2 } as Record<string, number>)[k] ?? 1;

/** every element reports this width in rem (the root font size is 16px) */
function boxWidth(rem: number) {
  const w = rem * 16;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: w, height: 100, top: 0, left: 0, right: w, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
}
const cols = (c: Element) => [...c.querySelectorAll(".pg-col")].map((col) => [...col.querySelectorAll(".pg-card")].map((e) => e.textContent));
const show = (keys: string[], max = 3) => <PageCols keys={keys} max={max} weightOf={W} render={(k) => <span>{k}</span>} />;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PageCols", () => {
  it("one visible card = one column (data-n=1), however wide the region is", () => {
    boxWidth(90);
    const { container } = render(show(["a"]));
    expect(container.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1");
    expect(cols(container)).toEqual([["a"]]);
  });

  it("no visible cards = renders nothing at all", () => {
    boxWidth(90);
    const { container } = render(show([]));
    expect(container.querySelector(".pg-cols")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("before it is measured (width 0) there is one column: nothing jumps on a phone", () => {
    boxWidth(0);
    const { container } = render(show(["a", "b", "c"]));
    expect(container.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1");
  });

  it("spreads the cards over as many columns as fit, the next card going to the lighter column", () => {
    boxWidth(87); // 3 columns of 26rem fit
    const { container } = render(show(["a", "b", "c", "d"]));
    expect(container.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("3");
    expect(cols(container)).toEqual([["a"], ["b", "d"], ["c"]]); // a=4, b=1, c=2, then d (2) goes under b (the lightest)
  });

  it("never more columns than max, and fewer when the region is narrow", () => {
    boxWidth(87);
    expect(render(show(["a", "b", "c", "d"], 2)).container.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("2");
    cleanup();
    boxWidth(40); // one 26rem column fits, two do not
    expect(render(show(["a", "b", "c", "d"])).container.querySelector(".pg-cols")!.getAttribute("data-n")).toBe("1");
  });

  it("hiding a card re-spreads the rest and keeps the teacher's order", () => {
    boxWidth(60);
    const { container, rerender } = render(show(["a", "b", "c"]));
    expect(cols(container)).toEqual([["a"], ["b", "c"]]);
    rerender(show(["b", "c"]));
    expect(cols(container)).toEqual([["b"], ["c"]]);
  });
});
