import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

const stack: HTMLElement[] = [];
const selector = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** Shared focus lifecycle for modal surfaces, including nested dialogs. */
export function Dialog({ children, label, onClose, dismissible = true, class: className = "modal", style, id, role = "dialog" }: {
  children: ComponentChildren; label: string; onClose: () => void; dismissible?: boolean; class?: string; style?: string; id?: string;
  /** "alertdialog" for a question that must be answered (confirm a destructive step) */
  role?: "dialog" | "alertdialog";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };
  useLayoutEffect(() => {
    const node = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...node.querySelectorAll<HTMLElement>(selector)].filter((el) => {
      if (el.hasAttribute("disabled") || el.tabIndex < 0 || el.closest('[hidden],[inert]')) return false;
      const css = getComputedStyle(el);
      return css.display !== "none" && css.visibility !== "hidden";
    });
    const focusFirst = () => (focusable()[0] ?? node).focus();
    stack.push(node);
    // Child layout effects run before their parent's. Keep descendants on top even
    // when a parent and an already-open nested dialog mount in the same render.
    stack.sort((a, b) => a.contains(b) ? -1 : b.contains(a) ? 1 : 0);
    if (stack.at(-1) === node) focusFirst();
    const keydown = (e: KeyboardEvent) => {
      if (stack.at(-1) !== node) return;
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (latest.current.dismissible) latest.current.onClose();
      } else if (e.key === "Tab") {
        const list = focusable();
        const first = list[0], last = list.at(-1);
        if (!first) { e.preventDefault(); node.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last!.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const contain = (e: FocusEvent) => {
      if (stack.at(-1) === node && !node.contains(e.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", contain);
      const index = stack.indexOf(node);
      if (index >= 0) stack.splice(index, 1);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div ref={ref} id={id} class={className} style={style} role={role} aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>;
}
