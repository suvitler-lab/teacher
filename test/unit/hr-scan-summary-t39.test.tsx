// T-39 (home-redesign): the end-of-round summary (S9) — BR-13/BR-14 numbers, "วิธีรับรอบนี้", "ส่งช้า", next room (BR-16).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "preact";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/dashboard", () => ({ dashboard: { value: null }, loadDashboard: vi.fn() }));
vi.mock("@client/lib/outbox", async (orig) => {
  const actual = await orig<typeof import("@client/lib/outbox")>();
  return { ...actual, enqueueSubmission: vi.fn(async () => {}), listFailed: vi.fn(async () => []), discardFailed: vi.fn(), retryFailed: vi.fn() };
});
vi.mock("@client/lib/sound", () => ({ beep: { ok: vi.fn(), err: vi.fn(), dup: vi.fn(), undo: vi.fn() }, vibrate: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@client/router", async (orig) => ({ ...(await orig<typeof import("@client/router")>()), navigate }));

import { assignments, students, classes } from "@client/store";
import { online, pendingOps, pairKey } from "@client/lib/outbox";
import { serverReachable } from "@client/lib/session";
import { ScanPage, __scan } from "@client/pages/Scan";
import { roundNumbers, nextRoom } from "@client/components/scan/summary";

const asg: Assignment = {
  id: "A", term_id: null, subject_id: null, type_id: null, title: "ใบงานเศษส่วน", unit: null, full_score: 20, assigned_date: null, due_date: "2026-11-01",
  note: null, publish_scores: true, status: "open", class_ids: ["c1", "c2", "c3"], created_at: 0, updated_at: 0, deleted_at: null,
};
const kid = (cls: string, n: number): Student => ({
  id: `${cls}-${n}`, code: `${cls}${n}`, qr_token: `Q-${cls}-${n}`.padEnd(12, "A"), prefix: null, first_name: `เด็ก${n}`, last_name: "สมมติ", nickname: null,
  class_id: cls, number: n, status: "active", left_at: null, updated_at: 0,
});
const room = (cls: string, count: number) => Array.from({ length: count }, (_, i) => kid(cls, i + 1));
const sess = { id: "scn_now", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 20, mode: "later" } as never;
const sub = (o: Record<string, unknown> = {}) => ({ status: "submitted", score: 15, at: 1, late: false, ...o }) as never;
const box = (entries: [string, unknown][]) => { __scan.subsBox.value = { aid: "A", map: new Map(entries as never), status: "ready", serverTime: 0 } as never; };

/** The spec's example: 33 children, 2 excused, 26 handed in (6 without a score, 4 late), 24 of them in this round: hid 16 · camera 6 · manual 1 · grid 1 */
function bigRound(): [string, unknown][] {
  const out: [string, unknown][] = [];
  let i = 1;
  const add = (n: number, o: Record<string, unknown>) => { for (let k = 0; k < n; k++) out.push([`c1-${i++}`, sub(o)]); };
  add(16, { method: "hid", sid: "scn_now" });
  add(6, { method: "camera", sid: "scn_now" });
  add(1, { method: "manual", sid: "scn_now", score: null, late: true });
  add(1, { method: "grid", sid: "scn_now", score: null, late: true });
  add(2, { method: "hid", sid: "scn_old", score: null, late: true }); // handed in before this round
  out.push(["c1-27", sub({ status: "excused", score: null })], ["c1-28", sub({ status: "excused", score: null })]);
  (out[0][1] as any).score = null; (out[1][1] as any).score = null;
  return out;
}

beforeEach(() => {
  cleanup(); vi.useRealTimers();
  get.mockReset(); post.mockReset(); post.mockResolvedValue({}); navigate.mockReset(); get.mockResolvedValue({ submissions: [], serverTime: 100 });
  pendingOps.value = new Map(); online.value = true; serverReachable.value = true;
  assignments.value = [asg]; students.value = [...room("c1", 33), ...room("c2", 30), ...room("c3", 28)];
  classes.value = [
    { id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false }, { id: "c2", name: "ป.6/2", year: 2569, grade: null, archived: false },
    { id: "c3", name: "ป.5/1", year: 2569, grade: null, archived: false },
  ] as never;
  __scan.session.value = null; __scan.ended.value = null;
});
afterEach(() => { vi.useRealTimers(); });

const open = () => { __scan.ended.value = sess; return render(h(ScanPage, {})); };
// the figures sit in separate boxes: compare without the spaces between them
const flat = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, "");

describe("roundNumbers (BR-13 / BR-14)", () => {
  it("counts the spec's example: 26 handed in, 5 not, ring over 31 = 84%", () => {
    const m = new Map(bigRound() as never);
    const n = roundNumbers("scn_now", room("c1", 33), (id) => m.get(id) as never);
    expect(n.submitted.length).toBe(26);
    expect(n.excused.length).toBe(2);
    expect(n.missing.length).toBe(5); // 33 - 26 - 2
    expect(n.counted).toBe(31);
    expect(n.pct).toBe(84); // 2600 / 31 = 83.87 — not 26/33 = 79
    expect(n.late).toBe(4);
    expect(n.ungraded.length).toBe(6);
    // 24 of the 26 were received in this round
    expect(n.how.map((x) => `${x.word} ${x.n}`)).toEqual(["เครื่องยิง 16", "กล้อง 6", "พิมพ์ 1", "แตะตาราง 1"]);
  });
  it("leaves a method out when it is 0, and a hand-in with no known method uncounted", () => {
    const m = new Map<string, unknown>([["c1-1", sub({ method: "camera", sid: "scn_now" })], ["c1-2", sub({})]]);
    const n = roundNumbers("scn_now", room("c1", 3), (id) => m.get(id) as never);
    expect(n.how).toEqual([expect.objectContaining({ key: "camera", n: 1 })]);
  });
  it("nobody counted → no percentage (never 0 %)", () => {
    const m = new Map<string, unknown>(room("c1", 2).map((s) => [s.id, sub({ status: "excused", score: null })]));
    expect(roundNumbers("x", room("c1", 2), (id) => m.get(id) as never).pct).toBeNull();
  });
});

describe("nextRoom (BR-16)", () => {
  const pr = (m: Map<string, unknown>) => (id: string) => m.get(id) as never;
  const studentsOf = (cid: string) => students.value.filter((s) => s.class_id === cid);
  const all = new Set(["c1", "c2", "c3"]);
  const name = (id: string) => ({ c1: "ป.6/1", c2: "ป.6/2", c3: "ป.5/1" })[id as "c1"] ?? "";
  it("is the next room in the work's order with someone not handed in: ป.6/2 ส่งแล้ว 0/30", () => {
    expect(nextRoom(asg, "c1", all, name, studentsOf, pr(new Map()))).toEqual({ classId: "c2", name: "ป.6/2", done: 0, of: 30 });
  });
  it("skips a room that is all handed in, and wraps round to the start", () => {
    const m = new Map<string, unknown>(room("c2", 30).map((s) => [s.id, sub()]));
    expect(nextRoom(asg, "c1", all, name, studentsOf, pr(m))?.classId).toBe("c3");
    expect(nextRoom(asg, "c3", all, name, studentsOf, pr(m))?.classId).toBe("c1");
  });
  it("none: a one-room work, or every other room done, and a room not in use is skipped", () => {
    expect(nextRoom({ class_ids: ["c1"] }, "c1", all, name, studentsOf, pr(new Map()))).toBeNull();
    const done = new Map<string, unknown>([...room("c2", 30), ...room("c3", 28)].map((s) => [s.id, sub()]));
    expect(nextRoom(asg, "c1", all, name, studentsOf, pr(done))).toBeNull();
    expect(nextRoom(asg, "c1", new Set(["c1", "c3"]), name, studentsOf, pr(new Map()))?.classId).toBe("c3");
  });
  it("an excused child is not counted in x/y", () => {
    const m = new Map<string, unknown>([["c2-1", sub({ status: "excused", score: null })], ["c2-2", sub()]]);
    expect(nextRoom(asg, "c1", all, name, studentsOf, pr(m))).toMatchObject({ done: 1, of: 29 });
  });
});

describe("summary page (AC-72)", () => {
  it("shows the ring, the numbers, late, and the line of how this round received", async () => {
    box(bigRound());
    open();
    expect(screen.getByRole("img", { name: /ส่งแล้ว 26 จาก 31 คน ร้อยละ 84/ })).toBeTruthy();
    expect(screen.getByText("84%")).toBeTruthy();
    expect(screen.getByText(/ป\.6\/1 · เต็ม 20 · ไม่นับยกเว้น 2 คน/)).toBeTruthy();
    const nums = flat(document.querySelector(".sc-sumnums"));
    expect(nums).toContain("ส่งแล้ว26");
    expect(nums).toContain("ยังไม่ส่ง5");
    expect(nums).toContain("ส่งช้า4");
    expect(flat(document.querySelector(".sc-sumhow"))).toBe("รอบนี้:เครื่องยิง16·กล้อง6·พิมพ์1·แตะตาราง1");
    await act(async () => {});
    expect(screen.getByRole("status", { name: "ผลจบรอบ" }).textContent).toBe("จบรอบ: ส่งแล้ว 26 จาก 31 คน");
  });
  it("chips: at most 18 then 'และอีก n คน'; everyone in gives 'ทุกคนส่งครบแล้ว' and no copy button", () => {
    box(bigRound());
    const { unmount } = open();
    expect(screen.getByText("และอีก 8 คน")).toBeTruthy(); // 26 handed in, 18 shown
    unmount();
    box(room("c1", 33).map((s) => [s.id, sub()] as [string, unknown]));
    open();
    expect(screen.getByText(/ทุกคนส่งครบแล้ว/)).toBeTruthy();
    expect(screen.queryByText(/คัดลอกรายชื่อ/)).toBeNull();
  });
  it("this device's unsent hand-ins count with their method; an unsent undo takes one away", () => {
    box([]);
    const op = (sid: string, method: string, status = "submitted") => ({ opId: "o" + sid, scanSessionId: "scn_now", assignmentId: "A", studentId: sid, status, score: 10, fullScoreAtScan: 20, method, clientTs: 5, receivedDate: "2026-11-02" });
    pendingOps.value = new Map([
      [pairKey({ assignmentId: "A", studentId: "c1-1" }), op("c1-1", "hid")],
      [pairKey({ assignmentId: "A", studentId: "c1-2" }), op("c1-2", "hid")],
      [pairKey({ assignmentId: "A", studentId: "c1-3" }), op("c1-3", "camera")],
      [pairKey({ assignmentId: "A", studentId: "c1-4" }), op("c1-4", "hid", "void")],
    ] as never);
    open();
    expect(flat(document.querySelector(".sc-sumhow"))).toContain("เครื่องยิง2·กล้อง1");
    expect(screen.getByText(/รอส่งขึ้นระบบ 4 คน — จะส่งเองเมื่อมีเน็ต/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /ส่งแล้ว 3 จาก 33 คน/ })).toBeTruthy();
  });
  it("a score typed onto a hand-in the server holds keeps the way it came in (not the way the score was typed)", () => {
    box([["c1-1", sub({ method: "hid", sid: "scn_now", score: null })]]);
    pendingOps.value = new Map([[pairKey({ assignmentId: "A", studentId: "c1-1" }), { opId: "o", scanSessionId: "scn_now", assignmentId: "A", studentId: "c1-1", status: "submitted", score: 12, fullScoreAtScan: 20, method: "manual", clientTs: 5 }]] as never);
    open();
    expect(flat(document.querySelector(".sc-sumhow"))).toBe("รอบนี้:เครื่องยิง1");
  });
  it("never says 0 for a round whose hand-ins were not read", () => {
    __scan.subsBox.value = { aid: "A", map: new Map(), status: "unknown", serverTime: 0 } as never;
    open();
    expect(screen.getByRole("img", { name: "ยังไม่ทราบว่าใครส่งแล้วบ้าง" })).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText(/ยังไม่ส่ง 33/)).toBeNull();
    expect(screen.queryByText(/สแกนห้องถัดไป/)).toBeNull();
  });
});

