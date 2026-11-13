// home-redesign T-31 (AC-45, AC-46, AC-47, AC-49, AC-50): the menu — rail groups, phone bar + "more" sheet, deep link after sign-in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put: vi.fn() } }));
for (const [m, n] of [["Setup", "Setup"], ["Onboarding", "Onboarding"], ["Home", "Home"], ["Scan", "ScanPage"], ["Gradebook", "GradebookPage"], ["Attendance", "AttendancePage"], ["Random", "RandomPage"], ["Students", "StudentsPage"], ["Settings", "SettingsPage"], ["Reports", "ReportsPage"], ["Timetable", "TimetablePage"]]) {
  vi.doMock(`@client/pages/${m}`, () => ({ [n]: () => <div data-page={m} /> }));
}

import { Shell } from "@client/components/Shell";
import { route } from "@client/router";
import { authState, settings } from "@client/store";
import { pendingCount } from "@client/lib/outbox";

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/home";
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("hr-menu: rail (AC-45, AC-49)", () => {
  it("holds exactly the nine pages in four text-labelled groups and nothing else", () => {
    route.value = "/reports";
    render(<Shell><div /></Shell>);
    const rail = screen.getByRole("navigation", { name: "เมนูหลัก" });
    const groups = within(rail).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["วันนี้", "ในห้องเรียน", "ตรวจงาน", "จัดการ"]);
    // the heading words exist in the page (visible text), one per group
    expect([...rail.querySelectorAll(".rail-gl")].map((e) => e.textContent)).toEqual(["วันนี้", "ในห้องเรียน", "ตรวจงาน", "จัดการ"]);
    const links = within(rail).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["หน้าหลัก", "ตารางสอน", "สแกน", "เช็คชื่อ", "สุ่มชื่อ", "คะแนน", "รายงาน", "นักเรียน", "ตั้งค่า"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#/home", "#/timetable", "#/scan", "#/attendance", "#/random", "#/gradebook", "#/reports", "#/students", "#/settings"]);
    expect(rail.textContent).not.toMatch(/บัตร QR|สำรองข้อมูล/);
    expect(links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual(["รายงาน"]);
  });

  it("keeps DOM order = visual order (no tabindex tricks) so Tab goes top to bottom", () => {
    render(<Shell><div /></Shell>);
    const rail = screen.getByRole("navigation", { name: "เมนูหลัก" });
    expect(rail.querySelectorAll("[tabindex]").length).toBe(0);
    const order = [...rail.querySelectorAll("a,button")].map((e) => e.textContent);
    expect(order[0]).toBe("หน้าหลัก");
    expect(order.at(-1)).toBe("ออกจากระบบ");
  });
});

describe("hr-menu: phone bar and the more sheet (AC-47)", () => {
  it("five slots, scan in the middle", () => {
    render(<Shell><div /></Shell>);
    const bar = screen.getByRole("navigation", { name: "เมนู" });
    const slots = [...bar.querySelectorAll(".tab-item")];
    expect(slots.map((e) => e.textContent!.trim())).toEqual(["หน้าหลัก", "เช็คชื่อ", "สแกน", "คะแนน", "เพิ่มเติม"]);
    expect(slots[2].classList.contains("tab-scan")).toBe(true);
  });

  it("opens with text group labels and the original targets; Esc closes and focus returns to the button", async () => {
    render(<Shell><div /></Shell>);
    const btn = screen.getByRole("button", { name: "เพิ่มเติม" });
    fireEvent.click(btn);
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["วันนี้", "ในห้องเรียน", "ตรวจงาน", "จัดการ"]);
    expect(within(sheet).getAllByRole("link").map((a) => [a.textContent!.trim(), a.getAttribute("href")])).toEqual([
      ["ตารางสอน", "#/timetable"], ["สุ่มชื่อ", "#/random"], ["รายงาน", "#/reports"], ["นักเรียน", "#/students"], ["ตั้งค่า", "#/settings"],
    ]);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(btn);
  });

  it("closes on a tap outside the sheet and on choosing an item, focus back on the button", async () => {
    render(<Shell><div /></Shell>);
    const btn = screen.getByRole("button", { name: "เพิ่มเติม" });
    fireEvent.click(btn);
    fireEvent.click(document.querySelector(".sheet-overlay")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: /สุ่มชื่อ/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(btn);
  });

  it("marks the more button as current when the page is one of its items", () => {
    route.value = "/students";
    render(<Shell><div /></Shell>);
    expect(screen.getByRole("button", { name: "เพิ่มเติม" }).className).toContain("on");
  });
});

describe("hr-menu: deep link before sign-in (AC-50)", () => {
  it("only real pages other than home count as a deep link", async () => {
    const { deepLinkOf } = await import("@client/app");
    expect(deepLinkOf("/scan")).toBe("/scan");
    expect(deepLinkOf("/timetable?term=x")).toBe("/timetable?term=x");
    expect(deepLinkOf("/settings?section=catalog")).toBe("/settings?section=catalog");
    expect(deepLinkOf("/home")).toBeNull();
    expect(deepLinkOf("/")).toBeNull();
    expect(deepLinkOf("/nope")).toBeNull();
  });

  it("shows no menu while signed out, then opens the requested page after sign-in (which sends everyone to #/home)", async () => {
    get.mockReturnValue(new Promise(() => {})); // /api/auth/me never answers: the test drives authState itself
    route.value = "/scan";
    authState.value = "login";
    settings.value = null;
    const { App } = await import("@client/app");
    render(<App />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(document.querySelector(".rail,.bottom-tabs")).toBeNull();
    // what Setup does on success
    authState.value = "ready";
    location.hash = "/home";
    // let the hashchange and App's effect really run: route was "/scan" before, so a bare waitFor would pass at once (T-31 R-01)
    await settle();
    expect(location.hash).toBe("#/scan");
    expect(route.value).toBe("/scan");
    expect(document.querySelector("[data-page=Scan]")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "เมนูหลัก" })).toBeTruthy();
  });

  it("keeps a link tapped while the sign-in page is already open (hashchange only, no new start) (T-31 R-04)", async () => {
    get.mockReturnValue(new Promise(() => {}));
    location.hash = "/home";
    route.value = "/home"; // opened with no deep link
    authState.value = "login";
    settings.value = null;
    const { App } = await import("@client/app");
    render(<App />);
    expect(document.querySelector(".rail")).toBeNull();
    location.hash = "/students?x=1"; // the teacher taps a link while the sign-in page is showing
    await settle();
    expect(route.value).toBe("/students?x=1");
    authState.value = "ready";
    location.hash = "/home"; // what Setup does on success
    await settle();
    expect(location.hash).toBe("#/students?x=1");
    expect(document.querySelector("[data-page=Students]")).toBeTruthy();
  });
});

describe("hr-menu: the sheet title and the sign-out question (T-31 R-03, R-07)", () => {
  it("the sheet is named like the button that opened it", () => {
    render(<Shell><div /></Shell>);
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มเติม" }));
    expect(screen.getByRole("dialog", { name: "เพิ่มเติม" })).toBeTruthy();
  });

  it("choosing 'อยู่ต่อ' on the sign-out question puts focus back on the 'เพิ่มเติม' button", async () => {
    pendingCount.value = 2; // work waiting on this device: signing out asks first
    try {
      render(<Shell><div /></Shell>);
      const more = screen.getByRole("button", { name: "เพิ่มเติม" });
      fireEvent.click(more);
      fireEvent.click(within(screen.getByRole("dialog", { name: "เพิ่มเติม" })).getByRole("button", { name: /ออกจากระบบ/ }));
      const ask = await screen.findByRole("alertdialog");
      (more as HTMLElement).blur(); // Safari: a tap never focused the button, so nothing remembers it
      fireEvent.click(within(ask).getByRole("button", { name: "อยู่ต่อ" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      await settle();
      expect(document.activeElement).toBe(more);
    } finally { pendingCount.value = 0; }
  });
});
