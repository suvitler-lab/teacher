// T-55 (AC-235..238, BR-51, BR-52, BR-60): the privacy section and the device section of the settings. Fictitious data only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));
const { collect } = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock("@client/lib/deviceCheck", async (orig) => ({ ...await orig<typeof import("@client/lib/deviceCheck")>(), collectDeviceFacts: collect }));

import { SettingsPage } from "@client/pages/Settings";
import { settings, terms, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import { online, pendingCount } from "@client/lib/outbox";
import { pjHideNames, pjTheme, pjSize, projectorOn } from "@client/lib/projector";
import { HIDE_PAGES, hideKey, hideSignal, setHide, setHideAll } from "@client/lib/hideNames";
import { clearLocalPrefs, localPrefKeys, LOCAL_PREF_KEEP } from "@client/lib/localPrefs";
import { resolveSection, SECTIONS } from "@client/components/settings/sections/registry";
import { getFontSize, setFontSize } from "@client/lib/display";
import { RANDOM_TICK_KEY, getRandomTick } from "@client/lib/sound";
import { outboxAdd, outboxAll, outboxRemove, draftPut, draftAll } from "@client/lib/idb";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: true, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});

const openSection = async (key: string) => {
  route.value = `/settings?section=${key}`;
  render(<SettingsPage />);
  await screen.findByRole("heading", { level: 1, name: "ตั้งค่า" });
};
const sw = (name: string) => screen.getByRole("switch", { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  get.mockImplementation(async (url: string) => (url.includes("devices") ? { devices: [] } : url.includes("restore") ? { pending: false, maintenance: false } : url.includes("auth/me") ? { email: "t@example.com" } : { rows: [] }));
  put.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  settings.value = base();
  projectorOn.value = false;
  online.value = true;
  pendingCount.value = 0;
  pjHideNames.value = false; pjTheme.value = "dark"; pjSize.value = 2;
  setHideAll(false);
  window.location.hash = "#/settings";
});
afterEach(() => { cleanup(); projectorOn.value = false; online.value = true; pendingCount.value = 0; vi.unstubAllGlobals(); });

describe("registry: the two new sections", () => {
  it("privacy and device are real sections of the 'เครื่องนี้' group; old links keep working", () => {
    const g = SECTIONS.filter((s) => s.group === "device").map((s) => s.key);
    expect(g).toEqual(["appearance", "privacy", "device"]);
    expect(resolveSection("privacy").section).toBe("privacy");
    expect(resolveSection("device").section).toBe("device");
    expect(resolveSection("devices").section).toBe("devices");
    expect(resolveSection("xyz").section).toBe("general");
  });
});

