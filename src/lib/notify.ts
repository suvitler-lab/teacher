import { signal } from "@preact/signals";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
  action?: { label: string; run: () => void };
  sticky?: boolean;
}

export const toasts = signal<Toast[]>([]);
let seq = 1;

export function notify(kind: Toast["kind"], message: string, opts: { action?: Toast["action"]; sticky?: boolean } = {}) {
  const id = seq++;
  toasts.value = [...toasts.value, { id, kind, message, action: opts.action, sticky: opts.sticky }];
  if (!opts.sticky) setTimeout(() => dismiss(id), 4000);
  return id;
}

export function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export const ok = (m: string) => notify("success", m);
export const err = (m: string) => notify("error", m);

/** Wrap a save action: run it, toast on failure, return whether it succeeded. */
export async function withToast(fn: () => Promise<unknown>, failMsg: string): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    err(failMsg);
    return false;
  }
}
