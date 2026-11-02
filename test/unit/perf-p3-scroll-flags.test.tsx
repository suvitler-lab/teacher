import { describe, expect, it } from "vitest";
import { h } from "preact";
import { useRef } from "preact/hooks";
import { render, act } from "@testing-library/preact";
import { useScrollFlags, flagsFit, edgeClassOf } from "../../src/components/GradebookNav";

// P3: scrolling must re-render the PAGE only when an edge shadow or "everything fits" changes — not on every scroll event.
let renders = 0;
let frame: HTMLDivElement;
function Harness({ sig }: { sig: string }) {
  const ref = useRef<HTMLDivElement>(null);
  renders++;
  const flags = useScrollFlags(ref, true, sig);
  return h("div", { ref, "data-flags": flags, class: "frame" + edgeClassOf(flags) });
}
function size(el: HTMLElement, clientWidth: number, scrollWidth: number) {
  Object.defineProperty(el, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scrollWidth });
}

describe("useScrollFlags (P3)", () => {
  it("50 scroll events in the middle of the table re-render nothing; crossing an edge re-renders once", async () => {
    renders = 0;
    const { container } = render(h(Harness, { sig: "a" }));
    frame = container.querySelector(".frame") as HTMLDivElement;
    size(frame, 800, 2000);
    await act(async () => { frame.dispatchEvent(new Event("scroll")); });
    expect(frame.dataset.flags).toBe("010"); // at the left edge: more to the right
    expect(frame.className).toContain("can-r");
    const base = renders;
    for (let i = 1; i <= 50; i++) {
      frame.scrollLeft = 10 + i * 5; // 15 … 260: in the middle
      await act(async () => { frame.dispatchEvent(new Event("scroll")); });
    }
    expect(frame.dataset.flags).toBe("110");
    expect(renders - base).toBe(1); // only the move off the left edge
    frame.scrollLeft = 1200; // the right end (2000 − 800)
    await act(async () => { frame.dispatchEvent(new Event("scroll")); });
    expect(frame.dataset.flags).toBe("100");
    expect(renders - base).toBe(2);
  });
  it("everything fits → flagsFit and no shadows", async () => {
    const { container } = render(h(Harness, { sig: "b" }));
    const el = container.querySelector(".frame") as HTMLDivElement;
    size(el, 800, 800);
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    expect(flagsFit(el.dataset.flags!)).toBe(true);
    expect(el.className).not.toContain("can-");
  });
});