describe("privacy: hide names on 7 pages (AC-235, BR-52)", () => {
  it("shows 7 rows, one per page, all off at first, each with the 'this device only' chip", async () => {
    await openSection("privacy");
    for (const n of ["หน้าหลัก", "สแกน", "เช็คชื่อ", "สุ่มชื่อ", "คะแนน", "รายงาน", "นักเรียน"]) expect(sw(`ซ่อนชื่อ: ${n}`).getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByRole("switch", { name: /^ซ่อนชื่อ: / })).toHaveLength(7);
    expect(screen.getAllByText("เครื่องนี้เท่านั้น").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("0 จาก 7 หน้า");
  });
  it("one row changes only the value of its own page (same key as the switch on that page); no API call", async () => {
    await openSection("privacy");
    fireEvent.click(sw("ซ่อนชื่อ: คะแนน"));
    expect(hideSignal("gradebook").value).toBe(true);
    expect(localStorage.getItem(hideKey("gradebook"))).toBe("1");
    for (const p of HIDE_PAGES.filter((x) => x !== "gradebook")) expect(hideSignal(p).value, p).toBe(false);
    expect(sw("ซ่อนชื่อ: คะแนน").getAttribute("aria-checked")).toBe("true");
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(sw("ซ่อนชื่อ: คะแนน"));
    expect(hideSignal("gradebook").value).toBe(false);
  });
  it("the home row keeps the old key (ngankrob-hide-names = '1' or absent)", async () => {
    await openSection("privacy");
    fireEvent.click(sw("ซ่อนชื่อ: หน้าหลัก"));
    expect(localStorage.getItem("ngankrob-hide-names")).toBe("1");
    fireEvent.click(sw("ซ่อนชื่อ: หน้าหลัก"));
    expect(localStorage.getItem("ngankrob-hide-names")).toBeNull();
  });
  it("เปิดทั้งหมด turns the 7 values on together and the button becomes ปิดทั้งหมด; the projector switch is not touched", async () => {
    await openSection("privacy");
    const allBtn = screen.getByRole("button", { name: /เปิดทั้งหมด/ }); // the name contains the visible words (WCAG 2.5.3)
    expect(allBtn.getAttribute("aria-label")).toContain("เปิดทั้งหมด");
    fireEvent.click(allBtn);
    for (const p of HIDE_PAGES) expect(hideSignal(p).value, p).toBe(true);
    expect(pjHideNames.value).toBe(false);
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("7 จาก 7 หน้า");
    fireEvent.click(screen.getByRole("button", { name: /ปิดทั้งหมด/ }));
    for (const p of HIDE_PAGES) expect(hideSignal(p).value, p).toBe(false);
  });
  it("the section follows a change made on a page (the page switch and this row are one value)", async () => {
    await openSection("privacy");
    act(() => { setHide("reports", true); });
    await waitFor(() => expect(sw("ซ่อนชื่อ: รายงาน").getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("1 จาก 7 หน้า");
  });
});

describe("privacy: projector and sound (AC-236, BR-51)", () => {
  it("the projector rows write the projector's own keys, never the page values", async () => {
    await openSection("privacy");
    fireEvent.click(sw("ซ่อนชื่อเด็กบนจอฉาย"));
    expect(pjHideNames.value).toBe(true);
    expect(localStorage.getItem("ngankrob-pj-hide-names")).toBe("1");
    for (const p of HIDE_PAGES) expect(hideSignal(p).value, p).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "สว่าง" }));
    expect(pjTheme.value).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "ใหญ่มาก" }));
    expect(pjSize.value).toBe(3);
    expect(localStorage.getItem("ngankrob-pj-size")).toBe("3");
  });
  it("scan sound = the synced sound_enabled (saved through the API); the 'ting' is this device only, off at first", async () => {
    await openSection("privacy");
    expect(getRandomTick()).toBe(false);
    expect(sw('เสียง "ติ๊ง" ตอนสุ่มได้ชื่อ').getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw('เสียง "ติ๊ง" ตอนสุ่มได้ชื่อ'));
    expect(localStorage.getItem(RANDOM_TICK_KEY)).toBe("1");
    expect(put).not.toHaveBeenCalled();
    fireEvent.click(sw("เสียงตอบรับสแกน"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/settings", { sound_enabled: false }));
  });
  it("offline: the scan sound switch waits for a connection and says so; this device's own switches still work", async () => {
    online.value = false;
    await openSection("privacy");
    expect(sw("เสียงตอบรับสแกน").matches(":disabled")).toBe(true); // inside a disabled fieldset
    expect(screen.getAllByText("ต้องออนไลน์").length).toBeGreaterThan(0);
    expect(sw("ซ่อนชื่อ: นักเรียน").disabled).toBe(false);
  });
  it("projecting: the section is read only (every control that writes is off)", async () => {
    projectorOn.value = true;
    await openSection("privacy");
    await waitFor(() => expect(sw("ซ่อนชื่อ: สแกน").disabled).toBe(true));
    expect((screen.getByRole("button", { name: /เปิดทั้งหมด/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("device section (AC-237)", () => {
  it("holds the check, the offline/storage rows (moved from the overview), the about-app card and the clear button; no version number", async () => {
    await openSection("device");
    expect(screen.getByRole("heading", { level: 2, name: /ตรวจเครื่องนี้/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /การแสดงผลบนเครื่องนี้/ })).toBeTruthy();
    expect(screen.getByText("ใช้ออฟไลน์")).toBeTruthy();
    expect(screen.getByText(/ที่เก็บข้อมูลในเครื่องนี้/)).toBeTruthy();
    const about = screen.getByRole("heading", { level: 2, name: /เกี่ยวกับแอป/ }).closest("section")!;
    expect(within(about).getByText("งานครบ")).toBeTruthy();
    expect(within(about).getByText("เปิดในเบราว์เซอร์")).toBeTruthy();
    expect(about.textContent).toContain("เพิ่มไปยังหน้าจอโฮม");
    expect(about.textContent).not.toMatch(/\d+\.\d+\.\d+|เวอร์ชัน \d/);
    expect(screen.getByRole("button", { name: /ล้างค่าที่จำไว้ในเครื่องนี้/ })).toBeTruthy();
  });
  it("the overview no longer carries the device card; the sign-in section no longer carries the check", async () => {
    await openSection("general");
    expect(screen.queryByRole("heading", { level: 2, name: /การแสดงผลบนเครื่องนี้/ })).toBeNull();
    cleanup();
    await openSection("devices");
    expect(screen.queryByRole("button", { name: /ตรวจเครื่องนี้/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: /บัญชีและรหัสผ่าน/ })).toBeTruthy();
  });
  it("the check button reports in a role=status line with an icon + words, and the result can be copied", async () => {
    collect.mockResolvedValue({
      secure: true, host: "https://app.example.com", online: true, reachable: true, latencyMs: 120, health: { ok: true }, skewMs: 1000, offline: "ready", offlineNote: "",
      installed: false, persisted: true, freeMb: 900, storageWorks: true, pending: 0, failed: 0, drafts: 0, hasCamera: true, workerVersion: null, userAgent: "iPad", screen: "1024×768", touch: true,
    });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await openSection("device");
    fireEvent.click(screen.getByRole("button", { name: /ตรวจเครื่องนี้/ }));
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("พร้อมใช้งาน"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /คัดลอกผลตรวจ/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((writeText.mock.calls[0] as unknown as [string])[0]).toContain("งานครบ — ตรวจเครื่อง");
  });
});

describe("clear what this device remembers (AC-238, BR-60, SGQ4)", () => {
  function seed() {
    setFontSize(22);
    localStorage.setItem("ngankrob-density", "roomy");
    localStorage.setItem("ngankrob-students-sort", "name");
    localStorage.setItem("ngankrob.gb.columns", "{}");
    localStorage.setItem(RANDOM_TICK_KEY, "1");
    localStorage.setItem("ngankrob-pj-theme", "light");
    for (const k of LOCAL_PREF_KEEP) localStorage.setItem(k, "keep-" + k);
    localStorage.setItem("gk_device_id", "dev_fixture");
    localStorage.setItem("gk_device_name", "เครื่องทดสอบ");
    localStorage.setItem("other-app", "x");
    setHide("scan", true); setHide("students", true); setHide("home", true);
    pjTheme.value = "light"; pjSize.value = 3; pjHideNames.value = true;
  }

  it("localPrefKeys lists the ngankrob keys except the copies of synced values; clearLocalPrefs removes only those", () => {
    seed();
    const keys = localPrefKeys();
    expect(keys).toContain("ngankrob-font-size");
    expect(keys).toContain("ngankrob-hide-names");
    for (const k of LOCAL_PREF_KEEP) expect(keys).not.toContain(k);
    expect(keys).not.toContain("gk_device_id");
    expect(keys).not.toContain("other-app");
    clearLocalPrefs();
    expect(localPrefKeys().filter((k) => !k.startsWith("ngankrob-hide-names-"))).toEqual([]);
    for (const k of LOCAL_PREF_KEEP) expect(localStorage.getItem(k)).toBe("keep-" + k);
    expect(localStorage.getItem("gk_device_id")).toBe("dev_fixture");
    expect(localStorage.getItem("gk_device_name")).toBe("เครื่องทดสอบ");
    expect(localStorage.getItem("other-app")).toBe("x");
    expect(getFontSize()).toBe(16);
    expect(document.documentElement.getAttribute("data-density")).toBe("normal");
    for (const p of HIDE_PAGES) expect(hideSignal(p).value, p).toBe(false);
    expect([pjTheme.value, pjSize.value, pjHideNames.value]).toEqual(["dark", 2, false]);
    expect(getRandomTick()).toBe(false);
  });

  it("the button asks first: focus on ยกเลิก, the body says what returns and what stays (queue count); cancelling clears nothing", async () => {
    seed(); pendingCount.value = 3;
    await openSection("device");
    fireEvent.click(screen.getByRole("button", { name: /ล้างค่าที่จำไว้ในเครื่องนี้/ }));
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toContain("จะกลับเป็นค่าเริ่มต้น");
    expect(dlg.textContent).toContain("ไม่แตะ");
    expect(dlg.textContent).toContain("งานที่รอส่ง 3 รายการ");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("ยกเลิก"));
    fireEvent.click(within(dlg).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(localStorage.getItem("ngankrob-density")).toBe("roomy");
    expect(hideSignal("scan").value).toBe(true);
  });

  it("confirming clears the remembered values; the queue stays 3, the sign-in and synced values stay, no API call", async () => {
    seed(); pendingCount.value = 3;
    const before = settings.value!;
    // real queue + draft rows in IndexedDB: they must survive the clear (not just the counter signal)
    for (const id of ["op_a", "op_b", "op_c"]) await outboxAdd({ opId: id, kind: "submission", payload: { opId: id } as never, tries: 0, nextAt: 0, createdAt: 1 });
    await draftPut({ key: "2026-11-12|c1|s1|1", rows: { st1: { status: "present", clientTs: 1, baseUpdatedAt: null } }, rev: 1, updatedAt: 1 });
    await openSection("device");
    fireEvent.click(screen.getByRole("button", { name: /ล้างค่าที่จำไว้ในเครื่องนี้/ }));
    const dlg = await screen.findByRole("alertdialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "ล้างค่าในเครื่องนี้" }));
    await waitFor(() => expect(localStorage.getItem("ngankrob-density")).toBeNull());
    expect(pendingCount.value).toBe(3);
    expect((await outboxAll()).map((x) => x.opId).sort()).toEqual(["op_a", "op_b", "op_c"]);
    expect((await draftAll()).map((d) => d.key)).toEqual(["2026-11-12|c1|s1|1"]);
    expect([pjTheme.value, pjSize.value, pjHideNames.value]).toEqual(["dark", 2, false]);
    expect(localStorage.getItem("ngankrob-pj-theme")).toBeNull();
    for (const id of ["op_a", "op_b", "op_c"]) await outboxRemove(id);
    expect(settings.value).toBe(before);
    expect(settings.value!.sound_enabled).toBe(true);
    expect(localStorage.getItem("ngankrob-theme")).toBe("keep-ngankrob-theme");
    expect(localStorage.getItem("gk_device_id")).toBe("dev_fixture");
    for (const p of HIDE_PAGES) expect(hideSignal(p).value, p).toBe(false);
    expect(getFontSize()).toBe(16);
    expect(put).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
