import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Student } from "@shared/types";

// ui-redesign round 2 (random-name page): who can be drawn, the optional cards, skip / undo, pairs, groups, the timer.
const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/router", async (orig) => ({ ...(await orig<typeof import("@client/router")>()), navigate: vi.fn() }));

import { classes, students, settings } from "@client/store";
import { kvSet } from "@client/lib/idb";
import { bkkToday } from "@shared/time";
import { RandomPage } from "@client/pages/Random";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";

const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: null,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
});
const baseSettings = (over: Record<string, string> = {}) => ({
  school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
}) as never;
/** the random page with these extra cards turned on */
const withCards = (...keys: string[]) => {
  let l = defaultPageLayout("random") as never as import("@client/lib/cardLayout").CardLayout<string>;
  for (const k of keys) l = toggleLayoutCard(l, k);
  settings.value = baseSettings({ random_cards: serializeLayout(l) });
};

let rows: { student_id: string; status: string }[] = [];
// the draw "rolls" for a couple of seconds before it settles
const settle = { timeout: 9000 };

beforeEach(async () => {
  get.mockReset();
  rows = [{ student_id: "s1", status: "present" }, { student_id: "s2", status: "late" }, { student_id: "s3", status: "present" }, { student_id: "s4", status: "absent" }];
  get.mockImplementation(async () => ({ rows }));
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  students.value = [1, 2, 3, 4].map(kid);
  settings.value = baseSettings();
  await kvSet(`random:c1:${bkkToday()}`, []); // the day's history lives in device storage between tests
});

const draw = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่มเลย/ })); }); };
const body = () => document.body.textContent ?? "";

