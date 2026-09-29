import { charFromKey } from "@shared/keymap";

// A keyboard-wedge scanner types a code as a very fast keystroke burst ending
// in Enter. We detect the burst by timing, decode from KeyboardEvent.code (so
// a Thai OS layout doesn't corrupt it), and — if the burst landed in a focused
// field — restore that field's value so scanning never pollutes score entry.

const BURST_GAP_MS = 60; // max gap between keys within one scan
const MIN_LEN = 3;

interface Snapshot {
  el: HTMLInputElement | HTMLTextAreaElement;
  value: string;
}

function editable(el: EventTarget | null): (HTMLInputElement | HTMLTextAreaElement) | null {
  if (!el || !(el instanceof HTMLElement)) return null;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (["text", "number", "search", "tel", "password", "email", "url"].includes(t)) return el;
  }
  return null;
}

export function installHidScanner(onScan: (raw: string) => void): () => void {
  let buffer: string[] = [];
  let lastTime = 0;
  let snapshot: Snapshot | null = null;

  function reset() {
    buffer = [];
    snapshot = null;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;

    if (e.key === "Enter") {
      const fastBurst = buffer.length >= MIN_LEN;
      if (fastBurst) {
        const raw = buffer.join("");
        // undo any characters that leaked into a focused field
        if (snapshot && snapshot.el.isConnected) {
          snapshot.el.value = snapshot.value;
          snapshot.el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        reset();
        e.preventDefault();
        e.stopPropagation();
        onScan(raw);
        return;
      }
      reset();
      return; // let a normal Enter through
    }

    const ch = charFromKey(e.code, e.key);
    if (ch === null) return; // modifier / non-text key — don't reset the burst

    if (dt > BURST_GAP_MS || buffer.length === 0) {
      // start of a new (possible) burst
      buffer = [ch];
      const el = editable(document.activeElement);
      snapshot = el ? { el, value: el.value } : null;
    } else {
      buffer.push(ch);
    }
  }

  document.addEventListener("keydown", onKeyDown, true);
  return () => document.removeEventListener("keydown", onKeyDown, true);
}
