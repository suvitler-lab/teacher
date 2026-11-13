import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

// T-38: the round on screen — hero (AC-55), recent scans with the way each came in (AC-65), "ยังไม่ส่ง" (AC-66),
// "รอส่งขึ้นระบบ" (AC-67), full score changed → "เริ่มรอบใหม่" (AC-60), seat grid (AC-62/64), card list (AC-71).
const { get, post, enqueue } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enqueue: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), enqueueSubmission: enqueue }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));
vi.mock("@client/lib/hid", () => ({ installHidScanner: () => () => {} }));

import { ScanPage, __scan } from "@client/pages/Scan";
import { assignments, classes, students, settings } from "@client/store";
import { pendingOps, failedPairKeys, online, pairKey } from "@client/lib/outbox";
import { staleFull, fullScoreNow } from "@client/components/scan/state";
import { UNSENT_MAX } from "@client/components/scan/ScanSide";

const asg = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a1", term_id: null, subject_id: null, type_id: null, title: "ใบงานเศษส่วน", unit: null, full_score: 20, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null, ...over,
});
const kid = (n: number, over: Partial<Student> = {}): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n + "AAAAAAAAA", prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0, ...over,
});
const row = (n: number, status: "submitted" | "excused", score: number | null) => ({
  assignment_id: "a1", student_id: "s" + n, status, score, late: 0, submitted_at: 1_700_000_000_000, method: "hid", device_id: "d", scan_session_id: "x", updated_at: 1,
});

async function open(kids: Student[], subs: ReturnType<typeof row>[] = [], mode: "full" | "later" | "type" = "later") {
  get.mockResolvedValue({ submissions: subs, serverTime: 100 });
  assignments.value = [asg()];
  students.value = kids;
  await __scan.startSession("a1", "c1", mode);
  render(<ScanPage />);
  await waitFor(() => expect(__scan.subsBox.value.status).toBe("ready"));
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({});
  enqueue.mockResolvedValue(undefined);
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 } as never];
  pendingOps.value = new Map();
  failedPairKeys.value = new Set();
  online.value = true;
  staleFull.value = null;
  __scan.recent.value = [];
  __scan.feedback.value = null;
  settings.value = { ...(settings.value ?? {}), scan_cards: "" } as never;
});
afterEach(() => { cleanup(); __scan.session.value = null; });

describe("hero (AC-55)", () => {
  it("says 'รับแล้ว x จาก y คน' without the exempt, and the ring names the same numbers (BR-13)", async () => {
    await open([kid(1), kid(2), kid(3), kid(4), kid(5)], [row(1, "submitted", 20), row(2, "submitted", 18), row(3, "submitted", null), row(4, "excused", null)]);
    expect(document.querySelector(".hero-count")!.textContent).toBe("รับแล้ว 3 จาก 4 คน");
    // 3 / 4 = 75 % (ยกเว้นไม่นับ)
    expect(screen.getByRole("img", { name: "ส่งแล้ว 3 จาก 4 คน ร้อยละ 75" })).toBeTruthy();
    expect(document.querySelector(".hero-count")!.getAttribute("aria-live")).toBe("off");
  });
  it("never shows 0 or a percentage before the hand-ins are known", async () => {
    get.mockReturnValue(new Promise(() => {}));
    assignments.value = [asg()]; students.value = [kid(1), kid(2)];
    void __scan.startSession("a1", "c1", "later"); // never answers
    await waitFor(() => expect(__scan.session.value).toBeTruthy());
    render(<ScanPage />);
    expect(screen.getByRole("img", { name: "ยังไม่ทราบว่าใครส่งแล้วบ้าง" })).toBeTruthy();
    expect(document.querySelector(".hero-count")!.textContent).toContain("…");
  });
});

