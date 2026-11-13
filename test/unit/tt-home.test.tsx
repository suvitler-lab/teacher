// T-18: the timetable on the home page — the strip under the header of every layout (AC-18..27, 53, 57, 64), the period rows of layout ก only
// (AC-54, 55), the on/off switch per layout in "ปรับหน้าหลัก" (AC-56, D53) and the minute tick (AC-23). Fixture F-T1, Bangkok clock pinned by setClock.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => null }));

import { Home } from "@client/pages/Home";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms } from "@client/store";
import { dashboard } from "@client/lib/dashboard";
import { setHideNames } from "@client/lib/homePrefs";
import { saveAppearance, resetAppearanceForTests } from "@client/lib/appearance";
import { setClock, tickNow } from "@client/lib/timetable/clock";
import { setTable, ttResetAll } from "@client/lib/timetable/state";
import { CLASSES, F_T1, SUBJECTS, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { route } from "@client/router";
import type { DashboardPayload, Settings } from "@shared/types";
import { kid } from "./m1-05-fixture";

const TODAY = "2026-11-11";
const bkk = (iso: string) => Date.parse(`${iso}+07:00`);
const WED_0950 = bkk("2026-11-11T09:50:00");
const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(WED_0950 - 2 * 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});
const payload = (): DashboardPayload => ({
  date: TODAY, termId: "t1", gradingAssignments: [], awaitingCount: 0, missingCount: 0, serverTime: 0, openAssignments: [],
  attendanceToday: CLASSES.map((c) => ({ date: TODAY, classId: c.id, present: 0, late: 0, leave: 0, sick: 0, absent: 0, marked: 0, total: 5 })),
  followUp: [], dueSoon: [], absentToday: [],
});
const load = (slots = F_T1) => setTable({ termId: "t1", rev: 1, readOnly: false, slots, confirmed: slots, pending: 0, loadedAt: WED_0950, source: "server" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  put.mockResolvedValue({ ok: true });
  get.mockImplementation(async () => payload());
  terms.value = [{ ...TERM_2_2569, id: "t1", is_current: true }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = CLASSES.map((c) => ({ ...c, grade: "ป.6", sort: 1 }));
  subjects.value = SUBJECTS;
  students.value = CLASSES.flatMap((c) => [0, 1, 2, 3, 4].map((n) => ({ ...kid(n), id: `${c.id}-${n}`, class_id: c.id })));
  settings.value = base();
  dashboard.value = null;
  setHideNames(false);
  resetAppearanceForTests();
  ttResetAll();
  load();
  setClock(WED_0950);
});
afterEach(() => { cleanup(); setClock(null); ttResetAll(); location.hash = ""; });

async function open(layout: "a" | "b" | "c", home_cards?: string) {
  await act(async () => { await saveAppearance({ layout }, { silent: true }); });
  if (home_cards !== undefined) settings.value = base({ home_cards });
  put.mockClear(); // saving the layout above is not what the tests count
  const r = render(<Home />);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(r.container.querySelector(layout === "a" ? ".hma-big" : layout === "b" ? ".hmb-panels" : ".hmc-grid")).not.toBeNull());
  return r;
}
const strip = (c: Element) => c.querySelector<HTMLElement>("[data-tt-strip]");
const rows = (c: Element) => [...c.querySelectorAll<HTMLElement>("[data-tt-row]")];
const off = (layout: "a" | "b" | "c") => JSON.stringify({ [layout]: { order: ["timetable"], hidden: ["timetable"] } });

