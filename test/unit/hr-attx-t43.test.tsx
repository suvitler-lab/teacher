import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Student } from "@shared/types";

// T-43 (home-redesign): hide names (AC-101), random link (AC-102), empty room (AC-99), month switch (AC-103), grid keys (AC-105), default cards (AC-90/91)
const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { classes, students, settings } from "@client/store";
import { Toasts } from "@client/components/Overlays";
import { toasts } from "@client/lib/notify";
import { AttendancePage } from "@client/pages/Attendance";
import { route } from "@client/router";
import { draftAll, draftUpdate } from "@client/lib/idb";
import { setHide, hideSignal } from "@client/lib/hideNames";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";
import { defaultPageLayout } from "@client/lib/pageCards";
import { stopAttSync } from "@client/lib/attSync";
import { online } from "@client/lib/outbox";
import { serverReachable, authRequired } from "@client/lib/session";

const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: "น้อง" + n,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
let rows: { student_id: string; status: string; updated_at: number }[] = [];
let days: unknown[] = [];

beforeEach(async () => {
  stopAttSync(); authRequired.value = false; online.value = true; serverReachable.value = true;
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
  get.mockReset(); post.mockReset(); rows = []; days = [];
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days } : { rows }));
  post.mockImplementation(() => new Promise(() => {}));
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  settings.value = { school_name: "", late_after: "08:30", theme: "light", sound_enabled: false, accept_student_code_scan: false, onboarding_done: true, period_times: "{}",
    home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "" } as never;
});
const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;
const ready = () => waitFor(() => expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(false));


beforeEach(() => { setHide("attendance", false); toasts.value = []; });
const allDone = () => [1, 2, 3, 4].map((n) => ({ student_id: "s" + n, status: n === 4 ? "absent" : n === 3 ? "late" : "present", updated_at: 1 }));

describe("hide names (AC-101)", () => {
  it("the page own switch: banner, number-only tiles, no name in title / aria-label, copy off, home value untouched", async () => {
    rows = allDone();
    render(h(AttendancePage, {}));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    expect(tile(1).getAttribute("title")).toContain("เด็ก1");
    const btn = screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { fireEvent.click(btn); });
    expect(screen.getByRole("button", { name: /ซ่อนชื่ออยู่/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("ซ่อนชื่อนักเรียนอยู่ · ทุกจุดแสดงเฉพาะเลขที่")).toBeTruthy();
    expect(tile(1).getAttribute("aria-label")).toBe("เลขที่ 1 มา");
    expect(tile(1).getAttribute("title")).toBe("เลขที่ 1");
    expect(tile(1).textContent).not.toContain("น้อง");
    // nothing on the page (text, title, aria-label) carries a name
    const all = Array.from(document.querySelectorAll("*")).flatMap((e) => [e.getAttribute("title"), e.getAttribute("aria-label"), e.childNodes.length === 1 ? e.textContent : ""]);
    expect(all.filter((x) => x && /เด็ก\d|น้อง\d/.test(x))).toEqual([]);
    expect((screen.getByRole("button", { name: /คัดลอกรายชื่อ/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(hideSignal("home").value).toBe(false); // other pages keep their own value
  });
  it("a tap and the cancel toast say the number only", async () => {
    rows = [{ student_id: "s1", status: "absent", updated_at: 1 }];
    setHide("attendance", true);
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await ready();
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(document.querySelector(".att-live")?.textContent).toBe("เลขที่ 1 — เปลี่ยนจาก ขาด เป็น มา"));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toBe("เลขที่ 1 มา"));
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(document.body.textContent).toContain("ยกเลิกการเช็คของ เลขที่ 1 แล้ว"));
    expect(document.body.textContent).not.toMatch(/เด็ก1|น้อง1/);
  });
  it("the value is kept per device", async () => {
    setHide("attendance", true);
    expect(localStorage.getItem("ngankrob-hide-names-attendance")).toBe("1");
    expect(hideSignal("attendance").value).toBe(true);
  });
});

describe("random-name link (AC-102)", () => {
  it("shows only today + daily + complete, with the count of come + late and the note", async () => {
    rows = allDone();
    render(h(AttendancePage, {}));
    const a = await screen.findByRole("link", { name: /สุ่มชื่อเฉพาะคนที่มา \(3\)/ });
    expect(a.getAttribute("href")).toBe("#/random?class=c1");
    expect(screen.getByText("สุ่มชื่อใช้เช็คชื่อรายวันของวันนี้ — สุ่มเฉพาะคนที่มาและมาสาย")).toBeTruthy();
  });
  it("not shown when someone is unchecked or on a past day", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }];
    const { unmount } = render(h(AttendancePage, {}));
    await ready();
    expect(screen.queryByRole("link", { name: /สุ่มชื่อ/ })).toBeNull();
    unmount();
    rows = allDone(); route.value = "/attendance?date=2026-11-03";
    render(h(AttendancePage, {}));
    await screen.findByText(/กำลังดูวันที่ผ่านมา/);
    expect(screen.queryByRole("link", { name: /สุ่มชื่อ/ })).toBeNull();
  });
});

describe("empty room (AC-99)", () => {
  it("no students: message, import button to /students, the all-present button off", async () => {
    students.value = [];
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.querySelector(".att-empty")?.textContent).toContain("ห้องนี้ยังไม่มีนักเรียน"));
    expect(screen.getByText("นำเข้ารายชื่อจาก Excel หรือเพิ่มทีละคน")).toBeTruthy();
    expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /นำเข้านักเรียน/ })); });
    expect(window.location.hash).toContain("/students");
  });
});