describe("random-name page", () => {
  it("draws only from the children who came (present and late), and says how many", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await draw();
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), settle);
    const shown = document.querySelector(".rnd-name")!.textContent!;
    expect(shown).not.toContain("เด็ก4");              // the absent child is never drawn
  });

  it("when attendance was not taken today it says so and offers the way on, instead of using the whole class", async () => {
    rows = [];
    render(h(RandomPage, {}));
    expect(await screen.findByText(/วันนี้ยังไม่ได้เช็คชื่อห้องนี้/)).toBeTruthy();
    // the way on is in the reason bar AND in the empty stage
    expect(screen.getAllByRole("button", { name: "ไปเช็คชื่อ" }).length).toBe(2);
    expect(screen.getByRole("button", { name: /สุ่มเลย/ }).hasAttribute("disabled")).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ใช้ทั้งห้อง \(4\)/ })); });
    await waitFor(() => expect(screen.getByRole("button", { name: /สุ่มเลย/ }).hasAttribute("disabled")).toBe(false));
  });

  it("the extra cards (timer, skip, range, pair, group options) are off until the teacher turns them on", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    for (const t of ["จับเวลาตอบ", "ข้ามคนนี้", "สุ่มเฉพาะเลขที่", "สุ่ม 2 คน"]) expect(body()).not.toContain(t);
    expect(body()).toContain("เรียกแล้ว 0");          // the history and options cards are on by default
    expect(body()).toContain("ไม่ซ้ำจนครบ");
  });

  it("the card drawer lists every card with a switch", async () => {
    render(h(RandomPage, {}));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับการ์ด" })); });
    for (const t of ["เรียกแล้ว", "ตัวเลือก", "จับเวลาตอบ", "ข้าม / เลิกทำ", "ช่วงเลขที่", "จับคู่", "ตัวเลือกกลุ่ม"]) {
      expect(screen.getByRole("switch", { name: `แสดงการ์ด ${t}` })).toBeTruthy();
    }
    expect(screen.getByRole("switch", { name: "แสดงการ์ด จับเวลาตอบ" }).getAttribute("aria-checked")).toBe("false");
  });

  it("undo takes the last child back out of the called list", async () => {
    withCards("pass");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await draw();
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), settle);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เลิกทำครั้งล่าสุด/ })); });
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 0"));
  });

  it("with pairs on, a draw shows two children as 'A คู่กับ B'", async () => {
    withCards("pair");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่ม 2 คน/ })); });
    await draw();
    // two cards side by side with "คู่กับ" between them
    await waitFor(() => expect(document.querySelectorAll(".rnd-pair").length).toBe(2), settle);
    expect(document.querySelector(".rnd-pairs")!.textContent).toContain("คู่กับ");
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 2"));
  });

  it("the number range keeps the draw to numbers x to y", async () => {
    withCards("range");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    // the range starts as the whole room (1 to the last number); typing the first number turns it on
    expect((screen.getByLabelText("เลขที่สุดท้าย") as HTMLInputElement).value).toBe("4");
    await act(async () => { fireEvent.input(screen.getByLabelText("เลขที่เริ่มต้น"), { target: { value: "3" } }); }); // range 3..4
    // the children who came are numbers 1, 2 and 3: only 3 is inside the range
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (1)"));
    await draw();
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), settle);
    expect(document.querySelector(".rnd-name")!.textContent).toContain("เด็ก3");
  });

  it("an empty range says so in its own words (not 'nobody came') and the way out turns the range off", async () => {
    withCards("range");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await act(async () => { fireEvent.input(screen.getByLabelText("เลขที่เริ่มต้น"), { target: { value: "5" } }); });
    await act(async () => { fireEvent.input(screen.getByLabelText("เลขที่สุดท้าย"), { target: { value: "9" } }); }); // 5..9: nobody who came
    await waitFor(() => expect(body()).toContain("ไม่มีใครเลขที่ 5–9"));
    expect(body()).not.toContain("วันนี้ไม่มีใครมาเรียน");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปิดช่วงเลขที่" })); });
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    expect(body()).not.toContain("ไม่มีใครเลขที่");
  });

  it("skip says who was skipped for a moment, then draws the next child", async () => {
    withCards("pass");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await draw();
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), settle);
    const who = document.querySelector(".rnd-name")!.textContent!;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ข้ามคนนี้/ })); });
    expect(document.querySelector(".rnd-name")!.textContent).toBe(`ข้าม ${who} แล้ว`);
    expect((screen.getByRole("button", { name: /ข้ามคนนี้/ }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(document.querySelector(".rnd-name")!.textContent).not.toContain("ข้าม"), settle);
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), settle);
    expect(document.querySelector(".rnd-name")!.textContent).not.toBe(who); // "skip" really moves on to somebody else
  }, 25000); // two draws, each rolls for a few seconds

  it("groups: every child who came is in exactly one group, and the leader star shows when that card is on", async () => {
    withCards("gopts");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /จับกลุ่ม/ })); });
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /จับกลุ่ม/ }).find((b) => b.classList.contains("primary"))!); });
    const groups = [...document.querySelectorAll(".rnd-group")];
    expect(groups.length).toBeGreaterThan(0);
    const text = groups.map((g) => g.textContent).join(" ");
    for (const n of [1, 2, 3]) expect(text).toContain(`${n} `);
    expect(text).not.toMatch(/(^|\s)4 /);
    // the leader has a star AND the word for a screen reader (not a star character alone)
    expect(groups[0].querySelector(".ti-star")).toBeTruthy();
    expect(groups[0].textContent).toContain("หัวหน้า");
  });

  it("the timer counts down and can be reset", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      withCards("timer");
      render(h(RandomPage, {}));
      await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
      expect(screen.getByRole("timer").textContent).toBe("30 วิ");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เริ่มจับเวลา/ })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(Number(screen.getByRole("timer").textContent!.replace(/\D/g, ""))).toBeLessThan(30);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ตั้งใหม่" })); });
      expect(screen.getByRole("timer").textContent).toBe("30 วิ");
    } finally { vi.useRealTimers(); }
  });
});

// ---- round 4: the page matches the design ----
import { moveLayoutCard } from "@client/lib/cardLayout";

/** a device that asks for less motion: the draw settles at once (and the tests do not wait for spinning names) */
function reducedMotion() {
  const prev = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  return () => { window.matchMedia = prev; };
}

