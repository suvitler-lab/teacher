import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
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
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", ...over,
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
    expect(screen.getByRole("button", { name: "ไปเช็คชื่อ" })).toBeTruthy();
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
    await act(async () => { fireEvent.click(screen.getByLabelText(/สุ่ม 2 คน/)); });
    await draw();
    await waitFor(() => expect(document.querySelector(".rnd-name")!.textContent).toMatch(/.+ คู่กับ .+/), settle);
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 2"));
  });

  it("the number range keeps the draw to numbers x to y", async () => {
    withCards("range");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await act(async () => { fireEvent.click(screen.getByLabelText(/สุ่มเฉพาะเลขที่/)); });
    for (let i = 0; i < 2; i++) await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เลขเริ่มเพิ่ม" })); }); // range 3..99
    // the children who came are numbers 1, 2 and 3: only 3 is inside the range
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (1)"));
    await draw();
    await waitFor(() => expect(body()).toContain("เรียกแล้ว 1"), settle);
    expect(document.querySelector(".rnd-name")!.textContent).toContain("เด็ก3");
  });

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
    expect(text).toContain("★");
  });

  it("the timer counts down and can be reset", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      withCards("timer");
      render(h(RandomPage, {}));
      await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
      expect(screen.getByRole("timer").textContent).toBe("30 วิ");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เริ่ม/ })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(Number(screen.getByRole("timer").textContent!.replace(/\D/g, ""))).toBeLessThan(30);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ตั้งใหม่" })); });
      expect(screen.getByRole("timer").textContent).toBe("30 วิ");
    } finally { vi.useRealTimers(); }
  });
});
