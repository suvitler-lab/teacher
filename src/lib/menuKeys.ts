// Keyboard for a small popup menu (role="menu"): ↑ ↓ Home End move between its items, Esc closes it, and the first item
// takes focus when the menu opens. Used by the ⋮ menus of the gradebook and the students list.

export function menuKeys(close: () => void) {
  return (e: KeyboardEvent) => {
    const root = e.currentTarget as HTMLElement;
    const items = [...root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length].focus(); };
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  };
}

/** ref for the menu element: puts focus on the first item once, when the menu appears. */
export function focusFirstItem(el: HTMLElement | null) {
  if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
}
