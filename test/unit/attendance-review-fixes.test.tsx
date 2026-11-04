// Fixes from the code review / QA of the ui-redesign branch (attendance page):
//  R-01  a slow answer from the system must not wipe what this device already saved while it was on its way
//  R-02  "มาทั้งห้อง" decides who is still unchecked AFTER the question is answered (a QR scan meanwhile is kept)
//  R-06  the clash card shows what this device holds NOW, not what it held when the clash was found
//  B-03  the room picked is kept in the address (?class=) and on this device; an explicit ?class= wins
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/preact";
import type { Student } from "@shared/types";
import { bkkToday } from "@shared/time";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { ApiError } from "@client/lib/api";
import { classes, students, settings, subjects } from "@client/store";
import { AttendancePage } from "@client/pages/Attendance";
import { Toasts } from "@client/components/Overlays";
import { toasts } from "@client/lib/notify";
import { route } from "@client/router";
import { draftAll, draftGet, draftUpdate } from "@client/lib/idb";
import { stopAttSync, draftEdit, ctxKey, type AttCtx } from "@client/lib/attSync";
import { projectorOn } from "@client/lib/projector";

const kid = (n: number, cls = "c1", id = "s" + n): Student => ({
  id, code: "10" + n, qr_token: "Q" + id, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: "น้อง" + n,
  class_id: cls, number: n, status: "active", left_at: null, updated_at: 0,
});
const baseSettings = () => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
}) as never;

const CLASS_KEY = "ngankrob-att-class";
const CTX: AttCtx = { date: bkkToday(), classId: "c1", subjectId: null, period: null };
const KEY = ctxKey(CTX);
const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;
const label = (n: number) => tile(n).getAttribute("aria-label")!;
const bodies = () => post.mock.calls.map((c) => c[1] as any);
const okReply = (body: { rows: { studentId: string; status: string }[] }) => {
  const at = Date.now();
  const none = body.rows.filter((r) => r.status === "none").map((r) => r.studentId);
  return { updatedAt: at, rows: {}, absent: none, state: Object.fromEntries(body.rows.filter((r) => r.status !== "none").map((r) => [r.studentId, { status: r.status, updatedAt: at }])) };
};
const mount = () => render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));

// the answer of GET /api/attendance, held back until the test lets it through
let lateAnswer: ((rows: unknown[]) => void) | null = null;
const holdAttendanceGet = () => {
  get.mockImplementation((path: string) => {
    if (path.startsWith("/api/attendance/days")) return Promise.resolve({ days: [] });
    return new Promise((res) => { lateAnswer = (rows) => res({ rows }); });
  });
};

beforeEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 60));
  stopAttSync();
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
  get.mockReset(); post.mockReset(); toasts.value = []; projectorOn.value = false; lateAnswer = null;
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days: [] } : { rows: [] }));
  post.mockImplementation(async (_p: string, body: any) => okReply(body));
  localStorage.clear();
  history.replaceState(null, "", "#/attendance");
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map((n) => kid(n));
  subjects.value = [{ id: "sub1", name: "คณิตศาสตร์", color: "blue" } as never];
  settings.value = baseSettings();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("R-01 · a slow answer does not wipe what was saved while it was on its way", () => {
  it("a mark that was confirmed meanwhile stays on screen, and the next tap builds on its version", async () => {
    holdAttendanceGet();
    mount();
    await waitFor(() => expect(screen.getByText(/เน็ตช้า/)).toBeTruthy(), { timeout: 4500 }); // tappable, the answer is still coming
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /สาย/ })); });
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined()); // confirmed by the system
    expect(label(1)).toContain("สาย");

    // now the OLD answer (read before that write) arrives
    await act(async () => { lateAnswer!([]); });
    await waitFor(() => expect(screen.queryByText(/เน็ตช้า/)).toBeNull());
    expect(label(1)).toContain("สาย"); // it did not go back to "not checked"
    expect(document.body.textContent).toContain("เช็คแล้ว 1/4");

    // a later tap on the same child is built on the version this device wrote: no clash with our own data
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /ขาด/ })); });
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(bodies()[1].rows[0]).toMatchObject({ studentId: "s1", status: "absent" });
    expect(typeof bodies()[1].rows[0].baseUpdatedAt).toBe("number");
  }, 15000);

  it("a mark that was taken back meanwhile does not come back from the old answer", async () => {
    holdAttendanceGet();
    mount();
    await waitFor(() => expect(screen.getByText(/เน็ตช้า/)).toBeTruthy(), { timeout: 4500 });
    await act(async () => { fireEvent.click(tile(1)); }); // present
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined(), { timeout: 3000 });
    expect(label(1)).toContain("มา");
    await act(async () => { fireEvent.click(tile(1)); }); // same status again = take it back
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined());
    expect(label(1)).toContain("ยังไม่เช็ค");

    // the old answer still lists s1 as present (it was read before either write)
    await act(async () => { lateAnswer!([{ student_id: "s1", status: "present", updated_at: 7 }]); });
    await waitFor(() => expect(screen.queryByText(/เน็ตช้า/)).toBeNull());
    expect(label(1)).toContain("ยังไม่เช็ค");
  }, 15000);

  it("what the system says about children nobody touched still arrives", async () => {
    holdAttendanceGet();
    mount();
    await waitFor(() => expect(screen.getByText(/เน็ตช้า/)).toBeTruthy(), { timeout: 4500 });
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined(), { timeout: 3000 });
    await act(async () => { lateAnswer!([{ student_id: "s3", status: "absent", updated_at: 7 }]); });
    await waitFor(() => expect(label(3)).toContain("ขาด"));
    expect(label(1)).toContain("มา");
  }, 15000);
});