describe("recent scans keep the way each came in (AC-65, BR-14)", () => {
  it("shows an icon plus a word per method", async () => {
    await open([kid(1), kid(2), kid(3)]);
    __scan.handleScan("1", "hid");
    __scan.handleScan("2", "camera");
    __scan.handleScan("3", "manual");
    await waitFor(() => expect(document.querySelectorAll(".sc-recent .sc-meth").length).toBe(3));
    const by = (m: string) => document.querySelector(`.sc-recent .sc-meth[data-method="${m}"]`)!;
    expect(by("hid").textContent).toContain("เครื่องยิง");
    expect(by("hid").querySelector('[data-icon="barcode"]')).toBeTruthy();
    expect(by("camera").textContent).toContain("กล้อง");
    expect(by("manual").textContent).toContain("พิมพ์");
  });
  it("a score typed onto a hand-in keeps the method it came in with", async () => {
    await open([kid(1)], [], "type");
    __scan.handleScan("1", "hid");
    __scan.submitTypedScore(15);
    expect(__scan.recent.value[0].method).toBe("hid");
  });
  it("a row of unknown method shows neither icon nor word", async () => {
    await open([kid(1)]);
    __scan.recent.value = [{ studentId: "s1", at: Date.now(), score: null }];
    await waitFor(() => expect(document.querySelector(".sc-recent .recent-row")).toBeTruthy());
    expect(document.querySelector(".sc-recent .sc-meth")).toBeNull();
  });
});

describe("ยังไม่ส่ง (AC-66)", () => {
  it("lists chips 'เลขที่ ชื่อ' in number order, read only, and counts like the grid", async () => {
    await open([kid(1), kid(2), kid(3), kid(4)], [row(2, "submitted", 20), row(3, "excused", null)]);
    const card = document.querySelector<HTMLElement>("[aria-labelledby=sc-unsent-h]")!;
    expect(card.querySelector("h2")!.textContent).toMatch(/ยังไม่ส่ง 2 คน/);
    const chips = [...card.querySelectorAll("li")].map((l) => l.textContent!.trim());
    expect(chips).toEqual(["เลขที่ 1 เด็ก1", "เลขที่ 4 เด็ก4"]);
    expect(card.querySelector("button")).toBeNull(); // not a queue: nothing to press
  });
  it("shows 12 at most and then 'และอีก n คน'", async () => {
    const kids = Array.from({ length: 15 }, (_, i) => kid(i + 1));
    await open(kids);
    const card = document.querySelector<HTMLElement>("[aria-labelledby=sc-unsent-h]")!;
    expect(card.querySelectorAll("li.sc-chip").length).toBe(UNSENT_MAX);
    expect(card.textContent).toContain("และอีก 3 คน");
  });
  it("everyone in → 'ทุกคนส่งครบแล้ว'", async () => {
    await open([kid(1), kid(2)], [row(1, "submitted", 20), row(2, "submitted", 20)]);
    expect(screen.getByText("ทุกคนส่งครบแล้ว")).toBeTruthy();
  });
  it("can be switched off in the card settings (the key is new, default on)", async () => {
    settings.value = { ...(settings.value ?? {}), scan_cards: JSON.stringify({ v: 1, order: ["recent", "unsent", "hid", "hint"], hidden: ["hint", "unsent"] }) } as never;
    await open([kid(1)]);
    expect(document.querySelector("[aria-labelledby=sc-unsent-h]")).toBeNull();
  });
  it("an old saved layout without the new key still shows it (added at the end)", async () => {
    settings.value = { ...(settings.value ?? {}), scan_cards: JSON.stringify({ v: 1, order: ["recent", "hid", "hint"], hidden: ["hint"] }) } as never;
    await open([kid(1)]);
    expect(document.querySelector("[aria-labelledby=sc-unsent-h]")).toBeTruthy();
  });
});

describe("รอส่งขึ้นระบบ (AC-67)", () => {
  it("offline: the card says so, the seat gets a cloud-upload corner and the side panel counts it", async () => {
    await open([kid(1), kid(2)], [], "full");
    online.value = false;
    __scan.handleScan("1", "manual");
    const opId = __scan.feedback.value!.opId!;
    pendingOps.value = new Map([[pairKey({ assignmentId: "a1", studentId: "s1" }), { opId, assignmentId: "a1", studentId: "s1", status: "submitted", score: 20, clientTs: 1 } as never]]);
    await waitFor(() => expect(document.querySelector(".fb .sub")!.textContent).toContain("· รอส่งขึ้นระบบ"));
    await waitFor(() => expect(document.querySelector(".sc-cell .sc-corner.pend")).toBeTruthy());
    expect(document.querySelector(".fb .sub")!.textContent).toMatch(/เลขที่ 1 · ส่งแล้ว.*· รอส่งขึ้นระบบ/);
    expect(document.querySelector(".sc-cell .sc-corner.pend [data-icon=cloud-upload]")).toBeTruthy();
    expect(document.querySelector("[aria-labelledby=sc-queue-h]")!.textContent).toContain("รอส่งขึ้นระบบ 1");
    expect(document.querySelector(".sc-cell.pend")!.getAttribute("aria-label")).toContain("รอส่งขึ้นระบบ");
  });
  it("online: no such words on the card", async () => {
    await open([kid(1)], [], "full");
    __scan.handleScan("1", "manual");
    expect(document.querySelector(".fb .sub")!.textContent).not.toContain("รอส่งขึ้นระบบ");
  });
});

