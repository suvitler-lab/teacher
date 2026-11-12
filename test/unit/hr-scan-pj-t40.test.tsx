import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

// T-40 (home-redesign): the scan page's own "hide names" switch (AC-77, BR-18) on every surface, and the TV that follows only its own
// switch (AC-76 / SQ1). Names are made-up; "ซ่อนชื่อ" must leave no child name in text, aria-label or title.
const { get, post, enqueue } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enqueue: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put: vi.fn() } }));
const { listFailedMock } = vi.hoisted(() => ({ listFailedMock: vi.fn() }));
vi.mock("@client/lib/outbox", async (orig) => ({ ...await orig<typeof import("@client/lib/outbox")>(), enqueueSubmission: enqueue, listFailed: listFailedMock }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));
vi.mock("@client/lib/hid", () => ({ installHidScanner: () => () => {} }));

import { ScanPage, __scan } from "@client/pages/Scan";
import { assignments, classes, students, settings } from "@client/store";
import { pendingOps, failedPairKeys, failedCount, online, pairKey } from "@client/lib/outbox";
import { choices, excusedAsk } from "@client/components/scan/state";
import { readFileSync } from "node:fs";
import path from "node:path";
import { toasts } from "@client/lib/notify";
import { setHide, hideSignal } from "@client/lib/hideNames";
import { pjHideNames, setPjHideNames, startProjector, exitProjector } from "@client/lib/projector";
import { ProjectorButton } from "@client/components/Projector";

const asg: Assignment = {
  id: "a1", term_id: null, subject_id: null, type_id: null, title: "ใบงานเศษส่วน", unit: null, full_score: 20, assigned_date: null, due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const kid = (n: number, first: string): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n + "AAAAAAAAA", prefix: null, first_name: first, last_name: "สมมตินามสกุล", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const NAMES = ["สมชาย", "สมหญิง", "วิชัย"];
const kids = () => NAMES.map((f, i) => kid(i + 1, f));

/** every text, aria-label and title in the page */
function surface(): string {
  const parts: string[] = [document.body.textContent ?? ""];
  document.querySelectorAll("[aria-label],[title]").forEach((el) => { parts.push(el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? ""); });
  return parts.join("\n");
}
const leaks = () => NAMES.concat(["สมมตินามสกุล"]).filter((n) => surface().includes(n));

async function open(mode: "full" | "later" | "type" = "full") {
  get.mockResolvedValue({ submissions: [], serverTime: 100 });
  assignments.value = [asg];
  students.value = kids();
  await __scan.startSession("a1", "c1", mode);
  render(<ScanPage />);
  await waitFor(() => expect(__scan.subsBox.value.status).toBe("ready"));
}

beforeEach(() => {
  vi.clearAllMocks();
  listFailedMock.mockResolvedValue([]);
  choices.value = null; excusedAsk.value = null;
  localStorage.clear();
  setHide("scan", false); setHide("home", false);
  setPjHideNames(false); exitProjector();
  post.mockResolvedValue({}); enqueue.mockResolvedValue(undefined);
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 } as never];
  pendingOps.value = new Map(); failedPairKeys.value = new Set(); online.value = true;
  __scan.recent.value = []; __scan.feedback.value = null; __scan.ended.value = null;
  settings.value = { ...(settings.value ?? {}), scan_cards: "" } as never;
});
afterEach(() => { cleanup(); __scan.session.value = null; exitProjector(); });

describe("the switch (AC-77)", () => {
  it("button + banner: eye icon and words, aria-pressed, 'แสดงชื่อ' turns it back", async () => {
    await open();
    const btn = screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: /ซ่อนชื่ออยู่ — แตะ/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("ซ่อนชื่อนักเรียนอยู่ · ทุกจุดแสดงเฉพาะเลขที่")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "แสดงชื่อ" }));
    expect(screen.queryByText(/ซ่อนชื่อนักเรียนอยู่/)).toBeNull();
    expect(hideSignal("scan").value).toBe(false);
  });
  it("is the page's own value: home and scan do not move each other (BR-18)", () => {
    setHide("scan", true);
    setHide("home", false);
    expect(hideSignal("scan").value).toBe(true);
    setHide("scan", false);
    setHide("home", true);
    expect(hideSignal("scan").value).toBe(false);
  });
});