describe("the strip under the header (AC-53, AC-57, AC-64)", () => {
  it.each(["a", "b", "c"] as const)("layout %s: cells 1-7 + the break, now / next lines and the one attendance button", async (l) => {
    const { container } = await open(l);
    const s = strip(container)!;
    expect(s).not.toBeNull();
    const cells = [...s.querySelectorAll("li.hmt-cell")];
    expect(cells).toHaveLength(8); // 7 periods + the lunch break between 3 and 4
    expect(cells[3].classList.contains("break")).toBe(true);
    expect(cells[0].textContent).toContain("ผ่านแล้ว"); // a word, not only a faded colour
    expect(cells[1].textContent).toContain("ตอนนี้");
    expect(cells[1].textContent).toContain("ป.6/4");
    expect(cells[1].getAttribute("aria-current")).toBe("time");
    expect(s.querySelector('[data-line="now"]')!.textContent).toBe("ตอนนี้คาบ 2 · ถึง 10:30 · คณิตศาสตร์ ป.6/4");
    expect(s.querySelector('[data-line="next"]')!.textContent).toContain("คาบ 4 · 12:30 · คณิตศาสตร์ ป.6/3");
    expect(within(s).getByRole("button", { name: "เช็คชื่อ ป.6/4" })).toBeTruthy(); // the room being taught, not ป.6/3
    expect(within(s).getByRole("button", { name: "สแกนงาน" })).toBeTruthy();
    expect(within(s).getByRole("button", { name: /ดูทั้งสัปดาห์/ })).toBeTruthy();
    expect(s.querySelector('[role="status"][aria-live="polite"]')!.textContent).toContain("ตอนนี้ คาบ 2");
  });

  it("the buttons only open the pages: #/attendance?class= and #/scan?class= (AC-27)", async () => {
    const { container } = await open("b");
    fireEvent.click(within(strip(container)!).getByRole("button", { name: "เช็คชื่อ ป.6/4" }));
    expect(location.hash).toBe("#/attendance?class=c4");
    fireEvent.click(within(strip(container)!).getByRole("button", { name: "สแกนงาน" }));
    expect(location.hash).toBe("#/scan?class=c4");
    expect(put).not.toHaveBeenCalled();
  });

  it("AC-18: free period 10:45 -> no now line, next = period 4 and the button says (คาบต่อไป)", async () => {
    setClock(bkk("2026-11-11T10:45:00"));
    const { container } = await open("a");
    const s = strip(container)!;
    expect(s.querySelector('[data-line="now"]')).toBeNull();
    expect(within(s).getByRole("button", { name: "เช็คชื่อ ป.6/3 (คาบต่อไป)" })).toBeTruthy();
  });

  it("AC-20 / N3: Monday 15:40 (PLC now) -> no attendance and no scan button, the next line is text only", async () => {
    setClock(bkk("2026-11-16T15:40:00"));
    const { container } = await open("a");
    const s = strip(container)!;
    expect(s.querySelector('[data-line="now"]')!.textContent).toContain("PLC กลุ่มสาระ");
    expect(s.querySelector('[data-line="next"]')!.textContent).toContain("พรุ่งนี้ (อังคาร)");
    expect(within(s).queryByRole("button", { name: /เช็คชื่อ|สแกนงาน/ })).toBeNull();
    expect(within(s).getByRole("button", { name: /ดูทั้งสัปดาห์/ })).toBeTruthy();
  });

  it("AC-25: an archived room is skipped (no button for ป.6/3 at 10:45)", async () => {
    setClock(bkk("2026-11-11T10:45:00"));
    classes.value = classes.value.map((c) => (c.id === "c3" ? { ...c, archived: true } : c));
    const { container } = await open("c");
    expect(within(strip(container)!).queryByRole("button", { name: /เช็คชื่อ/ })).toBeNull();
  });

  it("AC-24: an empty table shows no strip and no rows; so does a term with no table", async () => {
    ttResetAll(); load([]);
    const first = await open("a");
    expect(strip(first.container)).toBeNull();
    expect(rows(first.container)).toHaveLength(0);
    first.unmount();
    ttResetAll();
    const second = await open("a");
    expect(strip(second.container)).toBeNull();
  });

  it("AC-23: the minute tick moves 'now' by itself, no reload", async () => {
    const { container } = await open("a");
    expect(rows(container)).toHaveLength(2);
    setClock(bkk("2026-11-11T10:31:00")); // period 2 is over; tickNow is what the 60 s timer calls
    await act(async () => { tickNow(); });
    const s = strip(container)!;
    expect(s.querySelector('[data-line="now"]')).toBeNull();
    expect(within(s).getByRole("button", { name: "เช็คชื่อ ป.6/3 (คาบต่อไป)" })).toBeTruthy();
    expect(rows(container)).toHaveLength(1);
  });
});

