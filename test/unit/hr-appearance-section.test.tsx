// T-32: settings > หน้าตา — what the section shows (AC-01, AC-44), the deep link and the old name of the catalog section (AC-48).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/preact";
import fs from "node:fs";
import path from "node:path";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));

import { SettingsPage } from "@client/pages/Settings";
import { settings, terms, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import { resetAppearanceForTests, applyStoredAppearance } from "@client/lib/appearance";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "system", accent: "",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetAppearanceForTests();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  get.mockImplementation(async (url: string) => (url.includes("devices") ? { devices: [] } : url.includes("restore") ? { pending: false, maintenance: false } : { rows: [] }));
  put.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  settings.value = base();
  route.value = "/settings?section=appearance";
  window.location.hash = "#/settings?section=appearance";
});
afterEach(() => { cleanup(); });

const open = async () => { render(<SettingsPage />); await screen.findByRole("heading", { level: 2, name: "หน้าตา" }); };
const checkedLabel = (g: HTMLElement) => within(g).getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked).map((r) => r.getAttribute("aria-label"));

describe("AC-44 / AC-01: the appearance section", () => {
  it("?section=appearance opens it, first of the กลุ่ม เครื่องนี้ in the side menu (AC-207: after ใช้บ่อย + การสอน)", async () => {
    await open();
    const nav = screen.getByRole("navigation", { name: "หมวดตั้งค่า" });
    const names = within(nav).getAllByRole("button").map((b) => b.textContent!.trim());
    expect(names[0]).toContain("ภาพรวม");
    expect(names[5]).toContain("หน้าตา"); // after ภาพรวม · เวลาเรียน · การสแกน · ห้องเรียน วิชา ภาคเรียน · ประเภทงาน
    expect(within(nav).getByRole("button", { name: /หน้าตา/ }).getAttribute("aria-current")).toBe("page");
  });

  it("3 layouts, 3 skins, 3 modes as radio groups in that order; the saved ones are checked and marked ใช้อยู่", async () => {
    settings.value = base({ accent: JSON.stringify({ v: 1, skin: "playful", layout: "b" }), theme: "dark" });
    applyStoredAppearance();
    // the saved server value is adopted once, when the app opens
    await open();
    const groups = screen.getAllByRole("radiogroup");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["โครงหน้าหลัก", "ธีม", "สว่าง หรือ มืด"]);
    for (const g of groups) expect(within(g).getAllByRole("radio")).toHaveLength(3);
    expect(checkedLabel(groups[0])[0]).toContain("แผงรายห้อง");
    expect(checkedLabel(groups[1])[0]).toContain("สดใส");
    expect(checkedLabel(groups[2])).toEqual(["มืด"]);
    for (const g of groups) expect(checkedLabel(g)).toHaveLength(1);
    expect(document.querySelectorAll('input[type="radio"][aria-checked]')).toHaveLength(0); // native radios: `checked` only (R-3206)
    expect(document.querySelectorAll('[role="radiogroup"] [role="radiogroup"]')).toHaveLength(0); // no group inside a group
    expect(screen.getAllByText("ใช้อยู่")).toHaveLength(3); // a word, not colour alone
  });

  it("each layout card has a picture, a name and a one-line hint; each skin card has 4 swatches and กขค 123", async () => {
    await open();
    const [layouts, skins] = screen.getAllByRole("radiogroup");
    expect(layouts.querySelectorAll("svg.ap-thumb")).toHaveLength(3);
    for (const t of ["ก วันนี้ของครู", "ข แผงรายห้อง", "ค โฟกัสงานถัดไป", "ทีละเรื่อง ใหญ่ ชัด เหมาะกับใช้ในห้องเรียน"]) expect(within(layouts).getByText(t)).toBeTruthy();
    expect(skins.querySelectorAll(".ap-sw i")).toHaveLength(12);
    expect(within(skins).getAllByText("กขค 123")).toHaveLength(3);
    expect(skins.querySelectorAll("[data-skin]")).toHaveLength(3);
  });

  it("nothing saved: ก + อบอุ่น + ตามเครื่อง", async () => {
    await open();
    const [a, b, c] = screen.getAllByRole("radiogroup");
    expect(checkedLabel(a)[0]).toContain("ก วันนี้ของครู");
    expect(checkedLabel(b)[0]).toContain("อบอุ่น");
    expect(checkedLabel(c)).toEqual(["ตามเครื่อง"]);
  });

  it("has the moved text-size and density controls, a live preview, a reset button and no save button", async () => {
    await open();
    expect(screen.getByLabelText("เพิ่มขนาดตัวอักษร")).toBeTruthy();
    expect(screen.getByLabelText("ลดขนาดตัวอักษร")).toBeTruthy();
    expect(screen.getByRole("group", { name: "ความหนาแน่น" })).toBeTruthy();
    expect(document.querySelector('aside[aria-label="ตัวอย่างสด"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /ไปดูหน้าหลัก/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /คืนค่าเริ่มต้น/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^บันทึก/ })).toBeNull();
    expect(screen.getByText("เลือกแล้วเห็นผลทันที · บันทึกอัตโนมัติ")).toBeTruthy();
  });

  it("the focus order follows layout, skin, mode, text size, reset", async () => {
    await open();
    expect([...document.querySelectorAll(".ap-opts fieldset > legend")].map((l) => l.textContent)).toEqual(["โครงหน้าหลัก", "ธีม", "สว่าง / มืด", "ขนาดตัวอักษรและความหนาแน่น"]);
    const opts = document.querySelector(".ap-opts")!;
    expect(opts.lastElementChild!.className).toContain("ap-reset");
  });
});

describe("AC-48: the catalog section name", () => {
  it("no 'ข้อมูลพื้นฐาน' is left anywhere in src/", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|css)$/.test(e.name) && fs.readFileSync(p, "utf8").includes("ข้อมูลพื้นฐาน")) hits.push(p);
      }
    };
    walk(path.resolve(__dirname, "../../src"));
    expect(hits).toEqual([]);
  });
});
