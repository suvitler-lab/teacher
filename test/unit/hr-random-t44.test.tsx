import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Student } from "@shared/types";

// T-44: hero numbers (BR-24), reasons (RS-xx), skip / undo / new round, the soft "ting" (D44), races.
const get = vi.hoisted(() => vi.fn());
const ting = vi.hoisted(() => vi.fn());
const primeAudio = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/router", async (orig) => ({ ...(await orig<typeof import("@client/router")>()), navigate: vi.fn() }));
vi.mock("@client/lib/sound", async (orig) => ({ ...(await orig<typeof import("@client/lib/sound")>()), ting, primeAudio }));

import { classes, students, settings } from "@client/store";
import { kvSet, kvGet } from "@client/lib/idb";
import { toasts } from "@client/lib/notify";
import { bkkToday } from "@shared/time";
import { RandomPage } from "@client/pages/Random";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";

const kid = (n: number, cls = "c1"): Student => ({
  id: cls + "s" + n, code: "10" + n, qr_token: "Q" + cls + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: null,
  class_id: cls, number: n, status: "active", left_at: null, updated_at: 0,
});
const baseSettings = (over: Record<string, string> = {}) => ({ theme: "light", sound_enabled: true, home_cards: "", random_cards: "", ...over }) as never;
const withCards = (...keys: string[]) => {
  let l = defaultPageLayout("random") as never as import("@client/lib/cardLayout").CardLayout<string>;
  for (const k of keys) l = toggleLayoutCard(l, k);
  settings.value = baseSettings({ random_cards: serializeLayout(l) });
};
function reduced() {
  const prev = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  return () => { window.matchMedia = prev; };
}
const body = () => document.body.textContent ?? "";
const key = (c = "c1") => `random:${c}:${bkkToday()}`;
const go = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่ม(เลย|คนต่อไป)/ })); }); };
const hero = () => document.querySelector(".rnd-hero") as HTMLElement;
let rows: { student_id: string; status: string }[] = [];
let restore = () => {};

beforeEach(async () => {
  get.mockReset(); ting.mockReset(); primeAudio.mockReset(); toasts.value = []; localStorage.clear();
  rows = [1, 2, 3].map((n) => ({ student_id: "c1s" + n, status: n === 2 ? "late" : "present" }));
  rows.push({ student_id: "c1s4", status: "absent" });
  get.mockImplementation(async () => ({ rows }));
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false }, { id: "c2", name: "ป.6/2", year: 2569, grade: null, archived: false }] as never;
  students.value = [...[1, 2, 3, 4].map((n) => kid(n)), kid(1, "c2"), kid(2, "c2")];
  settings.value = baseSettings();
  await kvSet(key(), []); await kvSet(key("c2"), []);
  restore = reduced();
});
afterEach(() => restore());

describe("hero numbers (AC-107, AC-113, BR-24)", () => {
  it("drawn = N - m: a history id outside the pool is not counted, and the ring says the same", async () => {
    await kvSet(key(), ["c1s4", "c1s1"]); // s4 is absent today (drawn while the whole room was the base)
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    expect(body()).toContain("ยังไม่ถูกสุ่ม (2)");
    const ring = screen.getByRole("progressbar", { name: "สุ่มแล้วกี่คนในรอบนี้" });
    expect(ring.getAttribute("aria-valuenow")).toBe("1");
    expect(ring.getAttribute("aria-valuemax")).toBe("3");
    expect(hero().textContent).toContain("มาเรียน3 จาก 4");
    // whole room: the same history now counts both
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เฉพาะคนที่มา \(3\)/, pressed: true })); });
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (2)"));
    expect(body()).toContain("ยังไม่ถูกสุ่ม (2)");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuemax")).toBe("4");
  });

  it("never shows drawn 0 before attendance and history are known", async () => {
    let release: (v: unknown) => void = () => {};
    get.mockImplementation(() => new Promise((r) => { release = r; }));
    render(h(RandomPage, {}));
    expect(body()).not.toContain("สุ่มแล้ว (0)");
    expect(body()).toContain("สุ่มแล้ว (–)");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect((screen.getByRole("button", { name: /สุ่มเลย/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(body()).toContain("รอสักครู่");
    await act(async () => { release({ rows }); });
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (0)"));
  });

  it("an empty room says so before not-checked or nobody-came, with the way to import", async () => {
    students.value = [];
    rows = [];
    render(h(RandomPage, {}));
    expect(await screen.findByText("ห้องนี้ยังไม่มีนักเรียน", { selector: ".rnd-name" })).toBeTruthy();
    expect(body()).not.toContain("ยังไม่ได้เช็คชื่อ");
    expect(body()).not.toContain("ไม่มีใครมาเรียน");
    expect(screen.getByRole("button", { name: /นำเข้านักเรียน/ })).toBeTruthy();
  });

  it("offline with no attendance: says whole-room draws still work", async () => {
    get.mockImplementation(async () => { throw new Error("x"); });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      render(h(RandomPage, {}));
      expect(await screen.findByText(/สุ่มทั้งห้องได้ปกติ ประวัติเก็บในเครื่อง/)).toBeTruthy();
      expect(hero().textContent).toContain("ออฟไลน์");
      expect(screen.getByRole("button", { name: /สุ่มเลย/ }).hasAttribute("disabled")).toBe(true);
    } finally { Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); }
  });
});

