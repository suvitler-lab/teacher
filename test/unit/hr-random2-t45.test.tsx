import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Student } from "@shared/types";

// T-45: hide names (per page, AC-119), the TV follows only its own switch (AC-120), the cards (AC-121), announcements (AC-123).
const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/router", async (orig) => ({ ...(await orig<typeof import("@client/router")>()), navigate: vi.fn() }));

import { classes, students, settings } from "@client/store";
import { kvSet } from "@client/lib/idb";
import { toasts } from "@client/lib/notify";
import { bkkToday } from "@shared/time";
import { RandomPage } from "@client/pages/Random";
import { defaultPageLayout, randomLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard, visibleCards } from "@client/lib/cardLayout";
import { setHide, hideSignal } from "@client/lib/hideNames";
import { projectorOn, pjHideNames } from "@client/lib/projector";

const kid = (n: number): Student => ({
  id: "s" + n, code: "10" + n, qr_token: "Q" + n, prefix: null, first_name: "สมหญิง" + n, last_name: "ใจดี" + n, nickname: "เล่น" + n,
  class_id: "c1", number: n, status: "active", left_at: null, updated_at: 0,
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
const go = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่ม(เลย|คนต่อไป)/ })); }); };
const live = () => document.querySelector(".sr-only[role=status]")!.textContent ?? "";
/** every place a name could hide: text, title, aria-label */
const everything = () => {
  const bits = [document.body.textContent ?? ""];
  document.querySelectorAll("[title],[aria-label]").forEach((e) => bits.push(e.getAttribute("title") ?? "", e.getAttribute("aria-label") ?? ""));
  return bits.join(" | ");
};
const NAME = /สมหญิง|ใจดี|เล่น\d/;
let restore = () => {};

beforeEach(async () => {
  get.mockReset(); toasts.value = []; localStorage.clear();
  setHide("random", false); setHide("home", false); pjHideNames.value = false; projectorOn.value = false;
  get.mockImplementation(async () => ({ rows: [1, 2, 3, 4].map((n) => ({ student_id: "s" + n, status: "present" })) }));
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false }] as never;
  students.value = [1, 2, 3, 4].map(kid);
  settings.value = baseSettings();
  await kvSet(`random:c1:${bkkToday()}`, []);
  restore = reduced();
});
afterEach(() => { restore(); projectorOn.value = false; pjHideNames.value = false; setHide("random", false); });

