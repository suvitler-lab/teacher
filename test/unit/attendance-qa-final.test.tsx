// QA-final fixes for the attendance page (B-4, B-5, N-1):
//  B-4  the "ออฟไลน์ · รอส่ง n" badge counts attendance that still sits in drafts, in one total
//  B-5  while a clash with another device waits for the teacher, the child is "รอเลือก" and counted as "ต้องตรวจสอบ"
//  N-1  with an expired session, "มาทั้งห้อง" leaves the children visibly NOT SENT (chip "รอส่ง n"), nothing is lost
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
import { SyncBadge } from "@client/components/ui";
import { Toasts } from "@client/components/Overlays";
import { toasts } from "@client/lib/notify";
import { route } from "@client/router";
import { draftAll, draftGet, draftUpdate } from "@client/lib/idb";
import { stopAttSync, draftEdit, flushDraft, ctxKey, attDraftCount, refreshAttDraftCount, type AttCtx } from "@client/lib/attSync";
import { online, pendingCount, syncing } from "@client/lib/outbox";
import { serverReachable, authRequired } from "@client/lib/session";
import { projectorOn } from "@client/lib/projector";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";

const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: "น้อง" + n,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const baseSettings = () => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
}) as never;

const tile = (n: number) => document.getElementById("att-t-s" + n) as HTMLElement;
const legend = () => (document.querySelector(".att-legend") as HTMLElement).textContent ?? "";
const CTX: AttCtx = { date: bkkToday(), classId: "c1", subjectId: null, period: null };
const KEY = ctxKey(CTX);
const okReply = (body: { rows: { studentId: string; status: string }[] }) => {
  const at = Date.now();
  return { updatedAt: at, rows: {}, absent: [], state: Object.fromEntries(body.rows.map((r) => [r.studentId, { status: r.status, updatedAt: at }])) };
};
const ready = () => waitFor(() => expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(false)); // the room has loaded
const mount = () => render(h("div", {}, h(AttendancePage, {}), h(Toasts, {})));

beforeEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 60));
  stopAttSync();
  for (const d of await draftAll()) await draftUpdate(d.key, () => null);
  await refreshAttDraftCount();
  get.mockReset(); post.mockReset(); toasts.value = []; projectorOn.value = false;
  authRequired.value = false; pendingCount.value = 0; syncing.value = false; online.value = true; serverReachable.value = true;
  get.mockImplementation(async (path: string) => (path.startsWith("/api/attendance/days") ? { days: [] } : { rows: [] }));
  post.mockImplementation(async (_p: string, body: any) => okReply(body));
  route.value = "/attendance";
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  subjects.value = [{ id: "sub1", name: "คณิตศาสตร์", color: "blue" } as never];
  settings.value = baseSettings();
});

describe("B-4: the sync badge counts attendance drafts too", () => {
  it("shows one total of queued scores and unsent attendance, and follows both live", async () => {
    online.value = false;
    render(h(SyncBadge, {}));
    expect(document.body.textContent).toBe("ออฟไลน์");
    await draftEdit(CTX, [1, 2, 3].map((n) => ({ studentId: "s" + n, status: "present" as const, method: "grid" as const, baseUpdatedAt: null })));
    await waitFor(() => expect(document.body.textContent).toBe("ออฟไลน์ · รอส่ง 3"));
    act(() => { pendingCount.value = 2; });
    expect(document.body.textContent).toBe("ออฟไลน์ · รอส่ง 5");
    act(() => { pendingCount.value = 0; });
    // the draft is sent (and cleared): the badge drops back without any page being open
    online.value = true;
    await flushDraft(KEY, { manual: true });
    await waitFor(() => expect(attDraftCount.value).toBe(0));
    expect(document.body.textContent).toBe("ออนไลน์");
  });
});