describe("cards (AC-103, AC-90/91)", () => {
  it("todo, away and month are on from the start", async () => {
    rows = [{ student_id: "s1", status: "absent", updated_at: 1 }];
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.getElementById("att-todo-h")).toBeTruthy());
    expect(document.getElementById("att-away-h")).toBeTruthy();
    expect(document.getElementById("att-month-h")).toBeTruthy();
  });
  it("month can be hidden, and the drawer lists it with the locked parts", async () => {
    settings.value = { ...(settings.value as object), attendance_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("attendance"), "month")) } as never;
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.getElementById("att-away-h")).toBeTruthy());
    expect(document.getElementById("att-month-h")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับการ์ด" })); });
    expect(screen.getByRole("switch", { name: "แสดงการ์ด เดือนนี้" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/hero · ปุ่มสถานะ · ช่องรายชื่อ · แถบบันทึก · รายการชนกัน\/ต้องตรวจสอบ/)).toBeTruthy();
  });
});

describe("grid keyboard (AC-105)", () => {
  it("one tab stop; arrows and Home/End move between the children", async () => {
    rows = allDone();
    render(h(AttendancePage, {}));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    expect([1, 2, 3, 4].filter((n) => tile(n).tabIndex === 0)).toEqual([1]);
    tile(1).focus();
    await act(async () => { fireEvent.keyDown(tile(1), { key: "ArrowRight" }); });
    expect(document.activeElement).toBe(tile(2));
    expect(tile(2).tabIndex).toBe(0); expect(tile(1).tabIndex).toBe(-1);
    await act(async () => { fireEvent.keyDown(tile(2), { key: "End" }); });
    expect(document.activeElement).toBe(tile(4));
    await act(async () => { fireEvent.keyDown(tile(4), { key: "Home" }); });
    expect(document.activeElement).toBe(tile(1));
  });
});

describe("review round (R-4301, R-4303, R-4311)", () => {
  it("R-4301: the random button waits while a tap of this room is still on this device", async () => {
    rows = [1, 2, 3].map((n) => ({ student_id: "s" + n, status: "present", updated_at: 1 }));
    render(h(AttendancePage, {}));
    await ready();
    expect(screen.queryByRole("link", { name: /สุ่มชื่อเฉพาะคนที่มา/ })).toBeNull();
    await act(async () => { fireEvent.click(tile(4)); }); // the last child: complete on screen, but the send never answers
    await waitFor(() => expect(tile(4).getAttribute("aria-label")).toContain("มา"));
    await waitFor(() => expect(document.querySelector(".att-rand button")).toBeTruthy());
    expect((document.querySelector(".att-rand button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("link", { name: /สุ่มชื่อเฉพาะคนที่มา/ })).toBeNull();
    expect(document.querySelector(".att-rand")?.textContent).toContain("รอบันทึกขึ้นระบบให้เสร็จก่อน");
  });
  it("by period there is no random button even when everyone is checked", async () => {
    rows = allDone();
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.querySelector(".att-rand")).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "รายคาบ" })); });
    await waitFor(() => expect(screen.getByRole("group", { name: "เลือกคาบ" })).toBeTruthy());
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    expect(document.querySelector(".att-rand")).toBeNull();
  });
  it("R-4303: hiding names takes down a toast that carries a name, and clears the live line", async () => {
    rows = [{ student_id: "s1", status: "absent", updated_at: 1 }];
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await ready();
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); }); // takes the mark back: "ยกเลิกการเช็คของ เด็ก1 …"
    await waitFor(() => expect(document.body.textContent).toContain("ยกเลิกการเช็คของ เด็ก1"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" })); });
    await waitFor(() => expect(document.body.textContent).not.toContain("ยกเลิกการเช็คของ"));
    expect(document.body.textContent).not.toMatch(/เด็ก1|น้อง1/);
    expect(document.querySelector(".att-live")?.textContent).toBe("");
  });
  it("a number chip of 'ใครยังไม่เช็ค' puts the focus on that tile", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }];
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.getElementById("att-todo-h")).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ไปที่เลขที่ 3/ })); });
    expect(document.activeElement).toBe(tile(3));
  });
  it("R-4311: ArrowDown / ArrowUp jump a whole row (columns read from the grid)", async () => {
    rows = allDone();
    render(h(AttendancePage, {}));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    const spy = vi.spyOn(window, "getComputedStyle").mockReturnValue({ gridTemplateColumns: "100px 100px" } as never);
    tile(1).focus();
    await act(async () => { fireEvent.keyDown(tile(1), { key: "ArrowDown" }); });
    expect(document.activeElement).toBe(tile(3));
    await act(async () => { fireEvent.keyDown(tile(3), { key: "ArrowUp" }); });
    expect(document.activeElement).toBe(tile(1));
    spy.mockRestore();
  });
  it("the card drawer does not crash on a card its list does not know", async () => {
    settings.value = { ...(settings.value as object), attendance_cards: JSON.stringify({ v: 1, order: ["sum", "week", "month", "scans", "todo", "away"], hidden: [] }) } as never;
    render(h(AttendancePage, {}));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับการ์ด" })); });
    expect(screen.getByRole("switch", { name: "แสดงการ์ด เดือนนี้" })).toBeTruthy();
  });
});
