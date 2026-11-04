// ui-redesign round 4 (scan): card order has an effect, the undo toast counts down, the reader test never records a
// hand-in, the TV says "unknown code" only for an unknown code and does not single out an exempt child.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { h } from "preact";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const get = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/lib/dashboard", () => ({ dashboard: { value: null }, loadDashboard: vi.fn() }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...(await orig<typeof import("@client/lib/outbox")>()), enqueueSubmission: enqueue }));
vi.mock("@client/lib/sound", () => ({ beep: { ok: vi.fn(), err: vi.fn(), dup: vi.fn(), undo: vi.fn() }, vibrate: vi.fn() }));

import { assignments, students, classes, settings } from "@client/store";
import { toasts } from "@client/lib/notify";
import { projectorOn } from "@client/lib/projector";
import { ScanPage, __scan } from "@client/pages/Scan";

const asg: Assignment = {
  id: "A", term_id: null, subject_id: null, type_id: null, title: "งานทดสอบ", unit: null, full_score: 10, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const kid = (n: number, first: string): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q-" + n.toString().padStart(10, "A"), prefix: null, first_name: first, last_name: "สมมติ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const live = (mode = "full") => {
  __scan.session.value = { id: "scn_x", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 10, mode } as never;
  __scan.subsBox.value = { aid: "A", map: new Map(), status: "ready", serverTime: 0 };
};

beforeEach(() => {
  cleanup(); vi.useRealTimers();
  get.mockReset(); get.mockResolvedValue({ submissions: [], serverTime: 100 }); enqueue.mockClear();
  toasts.value = []; projectorOn.value = false;
  __scan.session.value = null; __scan.ended.value = null; __scan.feedback.value = null; __scan.recvDate.value = null;
  __scan.hidTestOn.value = false; __scan.hidLog.value = [];
  assignments.value = [asg]; students.value = [kid(1, "กิตติ"), kid(2, "ดาว")]; classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
});
afterEach(() => { vi.useRealTimers(); projectorOn.value = false; });

describe("card order (▲▼ in ปรับการ์ด)", () => {
  const withOrder = (order: string[], hidden: string[]) => {
    settings.value = { ...(settings.value ?? {}), scan_cards: JSON.stringify({ v: 1, order, hidden }) } as never;
  };
  it("draws the visible cards in the saved order", () => {
    live();
    withOrder(["hint", "recent", "hid"], []);
    const { container } = render(h(ScanPage, {}));
    const zone = container.querySelector(".sc-zone")!;
    const kinds = [...zone.children].map((e) => e.classList.contains("sc-hint") ? "hint" : e.classList.contains("sc-recent") ? "recent" : e.classList.contains("sc-hidbar") ? "hid" : "?");
    expect(kinds).toEqual(["hint", "recent", "hid"]);
    cleanup(); live();
    withOrder(["recent", "hid", "hint"], ["hint"]);
    const again = render(h(ScanPage, {}));
    expect([...again.container.querySelector(".sc-zone")!.children].map((e) => e.classList.contains("sc-recent") ? "recent" : e.classList.contains("sc-hidbar") ? "hid" : "?")).toEqual(["recent", "hid"]);
  });
});

describe("undo toast", () => {
  it("counts down from 5 in its own label and goes after 5 seconds", async () => {
    vi.useFakeTimers();
    live();
    __scan.commitStudent(kid(1, "กิตติ"), "manual");
    __scan.undo("s1");
    expect(toasts.value.find((t) => t.action)?.action?.label).toBe("เลิกทำ (5)");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(toasts.value.find((t) => t.action)?.action?.label).toBe("เลิกทำ (3)");
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(toasts.value.find((t) => t.action)).toBeUndefined();
  });
});

describe("reader test", () => {
  it("a code shot while the test is open is read back and never recorded", () => {
    live();
    __scan.hidTestOn.value = true;
    __scan.testHid("Q-AAAAAAAAA1");
    __scan.testHid("nope");
    expect(__scan.hidLog.value.map((r) => r.ok)).toEqual([false, true]);
    expect(__scan.hidLog.value[1].who).toContain("กิตติ");
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("the ทดสอบ button opens the panel", async () => {
    live();
    render(h(ScanPage, {}));
    fireEvent.click(screen.getAllByRole("button", { name: "ทดสอบ" })[0]);
    expect(await screen.findByText("ทดสอบเครื่องยิง")).toBeTruthy();
  });
});

describe("TV view", () => {
  it("says unknown code only for an unknown code, not for a closed work", async () => {
    live();
    projectorOn.value = true;
    const { container } = render(h(ScanPage, {}));
    __scan.handleScan("zzz-9", "manual");
    await act(async () => {});
    expect(container.textContent).toContain("ไม่รู้จักรหัสนี้");
    __scan.feedback.value = { kind: "danger", icon: "lock", name: "งานนี้ปิดรับแล้ว", sub: "x" };
    await act(async () => {});
    expect(container.querySelector(".pj")!.textContent).not.toContain("ไม่รู้จักรหัสนี้");
  });
  it("an exempt child looks like any child who has not handed in", async () => {
    live();
    __scan.subsBox.value = { aid: "A", map: new Map([["s2", { status: "excused", score: null, at: 1 } as never]]), status: "ready", serverTime: 0 };
    projectorOn.value = true;
    const { container } = render(h(ScanPage, {}));
    await act(async () => {});
    const cells = [...container.querySelectorAll(".pj .seatp > div")] as HTMLElement[];
    expect(cells.every((c) => !c.getAttribute("style"))).toBe(true);
  });
});

describe("summary", () => {
  it("has one h1 and a primary way to the gradebook", () => {
    __scan.subsBox.value = { aid: "A", map: new Map(), status: "ready", serverTime: 0 };
    __scan.ended.value = { id: "scn_x", assignmentId: "A", classId: "c1", subjectId: null, fullScore: 10, mode: "later" } as never;
    const { container } = render(h(ScanPage, {}));
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(container.querySelector("button.primary")!.textContent).toContain("ไปสมุดคะแนน");
  });
});
