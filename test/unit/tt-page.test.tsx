// T-19: the timetable page — states, add/edit sheet, cell menu, delete + undo, offline, past year. API mocked to EP-11.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put } }));

import { classes, currentTermId, settings, subjects, terms } from "@client/store";
import { dataEpoch } from "@client/lib/session";
import { online } from "@client/lib/outbox";
import { route } from "@client/router";
import { setClock } from "@client/lib/timetable/clock";
import { ttSeedBootstrap } from "@client/lib/timetable/state";
import { resetTimetableStoreForTests } from "@client/lib/timetable/store";
import { CLASSES, F_T1, SUBJECTS, TERM_1_2569, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { TimetablePage } from "@client/pages/Timetable";
import type { Settings } from "@shared/types";
import type { Slot } from "@shared/timetable";

const T2 = TERM_2_2569.id;
const base = (): Settings => ({
  school_name: "", teacher_name: "", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "", period_frame: "",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
});
const seed = (slots: Slot[] = F_T1, readOnly = false) => ttSeedBootstrap({ termId: T2, rev: 7, readOnly, slots }, { live: true, at: Date.now(), epoch: 5 });
const cell = (w: number, p: number) => document.querySelector(`[data-tt-cell="${w}:${p}"]`) as HTMLElement;
const okPut = () => put.mockImplementation(async (_u: string, b: { slots: Slot[] }) => ({ ok: true, changed: true, timetable: { termId: T2, rev: 8, readOnly: false, slots: b.slots } }));

beforeEach(() => {
  get.mockReset(); put.mockReset(); post.mockReset();
  resetTimetableStoreForTests();
  online.value = true; dataEpoch.value = 5;
  terms.value = [TERM_2_2569, TERM_1_2569]; currentTermId.value = T2; classes.value = CLASSES; subjects.value = SUBJECTS;
  settings.value = base();
  route.value = "/timetable";
  setClock(Date.parse("2026-11-11T09:45:00+07:00")); // Wednesday 09:45
  seed();
});
afterEach(() => { cleanup(); online.value = true; setClock(null); });

describe("grid and summary (AC-01)", () => {
  it("shows the 14 filled cells, 21 empty ones and the summary", () => {
    render(<TimetablePage />);
    expect(document.querySelectorAll('[role="gridcell"].fill')).toHaveLength(14);
    expect(document.querySelectorAll('[role="gridcell"].empty')).toHaveLength(21);
    expect(screen.getByTestId("tt-summary").textContent).toBe("สอน 9 · กิจกรรม 5 · รวม 14 คาบ (14 ชม.)");
    expect(cell(3, 4).getAttribute("aria-label")).toBe("วันพุธ คาบ 4 12:30 ถึง 13:30 คณิตศาสตร์ ป.6/3");
    expect(cell(3, 3).getAttribute("aria-label")).toBe("วันพุธ คาบ 3 ว่าง ปุ่มเพิ่มคาบ");
    expect(cell(3, 2).getAttribute("aria-label")).toContain("กำลังเรียนอยู่ตอนนี้");
  });
});

describe("B-01 / B-02", () => {
  it("an empty current term shows the copy button without switching terms", async () => {
    get.mockResolvedValue({ termId: T2, rev: 7, readOnly: false, slots: [], frame: null, counts: [{ termId: TERM_1_2569.id, slots: 14 }] });
    seed([]);
    render(<TimetablePage />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /คัดลอกจากภาค/ }).length).toBeGreaterThan(0));
  });
  it("offline: an empty seeded term renders without a request", () => {
    online.value = false;
    seed([]);
    render(<TimetablePage />);
    expect(get).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="gridcell"].empty')).toHaveLength(35);
  });
  it("activity name counts graphemes: 40 emoji ok, 41 is an error", async () => {
    okPut();
    render(<TimetablePage />);
    fireEvent.click(cell(4, 7));
    const dlg = screen.getByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("กิจกรรม"));
    fireEvent.input(within(dlg).getByLabelText(/ชื่อกิจกรรม/), { target: { value: "😀".repeat(40) } });
    expect(within(dlg).getByText("40/40")).toBeTruthy();
    fireEvent.input(within(dlg).getByLabelText(/ชื่อกิจกรรม/), { target: { value: "😀".repeat(41) } });
    fireEvent.click(within(dlg).getByRole("button", { name: "บันทึก" }));
    expect(within(dlg).getByText("ไม่เกิน 40 ตัวอักษร")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("add a slot (AC-02, AC-03, AC-04)", () => {
  it("teaching: pick room + subject, PUT carries baseRev, cell updates", async () => {
    okPut();
    render(<TimetablePage />);
    fireEvent.click(cell(3, 3));
    const dlg = screen.getByRole("dialog");
    fireEvent.change(within(dlg).getByLabelText(/^ห้อง/), { target: { value: "c1" } });
    fireEvent.change(within(dlg).getByLabelText(/วิชา/), { target: { value: "s-math" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const body = put.mock.calls[0][1];
    expect(body.baseRev).toBe(7);
    expect(body.slots.find((s: Slot) => s.weekday === 3 && s.period === 3)).toMatchObject({ kind: "class", classId: "c1", subjectId: "s-math" });
    expect(cell(3, 3).getAttribute("aria-label")).toContain("คณิตศาสตร์ ป.6/1");
    expect(screen.getByTestId("tt-summary").textContent).toContain("สอน 10");
  });
  it("V-62: the visible validation message is the one role=alert (named by aria-describedby), the live region stays separate", () => {
    okPut();
    render(<TimetablePage />);
    fireEvent.click(cell(4, 7));
    const dlg = screen.getByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("กิจกรรม"));
    fireEvent.click(within(dlg).getByRole("button", { name: "บันทึก" }));
    const alerts = within(dlg).getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain("ใส่ชื่อกิจกรรม");
    expect(within(dlg).getByLabelText(/ชื่อกิจกรรม/).getAttribute("aria-describedby")).toContain(alerts[0].id);
    expect(dlg.querySelector(".tts-live")?.getAttribute("role")).toBe("status"); // not an alert: no double announcement
  });
  it("activity: validation messages, no request until valid", async () => {
    okPut();
    render(<TimetablePage />);
    fireEvent.click(cell(4, 7));
    const dlg = screen.getByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("กิจกรรม"));
    fireEvent.click(within(dlg).getByRole("button", { name: "บันทึก" }));
    expect(within(dlg).getByText("ใส่ชื่อกิจกรรม")).toBeTruthy();
    fireEvent.input(within(dlg).getByLabelText(/ชื่อกิจกรรม/), { target: { value: "ก".repeat(41) } });
    fireEvent.click(within(dlg).getByRole("button", { name: "บันทึก" }));
    expect(within(dlg).getByText("ไม่เกิน 40 ตัวอักษร")).toBeTruthy();
    expect(within(dlg).getByText("เกิน 1 ตัว")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
    fireEvent.input(within(dlg).getByLabelText(/ชื่อกิจกรรม/), { target: { value: "ประชุมระดับชั้น" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("tt-summary").textContent).toContain("กิจกรรม 6");
  });
  it("teaching without a room shows เลือกห้อง", () => {
    render(<TimetablePage />);
    fireEvent.click(cell(3, 3));
    fireEvent.input(screen.getByLabelText(/^ห้อง/), { target: { value: "" } }); // the room used last is pre-picked: clear it
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(screen.getByText("เลือกห้อง", { selector: "p" })).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });
  it("a failed save keeps the sheet and what was typed, with a retry", async () => {
    const { ApiError } = await import("@client/lib/api");
    put.mockRejectedValue(new ApiError(500, "error", "x", {}));
    render(<TimetablePage />);
    fireEvent.click(cell(4, 7));
    fireEvent.click(screen.getByLabelText("กิจกรรม"));
    fireEvent.input(screen.getByLabelText(/ชื่อกิจกรรม/), { target: { value: "ลูกเสือ" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await screen.findByText("บันทึกตารางสอนไม่สำเร็จ");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText(/ชื่อกิจกรรม/) as HTMLInputElement).value).toBe("ลูกเสือ");
    expect(screen.getByRole("button", { name: "ลองอีกครั้ง" })).toBeTruthy();
  });
});

describe("cell menu, delete and undo (AC-05, AC-06, AC-28)", () => {
  it("teaching cell: shortcuts + edit + delete; activity: edit + delete only", () => {
    render(<TimetablePage />);
    fireEvent.click(cell(3, 4));
    expect(screen.getAllByRole("menuitem").map((e) => e.textContent!.trim())).toEqual(["เช็คชื่อ ป.6/3", "สแกนส่งงาน ป.6/3", "แก้คาบนี้", "ลบคาบนี้"]);
    expect(screen.getByRole("menuitem", { name: /เช็คชื่อ/ }).getAttribute("href")).toBe("#/attendance?class=c3");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(cell(5, 6));
    expect(screen.getAllByRole("menuitem").map((e) => e.textContent!.trim())).toEqual(["แก้คาบนี้", "ลบคาบนี้"]);
  });
  it("delete empties the cell at once and เลิกทำ puts it back", async () => {
    okPut();
    render(<TimetablePage />);
    fireEvent.click(cell(2, 6));
    fireEvent.click(screen.getByRole("menuitem", { name: /ลบคาบนี้/ }));
    expect(cell(2, 6).classList.contains("empty")).toBe(true);
    expect(await screen.findByText(/ลบคาบ คณิตศาสตร์ ป.6\/2 \(อังคาร คาบ 6\) แล้ว/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
    await waitFor(() => expect(cell(2, 6).classList.contains("fill")).toBe(true));
  });
  it("Delete key on a focused cell removes it", async () => {
    okPut();
    render(<TimetablePage />);
    cell(2, 2).focus();
    fireEvent.keyDown(cell(2, 2), { key: "Delete" });
    await waitFor(() => expect(cell(2, 2).classList.contains("empty")).toBe(true));
  });
});

describe("offline, past year, empty, no term (AC-08, AC-10, AC-43)", () => {
  it("offline: stamp + notice, empty cell does not open, edit is off, print and shortcuts stay", () => {
    online.value = false;
    render(<TimetablePage />);
    expect(screen.getByText(/ออฟไลน์ · ข้อมูลเมื่อ \d\d:\d\d/)).toBeTruthy();
    expect(screen.getAllByText("ออฟไลน์ — แก้ตารางสอนได้เมื่อออนไลน์").length).toBeGreaterThan(0);
    fireEvent.click(cell(3, 3));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByRole("button", { name: "พิมพ์ตารางสอน" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cell(3, 4));
    expect(screen.getByRole("menuitem", { name: /เช็คชื่อ/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /แก้คาบนี้/ }).getAttribute("aria-disabled")).toBe("true");
  });
  it("past year: tag, no edit buttons, cells are not buttons", () => {
    seed(F_T1, true);
    render(<TimetablePage />);
    expect(screen.getByText("ปีการศึกษาที่ผ่านมา · ดูอย่างเดียว")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ตั้งเวลาคาบ/ })).toBeNull();
    fireEvent.click(cell(3, 3));
    fireEvent.click(cell(3, 4));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "พิมพ์ตารางสอน" })).toBeTruthy();
  });
  it("empty term: hint, print off with its reason", () => {
    seed([]);
    render(<TimetablePage />);
    expect(screen.getByText("ยังไม่มีตารางสอนภาคนี้")).toBeTruthy();
    expect((screen.getByRole("button", { name: "พิมพ์ตารางสอน" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("ยังไม่มีคาบให้พิมพ์")).toBeTruthy();
  });
  it("no term at all", () => {
    terms.value = []; currentTermId.value = null;
    render(<TimetablePage />);
    expect(screen.getByText("ยังไม่มีภาคเรียน — สร้างภาคเรียนก่อนกรอกตารางสอน")).toBeTruthy();
    expect(screen.getByRole("button", { name: /ไปตั้งค่า/ })).toBeTruthy();
  });
  it("R-13: an unknown ?term= with terms present says term-not-found, with a link back", () => {
    route.value = "/timetable?term=nope";
    render(<TimetablePage />);
    expect(document.querySelector('[data-tt-state="term-not-found"]')).toBeTruthy();
    expect(document.querySelector('[data-tt-state="no-term"]')).toBeNull();
    expect(screen.getByText("ไม่พบภาคเรียนนี้")).toBeTruthy();
    expect(screen.getByRole("link", { name: "ไปตารางสอนภาคปัจจุบัน" }).getAttribute("href")).toBe("#/timetable");
  });
  it("R-17: empty cells that cannot add are not announced as an add button (old year, offline)", () => {
    seed(F_T1, true);
    const a = render(<TimetablePage />);
    expect(cell(3, 3).getAttribute("aria-label")).toBe("ว่าง · วันพุธ คาบ 3");
    a.unmount();
    seed();
    online.value = false;
    render(<TimetablePage />);
    expect(cell(3, 3).getAttribute("aria-label")).toBe("ว่าง · วันพุธ คาบ 3");
    expect(cell(3, 3).getAttribute("aria-label")).not.toContain("ปุ่มเพิ่มคาบ");
  });
  it("R-15 / ค: closing the add sheet returns focus to the very cell tapped, and every data-tt-cell is unique", async () => {
    const { applyStoredAppearance, resetAppearanceForTests, TIMETABLE_KEY } = await import("@client/lib/appearance");
    localStorage.setItem(TIMETABLE_KEY, "c");
    settings.value = { ...base(), accent: JSON.stringify({ v: 1, skin: "warm", layout: "a", timetable: "c" }) };
    applyStoredAppearance();
    try {
      render(<TimetablePage />);
      const keys = [...document.querySelectorAll("[data-tt-cell]")].map((e) => e.getAttribute("data-tt-cell"));
      expect(new Set(keys).size).toBe(keys.length);
      // V-22: below the paper-grid width layout ค shows today once — in the day list that opens on today (no "today:" copy)
      const todayCell = document.querySelector('.ttc [data-tt-cell].ttd-cell') as HTMLElement;
      expect(todayCell).toBeTruthy();
      todayCell.focus();
      fireEvent.click(todayCell);
      // a free cell opens the add sheet; a filled one the menu — either way Esc brings focus back to the tapped element
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(document.activeElement).toBe(todayCell));
    } finally { localStorage.removeItem(TIMETABLE_KEY); resetAppearanceForTests(); }
  });
  it("R-18: ScrollArea observes cards added after mount and shows the cue", async () => {
    const { ScrollArea } = await import("@client/components/home/a/ScrollArea");
    const observed = new Set<Element>();
    let disconnected = 0;
    vi.stubGlobal("ResizeObserver", class { observe(e: Element) { observed.add(e); } unobserve(e: Element) { observed.delete(e); } disconnect() { disconnected++; } });
    try {
      const { container, unmount } = render(<ScrollArea wrap="w" class="c" label="การ์ด"><p>a</p></ScrollArea>);
      const box = container.querySelector(".c") as HTMLElement;
      expect(container.querySelector(".hma-more")).toBeNull();
      expect(observed.size).toBe(2);
      Object.defineProperty(box, "scrollHeight", { configurable: true, value: 500 });
      Object.defineProperty(box, "clientHeight", { configurable: true, value: 100 });
      box.appendChild(document.createElement("p"));
      await waitFor(() => expect(container.querySelector(".hma-more")).toBeTruthy());
      expect(observed.size).toBe(3);
      unmount();
      expect(disconnected).toBeGreaterThan(0);
    } finally { vi.unstubAllGlobals(); }
  });
  it("R-16: Esc on the time sheet returns focus to the button that opened it", () => {
    render(<TimetablePage />);
    const opener = screen.getByRole("button", { name: /ตั้งเวลาคาบ/ });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it("clear asks first; ไม่ changes nothing", () => {
    render(<TimetablePage />);
    fireEvent.click(screen.getByRole("button", { name: "เมนูเพิ่มเติมของตารางสอน" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ล้างตารางภาคนี้/ }));
    expect(screen.getByText("ลบทั้ง 14 คาบของภาค 2/2569? โครงเวลาไม่เปลี่ยน")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ไม่" }));
    expect(put).not.toHaveBeenCalled();
  });
  it("V-04: Esc on the clear confirm returns focus to the ⋯ button", () => {
    render(<TimetablePage />);
    const more = screen.getByRole("button", { name: "เมนูเพิ่มเติมของตารางสอน" });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("menuitem", { name: /ล้างตารางภาคนี้/ }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(more);
  });
  it("opens the time sheet from the header", () => {
    render(<TimetablePage />);
    fireEvent.click(screen.getByRole("button", { name: /ตั้งเวลาคาบ/ }));
    expect(screen.getByRole("dialog", { name: "ตั้งเวลาคาบ" })).toBeTruthy();
  });
});

describe("VF-F3 (D56): unreadable stored frame", () => {
  it("shows the notice with a button that opens the time sheet; a good frame shows none", () => {
    const { unmount } = render(<TimetablePage />);
    expect(document.querySelector('[data-tt-state="frame-broken"]')).toBeNull();
    unmount();
    settings.value = { ...base(), period_frame: "{bad" };
    render(<TimetablePage />);
    const bar = document.querySelector('[data-tt-state="frame-broken"]') as HTMLElement;
    expect(bar.textContent).toContain("โครงเวลาที่บันทึกไว้อ่านไม่ได้ — ตั้งเวลาคาบใหม่");
    fireEvent.click(within(bar).getByRole("button", { name: "ตั้งเวลาคาบ" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
