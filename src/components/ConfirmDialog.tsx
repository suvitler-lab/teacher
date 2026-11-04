import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";

export interface AskOptions {
  title: string;
  body: ComponentChildren;
  /** the confirming button's words, e.g. "ออกโดยไม่บันทึก" */
  yes: string;
  /** the staying button's words, default "ยกเลิก" */
  no?: string;
  /** a destructive answer: red button, and focus starts on the safe one */
  danger?: boolean;
}

/**
 * A page-level replacement for window.confirm(): `ask()` shows a Dialog and resolves true (yes) or false (no / Esc /
 * tap outside). Focus starts on the safe answer ("no"), so Enter never confirms by accident. Render `node` once.
 */
export function useConfirm() {
  const [open, setOpen] = useState<(AskOptions & { id: number }) | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const seq = useRef(0);

  function ask(o: AskOptions): Promise<boolean> {
    resolver.current?.(false); // a second question replaces the first one
    return new Promise<boolean>((resolve) => { resolver.current = resolve; setOpen({ ...o, id: ++seq.current }); });
  }
  function answer(v: boolean) {
    const r = resolver.current;
    resolver.current = null;
    setOpen(null);
    r?.(v);
  }

  const node = open && (
    <div class="modal-overlay" key={open.id} onClick={(e) => { if (e.target === e.currentTarget) answer(false); }}>
      <Dialog role="alertdialog" label={open.title} onClose={() => answer(false)} style="max-width:440px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:1.2rem">{open.title}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={() => answer(false)}><Icon name="x" /></button>
        </div>
        <div style="font-size:var(--fs-sm);line-height:1.6;margin-bottom:10px">{open.body}</div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px">
          {/* the safe answer comes first in the tab order, so Dialog's focus-first lands on it */}
          <button onClick={() => answer(false)}>{open.no ?? "ยกเลิก"}</button>
          <button class={open.danger ? "danger" : "primary"} onClick={() => answer(true)}>{open.yes}</button>
        </div>
      </Dialog>
    </div>
  );
  return { ask, node };
}
