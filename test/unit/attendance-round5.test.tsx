// A second tap on a child who already has the selected status takes the mark back ("not checked yet"):
// the cleared state is a draft row like any other, so it survives offline queueing, reload, retry and a clash,
// and every number on the page (tiles, summary, week strip, "who is not checked", TV) counts the child as unchecked.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/preact";
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
import { stopAttSync, draftEdit, withdrawRows, flushDraft, ctxKey, type AttCtx } from "@client/lib/attSync";
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

let rows: { student_id: string; status: string; updated_at: number; time?: number }[] = [];
const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;
const CTX: AttCtx = { date: bkkToday(), classId: "c1", subjectId: null, period: null };
const KEY = ctxKey(CTX);
const bodies = () => post.mock.calls.map((c) => c[1] as any);
const okReply = (body: { rows: { studentId: string; status: string }[] }) => {
  const at = Date.now();
  const none = body.rows.filter((r) => r.status === "none").map((r) => r.studentId);
  return {
    updatedAt: at, rows: {}, absent: none,
    state: Object.fromEntries(body.rows.filter((r) => r.status !== "none").map((r) => [r.studentId, { status: r.status, updatedAt: at }])),
  };
};
const mount = () => render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));

beforeEach(async () => {
  cleanup(); // leaving the page sends what is waiting: let that finish before the next test starts
  await new Promise((r) => setTimeout(r, 60));
  stopAttSync();
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
  get.mockReset(); post.mockReset(); rows = []; toasts.value = []; projectorOn.value = false;
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days: [] } : { rows }));
  post.mockImplementation(async (_p: string, body: any) => okReply(body));
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  subjects.value = [{ id: "sub1", name: "คณิตศาสตร์", color: "blue" } as never];
  settings.value = baseSettings();
});

describe("second tap clears", () => {
  it("clears the mark, updates every count, and sends a clear to the server", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }, { student_id: "s2", status: "absent", updated_at: 8 }];
    settings.value = baseSettings({ attendance_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("attendance"), "todo")) });
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    expect(document.body.textContent).toContain("เช็คแล้ว 2/4");

    await act(async () => { fireEvent.click(tile(1)); }); // brush is "present" and s1 is present
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค"));
    expect(tile(1).className).not.toContain("present");
    expect(tile(1).textContent).toContain("แตะเพื่อเช็ค");
    expect(await screen.findByText(/ยกเลิกการเช็คของ/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "เลิกทำ" })).toBeTruthy();
    expect(document.body.textContent).toContain("เช็คแล้ว 1/4");
    expect(document.body.textContent).toContain("ใครยังไม่เช็ค 3 คน");
    expect(document.body.textContent).toContain("ยังไม่เช็ค 3");
    expect(tile(2).getAttribute("aria-label")).toContain("ขาด"); // the others are untouched

    // it goes to the server as a clear built on the version that was on screen
    await waitFor(() => expect(post).toHaveBeenCalled(), { timeout: 3000 });
    const sent = bodies()[0].rows;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ studentId: "s1", status: "none", baseUpdatedAt: 7 });
    expect(typeof sent[0].opId).toBe("string");
    // once acknowledged the tile stays unchecked and nothing is waiting any more
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined());
    expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
  });

  it("a different selected status changes the mark; it does not clear it", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /ขาด/ })); });
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ขาด"));
    await waitFor(() => expect(bodies()[0].rows[0]).toMatchObject({ studentId: "s1", status: "absent" }), { timeout: 3000 });
  });

  it("tapping again after a clear marks the child again (clear is a toggle, not a one-way door)", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค"));
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).not.toContain("ยังไม่เช็ค"));
    expect(tile(1).getAttribute("aria-label")).toContain("มา");
    expect(tile(1).getAttribute("aria-label")).not.toContain("ยังไม่เช็ค");
  });

  it("the week strip and the TV view count a cleared child as unchecked", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    const today = () => document.querySelector(".att-week button.on")!.getAttribute("aria-label")!;
    expect(today()).toContain("เช็ค 1/4");
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(today()).toContain("ยังไม่เช็ค"));
    expect(document.getElementById("att-sum-h")!.textContent).toContain("ยังไม่ได้เช็คชื่อ · 4 คน");

    cleanup();
    // TV: the server still says "present" but this device's draft clears it
    projectorOn.value = true;
    render(h(AttendancePage, {}));
    const pj = await waitFor(() => { const e = document.querySelector(".pj"); expect(e).toBeTruthy(); return e as HTMLElement; });
    await waitFor(() => expect(pj.textContent).toContain("มาแล้ว 0 จาก 4 คน"));
  });
});

describe("undo", () => {
  it("'เลิกทำ' puts the previous status back, with its time, and the server ends up with it", async () => {
    const t0 = new Date(`${bkkToday()}T08:41:00+07:00`).getTime();
    rows = [{ student_id: "s1", status: "late", updated_at: 7, time: t0 }];
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("สาย"));
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /สาย/ })); });
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค"));

    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "เลิกทำ" })); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("สาย"));
    expect(tile(1).getAttribute("aria-label")).not.toContain("ยังไม่เช็ค");
    // while the clear had not been sent yet, the undo replaces it in the draft: the server hears "late" once
    await waitFor(() => expect(bodies().some((b) => b.rows[0].status === "late")).toBe(true), { timeout: 3000 });
    expect(bodies().find((b) => b.rows[0].status === "late").rows[0]).toMatchObject({ studentId: "s1", status: "late", baseUpdatedAt: 7, time: t0 });
    expect(bodies().filter((b) => b.rows[0].studentId === "s1" && b.rows[0].status === "none" && b.rows[0].time === t0)).toHaveLength(0);
  });

  it("an undo after the clear was already sent writes the status back as a fresh mark", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined(), { timeout: 3000 }); // clear acknowledged
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "เลิกทำ" })); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).not.toContain("ยังไม่เช็ค"));
    await waitFor(() => expect(bodies().length).toBe(2), { timeout: 3000 });
    expect(bodies()[1].rows[0]).toMatchObject({ studentId: "s1", status: "present", baseUpdatedAt: null });
  });
});