describe("random-name page · design", () => {
  it("the 'only those who came' chip on the stage is a button that switches to the whole room and back", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    const stage = within(document.querySelector(".rnd-stage") as HTMLElement);
    await act(async () => { fireEvent.click(stage.getByRole("button", { name: /เฉพาะคนที่มา \(3\)/, pressed: true })); });
    expect(stage.getByRole("button", { name: /ทั้งห้อง \(4\)/, pressed: false })).toBeTruthy();
  });

  it("with reduced motion the answer comes at once, the stage does not announce, and the result is read out once", async () => {
    const restore = reducedMotion();
    try {
      render(h(RandomPage, {}));
      await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
      const stage = document.querySelector(".rnd-stage")!;
      expect(stage.getAttribute("aria-live")).toBe("off");
      const live = document.querySelector(".sr-only[role=status]")!;
      expect(live.textContent).toBe("");
      await draw();
      await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), { timeout: 2000 });
      expect(live.textContent).toMatch(/^สุ่มได้ เด็ก\d ทดสอบ/);
    } finally { restore(); }
  });

  it("when everybody has been called it says the next draw starts a new round", async () => {
    const restore = reducedMotion();
    try {
      render(h(RandomPage, {}));
      await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
      for (let i = 1; i <= 3; i++) {
        await draw();
        await waitFor(() => expect(body()).toContain(`เรียกแล้ว ${i}`), { timeout: 2000 });
      }
      expect(body()).toContain("เรียกครบทุกคนแล้ว (3) — สุ่มครั้งถัดไปเริ่มรอบใหม่");
      expect(body()).toContain("เหลือ 0 คน");
    } finally { restore(); }
  });

  it("groups: the draw button stays above the groups, and 'how many groups' does not say 'per group ~n'", async () => {
    const restore = reducedMotion();
    try {
      withCards("gopts");
      render(h(RandomPage, {}));
      await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /จับกลุ่ม/ })); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "กี่กลุ่ม", pressed: false })); });
      await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /จับกลุ่ม/ }).find((b) => b.classList.contains("primary"))!); });
      await waitFor(() => expect(document.querySelectorAll(".rnd-group").length).toBe(3));
      // 3 groups from 3 children: one child each — not "กลุ่มละ ~4"
      expect(document.querySelector(".rnd-sub")!.textContent).toBe("กลุ่มละประมาณ 1 คน · 3 คน");
      expect(body()).not.toContain("กลุ่มละ ~");
      const go = document.querySelector(".rnd-go")!, groups = document.querySelector(".rnd-groups")!;
      expect(go.compareDocumentPosition(groups) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally { restore(); }
  });

  it("the timer starts by itself after a draw when its card is on, and says when time is up", async () => {
    const restore = reducedMotion();
    try {
      withCards("timer");
      render(h(RandomPage, {}));
      await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "10 วิ" })); });
      await draw();
      await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), { timeout: 2000 });
      await waitFor(() => expect(Number(screen.getByRole("timer").textContent!.replace(/\D/g, ""))).toBeLessThan(10), { timeout: 3500 });
      expect(screen.getByRole("button", { name: /หยุด/ })).toBeTruthy(); // it is running
      // time is up after the ten seconds: a word, not only a colour
      await waitFor(() => expect(screen.getByText("หมดเวลา")).toBeTruthy(), { timeout: 12000 });
      expect(screen.getByRole("button", { name: /เริ่มจับเวลา/ })).toBeTruthy();
    } finally { restore(); }
  }, 25000);

  it("the range inputs start as the whole room (1 – last number), not 1 – 99", async () => {
    withCards("range");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    expect((screen.getByLabelText("เลขที่เริ่มต้น") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("เลขที่สุดท้าย") as HTMLInputElement).value).toBe("4");
  });

  it("the cards follow the order saved in 'ปรับการ์ด'", async () => {
    let l = defaultPageLayout("random") as never as import("@client/lib/cardLayout").CardLayout<string>; // default: hist, opts, ...
    const first = render(h(RandomPage, {}));
    await waitFor(() => expect(document.getElementById("rnd-hist-h")).toBeTruthy());
    const follows = (a: string, b: string) => !!(document.getElementById(a)!.compareDocumentPosition(document.getElementById(b)!) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows("rnd-hist-h", "rnd-opts-h")).toBe(true);
    first.unmount();
    l = moveLayoutCard(l, "opts", -1);
    settings.value = baseSettings({ random_cards: serializeLayout(l) });
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.getElementById("rnd-opts-h")).toBeTruthy());
    expect(follows("rnd-opts-h", "rnd-hist-h")).toBe(true);
  });
});