describe("hide names on the page (AC-119)", () => {
  it("a draw shows the number alone on the stage, the chips, the announcement and every title / aria-label", async () => {
    setHide("random", true);
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    expect(screen.getByRole("button", { name: /ซ่อนชื่ออยู่/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("ซ่อนชื่อนักเรียนอยู่ · แสดงเฉพาะเลขที่");
    await go();
    await waitFor(() => expect(document.body.textContent).toContain("สุ่มแล้ว (1)"));
    expect(document.querySelector(".rnd-name")!.textContent).toMatch(/^เลขที่ \d$/);
    expect(live()).toMatch(/^สุ่มได้ เลขที่ \d$/);
    expect(everything()).not.toMatch(NAME);
  });

  it("turning the switch on after a result is shown hides the name at once (nothing was frozen into text)", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await go();
    await waitFor(() => expect(document.body.textContent).toContain("สุ่มแล้ว (1)"));
    expect(everything()).toMatch(NAME);
    expect(live()).toMatch(/^สุ่มได้ เลขที่ \d สมหญิง\d ใจดี\d$/); // names shown: "สุ่มได้ เลขที่ 12 สมหญิง ใจดี" (AC-123)
    await act(async () => { setHide("random", true); });
    expect(everything()).not.toMatch(NAME);
    expect(live()).not.toMatch(NAME);
    await act(async () => { setHide("random", false); });
    expect(everything()).toMatch(NAME);
  });

  it("does not touch the other pages' switches (BR-18)", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ซ่อนชื่อนักเรียน" })); });
    expect(hideSignal("random").value).toBe(true);
    expect(hideSignal("home").value).toBe(false);
    expect(hideSignal("scan").value).toBe(false);
  });

  it("skip says 'ข้ามเลขที่ N แล้ว' with the names hidden, and announces the skip (R-4410)", async () => {
    withCards("pass");
    setHide("random", true);
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await go();
    await waitFor(() => expect(document.body.textContent).toContain("สุ่มแล้ว (1)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ข้ามคนนี้/ })); });
    expect(document.querySelector(".rnd-name")!.textContent).toMatch(/^ข้ามเลขที่ \d แล้ว$/);
    expect(live()).toMatch(/^ข้าม เลขที่ \d แล้ว$/);
    expect(everything()).not.toMatch(NAME);
  });

  it("groups: members are numbers, the leader is a star + number, copy is off with the reason, and nothing carries a name", async () => {
    withCards("gopts");
    setHide("random", true);
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /จับกลุ่ม/, pressed: false })); });
    await act(async () => { fireEvent.click(document.querySelector(".rnd-go")!); });
    await waitFor(() => expect(document.querySelector(".rnd-groups")).toBeTruthy());
    expect(document.querySelector(".rnd-group .lead")!.textContent).toMatch(/หัวหน้า เลขที่ \d/);
    expect((screen.getByRole("button", { name: /คัดลอกรายชื่อ/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("ปิดไว้ขณะซ่อนชื่อ");
    expect(everything()).not.toMatch(NAME);
  });
});

describe("the TV follows its own switch only (AC-120)", () => {
  const drawOnTv = async () => {
    projectorOn.value = true;
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("มาเรียน 4"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่มคนต่อไป/ })); });
    await waitFor(() => expect(document.querySelector(".pj .big")).toBeTruthy());
  };
  it("TV switch on + page switch off: numbers only on the TV", async () => {
    pjHideNames.value = true; setHide("random", false);
    await drawOnTv();
    expect(document.querySelector(".pj .big")!.textContent).toMatch(/^เลขที่ \d$/);
    expect(document.querySelector(".pj")!.textContent).not.toMatch(NAME);
  });
  it("TV switch off + page switch on: the TV still shows the name (the page's button does not hide the TV)", async () => {
    pjHideNames.value = false; setHide("random", true);
    await drawOnTv();
    expect(document.querySelector(".pj .big")!.textContent).toMatch(/สมหญิง\d/);
  });
  it("shows 'มาเรียน 4 · เหลือ 3' (no per-child data)", async () => {
    pjHideNames.value = true;
    await drawOnTv();
    expect(document.querySelector(".pj-tally")!.textContent).toBe("มาเรียน 4 · เหลือ 3");
  });
  it("cannot draw: a short reason, no 'go and check attendance' button", async () => {
    get.mockImplementation(async () => ({ rows: [] }));
    projectorOn.value = true;
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.querySelector(".pj .empty")?.textContent).toBe("วันนี้ยังไม่ได้เช็คชื่อห้องนี้"));
    expect(screen.queryByRole("button", { name: /ไปเช็คชื่อ/ })).toBeNull();
  });
  it("groups on the TV: '★ เลขที่ N' while the TV switch is on", async () => {
    withCards("gopts");
    pjHideNames.value = true;
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /จับกลุ่ม/, pressed: false })); });
    await act(async () => { fireEvent.click(document.querySelector(".rnd-go")!); });
    await waitFor(() => expect(document.querySelector(".rnd-groups")).toBeTruthy());
    await act(async () => { projectorOn.value = true; });
    expect(document.querySelector(".pgroups")!.textContent).toMatch(/★ เลขที่ \d/);
    expect(document.querySelector(".pj")!.textContent).not.toMatch(NAME);
  });
});