describe("draw, skip, undo, new round (AC-110, AC-112, BR-25)", () => {
  it("nobody repeats until everybody has been drawn, and the button becomes next", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      await go();
      await waitFor(() => expect(body()).toContain(`สุ่มแล้ว (${i + 1})`));
      seen.push(document.querySelector(".rnd-badge")!.textContent!);
    }
    expect(new Set(seen).size).toBe(3);
    expect(screen.getByRole("button", { name: /สุ่มคนต่อไป/ })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("3");
    expect(body()).toContain("สุ่มครบทุกคนแล้ว");
  });

  it("skip puts the child back (drawn stays one) and the next draw is someone else", async () => {
    withCards("pass");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    const first = document.querySelector(".rnd-badge")!.textContent;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ข้ามคนนี้/ })); });
    expect(document.querySelector(".rnd-name")!.textContent).toMatch(/^ข้าม .* แล้ว$/);
    await waitFor(() => expect(document.querySelector(".rnd-name")!.textContent).not.toContain("ข้าม"), { timeout: 3000 });
    expect(body()).toContain("สุ่มแล้ว (1)");
    expect(document.querySelector(".rnd-badge")!.textContent).not.toBe(first);
  });

  it("new round: toast with an undo that brings the old round back", async () => {
    await kvSet(key(), ["c1s1", "c1s3"]);
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (2)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เริ่มรอบใหม่/ })); });
    expect(body()).toContain("สุ่มแล้ว (0)");
    const t = toasts.value.find((x) => x.message.includes("เริ่มรอบใหม่แล้ว"))!;
    expect(t.message).toBe("เริ่มรอบใหม่แล้ว · สุ่มแล้ว 0 จาก 3");
    expect(t.action?.label).toBe("เลิกทำ");
    await act(async () => { t.action!.run(); });
    expect(body()).toContain("สุ่มแล้ว (2)");
    expect(await kvGet<string[]>(key())).toEqual(["c1s1", "c1s3"]);
  });

  it("undoing a new round does nothing once something was drawn after it", async () => {
    await kvSet(key(), ["c1s1"]);
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เริ่มรอบใหม่/ })); });
    const t = toasts.value.find((x) => x.message.includes("เริ่มรอบใหม่แล้ว"))!;
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    await act(async () => { t.action!.run(); });
    expect(body()).toContain("สุ่มแล้ว (1)");
    expect((await kvGet<string[]>(key()))!.length).toBe(1);
  });

  it("changing room while the names still spin leaves both rooms history untouched", async () => {
    restore(); // real motion: the draw takes a couple of seconds
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await go();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /ป\.6\/2/ })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 3600)); });
    expect(await kvGet<string[]>(key())).toEqual([]);
    expect(await kvGet<string[]>(key("c2"))).toEqual([]);
    expect(document.querySelector(".rnd-badge")).toBeNull();
  }, 15000);
});