describe("full score changed (AC-60)", () => {
  it("a bar stays with [เริ่มรอบใหม่]; the button restarts the same work, room and mode with the new full score", async () => {
    await open([kid(1)], [], "full");
    expect(document.querySelector(".sc-fullchg")).toBeNull();
    assignments.value = [asg({ full_score: 25 })]; // what the 60-second poll brings
    await waitFor(() => expect(screen.getByText("คะแนนเต็มถูกแก้ไข")).toBeTruthy());
    const bar = document.querySelector<HTMLElement>(".sc-fullchg")!;
    expect(bar.getAttribute("role")).toBe("alert");
    expect(bar.textContent).toContain("คะแนนเต็มปัจจุบันคือ 25 — เริ่มรอบใหม่เพื่อความถูกต้อง");
    expect(within(bar).getByRole("button", { name: /จบรอบ/ })).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: /เริ่มรอบใหม่/ }));
    await waitFor(() => expect(__scan.session.value!.fullScore).toBe(25));
    expect(__scan.session.value!.classId).toBe("c1");
    expect(__scan.session.value!.mode).toBe("full");
    expect(__scan.session.value!.id).not.toBe("");
    await waitFor(() => expect(document.querySelector(".sc-fullchg")).toBeNull());
  });
  it("the server's answer (ack) alone is enough to show the bar", async () => {
    await open([kid(1)], [], "full");
    staleFull.value = { aid: "a1", full: 30 };
    await waitFor(() => expect(fullScoreNow.value).toBe(30));
    expect(document.querySelector(".sc-fullchg")!.textContent).toContain("30");
  });
});