describe("cards (AC-121)", () => {
  it("'left' is registered: default on, right after 'hist'; skip / undo stays off as AC-121 says", () => {
    expect(visibleCards(randomLayout.value)).toEqual(["hist", "left", "opts"]);
  });
  it("the drawer lists 'ยังไม่ถูกสุ่ม' with a switch and the new locked words", async () => {
    render(h(RandomPage, {}));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับการ์ด" })); });
    expect(screen.getByRole("switch", { name: "แสดงการ์ด ยังไม่ถูกสุ่ม" }).getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain("hero · ชิปห้อง · แถบเหตุผล · เวที · ปุ่มสุ่ม/จับกลุ่ม");
  });
  it("hiding 'left' removes the panel", async () => {
    withCards("left");
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    expect(document.body.textContent).not.toContain("ยังไม่ถูกสุ่ม (");
  });
});

describe("review round (R-4503, R-4504, R-4506)", () => {
  it("an old saved layout (before 'left' existed) gains 'left' on, and a card hidden before stays hidden", async () => {
    settings.value = baseSettings({ random_cards: JSON.stringify({ v: 1, order: ["hist", "opts", "timer", "pass", "range", "pair", "gopts"], hidden: ["opts", "timer", "pass", "range", "pair", "gopts"] }) });
    expect(visibleCards(randomLayout.value)).toEqual(["hist", "left"]);
  });
  it("'แสดงชื่อ' in the banner hands the focus to the eye button instead of losing it", async () => {
    setHide("random", true);
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "แสดงชื่อ" })); });
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(".rnd-hidebtn")));
  });
  it("side chips: full name in title when shown, 'เลขที่ N' when hidden, and the number is read as 'เลขที่ N'", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("ยังไม่ถูกสุ่ม (4)"));
    const chip = document.querySelector(".rnd-chip.left") as HTMLElement;
    expect(chip.getAttribute("title")).toMatch(/^สมหญิง\d ใจดี\d$/);
    expect(chip.querySelector(".sr-only")!.textContent).toBe("เลขที่ ");
    await act(async () => { setHide("random", true); });
    expect((document.querySelector(".rnd-chip.left") as HTMLElement).getAttribute("title")).toMatch(/^เลขที่ \d$/);
  });
  it("new round and undo are announced", async () => {
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await go();
    await waitFor(() => expect(document.body.textContent).toContain("สุ่มแล้ว (1)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เริ่มรอบใหม่/ })); });
    expect(live()).toBe("เริ่มรอบใหม่แล้ว");
  });
  it("undo says 'เลิกทำแล้ว'", async () => {
    withCards("pass");
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("เฉพาะคนที่มา (4)"));
    await go();
    await waitFor(() => expect(document.body.textContent).toContain("สุ่มแล้ว (1)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /เลิกทำครั้งล่าสุด/ })); });
    expect(live()).toBe("เลิกทำแล้ว");
  });
  it("TV: the skip button shows when the skip card is on, and skipping says 'ข้ามเลขที่ N แล้ว' with the TV switch on", async () => {
    withCards("pass");
    pjHideNames.value = true; projectorOn.value = true;
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("มาเรียน 4"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่มคนต่อไป/ })); });
    await waitFor(() => expect(document.querySelector(".pj .big")).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ข้าม/ })); });
    expect(document.querySelector(".pj .big")!.textContent).toMatch(/^ข้ามเลขที่ \d แล้ว$/);
  });
  it("TV: the spinning names carry no name while the TV switch is on", async () => {
    restore();
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
    pjHideNames.value = true; projectorOn.value = true;
    render(h(RandomPage, {}));
    await waitFor(() => expect(document.body.textContent).toContain("มาเรียน 4"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่มคนต่อไป/ })); });
    await waitFor(() => expect(document.querySelector(".pj .big")).toBeTruthy());
    expect(document.querySelector(".pj")!.textContent).not.toMatch(NAME);
    expect(document.querySelector(".pj .big")!.textContent).toMatch(/^เลขที่ \d$/);
  });
});