describe("R-02 · 'มาทั้งห้อง' judges who is unchecked after the question is answered", () => {
  async function openQuestion() {
    mount();
    const all = await screen.findByRole("button", { name: /มาทั้งห้อง/ });
    await waitFor(() => expect((all as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(all); });
    return screen.findByRole("alertdialog");
  }
  const confirm = (dlg: HTMLElement) => act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: /^มาทั้งห้อง \d+ คน$/ })); });

  it("a child tapped as late while the question was open keeps 'สาย'", async () => {
    post.mockImplementation(() => new Promise(() => {}));
    const dlg = await openQuestion();
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /สาย/ })); });
    await act(async () => { fireEvent.click(tile(2)); });
    await waitFor(() => expect(label(2)).toContain("สาย"));
    await confirm(dlg);
    expect(await screen.findByText(/ให้ “มา” 3 คนแล้ว/)).toBeTruthy();
    expect(label(2)).toContain("สาย");
    for (const n of [1, 3, 4]) expect(label(n)).toContain("มา");
    expect((await draftGet(KEY))?.rows.s2.status).toBe("late");
  });

  it("a mark written to the draft behind the page's back (a scan) is not overwritten either", async () => {
    post.mockImplementation(() => new Promise(() => {}));
    const dlg = await openQuestion();
    await draftEdit(CTX, [{ studentId: "s2", status: "late", method: "hid", baseUpdatedAt: null }]); // the page has not seen it yet
    await confirm(dlg);
    expect(await screen.findByText(/ให้ “มา” 3 คนแล้ว/)).toBeTruthy();
    const d = await draftGet(KEY);
    expect(d?.rows.s2).toMatchObject({ status: "late", method: "hid" });
    expect(d?.rows.s1).toMatchObject({ status: "present", method: "bulk" });
  });

  it("taking 'มาทั้งห้อง' back removes only the children it filled", async () => {
    post.mockImplementation(() => new Promise(() => {}));
    const dlg = await openQuestion();
    await draftEdit(CTX, [{ studentId: "s2", status: "late", method: "hid", baseUpdatedAt: null }]);
    await confirm(dlg);
    expect(await screen.findByText(/ให้ “มา” 3 คนแล้ว/)).toBeTruthy();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "เลิกทำ" })); });
    expect(await screen.findByText(/เลิกทำแล้ว · 3 คนกลับเป็นยังไม่เช็ค/)).toBeTruthy();
    const d = await draftGet(KEY);
    expect(Object.keys(d?.rows ?? {})).toEqual(["s2"]);
  });
});