describe("no child name on any surface of the round while hidden (AC-77)", () => {
  it("shows names when the switch is off (so the test can tell)", async () => {
    await open();
    __scan.handleScan("1", "manual");
    await waitFor(() => expect(document.querySelector(".fb .name")?.textContent).toContain("สมชาย"));
    expect(leaks().length).toBeGreaterThan(0);
  });
  it("result card, recent, unsent, grid, options sheet, undo toast: only 'เลขที่ N'; the card keeps 'ส่งแล้ว' but not the score", async () => {
    await open();
    setHide("scan", true);
    __scan.handleScan("1", "manual");
    await waitFor(() => expect(document.querySelector(".fb .name")?.textContent).toBe("เลขที่ 1"));
    expect(document.querySelector(".fb .score")).toBeNull();
    expect(document.querySelector(".fb .sub")?.textContent).toContain("ส่งแล้ว");
    expect(document.querySelector(".sc-recent")?.textContent).toContain("เลขที่ 1");
    expect(document.querySelector(".sc-recent")?.textContent).not.toMatch(/20\/20/);
    expect(document.querySelector(".sc-unsent")?.textContent).toContain("เลขที่ 2");
    expect(screen.getByRole("button", { name: /^เลขที่ 2 · / })).toBeTruthy();
    expect(leaks()).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: "ตัวเลือก เลขที่ 1" })[0]);
    expect(leaks()).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: /ยกเลิกการส่ง/ }));
    await waitFor(() => expect(toasts.value.some((t) => t.message.includes("ยกเลิกการส่งของเลขที่ 1 แล้ว"))).toBe(true));
    expect(toasts.value.some((t) => NAMES.some((n) => t.message.includes(n)))).toBe(false);
    expect(leaks()).toEqual([]);
  });
  it("a result card already on screen follows the switch when it is turned on", async () => {
    await open();
    __scan.handleScan("2", "manual");
    await waitFor(() => expect(document.querySelector(".fb .name")?.textContent).toContain("สมหญิง"));
    setHide("scan", true);
    await waitFor(() => expect(document.querySelector(".fb .name")?.textContent).toBe("เลขที่ 2"));
    expect(leaks()).toEqual([]);
  });
  it("the score pad (type mode) names the child by number only", async () => {
    await open("type");
    setHide("scan", true);
    __scan.handleScan("3", "manual");
    await waitFor(() => expect(document.querySelector(".sc-pad")).toBeTruthy());
    expect(document.querySelector(".sc-pad-name")?.textContent).toBe("เลขที่ 3");
    expect(leaks()).toEqual([]);
  });
  it("the HID test panel does not say the name either", async () => {
    await open();
    setHide("scan", true);
    __scan.hidTestOn.value = true;
    settings.value = { ...(settings.value ?? {}), accept_student_code_scan: true } as never;
    __scan.testHid("101");
    await waitFor(() => expect(__scan.hidLog.value.length).toBe(1));
    expect(__scan.hidLog.value[0].who).toBe("เลขที่ 1");
    expect(leaks()).toEqual([]);
  });
});