describe("the soft ting (AC-115, BR-28, D44)", () => {
  const sw = () => screen.getByRole("switch", { name: "เสียงติ๊งตอนได้ชื่อ" });
  it("is off at first, remembered per device, and sounds once per settled result", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    expect(sw().getAttribute("aria-checked")).toBe("false");
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    expect(ting).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(sw()); });
    expect(localStorage.getItem("ngankrob-random-tick")).toBe("1");
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (2)"));
    expect(ting).toHaveBeenCalledTimes(1);
  });
  it("comes back on after a reload (a new mount reads this device)", async () => {
    localStorage.setItem("ngankrob-random-tick", "1");
    render(h(RandomPage, {}));
    await waitFor(() => expect(sw().getAttribute("aria-checked")).toBe("true"));
  });
  it("one ting for a draw of several people, none in group mode", async () => {
    localStorage.setItem("ngankrob-random-tick", "1");
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await act(async () => { fireEvent.click(within(screen.getByRole("group", { name: "จำนวนต่อครั้ง" })).getByRole("button", { name: "เพิ่ม" })); });
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (2)"));
    expect(ting).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(within(hero()).getByRole("button", { name: /จับกลุ่ม/ })); });
    await act(async () => { fireEvent.click(document.querySelector(".rnd-go")!); });
    await waitFor(() => expect(document.querySelectorAll(".rnd-group").length).toBeGreaterThan(0));
    expect(ting).toHaveBeenCalledTimes(1);
  });
});

describe("groups (AC-116)", () => {
  it("says the result is not saved, the live line names the plan, and changing room drops it", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await act(async () => { fireEvent.click(within(hero()).getByRole("button", { name: /จับกลุ่ม/ })); });
    await act(async () => { fireEvent.click(document.querySelector(".rnd-go")!); });
    await waitFor(() => expect(body()).toContain("ผลจับกลุ่มไม่ถูกบันทึก — คัดลอกไว้ถ้าต้องใช้"));
    expect(document.querySelector(".sr-only[role=status]")!.textContent).toMatch(/^แบ่งได้ \d+ กลุ่ม กลุ่มละประมาณ \d+ คน$/);
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /ป\.6\/2/ })); });
    expect(document.querySelectorAll(".rnd-group").length).toBe(0);
  });
});

describe("review fixes R-4401 / R-4403 / R-4405", () => {
  it("R-4401: new-round undo after moving to another room does not touch that room", async () => {
    await kvSet(key(), ["c1s1"]);
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เริ่มรอบใหม่/ })); });
    const t = toasts.value.find((x) => x.message.includes("เริ่มรอบใหม่แล้ว"))!;
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /ป\.6\/2/ })); });
    await waitFor(() => expect(hero().textContent).toContain("ป.6/2"));
    await act(async () => { t.action!.run(); });
    expect(await kvGet<string[]>(key("c2"))).toEqual([]);
    expect(await kvGet<string[]>(key())).toEqual([]); // the old room stays reset, not restored behind the teacher back
    expect(body()).not.toContain("สุ่มแล้ว (1)");
  });

  it("R-4403: the base chip shows a dash, not (0), while loading or before attendance is taken", async () => {
    let release: (v: unknown) => void = () => {};
    get.mockImplementation(() => new Promise((r) => { release = r; }));
    render(h(RandomPage, {}));
    expect(hero().textContent).toContain("เฉพาะคนที่มา (–)");
    await act(async () => { release({ rows: [] }); });
    await waitFor(() => expect(body()).toContain("วันนี้ยังไม่ได้เช็คชื่อห้องนี้"));
    expect(hero().textContent).toContain("เฉพาะคนที่มา (–)");
    expect(hero().textContent).not.toContain("(0)");
  });

  it("R-4405: the audio context is woken inside the tap only when the ting is on", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    expect(primeAudio).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("switch", { name: "เสียงติ๊งตอนได้ชื่อ" })); });
    await go();
    expect(primeAudio).toHaveBeenCalledTimes(1);
  });
});