describe("period rows of ลำดับงานวันนี้ — layout ก only (AC-54, 55, 57, 64)", () => {
  it("ก: 2 rows (period 2 now, period 4) with the from-timetable label, the button only on the room taught, current row first", async () => {
    const { container } = await open("a");
    const r = rows(container);
    expect(r).toHaveLength(2);
    expect(r[0].textContent).toContain("คาบ 2 · คณิตศาสตร์ ป.6/4");
    expect(r[0].textContent).toContain("กำลังสอน · ถึง 10:30");
    expect(r[1].textContent).toContain("12:30–13:30");
    r.forEach((x) => expect(x.textContent).toContain("จากตารางสอน"));
    expect(within(r[0]).getByRole("button", { name: "เช็คชื่อ ป.6/4" })).toBeTruthy();
    expect(within(r[1]).queryByRole("button")).toBeNull();
    expect(container.querySelector(".hma-tl")!.firstElementChild).toBe(r[0]); // current -> old work rows -> the rest
    expect(r.some((x) => /เสร็จ/.test(x.textContent ?? ""))).toBe(false); // no done / tick on a period row
  });

  it.each(["b", "c"] as const)("%s: no period row anywhere (0 rows)", async (l) => {
    const { container } = await open(l);
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).not.toContain("จากตารางสอน");
  });

  it("Friday 08:00: five rows; later with 2 left and 3 finished -> one folded line for the finished ones", async () => {
    setClock(bkk("2026-11-13T08:00:00"));
    const { container } = await open("a");
    expect(rows(container)).toHaveLength(5); // periods 3 4 5 6 7
    setClock(bkk("2026-11-13T14:35:00"));
    await act(async () => { tickNow(); });
    expect(rows(container)).toHaveLength(2);
    const fold = container.querySelector<HTMLElement>("[data-kind=ttPast] button")!;
    expect(fold.textContent).toContain("คาบที่ผ่านแล้ว 3 คาบ");
    fireEvent.click(fold);
    expect(container.querySelector(".hmt-pastl")!.textContent).toContain("คาบ 5");
  });

  it("an archived room has no row (AC-55)", async () => {
    classes.value = classes.value.map((c) => (c.id === "c3" ? { ...c, archived: true } : c));
    const { container } = await open("a");
    expect(rows(container)).toHaveLength(1);
  });
});

describe("switch per layout in ปรับหน้าหลัก (AC-56, D53)", () => {
  it("off in ก: the strip is gone, the rows stay; ข still shows its strip", async () => {
    const first = await open("a", off("a"));
    expect(strip(first.container)).toBeNull();
    expect(rows(first.container)).toHaveLength(2);
    first.unmount();
    const b = await open("b", off("a"));
    expect(strip(b.container)).not.toBeNull();
  });

  it("off in ค: no timetable anywhere on the page (AC-57)", async () => {
    const { container } = await open("c", off("c"));
    expect(strip(container)).toBeNull();
    expect(rows(container)).toHaveLength(0);
  });

  it("the panel has a switch for the strip with no arrows, the other cards keep theirs, and a toggle saves into that layout's field", async () => {
    await open("b");
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: /^ปรับหน้าหลัก · โครง ข/ });
    const prefs = [...dlg.querySelectorAll<HTMLElement>(".hm-pref")];
    expect(prefs[0].dataset.card).toBe("timetable"); // fixed place: first, always
    expect(prefs[0].querySelectorAll("button.icon")).toHaveLength(0);
    expect(prefs[1].querySelectorAll("button.icon")).toHaveLength(2);
    fireEvent.click(within(dlg).getByRole("switch", { name: /แสดงการ์ด ตารางสอน/ }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(JSON.parse(put.mock.calls[0][1].home_cards).b.hidden).toContain("timetable");
  });

  it("an arrow on the first movable card does not swap it with the fixed strip", async () => {
    await open("b");
    fireEvent.click(screen.getByRole("button", { name: "ปรับหน้าหลัก" }));
    const dlg = await screen.findByRole("dialog", { name: /^ปรับหน้าหลัก · โครง ข/ });
    fireEvent.click(within(dlg).getByRole("button", { name: "เลื่อน ต้องติดตาม ขึ้น" }));
    expect(put).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole("button", { name: "เลื่อน ต้องติดตาม ลง" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(JSON.parse(put.mock.calls[0][1].home_cards).b.order).toEqual(["timetable", "absent", "follow"]);
  });

  it("an old account (saved list without the card) gets the strip on", async () => {
    const { container } = await open("a", JSON.stringify({ a: { order: ["open", "follow", "absent", "due", "classes"], hidden: ["classes"] } }));
    expect(strip(container)).not.toBeNull();
  });

  it("#/?customize=1 (the link from ตั้งค่า > หน้าตา) opens the panel and takes the flag off the address", async () => {
    route.value = "/?customize=1";
    await open("a");
    await screen.findByRole("dialog", { name: /^ปรับหน้าหลัก · โครง ก/ });
    await waitFor(() => expect(route.value).toBe("/"));
  });
});
