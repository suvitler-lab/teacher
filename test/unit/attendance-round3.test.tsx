// ui-redesign round 3 (attendance): "มาทั้งห้อง" can be taken back for a few seconds, a tap on the "who is not checked yet"
// card marks the tile it scrolls to, and the TV mode never shows absent / leave / sick.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/preact";
import type { Student } from "@shared/types";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { classes, students, settings } from "@client/store";
import { AttendancePage } from "@client/pages/Attendance";
import { Toasts } from "@client/components/Overlays";
import { toasts } from "@client/lib/notify";
import { route } from "@client/router";
import { draftAll, draftUpdate } from "@client/lib/idb";
import { flushDraft } from "@client/lib/attSync";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";
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

beforeEach(async () => {
  cleanup();
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
  get.mockReset(); post.mockReset(); rows = []; toasts.value = []; projectorOn.value = false;
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days: [] } : { rows }));
  post.mockImplementation(() => new Promise(() => {})); // nothing reaches the server
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  settings.value = baseSettings();
});

const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;
const allButton = () => screen.findByRole("button", { name: /มาทั้งห้อง/ });
async function markAll() {
  const all = await allButton();
  await waitFor(() => expect((all as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(all); });
  const dlg = await screen.findByRole("alertdialog");
  await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: /^มาทั้งห้อง \d+ คน$/ })); });
  await waitFor(() => expect(tile(2).getAttribute("aria-label")).toContain("มา"));
}

describe("undo for 'มาทั้งห้อง'", () => {
  it("offers เลิกทำ, and taking it back leaves the children unchecked and sends nothing", async () => {
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await markAll();
    const undo = await screen.findByRole("button", { name: "เลิกทำ" });
    await act(async () => { fireEvent.click(undo); });
    await waitFor(() => expect(tile(2).getAttribute("aria-label")).toContain("ยังไม่เช็ค"));
    expect(tile(4).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
    expect(screen.getByText(/เลิกทำแล้ว · 4 คนกลับเป็นยังไม่เช็ค/)).toBeTruthy();
    expect(await draftAll()).toEqual([]); // nothing left waiting to be sent
    expect(post).not.toHaveBeenCalled();
  });

  it("the send is held back, so nothing reaches the server in the first seconds", async () => {
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await markAll();
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    expect(post).not.toHaveBeenCalled();
    expect((await draftAll())[0]?.rows ? Object.keys((await draftAll())[0].rows).length : 0).toBe(4);
  });

  it("once the send has started, it says so instead of pretending to undo", async () => {
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await markAll();
    const undo = await screen.findByRole("button", { name: "เลิกทำ" });
    const [d] = await draftAll();
    void flushDraft(d.key, { manual: true }); // the send is under way (the server never answers in this test)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => { fireEvent.click(undo); });
    expect(await screen.findByText(/เลิกทำไม่ได้แล้ว/)).toBeTruthy();
    expect(tile(2).getAttribute("aria-label")).toContain("มา");
  });
});

describe("a second tap on the selected status takes the mark back", () => {
  it("tapping a child who already has the selected status clears the mark and says so (details: attendance-round5)", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }];
    render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); });
    expect(await screen.findByText(/ยกเลิกการเช็คของ/)).toBeTruthy();
    expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
  });
});

describe("who is not checked yet", () => {
  it("a tap on a number marks the tile it points to", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }];
    settings.value = baseSettings({ attendance_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("attendance"), "todo")) });
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("ใครยังไม่เช็ค 3 คน"));
    const chip = screen.getByRole("button", { name: /^ไปที่เลขที่ 3 / });
    expect(tile(3).className).not.toContain("hit");
    await act(async () => { fireEvent.click(chip); });
    expect(tile(3).className).toContain("hit");
  });
});

describe("TV mode: names", () => {
  it("shows the last child by name; the 'hide names' switch shows the number instead", async () => {
    const { setPjHideNames } = await import("@client/lib/projector");
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }];
    projectorOn.value = true; setPjHideNames(false);
    const first = render(<AttendancePage />);
    const pj = await waitFor(() => { const e = document.querySelector(".pj"); expect(e).toBeTruthy(); return e as HTMLElement; });
    await waitFor(() => expect(pj.textContent).toMatch(/น้อง.+มาแล้ว/));
    first.unmount(); setPjHideNames(true);
    render(<AttendancePage />);
    const pj2 = await waitFor(() => { const e = document.querySelector(".pj"); expect(e).toBeTruthy(); return e as HTMLElement; });
    await waitFor(() => expect(pj2.textContent).toContain("เลขที่ 1"));
    expect(pj2.textContent).not.toMatch(/เด็ก1|น้อง1/);
    setPjHideNames(false);
  });
});

describe("TV mode", () => {
  it("shows who has come, never who is absent, on leave or sick", async () => {
    rows = [
      { student_id: "s1", status: "present", updated_at: 1 }, { student_id: "s2", status: "absent", updated_at: 1 },
      { student_id: "s3", status: "sick", updated_at: 1 }, { student_id: "s4", status: "leave", updated_at: 1 },
    ];
    projectorOn.value = true;
    render(h(AttendancePage, {}));
    const pj = await waitFor(() => { const e = document.querySelector(".pj"); expect(e).toBeTruthy(); return e as HTMLElement; });
    await waitFor(() => expect(pj.textContent).toContain("มาแล้ว 1 จาก 4 คน"));
    expect(pj.textContent).not.toMatch(/ขาด|ป่วย|ลา\b/);
  });
});