describe("review fixes (R-3901..R-3904)", () => {
  const live = { ...(sess as object), mode: "type" } as never;
  it("R-3901: read by the reader, score typed, server answers 'manual' — still 'เครื่องยิง' (and undo removes it)", async () => {
    __scan.session.value = live;
    box([]);
    __scan.handleScan("1", "hid");
    __scan.handleScan("2", "hid");
    await act(async () => {});
    __scan.submitTypedScore(15);
    await act(async () => {});
    // the server stored the score op's method (manual) for child 1; child 2 is still waiting for a score (hid)
    box([["c1-1", sub({ method: "manual", sid: "scn_now" })], ["c1-2", sub({ method: "hid", sid: "scn_now", score: null })]]);
    __scan.ended.value = live; __scan.session.value = null;
    render(h(ScanPage, {}));
    expect(flat(document.querySelector(".sc-sumhow"))).toBe("รอบนี้:เครื่องยิง2");
  });
  it("R-3901: taking a hand-in back removes its way; a later scan with another way is counted as that", async () => {
    __scan.session.value = live; box([]);
    __scan.handleScan("1", "hid"); await act(async () => {});
    __scan.undo("c1-1"); await act(async () => {});
    __scan.handleScan("1", "camera"); await act(async () => {});
    __scan.submitTypedScore(10); await act(async () => {});
    box([["c1-1", sub({ method: "manual", sid: "scn_now" })]]);
    __scan.ended.value = live; __scan.session.value = null;
    render(h(ScanPage, {}));
    expect(flat(document.querySelector(".sc-sumhow"))).toBe("รอบนี้:กล้อง1");
  });
  it("R-3902: past the due date with unsent hand-ins → 'ส่งช้า 0 · รอตัดสิน n', never a bare 0; no due date → no box; none waiting → plain", () => {
    box([]);
    const op = (sid: string) => ({ opId: "o" + sid, scanSessionId: "scn_now", assignmentId: "A", studentId: sid, status: "submitted", score: 10, fullScoreAtScan: 20, method: "hid", clientTs: 5, receivedDate: "2026-11-12" });
    pendingOps.value = new Map([1, 2].map((i) => [pairKey({ assignmentId: "A", studentId: "c1-" + i }), op("c1-" + i)]) as never);
    const a = open();
    expect(flat(document.querySelector(".sc-sumnums"))).toContain("ส่งช้า0·รอตัดสิน2");
    a.unmount(); pendingOps.value = new Map();
    box([["c1-1", sub({ late: true })]]);
    const b = open();
    expect(flat(document.querySelector(".sc-sumnums"))).toContain("ส่งช้า1");
    expect(flat(document.querySelector(".sc-sumnums"))).not.toContain("รอตัดสิน");
    b.unmount();
    assignments.value = [{ ...asg, due_date: null }];
    box([["c1-1", sub({})]]);
    open();
    expect(flat(document.querySelector(".sc-sumnums"))).not.toContain("ส่งช้า");
  });
  it("R-3903: a closed work has no next-room button and 'กลับไปสแกนต่อ' is off with the reason; closing from here changes it at once", async () => {
    assignments.value = [{ ...asg, status: "closed" }];
    box(bigRound());
    open();
    expect(screen.queryByText(/สแกนห้องถัดไป/)).toBeNull();
    expect((screen.getByText("กลับไปสแกนต่อ").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("งานนี้ปิดรับแล้ว")).toBeTruthy();
  });
  it("R-3903: pressing 'ปิดรับงาน' successfully removes the next-room button and disables scan-again", async () => {
    post.mockResolvedValue({ assignment: { ...asg, status: "closed" } });
    box(bigRound());
    open();
    expect(screen.getByText(/สแกนห้องถัดไป/)).toBeTruthy();
    fireEvent.click(screen.getByText("ปิดรับงาน"));
    const dlg = await screen.findByRole("alertdialog");
    fireEvent.click(within(dlg).getByText("ปิดรับงาน"));
    await waitFor(() => expect(screen.queryByText(/สแกนห้องถัดไป/)).toBeNull());
    expect((screen.getByText("กลับไปสแกนต่อ").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
  it("R-3904: the focus goes to the top of the summary when it opens, and stays on the page after the work is closed", async () => {
    post.mockResolvedValue({ assignment: { ...asg, status: "closed" } });
    box(bigRound());
    open();
    await act(async () => {});
    expect(document.activeElement?.classList.contains("sc-sumfocus")).toBe(true);
    fireEvent.click(screen.getByText("ปิดรับงาน"));
    const dlg = await screen.findByRole("alertdialog");
    (document.activeElement as HTMLElement)?.blur?.();
    fireEvent.click(within(dlg).getByText("ปิดรับงาน"));
    await waitFor(() => expect(screen.queryByText("ปิดรับงาน")).toBeNull());
    expect(document.activeElement?.classList.contains("sc-sumfocus")).toBe(true);
  });
});

describe("actions (AC-73/74/75)", () => {
  it("next room: label from BR-16, starts a new round of that room with the same work and mode", async () => {
    box(bigRound());
    open();
    fireEvent.click(screen.getByRole("button", { name: /สแกนห้องถัดไป: ป\.6\/2 · ส่งแล้ว 0\/30/ }));
    await waitFor(() => expect(__scan.session.value?.classId).toBe("c2"));
    expect(__scan.session.value).toMatchObject({ assignmentId: "A", mode: "later" });
    expect(__scan.session.value!.id).not.toBe("scn_now");
    expect(__scan.ended.value).toBeNull();
  });
  it("one-room work: no next-room button", () => {
    assignments.value = [{ ...asg, class_ids: ["c1"] }];
    box(bigRound());
    open();
    expect(screen.queryByText(/สแกนห้องถัดไป/)).toBeNull();
  });
  it("go-to-gradebook and give-scores go where they always went", () => {
    box(bigRound());
    open();
    fireEvent.click(screen.getByText("ไปสมุดคะแนน"));
    expect(navigate).toHaveBeenLastCalledWith("/gradebook", { class: "c1", asg: "A" });
    fireEvent.click(screen.getByText("ให้คะแนนตอนนี้"));
    expect(navigate).toHaveBeenLastCalledWith("/gradebook", { class: "c1", asg: "A", rows: "awaiting" });
  });
  it("copy: the old text, 'คัดลอกแล้ว' for 2 s; when it cannot copy it says how to do it by hand", async () => {
    const writeText = vi.fn(async (_t: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    box(bigRound());
    open();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /คัดลอกรายชื่อ/ })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text.startsWith('รายชื่อยังไม่ส่ง "ใบงานเศษส่วน" ป.6/1\n')).toBe(true);
    expect(text).toContain("29. เด็ก29 สมมติ");
    expect(screen.getByText("คัดลอกแล้ว")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(screen.getByText("คัดลอกรายชื่อ")).toBeTruthy();
    vi.useRealTimers();
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /คัดลอกรายชื่อ/ })); });
    expect(screen.getByText(/คัดลอกไม่ได้ — กดค้างที่รายชื่อเพื่อคัดลอกเอง/)).toBeTruthy();
  });
  it("close the work: offline / waiting disable with the reason; confirm names the room's count; one post when pressed fast", async () => {
    box(bigRound());
    online.value = false;
    const first = open();
    expect((screen.getByText("ปิดรับงาน").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("ต้องออนไลน์ถึงปิดรับงานได้")).toBeTruthy();
    first.unmount(); online.value = true;
    pendingOps.value = new Map([[pairKey({ assignmentId: "A", studentId: "c1-30" }), { opId: "o", scanSessionId: "scn_now", assignmentId: "A", studentId: "c1-30", status: "submitted", score: null, fullScoreAtScan: 20, method: "hid", clientTs: 1 }]] as never);
    const second = open();
    expect((screen.getByText("ปิดรับงาน").closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("รอรายการค้างส่งขึ้นระบบก่อน")).toBeTruthy();
    second.unmount(); pendingOps.value = new Map();

    let release!: (v: unknown) => void;
    post.mockImplementation(() => new Promise((r) => { release = r; }));
    open();
    fireEvent.click(screen.getByText("ปิดรับงาน"));
    const dlg = await screen.findByRole("alertdialog", { name: /ปิดรับ “ใบงานเศษส่วน” ทุกห้อง\?/ });
    expect(dlg.textContent).toContain("ยังไม่ส่ง 5 คน");
    const yes = [...dlg.querySelectorAll("button")].find((b) => b.textContent === "ปิดรับงาน") as HTMLElement;
    fireEvent.click(yes); fireEvent.click(yes);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).not.toHaveProperty("full_score");
    await act(async () => { release({ assignment: { ...asg, status: "closed" } }); });
    await waitFor(() => expect(screen.queryByText("ปิดรับงาน")).toBeNull()); // no button once it is closed
  });
  it("a failed close keeps the button so it can be tried again", async () => {
    box(bigRound());
    post.mockRejectedValue(new Error("Failed to fetch"));
    open();
    fireEvent.click(screen.getByText("ปิดรับงาน"));
    const dlg = await screen.findByRole("alertdialog");
    fireEvent.click(within(dlg).getByText("ปิดรับงาน"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByText("ปิดรับงาน").closest("button") as HTMLButtonElement).disabled).toBe(false));
  });
  it("a work already closed has no close button", () => {
    assignments.value = [{ ...asg, status: "closed" }];
    box(bigRound());
    open();
    expect(screen.queryByText("ปิดรับงาน")).toBeNull();
  });
});
