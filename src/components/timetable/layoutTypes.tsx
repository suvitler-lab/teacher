// The contract between the timetable page (shared sheets, menu, toasts) and the three layouts (ก ข ค).
// A layout only draws the table and reports taps; adding, editing, deleting and every message live in pages/Timetable.tsx.
import type { Frame, Slot, Weekday } from "@shared/timetable";

export interface LayoutProps {
  termId: string;
  slots: Slot[];
  frame: Frame;
  readOnly: boolean; // a past-year term: nothing can be changed and no cell is a button
  offline: boolean; // reading the copy kept on this device: empty cells are shown but cannot add
  /** A cell was activated (tap / Enter / Space). The page opens the add sheet or the cell menu, anchored to `anchor`. */
  onCell: (weekday: Weekday, period: number, anchor: HTMLElement) => void;
  /** Delete pressed on a focused filled cell (no question asked: the page offers "เลิกทำ"). Optional for layouts without a keyboard grid. */
  onDelete?: (weekday: Weekday, period: number) => void;
}

/** Every cell element carries `data-tt-cell="<weekday>:<period>"` so the page can put focus back on it after a sheet closes. */
export const cellAttr = (weekday: number, period: number) => `${weekday}:${period}`;
export const cellSelector = (weekday: number, period: number) => `[data-tt-cell="${cellAttr(weekday, period)}"]`;

export function focusCell(weekday: number, period: number): void {
  const el = document.querySelector<HTMLElement>(cellSelector(weekday, period));
  el?.focus();
}