describe("R-06 · the clash card follows the tap made after the clash", () => {
  it("shows the status now in the draft, and 'use this device' sends that one", async () => {
    get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days: [] } : { rows: [{ student_id: "s1", status: "present", updated_at: 7 }] }));
    post.mockRejectedValueOnce(new ApiError(409, "conflict", "conflict", {
      error: "conflict", conflicts: [{ studentId: "s1", draft: { status: "none" }, server: { status: "absent", updatedAt: 50, deviceName: "iPad" } }],
    }));
    post.mockImplementation(async (_p: string, body: any) => okReply(body));
    mount();
    await waitFor(() => expect(label(1)).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); }); // takes the mark back -> clash with the iPad
    expect(await screen.findByText(/ข้อมูลชนกับอีกเครื่อง 1 รายการ/, {}, { timeout: 3000 })).toBeTruthy();
    expect(document.body.textContent).toContain("เครื่องนี้: ยกเลิกการเช็ค · ในระบบ: ขาด (iPad)");

    // the teacher taps the child again (a different mind): the card must say what will be sent
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(document.body.textContent).toContain("เครื่องนี้: มา · ในระบบ: ขาด (iPad)"));
    expect(document.body.textContent).not.toContain("เครื่องนี้: ยกเลิกการเช็ค");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ใช้ของเครื่องนี้" })); });
    await waitFor(() => expect(bodies().at(-1).rows[0]).toMatchObject({ studentId: "s1", status: "present", baseUpdatedAt: 50 }), { timeout: 3000 });
  });
});

describe("B-03 · the room is kept in the address and on this device", () => {
  const two = () => {
    classes.value = [
      { id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never,
      { id: "c2", name: "ป.6/2", year: 2569, grade: null, archived: false } as never,
    ];
    students.value = [...[1, 2, 3, 4].map((n) => kid(n)), ...[1, 2, 3].map((n) => kid(n, "c2", "t" + n))];
  };
  const tab = (name: RegExp) => screen.getByRole("tab", { name });
  const selected = () => screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);

  it("picking a room puts ?class= in the address and remembers it", async () => {
    two();
    mount();
    await waitFor(() => expect(selected()[0]).toContain("ป.6/1"));
    await act(async () => { fireEvent.click(tab(/ป.6\/2/)); });
    expect(selected()[0]).toContain("ป.6/2");
    expect(location.hash).toContain("class=c2");
    expect(localStorage.getItem(CLASS_KEY)).toBe("c2");
    await waitFor(() => expect(route.value).toContain("class=c2"));
    await waitFor(() => expect(get.mock.calls.some((c) => /\/api\/attendance\?.*class=c2/.test(String(c[0])))).toBe(true));
  });

  it("a reload (a bare address) opens the room that was looked at last", async () => {
    two();
    localStorage.setItem(CLASS_KEY, "c2");
    mount();
    await waitFor(() => expect(selected()[0]).toContain("ป.6/2"));
  });

  it("an explicit ?class= in the address wins over the remembered room", async () => {
    two();
    localStorage.setItem(CLASS_KEY, "c2");
    route.value = "/attendance?class=c1";
    mount();
    await waitFor(() => expect(selected()[0]).toContain("ป.6/1"));
  });

  it("a remembered room that no longer exists falls back to the first one", async () => {
    two();
    localStorage.setItem(CLASS_KEY, "gone");
    mount();
    await waitFor(() => expect(selected()[0]).toContain("ป.6/1"));
  });

  it("the address changing under the page (a link, back/forward) switches the room", async () => {
    two();
    mount();
    await waitFor(() => expect(selected()[0]).toContain("ป.6/1"));
    await act(async () => { route.value = "/attendance?class=c2"; });
    await waitFor(() => expect(selected()[0]).toContain("ป.6/2"));
    expect(localStorage.getItem(CLASS_KEY)).toBe("c2");
  });

  it("blocked storage costs only the memory: the page still opens and switches rooms", async () => {
    two();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mount();
    await waitFor(() => expect(selected()[0]).toContain("ป.6/1"));
    await act(async () => { fireEvent.click(tab(/ป.6\/2/)); });
    expect(selected()[0]).toContain("ป.6/2");
    expect(location.hash).toContain("class=c2");
  });
});
