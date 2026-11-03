import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Student } from "@shared/types";

// ui-redesign round 2 (attendance page): five status buttons, a confirmed "all present", page cards, period links.
const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { classes, students, settings, subjects } from "@client/store";
import { AttendancePage } from "@client/pages/Attendance";
import { route } from "@client/router";
import { draftAll, draftUpdate } from "@client/lib/idb";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";

const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: "น้อง" + n,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const baseSettings = (over: Record<string, string> = {}) => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", ...over,
}) as never;

let rows: { student_id: string; status: string; updated_at: number }[] = [];

beforeEach(async () => {
  for (const d of await draftAll()) await draftUpdate(d.key, () => null); // drafts live in the (fake) device storage between tests
  get.mockReset(); post.mockReset();
  rows = [];
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days: [] } : { rows }));
  post.mockImplementation(() => new Promise(() => {})); // nothing reaches the server in these tests
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  subjects.value = [{ id: "sub1", name: "คณิตศาสตร์", color: "blue" } as never];
  settings.value = baseSettings();
});

/** taps are ignored until the page knows what the server holds: wait for that */
const loaded = () => waitFor(() => expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(false));
const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;

describe("attendance page", () => {
  it("shows the five status buttons, each with a word, and four tiles that start unchecked", async () => {
    render(h(AttendancePage, {}));
    for (const w of ["มา", "สาย", "ลา", "ป่วย", "ขาด"]) expect(screen.getByRole("button", { name: w })).toBeTruthy();
    await waitFor(() => expect(tile(1)).toBeTruthy());
    expect(tile(1).textContent).toContain("แตะเพื่อเช็ค");
    expect(screen.getByRole("button", { name: "มา" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("a tap puts the chosen status on the child (default มา, then ขาด)", async () => {
    render(h(AttendancePage, {}));
    await loaded();
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ขาด" })); });
    await act(async () => { fireEvent.click(tile(2)); });
    await waitFor(() => expect(tile(2).getAttribute("aria-label")).toContain("ขาด"));
    expect(tile(3).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
  });

  it("'มาทั้งห้อง' asks first, and only fills the children not checked yet", async () => {
    rows = [{ student_id: "s1", status: "absent", updated_at: 1 }];
    render(h(AttendancePage, {}));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ขาด"));
    const all = await screen.findByRole("button", { name: /มาทั้งห้อง/ });
    await waitFor(() => expect((all as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(all); });
    expect(screen.getByText(/ให้ “มา” 3 คนที่ยังไม่เช็ค/)).toBeTruthy();
    expect(tile(2).getAttribute("aria-label")).toContain("ยังไม่เช็ค");   // nothing changed before the answer
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ให้ “มา”" })); });
    await waitFor(() => expect(tile(2).getAttribute("aria-label")).toContain("มา"));
    expect(tile(4).getAttribute("aria-label")).toContain("มา");
    expect(tile(1).getAttribute("aria-label")).toContain("ขาด");              // already checked: kept
  });

  it("the summary card is on by default and disappears when the teacher turns it off", async () => {
    const { unmount } = render(h(AttendancePage, {}));
    expect(await screen.findByText(/มาเรียน \d+ จาก 4 คน/)).toBeTruthy();
    unmount();
    settings.value = baseSettings({ attendance_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("attendance"), "sum")) });
    render(h(AttendancePage, {}));
    await waitFor(() => expect(tile(1)).toBeTruthy());
    expect(screen.queryByText(/มาเรียน \d+ จาก 4 คน/)).toBeNull();
  });

  it("the 'who is not checked yet' card is off by default and lists the unchecked numbers when on", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 1 }];
    const { unmount } = render(h(AttendancePage, {}));
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    expect(screen.queryByText(/ใครยังไม่เช็ค/)).toBeNull();
    unmount();
    settings.value = baseSettings({ attendance_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("attendance"), "todo")) });
    render(h(AttendancePage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("ใครยังไม่เช็ค 3 คน"));
  });

  it("a link with date, subject and period opens that period (1–8 are offered)", async () => {
    route.value = "/attendance?date=2026-11-03&subject=sub1&period=8";
    render(h(AttendancePage, {}));
    const p8 = await screen.findByRole("button", { name: "คาบ 8" });
    expect(p8.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(get.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/attendance?"))).toEqual([expect.stringMatching(/date=2026-11-03.*class=c1.*subject=sub1.*period=8/)]));
  });

  it("the card drawer opens from the header and says what cannot be turned off", async () => {
    render(h(AttendancePage, {}));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับการ์ด" })); });
    expect(screen.getByText(/ปิดไม่ได้ \(เพื่อกันข้อมูลหาย\)/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "แสดงการ์ด สรุปวันนี้" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "แสดงการ์ด ใครยังไม่เช็ค" }).getAttribute("aria-checked")).toBe("false");
  });
});
