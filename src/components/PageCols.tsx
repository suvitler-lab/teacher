import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { MIN_COL, colsFor, splitColumns } from "../lib/pageColumns";

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/** width of the element in rem of the user's text size (0 until measured); re-measures on resize and when the text size changes */
export function useRegionRem<T extends HTMLElement>(): [preact.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [rem, setRem] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRem(el.getBoundingClientRect().width / remPx());
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, rem];
}

interface Props<K extends string> {
  keys: K[];
  max: number;
  minCol?: number;
  weightOf: (k: K) => number;
  render: (k: K) => ComponentChildren;
  class?: string;
}

/** a first guess of the region width before it is measured: the window minus the rail and the page padding (so the cards mount once, not twice) */
function guessRem(): number {
  if (typeof window === "undefined") return 0;
  const narrow = window.innerWidth <= 720;
  return Math.max(0, window.innerWidth - (narrow ? 32 : 144)) / remPx();
}

/** The visible cards in the teacher's order, spread over as many columns as the region is wide enough for. */
export function PageCols<K extends string>({ keys, max, minCol = MIN_COL, weightOf, render, class: cls }: Props<K>) {
  const ref = useRef<HTMLDivElement>(null);
  const [rem, setRem] = useState(guessRem);
  const count = keys.length;
  // only the number of columns matters: a resize that keeps it does not re-render the cards
  const nRef = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width / remPx();
      if (colsFor(w, max, Math.max(1, count), minCol) !== nRef.current) setRem(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max, count, minCol]);
  if (count === 0) return null;
  const n = rem === 0 ? 1 : colsFor(rem, max, count, minCol);
  nRef.current = n;
  const cols = splitColumns(keys, n, weightOf);
  // the outer box is measured (full width of the region); the inner grid may be capped when it ends up with one column
  return (
    <div ref={ref} class={cls} style="min-width:0">
      <div class="pg-cols" data-n={n} style={`--n:${n}`}>
        {cols.map((ks, i) => (
          <div class="pg-col" key={i}>{ks.map((k) => <div key={k} class="pg-card">{render(k)}</div>)}</div>
        ))}
      </div>
    </div>
  );
}
