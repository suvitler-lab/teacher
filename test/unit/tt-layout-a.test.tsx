// T-19: layout ก — grid roles, roving tabindex, arrow keys, phone day list.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { classes, currentTermId, subjects, terms } from "@client/store";
import { setClock } from "@client/lib/timetable/clock";
import { ttSeedBootstrap } from "@client/lib/timetable/state";
import { resetTimetableStoreForTests } from "@client/lib/timetable/store";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { LayoutA } from "@client/components/timetable/a";

const props = (over = {}) => ({ termId: TERM_2_2569.id, slots: F_T1, frame: FRAME, readOnly: false, offline: false, onCell: vi.fn(), onDelete: vi.fn(), ...over });
const cell = (w: number, p: number) => document.querySelector(`[data-tt-cell="${w}:${p}"]`) as HTMLElement;
const phone = (on: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: on, addEventListener: vi.fn(), removeEventListener: vi.fn() }));

beforeEach(() => {
  resetTimetableStoreForTests();
  terms.value = [TERM_2_2569]; currentTermId.value = TERM_2_2569.id; classes.value = CLASSES; subjects.value = SUBJECTS;
  ttSeedBootstrap({ termId: TERM_2_2569.id, rev: 7, readOnly: false, slots: F_T1 }, { live: true, at: 0, epoch: 1 });
  setClock(Date.parse("2026-11-11T09:45:00+07:00"));
  phone(false);
});
afterEach(() => { cleanup(); setClock(null); vi.unstubAllGlobals(); });

describe("layout ก", () => {
  it("is a grid with headers, one tab stop and the break as a labelled column", () => {
    render(<LayoutA {...props()} />);
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.getAllByRole("rowheader").length).toBe(5);
    expect(screen.getByRole("columnheader", { name: "พักกลางวัน 11:30 ถึง 12:30" })).toBeTruthy();
    expect(document.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
  });
  it("arrows, Home/End and Ctrl+Home move focus; Enter reports the cell; Delete only on a filled one", () => {
    const p = props();
    render(<LayoutA {...p} />);
    cell(1, 1).focus();
    fireEvent.keyDown(cell(1, 1), { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(1, 2));
    fireEvent.keyDown(cell(1, 2), { key: "ArrowDown" });
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
  it("read-only: no plus sign and no delete", () => {
    const p = props({ readOnly: true });
    render(<LayoutA {...p} />);
    expect(document.querySelector(".tta-plus")).toBeNull();
    fireEvent.keyDown(cell(1, 2), { key: "Delete" });
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it("phone: today first with ตอนนี้ / ต่อไป words; chips change the day", () => {
    phone(true);
    render(<LayoutA {...props()} />);
    expect(screen.getByRole("heading", { name: "วันนี้ (พุธ)" })).toBeTruthy();
    expect(screen.getByText("ตอนนี้")).toBeTruthy();
    expect(screen.getByText("ต่อไป")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "วันศุกร์" }));
    expect(screen.getByRole("heading", { name: "วันศุกร์" })).toBeTruthy();
  });
  it("phone on Saturday opens on the next school day", () => {
    setClock(Date.parse("2026-11-14T10:00:00+07:00"));
    phone(true);
    render(<LayoutA {...props()} />);
    expect(screen.getByRole("heading", { name: "วันจันทร์ (วันเรียนถัดไป)" })).toBeTruthy();
  });
});
