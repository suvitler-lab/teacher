// ui-redesign round 4 (attendance): the page matches the design — taps never feel dead, cards follow the saved order,
// scan messages are in the words of the design, a period without a start time is flagged.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/preact";
import type { Student } from "@shared/types";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { classes, students, settings, subjects } from "@client/store";
import { AttendancePage } from "@client/pages/Attendance";
import { Toasts } from "@client/components/Overlays";
import { toasts } from "@client/lib/notify";
import { route } from "@client/router";
import { draftAll, draftUpdate } from "@client/lib/idb";
import { stopAttSync } from "@client/lib/attSync";
import { defaultPageLayout } from "@client/lib/pageCards";
import { moveLayoutCard, serializeLayout, toggleLayoutCard, type CardLayout } from "@client/lib/cardLayout";
import { projectorOn } from "@client/lib/projector";

const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: "น้อง" + n,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const baseSettings = (over: Record<string, string> = {}) => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
}) as never;

let rows: { student_id: string; status: string; updated_at: number }[] = [];
const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;

beforeEach(async () => {
  cleanup();
  stopAttSync();
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
  get.mockReset(); post.mockReset(); rows = []; toasts.value = []; projectorOn.value = false;
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days: [] } : { rows }));
  post.mockImplementation(() => new Promise(() => {}));
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  subjects.value = [{ id: "sub1", name: "คณิตศาสตร์", color: "blue" } as never];
  settings.value = baseSettings();
});

describe("a tap is never dead", () => {
  it("while the system is slow to answer the children can be tapped after a moment, and the page says why it is waiting", async () => {
    get.mockImplementation((path: string) => (path.startsWith("/api/attendance/days") ? Promise.resolve({ days: [] }) : new Promise(() => {}))); // never answers
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await waitFor(() => expect(tile(1)).toBeTruthy());
    // at first a tap explains instead of doing nothing
    await act(async () => { fireEvent.click(tile(1)); });
    expect(await screen.findByText(/กำลังโหลดรายชื่อ — รอสักครู่/)).toBeTruthy();
    expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
    // a few seconds on, the room is usable: the tap lands and the note says the network is slow
    await waitFor(() => expect(screen.getByText(/เน็ตช้า/)).toBeTruthy(), { timeout: 4500 });
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    // "all present" waits for the system's answer (it would clash with what the system holds)
    expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(true);
  }, 12000);

  it("tapping a child who already has the selected status rings the tile and takes the mark back, saying so", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }];
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); });
    expect(tile(1).className).toContain("hit");
    expect(await screen.findByText(/ยกเลิกการเช็คของ/)).toBeTruthy();
    expect(tile(1).className).not.toContain("present");
  });

  it("many quick taps, with the answers coming back in between, all stay on screen", async () => {
    post.mockImplementation(async (_p: string, body: { rows: { studentId: string; status: string }[] }) => {
      await new Promise((r) => setTimeout(r, 30));
      const at = Date.now();
      return { updatedAt: at, rows: Object.fromEntries(body.rows.map((r) => [r.studentId, at])), state: Object.fromEntries(body.rows.map((r) => [r.studentId, { status: r.status, updatedAt: at }])) };
    });
    render(h(AttendancePage, {}));
    await waitFor(() => expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(false));
    for (const n of [1, 2, 3, 4]) {
      await act(async () => { fireEvent.click(tile(n)); });
      await act(async () => { await new Promise((r) => setTimeout(r, n % 2 ? 700 : 20)); }); // some taps land while a send is in flight
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    for (const n of [1, 2, 3, 4]) expect(tile(n).getAttribute("aria-label")).toContain("มา");
    expect(post).toHaveBeenCalled();
  }, 15000);
});

describe("the five status buttons", () => {
  it("are one radio group, move with the arrow keys, and stay on screen in scan mode (a hidden brush would still colour taps)", async () => {
    render(h(AttendancePage, {}));
    const radios = () => screen.getAllByRole("radio");
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false", "false"]);
    await act(async () => { fireEvent.keyDown(radios()[0], { key: "ArrowRight" }); });
    expect(radios()[1].getAttribute("aria-checked")).toBe("true");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สแกน QR/ })); });
    expect(screen.getAllByRole("radio").length).toBe(5);
  });
});

