// T-21: layout ค — now/next card, BR-15 shortcut room (AC-58 cases), today list, week editor, phone view.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { classes, currentTermId, subjects, terms } from "@client/store";
import { setClock } from "@client/lib/timetable/clock";
import { ttSeedBootstrap } from "@client/lib/timetable/state";
import { resetTimetableStoreForTests } from "@client/lib/timetable/store";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { LayoutC } from "@client/components/timetable/c";

const props = (over = {}) => ({ termId: TERM_2_2569.id, slots: F_T1, frame: FRAME, readOnly: false, offline: false, onCell: vi.fn(), onDelete: vi.fn(), ...over });
const media = (m: { phone?: boolean; wide?: boolean; grid?: boolean }) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width: 640px") ? !!m.phone : q.includes("min-width: 1400px") ? !!m.grid : q.includes("min-width: 1000px") ? !!m.wide : false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
const at = (iso: string) => setClock(Date.parse(`${iso}+07:00`));
const card = () => document.querySelector("[data-ttc-now]") as HTMLElement | null;

beforeEach(() => {
  resetTimetableStoreForTests();
  terms.value = [TERM_2_2569]; currentTermId.value = TERM_2_2569.id; classes.value = CLASSES; subjects.value = SUBJECTS;
  ttSeedBootstrap({ termId: TERM_2_2569.id, rev: 7, readOnly: false, slots: F_T1 }, { live: true, at: 0, epoch: 1 });
  at("2026-11-11T09:45:00");
  media({ wide: true, grid: true });
});
afterEach(() => { cleanup(); setClock(null); vi.unstubAllGlobals(); });

describe("layout ค", () => {
  it("wed 09:45: now card says คาบ 2 · ถึง 10:30 with the เช็คชื่อ ป.6/4 button (AC-51)", () => {
    render(<LayoutC {...props()} />);
    const now = card()!.querySelector('[data-blk="now"]') as HTMLElement;
    expect(now.textContent).toContain("ตอนนี้");
    expect(now.textContent).toContain("คาบ 2 · ถึง 10:30");
    expect(now.textContent).toContain("ป.6/4");
    expect(screen.getAllByRole("button", { name: "เช็คชื่อ ป.6/4" })).toHaveLength(1);
    expect(card()!.querySelector('[data-blk="next"]')!.textContent).toContain("คาบ 4");
  });
  it("shortcut room follows BR-15: next period carries (คาบต่อไป); none after the last teaching period; none on Saturday", () => {
    at("2026-11-11T10:45:00");
    const { unmount } = render(<LayoutC {...props()} />);
    expect(screen.getByRole("button", { name: "เช็คชื่อ ป.6/3 (คาบต่อไป)" })).toBeTruthy();
    expect(card()!.querySelector('[data-blk="now"] .ttc-acts')).toBeNull(); // the button sits on the "ต่อไป" block
    unmount();
    at("2026-11-09T15:40:00"); // Monday, only PLC left
    const r2 = render(<LayoutC {...props()} />);
    expect(screen.queryByRole("button", { name: /เช็คชื่อ/ })).toBeNull();
    r2.unmount();
    at("2026-11-14T10:00:00");
    render(<LayoutC {...props()} />);
    expect(screen.queryByRole("button", { name: /เช็คชื่อ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "สแกนงาน" })).toBeNull();
  });
  it("Friday 10:45 points at ป.6/4 (teaching period 3), not ป.6/1 of period 4", () => {
    at("2026-11-13T10:45:00");
    render(<LayoutC {...props()} />);
    expect(screen.getByRole("button", { name: "เช็คชื่อ ป.6/4" })).toBeTruthy();
  });
  it("today list: ตอนนี้ / ต่อไป / ผ่านแล้ว words, lunch break row, taps open the cell", () => {
    const p = props();
    render(<LayoutC {...p} />);
    const list = document.querySelector(".ttc-today")!;
    expect(list.textContent).toContain("วันนี้ · พุธ");
    expect(list.querySelector(".now .ttd-tag")!.textContent).toBe("ตอนนี้");
    expect(list.textContent).toContain("ต่อไป");
    expect(list.textContent).toContain("พักกลางวัน");
    const row = list.querySelector('[data-tt-cell="today:3:2"]') as HTMLElement;
    fireEvent.click(row);
    expect(p.onCell).toHaveBeenCalledWith(3, 2, row);
  });
  it("wide: the week is the paper grid (every cell reachable); narrow: chips + day list; delete key reports", () => {
    const p = props();
    const { unmount } = render(<LayoutC {...p} />);
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(document.querySelectorAll('.ttc-week [role="gridcell"]')).toHaveLength(35);
    fireEvent.keyDown(document.querySelector('.ttc-today [data-tt-cell="today:3:2"]') as HTMLElement, { key: "Delete" });
    expect(p.onDelete).toHaveBeenCalledWith(3, 2);
    unmount();
    media({ wide: true, grid: false });
    render(<LayoutC {...p} />);
    expect(screen.queryByRole("grid")).toBeNull();
    expect(document.querySelector(".ttc-week .ttd-chips")).toBeTruthy();
    // V-22: the chip + day-list editor already opens on today, so the separate today list is not drawn a second time
    expect(document.querySelector(".ttc-today")).toBeNull();
  });
  it("phone: card then the day list only (no second today list)", () => {
    media({ phone: true });
    render(<LayoutC {...props()} />);
    expect(card()).toBeTruthy();
    expect(document.querySelector(".ttc-today")).toBeNull();
    expect(document.querySelector(".ttd-chips")).toBeTruthy();
  });
  it("saturday: list shows the next school day; past-year term (not live) has no card and no buttons", () => {
    at("2026-11-14T10:00:00");
    const { unmount } = render(<LayoutC {...props()} />);
    expect(document.querySelector(".ttc-today")!.textContent).toContain("วันเรียนถัดไป · จันทร์");
    unmount();
    terms.value = [{ ...TERM_2_2569, is_current: false }];
    render(<LayoutC {...props({ readOnly: true })} />);
    expect(card()).toBeNull();
    expect(document.querySelector(".ttc-today button")).toBeNull();
  });
});