describe("B-5: a clash that waits for the teacher is not shown as saved", () => {
  const clash = () => post.mockRejectedValueOnce(new ApiError(409, "conflict", "conflict", {
    error: "conflict", conflicts: [{ studentId: "s1", draft: { status: "present" }, server: { status: "absent", updatedAt: 50, deviceName: "iPad" } }],
  }));

  it("the tile says รอเลือก, the summary counts it as ต้องตรวจสอบ (not มา), and picking a side settles it", async () => {
    clash();
    settings.value = { ...(baseSettings() as object), attendance_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("attendance"), "todo")) } as never;
    mount();
    await ready();
    await act(async () => { fireEvent.click(tile(1)); });
    expect(await screen.findByText(/ข้อมูลชนกับอีกเครื่อง 1 รายการ/, {}, { timeout: 3000 })).toBeTruthy();

    expect(tile(1).getAttribute("aria-label")).toContain("รอเลือกข้อมูล");
    expect(tile(1).className).toContain("held");
    expect(tile(1).className).not.toContain("present");
    expect(tile(1).textContent).toContain("รอเลือก");
    expect(legend()).toContain("มา 0");
    expect(legend()).toContain("ต้องตรวจสอบ 1");
    expect(legend()).toContain("ยังไม่เช็ค 3");
    expect(document.querySelector(".att-count")!.textContent).toBe("เช็คแล้ว 0/4");
    // "who is not checked yet" does not list the child twice
    expect(document.getElementById("att-todo-h")!.textContent).toContain("3 คน");

    // a new tap on it only changes what this device would send (the card follows); the tile stays "รอเลือก" and nothing is sent
    await act(async () => { fireEvent.click(tile(1)); });
    await new Promise((r) => setTimeout(r, 900));
    expect(tile(1).getAttribute("aria-label")).toContain("รอเลือกข้อมูล");
    expect(post).toHaveBeenCalledTimes(1);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ใช้ของระบบ" })); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("ขาด"));
    expect(tile(1).className).not.toContain("held");
    expect(legend()).toContain("ขาด 1");
    expect(legend()).not.toContain("ต้องตรวจสอบ");
  });

  it("choosing this device's value turns the tile into that status once it is sent", async () => {
    clash();
    mount();
    await ready();
    await act(async () => { fireEvent.click(tile(1)); });
    await screen.findByText(/ข้อมูลชนกับอีกเครื่อง 1 รายการ/, {}, { timeout: 3000 });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ใช้ของเครื่องนี้" })); });
    await waitFor(() => expect(tile(1).getAttribute("aria-label")).toContain("มา"), { timeout: 3000 });
    expect(tile(1).className).not.toContain("held");
    await waitFor(async () => expect(await draftGet(KEY)).toBeUndefined());
  });
});

describe("N-1: the session expired, then 'มาทั้งห้อง'", () => {
  it("shows 'รอส่ง 4' for the children right away (not saved), keeps them in the draft, and sends after login", async () => {
    post.mockImplementation(async () => { authRequired.value = true; throw new ApiError(401, "unauthorized", "x"); });
    mount();
    await waitFor(() => expect(tile(1)).toBeTruthy());
    await waitFor(() => expect((screen.getByRole("button", { name: /มาทั้งห้อง/ }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /มาทั้งห้อง/ })); });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "มาทั้งห้อง 4 คน" })); });
    // right after the tap: on screen as marked, but the bar says nothing was sent
    await waitFor(() => expect(tile(4).getAttribute("aria-label")).toContain("มา"));
    expect(document.querySelector(".att-savebar")!.textContent).toContain("รอส่ง 4");
    expect(document.querySelector(".att-savebar")!.textContent).not.toContain("บันทึกแล้ว");

    // the send finds the session gone (401): the answer must not look like a save
    await act(async () => { await flushDraft(KEY, { manual: true }); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".att-savebar")!.textContent).toContain("รอส่ง 4");
    expect(document.querySelector(".att-savebar")!.textContent).not.toContain("บันทึกแล้ว");
    expect(Object.keys((await draftGet(KEY))!.rows)).toHaveLength(4);
    expect(attDraftCount.value).toBe(4);
    // and the menu badge says so too
    cleanup();
    render(h(SyncBadge, {}));
    expect(document.body.textContent).toContain("รอส่ง 4");

    // login again: the very same rows go through, once
    authRequired.value = false;
    post.mockImplementation(async (_p: string, body: any) => okReply(body));
    await flushDraft(KEY, { manual: true });
    expect(await draftGet(KEY)).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(2);
  }, 15000);
});