describe("cards follow the order saved in 'ปรับการ์ด'", () => {
  it("the cards beside the children (to do / away) are drawn in the saved order", async () => {
    let l = defaultPageLayout("attendance") as never as CardLayout<string>;
    l = toggleLayoutCard(toggleLayoutCard(l, "todo"), "away");
    // default order: ... todo, away
    settings.value = baseSettings({ attendance_cards: serializeLayout(l) });
    const first = render(h(AttendancePage, {}));
    await waitFor(() => expect(document.getElementById("att-todo-h")).toBeTruthy());
    const pos = (a: string, b: string) => document.getElementById(a)!.compareDocumentPosition(document.getElementById(b)!) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(pos("att-todo-h", "att-away-h")).toBeTruthy();
    first.unmount();
    // move "away" above "todo" (and "scans")
    let moved = l;
    for (let i = 0; i < 3; i++) moved = moveLayoutCard(moved, "away", -1);
    settings.value = baseSettings({ attendance_cards: serializeLayout(moved) });
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.getElementById("att-away-h")).toBeTruthy());
    expect(pos("att-away-h", "att-todo-h")).toBeTruthy();
  });

  it("the summary and the week strip swap places when moved", async () => {
    const l0 = defaultPageLayout("attendance") as never as CardLayout<string>; // default order: sum, week, ...
    const heads = () => [document.getElementById("att-sum-h")!, document.querySelector(".att-week")!];
    const first = render(h(AttendancePage, {}));
    await waitFor(() => expect(document.getElementById("att-sum-h")).toBeTruthy());
    const [sumA, weekA] = heads();
    expect(sumA.compareDocumentPosition(weekA) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // sum is listed first by default
    first.unmount();
    settings.value = baseSettings({ attendance_cards: serializeLayout(moveLayoutCard(l0, "week", -1)) });
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.getElementById("att-sum-h")).toBeTruthy());
    const [sumB, weekB] = heads();
    expect(weekB.compareDocumentPosition(sumB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // week first
  });
});

describe("scan messages", () => {
  const scanTab = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สแกน QR/ })); }); };
  const type = async (v: string) => {
    const input = screen.getByLabelText("รหัสนักเรียน") as HTMLInputElement;
    await act(async () => { input.value = v; fireEvent.keyDown(input, { key: "Enter" }); });
  };

  it("a number that is not in the room says so with the room's name", async () => {
    render(h(AttendancePage, {}));
    await scanTab();
    await type("99");
    expect(await screen.findByText("ไม่มีเลขที่ 99 ใน ป.6/1")).toBeTruthy();
  });

  it("an unknown card says what to do; a good scan says who and when", async () => {
    render(h(AttendancePage, {}));
    await scanTab();
    await type("Q-NOPE");
    expect(await screen.findByText(/ไม่รู้จักรหัส Q-NOPE — ตรวจบัตรหรือพิมพ์เลขที่/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(false));
    await type("2");
    expect(await screen.findByText(/^น้อง2 · (มา|สาย) \d{2}:\d{2}$/)).toBeTruthy();
    expect(tile(2).getAttribute("aria-label")).toMatch(/มา|สาย/);
  });

  it("the scan box has the focus when the scan mode opens", async () => {
    render(h(AttendancePage, {}));
    await scanTab();
    expect(document.activeElement).toBe(screen.getByLabelText("รหัสนักเรียน"));
  });
});

describe("by period", () => {
  it("a period with no start time is flagged for good, with the way to set it", async () => {
    route.value = "/attendance?date=2026-11-03&subject=sub1&period=2";
    settings.value = baseSettings({ period_times: JSON.stringify({ 1: "08:30" }) });
    render(h(AttendancePage, {}));
    expect(await screen.findByText(/คาบ 2 ยังไม่ได้ตั้งเวลาเริ่ม/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /ตั้งเวลาคาบ/ })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "คาบ 1" })); });
    await waitFor(() => expect(screen.queryByText(/ยังไม่ได้ตั้งเวลาเริ่ม/)).toBeNull());
    expect(screen.getByText(/คาบ 1 เริ่ม 08:30/)).toBeTruthy();
  });

  it("the period is picked with the pills only (no second drop-down for it)", async () => {
    route.value = "/attendance?date=2026-11-03&subject=sub1&period=2";
    render(h(AttendancePage, {}));
    await screen.findByRole("button", { name: "คาบ 2" });
    expect(screen.queryByLabelText("คาบเรียน")).toBeNull();
  });
});

describe("the save bar", () => {
  it("only the save state is read out; the running count is plain text", async () => {
    render(h(AttendancePage, {}));
    await waitFor(() => expect(screen.getByText(/เช็คแล้ว 0\/4/)).toBeTruthy());
    const live = document.querySelector(".att-savebar [role=status]")!;
    expect(live.textContent).not.toMatch(/เช็คแล้ว/);
    expect(live.closest(".att-savebar")!.textContent).toMatch(/เช็คแล้ว 0\/4/);
  });
});