describe("round summary while hidden (T-39 leftover)", () => {
  it("chips are numbers, 'คัดลอกรายชื่อ' is disabled and copies nothing", async () => {
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    await open();
    __scan.handleScan("1", "manual");
    setHide("scan", true);
    __scan.ended.value = __scan.session.value;
    __scan.session.value = null;
    cleanup(); render(<ScanPage />);
    await waitFor(() => expect(screen.getByText(/ซ่อนชื่อนักเรียนอยู่/)).toBeTruthy());
    expect(leaks()).toEqual([]);
    const copy = screen.getByRole("button", { name: /คัดลอกรายชื่อ/ }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    fireEvent.click(copy);
    expect(write).not.toHaveBeenCalled();
    expect([...document.querySelectorAll(".sc-names")].map((e) => e.textContent).join(" ")).toContain("เลขที่ 2");
  });
  it("copy button is enabled when the switch is off", async () => {
    await open();
    __scan.ended.value = __scan.session.value; __scan.session.value = null;
    cleanup(); render(<ScanPage />);
    expect((screen.getByRole("button", { name: /คัดลอกรายชื่อ/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the TV follows its own switch only (AC-76, SQ1)", () => {
  it("scan hidden + TV switch off -> the TV shows the name; starting the TV changes neither switch", async () => {
    await open();
    setHide("scan", true);
    __scan.handleScan("1", "manual");
    startProjector();
    await waitFor(() => expect(document.querySelector(".pj-lname")?.textContent).toBe("น้องสมชาย"));
    expect(document.querySelector(".pj")?.textContent).not.toMatch(/\d+\/20/);
    expect(hideSignal("scan").value).toBe(true);
    expect(pjHideNames.value).toBe(false);
  });
  it("scan visible + TV switch on -> the TV shows only the number", async () => {
    await open();
    setPjHideNames(true);
    __scan.handleScan("1", "manual");
    startProjector();
    await waitFor(() => expect(document.querySelector(".pj-lname")?.textContent).toBe("เลขที่ 1"));
    expect(document.querySelector(".pj")?.textContent).not.toContain("สมชาย");
    expect(hideSignal("scan").value).toBe(false);
  });
});

describe("ProjectorButton disabled (T-50)", () => {
  it("default: enabled and opens; disabled: greyed out and never opens", () => {
    const a = render(<ProjectorButton />);
    const b1 = a.getByRole("button", { name: /โหมดฉายจอ/ }) as HTMLButtonElement;
    expect(b1.disabled).toBe(false);
    fireEvent.click(b1);
    expect(a.getByRole("dialog", { name: "ตั้งค่าโหมดฉายจอ" })).toBeTruthy();
    a.unmount();
    const c = render(<ProjectorButton disabled />);
    const b2 = c.getByRole("button", { name: /โหมดฉายจอ/ }) as HTMLButtonElement;
    expect(b2.disabled).toBe(true);
    fireEvent.click(b2);
    expect(c.queryByRole("dialog")).toBeNull();
  });
});

describe("phone: 'จบรอบ' in the bar's menu (AC-78)", () => {
  it("opens, Esc closes and gives the focus back, a choice ends the round", async () => {
    await open();
    const more = screen.getByRole("button", { name: "เมนูเพิ่มเติม" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const item = screen.getByRole("menuitem", { name: /จบรอบ/ });
    expect(document.activeElement).toBe(item);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: /จบรอบ/ })).toBeNull();
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("menuitem", { name: /จบรอบ/ }));
    await waitFor(() => expect(__scan.ended.value).toBeTruthy());
    expect(__scan.session.value).toBeNull();
  });
  it("the wide-screen button still ends the round (same handler)", async () => {
    await open();
    fireEvent.click(document.querySelector(".hero-end") as HTMLElement);
    await waitFor(() => expect(__scan.ended.value).toBeTruthy());
  });
});

describe("texts built once follow a switch turned on later (R-4003)", () => {
  it("the undo toast and the HID test log lose the name when hiding starts", async () => {
    await open();
    __scan.handleScan("1", "manual");
    await waitFor(() => expect(__scan.recent.value.length).toBe(1));
    __scan.undo("s1");
    await waitFor(() => expect(toasts.value.some((t) => t.message.includes("สมชาย"))).toBe(true));
    settings.value = { ...(settings.value ?? {}), accept_student_code_scan: true } as never;
    __scan.hidTestOn.value = true;
    __scan.testHid("102");
    await waitFor(() => expect(__scan.hidLog.value[0]?.who).toContain("สมหญิง"));
    setHide("scan", true);
    expect(toasts.value.some((t) => NAMES.some((n) => t.message.includes(n)))).toBe(false);
    expect(toasts.value.some((t) => t.message.includes("ยกเลิกการส่งของเลขที่ 1"))).toBe(true);
    expect(__scan.hidLog.value[0].who).toBe("เลขที่ 2");
    await waitFor(() => expect(screen.getByText(/ซ่อนชื่อนักเรียนอยู่/)).toBeTruthy());
    expect(leaks()).toEqual([]);
  });
});

describe("other surfaces while hidden (R-4004)", () => {
  it("a result card with no opId is matched by its full name; two kids with the same name -> 'นักเรียน'", async () => {
    await open();
    setHide("scan", true);
    __scan.feedback.value = { kind: "danger", icon: "user-x", name: "สมหญิง สมมตินามสกุล", sub: "ไม่ได้อยู่ในห้องที่เลือก" };
    await waitFor(() => expect(document.querySelector(".fb .name")?.textContent).toBe("เลขที่ 2"));
    students.value = [...kids(), { ...kid(9, "สมหญิง"), id: "s9" }];
    await waitFor(() => expect(document.querySelector(".fb .name")?.textContent).toBe("นักเรียน"));
    // a card that is not about a child keeps its words
    __scan.feedback.value = { kind: "danger", icon: "alert-triangle", name: "บันทึกไม่สำเร็จ", sub: "x" };
    await waitFor(() => expect(document.querySelector(".fb .name")?.textContent).toBe("บันทึกไม่สำเร็จ"));
  });
  it("failed panel (and its drop question), queue card, choose-a-child card, exempt question", async () => {
    await open();
    setHide("scan", true);
    listFailedMock.mockResolvedValue([{ opId: "o1", reason: "assignment_closed", failedAt: 1, payload: { assignmentId: "a1", studentId: "s1" } }]);
    failedCount.value = 1;
    pendingOps.value = new Map([[pairKey({ assignmentId: "a1", studentId: "s2" }), { opId: "o2", assignmentId: "a1", studentId: "s2" } as never]]);
    choices.value = { raw: "3", students: [kid(3, "วิชัย"), { ...kid(3, "สมศรี"), id: "s33" }], method: "manual" };
    await waitFor(() => expect(document.querySelector(".sc-failed")).toBeTruthy());
    expect(document.querySelector(".sc-failed")?.textContent).toContain("เลขที่ 1");
    expect(document.querySelector(".sc-queue, [aria-labelledby=sc-queue-h]")?.textContent).toContain("เลขที่ 2");
    expect(document.querySelector(".sc-choose")?.textContent).toContain("เลขที่ 3");
    expect(leaks().concat(["สมศรี"].filter((n) => surface().includes(n)))).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "ทิ้ง" }));
    await waitFor(() => expect(document.body.textContent).toContain("ทิ้งรายการส่งของ เลขที่ 1?"));
    expect(leaks()).toEqual([]);
    choices.value = null;
    excusedAsk.value = { student: kid(2, "สมหญิง"), method: "manual" };
    await waitFor(() => expect(document.body.textContent).toContain("เลขที่ 2 ถูกตั้งเป็น"));
    expect(leaks()).toEqual([]);
  });
});

describe("sizes the AC asks for (R-4001, R-4002)", () => {
  const css = readFileSync(path.resolve(__dirname, "../../src/styles/scan.css"), "utf8");
  it("result-card name >= 28px, it wraps instead of cutting", () => {
    expect(css).toMatch(/\.fb \.name \{[^}]*font-size: 1.75rem;[^}]*overflow-wrap: anywhere/);
  });
  it("undo button and every score key >= 56px at any font size", () => {
    expect(css).toMatch(/\.fb-undo \{[^}]*min-height: 56px/);
    expect([...css.matchAll(/--key-h: max\(56px,/g)].length).toBe(2);
    expect(css).not.toMatch(/--key-h: max\(var\(--tap\)/);
  });
});
