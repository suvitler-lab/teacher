import { useEffect, useRef, useState } from "preact/hooks";

/** The quick score input inside a grid cell (and the phone list row). Enter = next child, Esc = cancel, Alt+Enter = full editor. */
export function CellInput({ initial, seed = null, onCommit, onCancel, onMore }: { initial: string; seed?: string | null; onCommit: (initial: string, v: string, next: boolean) => void; onCancel: () => void; onMore?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(seed ?? initial);
  const done = useRef(false);
  // latest value + handler, for the unmount path below (a closure would hold the first render's)
  const latest = useRef({ v, onCommit });
  latest.current = { v, onCommit };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (seed != null) el.setSelectionRange(el.value.length, el.value.length); else el.select(); // typed digit: keep it and go on after it; otherwise select the old score
  }, []);
  // Leaving the page (or the class/filter changing) tears the input down without a blur:
  // a typed-but-unconfirmed score must still be recorded, not silently dropped.
  useEffect(() => () => {
    if (done.current) return;
    done.current = true;
    latest.current.onCommit(initial, latest.current.v, false);
  }, []);
  function finish(next: boolean) { if (done.current) return; done.current = true; onCommit(initial, v, next); }
  return (
    <input ref={ref} class="cell-input" aria-label="คะแนน" inputMode="decimal" value={v}
      onInput={(e) => setV((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        // The editor owns these keys. They must not also activate the containing
        // grid cell after committing moves editing to a different row.
        if (e.key === "Enter" && e.altKey && onMore) { e.preventDefault(); e.stopPropagation(); finish(false); onMore(); }
        else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finish(true); }
        else if (e.key === "Escape") {
          e.preventDefault(); e.stopPropagation(); done.current = true;
          // B-07: hand the focus to the grid cell NOW, while the input still holds it — leaving it to a timer after the input is
          // gone let it fall to <body> (arrows dead until a click) when the editor was opened by typing a digit
          const cell = ref.current?.closest<HTMLElement>("td.cell") ?? null;
          onCancel();
          cell?.focus({ preventScroll: true });
        }
      }}
      onBlur={() => finish(false)} />
  );
}