describe("seat grid (AC-62, AC-64)", () => {
  it("one seat is a Tab stop, arrows move it, and the latest hand-in is marked 'ล่าสุด'", async () => {
    await open([kid(1), kid(2), kid(3)], [], "full");
    __scan.handleScan("2", "manual");
    await waitFor(() => expect(document.querySelector(".sc-lasttag")).toBeTruthy());
    const cells = () => [...document.querySelectorAll<HTMLButtonElement>("button.sc-cell")];
    expect(cells().filter((c) => c.tabIndex === 0).length).toBe(1);
    expect(cells()[1].getAttribute("aria-label")).toContain("· ล่าสุด");
    expect(cells()[1].textContent).toContain("ล่าสุด");
    cells()[0].focus();
    fireEvent.keyDown(cells()[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(cells()[1]);
    await waitFor(() => expect(cells()[1].tabIndex).toBe(0));
    expect(cells()[0].tabIndex).toBe(-1);
  });
  it("seats are dashed '?' while the hand-ins are unknown", async () => {
    get.mockRejectedValue(new Error("offline"));
    assignments.value = [asg()]; students.value = [kid(1)];
    await __scan.startSession("a1", "c1", "later");
    render(<ScanPage />);
    await waitFor(() => expect(__scan.subsBox.value.status).toBe("unknown"));
    const cell = document.querySelector<HTMLElement>("button.sc-cell")!;
    expect(cell.textContent).toContain("?");
    expect(cell.getAttribute("aria-label")).toContain("ยังไม่ทราบ");
  });
  it("a room with no children says so and offers the import (AC-64)", async () => {
    await open([]);
    expect(screen.getByText("ห้องนี้ยังไม่มีนักเรียน")).toBeTruthy();
    expect(screen.getByText("นำเข้ารายชื่อจาก Excel หรือเพิ่มทีละคน")).toBeTruthy();
    expect(screen.getByRole("button", { name: /นำเข้านักเรียน/ })).toBeTruthy();
    expect(screen.getByLabelText("รหัสนักเรียน")).toBeTruthy(); // the field still works
  });
});

describe("field and camera (AC-56, AC-69)", () => {
  it("the field is numeric on a phone and named for screen readers", async () => {
    await open([kid(1)]);
    const input = screen.getByLabelText("รหัสนักเรียน") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.placeholder).toBe("ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter");
  });
  it("a camera problem says the reader and typing still work, with a way to close it", async () => {
    await open([kid(1)]);
    __scan.session.value = __scan.session.value; // keep the round
    const { cameraProblem } = await import("@client/components/scan/state");
    cameraProblem.value = { title: "ไม่พบกล้องในเครื่องนี้", hint: "ใช้เครื่องยิงหรือพิมพ์เลขที่แทน" };
    const bar = await screen.findByRole("alert", { name: "" }).catch(() => null);
    expect(bar).toBeTruthy();
    expect(document.body.textContent).toContain("เครื่องยิง/พิมพ์เลขที่ใช้ได้ตามปกติ");
    cameraProblem.value = null;
  });
});

describe("review round (R-3801, R-3802, R-3804)", () => {
  it("R-3801: the hero's 'รอส่ง n' counts children of this work like the queue card, not every op on the device", async () => {
    await open([kid(1), kid(2), kid(3)], [], "type");
    online.value = false;
    const op = (a: string, s: string, score: number | null) => [pairKey({ assignmentId: a, studentId: s }), { opId: a + s, assignmentId: a, studentId: s, status: "submitted", score, clientTs: 1 } as never] as const;
    // two children of this work, one op of another work, one more op for the same child (queue holds one per child here, the count must still be 2)
    pendingOps.value = new Map([op("a1", "s1", 20), op("a1", "s2", null), op("a9", "s9", 5)]);
    await waitFor(() => expect(document.querySelector("[aria-labelledby=sc-queue-h]")).toBeTruthy());
    expect(document.querySelector("[aria-labelledby=sc-queue-h]")!.textContent).toContain("รอส่งขึ้นระบบ 2");
    const chip = document.querySelector<HTMLElement>(".hero-pills [role=status]")!;
    expect(chip.textContent).toContain("ออฟไลน์ · รอส่ง 2");
    expect(chip.textContent).not.toContain("รอส่ง 3");
  });
  it("R-3802: 20 → 25 (ack) → 20 (poll): the bar goes away and nothing is patched to 25", async () => {
    await open([kid(1)], [], "full");
    staleFull.value = { aid: "a1", full: 25 };
    await waitFor(() => expect(document.querySelector(".sc-fullchg")).toBeTruthy());
    get.mockResolvedValue({ submissions: [], assignment: { status: "open", full_score: 20, deleted: false }, serverTime: 200 });
    await __scan.pollSubs();
    await waitFor(() => expect(document.querySelector(".sc-fullchg")).toBeNull());
    expect(fullScoreNow.value).toBeNull();
    expect(assignments.value[0].full_score).toBe(20);
  });
  describe("narrow head (R-3804)", () => {
    const real = window.matchMedia;
    beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as never; });
    afterEach(() => { window.matchMedia = real; });
    it("says 'ยังไม่ส่ง (3)' — a number, no 'คน' — and folds with aria-expanded", async () => {
      await open([kid(1), kid(2), kid(3)]);
      const head = document.querySelector<HTMLElement>("#sc-unsent-h button")!;
      expect(head.textContent!.replace(/\s+/g, " ").trim()).toBe("ยังไม่ส่ง (3)");
      expect(head.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(head);
      expect(head.getAttribute("aria-expanded")).toBe("true");
    });
    it("everyone in: '(0)', never an empty '()'", async () => {
      await open([kid(1)], [row(1, "submitted", 20)]);
      const t = document.querySelector<HTMLElement>("#sc-unsent-h button")!.textContent!.replace(/\s+/g, " ").trim();
      expect(t).toBe("ยังไม่ส่ง (0)");
      expect(t).not.toContain("()");
    });
  });
});