describe("offline, reload, retry, clash", () => {
  it("offline: the clear waits in the queue, the tile stays unchecked, and it goes out when the network is back", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    post.mockReset();
    post.mockRejectedValueOnce(new ApiError(0, "network", "offline"));
    post.mockImplementation(async (_p: string, body: any) => okReply(body));
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // not acknowledged: the clear is still in the draft, and the screen still says "unchecked"
    expect((await draftGet(KEY))?.rows.s1.status).toBe("none");
    expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
    await waitFor(() => expect(document.body.textContent).toMatch(/ยังไม่ได้ส่ง 1/));

    await act(async () => { await flushDraft(KEY, { manual: true }); });
    expect(post).toHaveBeenCalledTimes(2);
    expect(bodies()[1].rows[0]).toMatchObject({ studentId: "s1", status: "none", baseUpdatedAt: 7 });
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined());
    expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
  });

  it("reload: a clear that was never sent is still a clear — the server's old mark does not come back", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    post.mockImplementation(() => new Promise(() => {})); // nothing is ever acknowledged
    await draftEdit(CTX, [{ studentId: "s1", status: "none", method: "grid", baseUpdatedAt: 7 }]);
    mount(); // a fresh page reads the draft from storage
    await waitFor(() => expect(document.getElementById("att-t-s1")).toBeTruthy());
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค"));
    expect(document.body.textContent).toContain("เช็คแล้ว 0/4");
    // and it is sent on load
    await waitFor(() => expect(bodies()[0]?.rows[0]).toMatchObject({ studentId: "s1", status: "none", baseUpdatedAt: 7 }), { timeout: 3000 });
  });

  it("another device marked the child after this clear: the page shows what the system holds and says so", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    post.mockImplementation(async (_p: string, body: any) => ({
      updatedAt: 99, rows: { s1: 99 }, state: { s1: { status: "absent", updatedAt: 99 } }, absent: [], _b: body,
    }));
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ขาด"), { timeout: 3000 });
    expect(await screen.findByText(/อีกเครื่องแก้/)).toBeTruthy();
  });

  it("a clear that clashes with another device waits for the teacher, who can take either side", async () => {
    rows = [{ student_id: "s1", status: "present", updated_at: 7 }];
    post.mockRejectedValueOnce(new ApiError(409, "conflict", "conflict", {
      error: "conflict", conflicts: [{ studentId: "s1", draft: { status: "none" }, server: { status: "absent", updatedAt: 50, deviceName: "iPad" } }],
    }));
    post.mockImplementation(async (_p: string, body: any) => okReply(body));
    mount();
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"));
    await act(async () => { fireEvent.click(tile(1)); });
    expect(await screen.findByText(/ข้อมูลชนกับอีกเครื่อง 1 รายการ/, {}, { timeout: 3000 })).toBeTruthy();
    expect(document.body.textContent).toContain("เครื่องนี้: ยกเลิกการเช็ค · ในระบบ: ขาด (iPad)");

    // "use this device": re-based on the version the server has now, and sent
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ใช้ของเครื่องนี้" })); });
    await waitFor(() => expect(bodies().at(-1).rows[0]).toMatchObject({ studentId: "s1", status: "none", baseUpdatedAt: 50 }), { timeout: 3000 });
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined());
    expect(tile(1).getAttribute("aria-label")).toContain("ยังไม่เช็ค");
  });
});

describe("the sender, without the page", () => {
  it("a server that says 'no mark' for a cleared child is an acknowledgement; silence is not", async () => {
    post.mockImplementationOnce(async () => ({ updatedAt: 5, rows: {}, state: {}, absent: [] })); // says nothing about s1
    await draftEdit(CTX, [{ studentId: "s1", status: "none", method: "grid", baseUpdatedAt: null }]);
    await flushDraft(KEY, { manual: true });
    expect(await draftGet(KEY)).toBeTruthy(); // kept: never drop a tap on a maybe
    stopAttSync();
    post.mockImplementation(async () => ({ updatedAt: 6, rows: {}, state: {}, absent: ["s1"] }));
    await flushDraft(KEY, { manual: true });
    expect(await draftGet(KEY)).toBeUndefined();
  });

  it("taking back 'มาทั้งห้อง' restores a clear that had not been sent for a child it touched", async () => {
    const first = await draftEdit(CTX, [{ studentId: "s1", status: "none", method: "grid", baseUpdatedAt: 7 }]);
    const clearRow = first.rows.s1;
    const bulk = await draftEdit(CTX, [{ studentId: "s1", status: "present", method: "bulk", baseUpdatedAt: 7 }, { studentId: "s2", status: "present", method: "bulk", baseUpdatedAt: null }]);
    const ops = { s1: bulk.rows.s1.opId!, s2: bulk.rows.s2.opId! };
    const r = await withdrawRows(CTX, ops, { s1: clearRow });
    expect(r.taken).toBe(2);
    expect(r.draft?.rows.s1).toMatchObject({ status: "none", opId: clearRow.opId });
    expect(r.draft?.rows.s2).toBeUndefined();
  });
});
