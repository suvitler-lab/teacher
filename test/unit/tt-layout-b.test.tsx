// T-20: layout ข — time axis, blocks, break band, "ตอนนี้" line as text, day/week switch, add-slot picker, keyboard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { classes, currentTermId, subjects, terms } from "@client/store";
import { setClock } from "@client/lib/timetable/clock";
import { ttSeedBootstrap } from "@client/lib/timetable/state";
import { resetTimetableStoreForTests } from "@client/lib/timetable/store";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { LayoutB } from "@client/components/timetable/b";

const props = (over = {}) => ({ termId: TERM_2_2569.id, slots: F_T1, frame: FRAME, readOnly: false, offline: false, onCell: vi.fn(), onDelete: vi.fn(), ...over });
const cell = (w: number, p: number) => document.querySelector(`[data-tt-cell="${w}:${p}"]`) as HTMLElement;
const phone = (on: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: on, addEventListener: vi.fn(), removeEventListener: vi.fn() }));

beforeEach(() => {
  resetTimetableStoreForTests();
  terms.value = [TERM_2_2569]; currentTermId.value = TERM_2_2569.id; classes.value = CLASSES; subjects.value = SUBJECTS;
  ttSeedBootstrap({ termId: TERM_2_2569.id, rev: 7, readOnly: false, slots: F_T1 }, { live: true, at: 0, epoch: 1 });
  setClock(Date.parse("2026-11-11T09:45:00+07:00")); // Wednesday 09:45
  phone(false);
});
afterEach(() => { cleanup(); setClock(null); vi.unstubAllGlobals(); });

describe("layout ข", () => {
  it("week: 5 day columns, the lunch band, 14 filled and 21 empty cells (AC-01 AC-50)", () => {
    render(<LayoutB {...props()} />);
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(document.querySelectorAll(".ttb-c.fill")).toHaveLength(14);
    expect(document.querySelectorAll(".ttb-c.empty")).toHaveLength(21);
    expect(screen.getByRole("gridcell", { name: "พักกลางวัน 11:30 ถึง 12:30" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: /^คาบ 1 08:30 ถึง 09:30/ })).toBeTruthy();
  });
  it("the now line is a word with the time (AC-34), in period 2; only today's cell is marked", () => {
    render(<LayoutB {...props()} />);
    expect(screen.getByRole("rowheader", { name: "คาบ 2 09:30 ถึง 10:30 ตอนนี้ 09:45" })).toBeTruthy();
    expect(document.querySelectorAll(".ttb-line")).toHaveLength(1);
    expect(document.querySelectorAll(".ttb-c.now")).toHaveLength(1);
    expect(cell(3, 2).getAttribute("aria-label")).toContain("กำลังเรียนอยู่ตอนนี้");
  });
  it("outside school hours there is no line", () => {
    setClock(Date.parse("2026-11-11T18:00:00+07:00"));
    render(<LayoutB {...props()} />);
    expect(document.querySelectorAll(".ttb-line")).toHaveLength(0);
  });
  it("every 60-minute block has the same height rule; the break band is narrow", () => {
    render(<LayoutB {...props()} />);
    const rows = (document.querySelector(".ttb-grid") as HTMLElement).style.gridTemplateRows;
    expect(rows).toContain("minmax(28px, auto)");
    expect(rows.match(/\* 1\)/g)?.length).toBe(7);
  });
  it("day / week switch: the day view has one column and chips; the switch is a radio group", () => {
    render(<LayoutB {...props()} />);
    expect(screen.getByRole("radiogroup", { name: "มุมมอง" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "วัน" }));
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(document.querySelectorAll(".ttb-c")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "วันจันทร์" }));
    expect(cell(1, 1)).toBeTruthy();
    expect(cell(3, 1)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "สัปดาห์" }));
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });
  it("phone: one day only, no switch", () => {
    phone(true);
    render(<LayoutB {...props()} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(document.querySelectorAll(".ttb-c")).toHaveLength(7);
  });
  it("tapping an empty cell reports it (add); a filled one reports it (menu)", () => {
    const p = props();
    render(<LayoutB {...p} />);
    fireEvent.click(cell(3, 3));
    expect(p.onCell).toHaveBeenCalledWith(3, 3, cell(3, 3));
    fireEvent.click(cell(3, 4));
    expect(p.onCell).toHaveBeenCalledWith(3, 4, cell(3, 4));
  });
  it("เพิ่มคาบ lists the empty cells first, then reports the chosen one; Esc closes and returns focus", async () => {
    const p = props();
    render(<LayoutB {...p} />);
    const add = screen.getByRole("button", { name: /เพิ่มคาบ/ });
    fireEvent.click(add);
    const sel = (await screen.findByRole("combobox")) as unknown as HTMLSelectElement;
    expect(sel.options.length).toBe(21);
    sel.value = "2:1";
    expect(sel.value).toBe("2:1");
    fireEvent.change(sel);

    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    await waitFor(() => expect(p.onCell).toHaveBeenCalledWith(2, 1, add));
    fireEvent.click(add);
    fireEvent.keyDown(await screen.findByRole("group", { name: "เลือกช่องที่จะเพิ่มคาบ" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(add));
  });
  it("offline: add is off and empty cells are aria-disabled; read-only: no add, no plus, no delete", () => {
    const { rerender } = render(<LayoutB {...props({ offline: true })} />);
    expect(screen.getByRole("button", { name: /เพิ่มคาบ/ }).getAttribute("aria-disabled")).toBe("true");
    expect(cell(3, 3).getAttribute("aria-disabled")).toBe("true");
    const p = props({ readOnly: true });
    rerender(<LayoutB {...p} />);
    expect(screen.queryByRole("button", { name: /เพิ่มคาบ/ })).toBeNull();
    expect(document.querySelector(".ttb-plus")).toBeNull();
    fireEvent.keyDown(cell(1, 2), { key: "Delete" });
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it("keyboard: one tab stop, down = next period, right = next day, Enter reports, Delete only on a filled cell", () => {
    const p = props();
    render(<LayoutB {...p} />);
    expect(document.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
    cell(1, 1).focus();
    fireEvent.keyDown(cell(1, 1), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell(1, 2));
    fireEvent.keyDown(cell(1, 2), { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(2, 2));
    fireEvent.keyDown(cell(2, 2), { key: "End" });
    expect(document.activeElement).toBe(cell(2, 7));
    fireEvent.keyDown(cell(2, 7), { key: "Home", ctrlKey: true });
    expect(document.activeElement).toBe(cell(1, 1));
    fireEvent.keyDown(cell(1, 1), { key: "Delete" });
    expect(p.onDelete).not.toHaveBeenCalled();
    fireEvent.keyDown(cell(1, 2), { key: "Delete" });
    expect(p.onDelete).toHaveBeenCalledWith(1, 2);
    fireEvent.keyDown(cell(1, 2), { key: "Enter" });
    expect(p.onCell).toHaveBeenCalledWith(1, 2, cell(1, 2));
  });
  it("a cell is read as day, period, time, then the name (AC-34)", () => {
    render(<LayoutB {...props()} />);
    expect(cell(3, 4).getAttribute("aria-label")).toMatch(/^วันพุธ คาบ 4 12:30 ถึง 13:30 /);
    expect(cell(3, 3).getAttribute("aria-label")).toBe("วันพุธ คาบ 3 ว่าง ปุ่มเพิ่มคาบ");
  });
});
