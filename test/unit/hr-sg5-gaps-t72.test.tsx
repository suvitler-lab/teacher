// T-72: test gaps proved by QA-B mutation (verify-qa-b.md M53-9, M53-10, M53-12, M56-2).
// Fictitious names only. No real endpoint is called: `api` is a mock; nothing is ever sent to a server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
vi.mock("@client/store", async (orig) => ({ ...await orig<typeof import("@client/store")>(), loadBootstrap: vi.fn(async () => {}) }));
const { runBackup } = vi.hoisted(() => ({ runBackup: vi.fn(async () => {}) }));
vi.mock("@client/lib/backup", async (orig) => ({ ...await orig<typeof import("@client/lib/backup")>(), runBackup }));
vi.mock("@client/lib/idb", async (orig) => ({ ...await orig<typeof import("@client/lib/idb")>(), clearLocalWork: vi.fn(async () => {}) }));

import { SettingsPage } from "@client/pages/Settings";
import { DangerSection } from "@client/components/settings/sections/DangerSection";
import { ResetModal } from "@client/components/ResetModal";
import { settings, terms, currentTermId, selectedTermId } from "@client/store";
import { route } from "@client/router";
import { online } from "@client/lib/outbox";
import { projectorOn } from "@client/lib/projector";
import type { Settings } from "@shared/types";

const base = (): Settings => ({
  school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: String(Date.now() - 86_400_000), period_times: "", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
} as Settings);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  get.mockImplementation(async (url: string) => (url.includes("restore") ? { pending: false, maintenance: false } : { rows: [] }));
  put.mockResolvedValue({ ok: true });
  post.mockResolvedValue({ ok: true });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  settings.value = base();
  online.value = true; projectorOn.value = false;
  route.value = "/settings";
  // let the router's hashchange (which reads the address when it fires) settle, so its "last route" is /settings
  window.location.hash = "#/settings";
  await new Promise((r) => setTimeout(r, 30));
  route.value = "/settings";
});
afterEach(() => { cleanup(); online.value = true; projectorOn.value = false; });

const edit = async (v = "ครูใหม่") => { fireEvent.input(await screen.findByLabelText("ชื่อครู"), { target: { value: v } }); };

describe("M53-9 the page guards unsaved edits", () => {
  it("beforeunload is cancelled while something is edited, and not when nothing is", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("ชื่อครู");
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await edit();
    await waitFor(() => screen.getByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" }));
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("leaving to another page asks first; staying keeps the page and the typed value", async () => {
    render(<SettingsPage />);
    await edit("ครูใหม่");
    window.location.hash = "#/home";
    const dlg = await screen.findByRole("alertdialog");
    expect(dlg.textContent).toContain("ยังไม่ได้บันทึก");
    expect(document.activeElement?.textContent).toBe("อยู่ต่อ"); // the safe answer first
    fireEvent.click(within(dlg).getByRole("button", { name: "อยู่ต่อ" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
    expect(route.value).toBe("/settings");
    expect((screen.getByLabelText("ชื่อครู") as HTMLInputElement).value).toBe("ครูใหม่");
  });

  it("confirming ออกโดยไม่บันทึก goes on to the wanted page without saving", async () => {
    render(<SettingsPage />);
    await edit();
    window.location.hash = "#/reports";
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ออกโดยไม่บันทึก" }));
    await waitFor(() => expect(route.value).toBe("/reports"));
    expect(put).not.toHaveBeenCalled();
  });

  it("nothing edited: leaving does not ask", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("ชื่อครู");
    window.location.hash = "#/reports";
    await waitFor(() => expect(route.value).toBe("/reports"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("moving between sections of the settings page is not leaving: no question", async () => {
    render(<SettingsPage />);
    await edit();
    window.location.hash = "#/settings?section=time";
    await waitFor(() => expect(route.value).toBe("/settings?section=time"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("after the edit is cancelled (ยกเลิก in the bar) the guard is gone", async () => {
    render(<SettingsPage />);
    await edit();
    const bar = await screen.findByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" });
    fireEvent.click(within(bar).getByRole("button", { name: "ยกเลิก" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" })).toBeNull());
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    window.location.hash = "#/reports";
    await waitFor(() => expect(route.value).toBe("/reports"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("M53-10 the save button cannot be pressed twice", () => {
  it("while saving: disabled with กำลังบันทึก…, one request only, then the bar goes", async () => {
    let release!: () => void;
    put.mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true }); }));
    render(<SettingsPage />);
    await edit();
    const bar = await screen.findByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" });
    const btn = within(bar).getByRole("button", { name: /^บันทึก/ }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(within(bar).getByRole("button", { name: /กำลังบันทึก/ }).hasAttribute("disabled")).toBe(true));
    (within(bar).getByRole("button", { name: /กำลังบันทึก/ }) as HTMLButtonElement).click(); // a real click: blocked on a disabled button
    (within(bar).getByRole("button", { name: /กำลังบันทึก/ }) as HTMLButtonElement).click();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("/api/settings", { teacher_name: "ครูใหม่" });
    release();
    await waitFor(() => expect(screen.queryByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" })).toBeNull());
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("a failed save: the retry button is also off while it retries", async () => {
    put.mockRejectedValueOnce(new Error("500"));
    render(<SettingsPage />);
    await edit();
    fireEvent.click(within(await screen.findByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" })).getByRole("button", { name: /^บันทึก/ }));
    const alert = await screen.findByRole("alert");
    let release!: () => void;
    put.mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true }); }));
    fireEvent.click(within(alert).getByRole("button", { name: "ลองอีกครั้ง" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    // the alert is cleared while retrying; the main button is the one left, and it is off
    const bar = screen.getByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" });
    expect(within(bar).getByRole("button", { name: /กำลังบันทึก/ }).hasAttribute("disabled")).toBe(true);
    release();
    await waitFor(() => expect(screen.queryByRole("region", { name: "การแก้ไขที่ยังไม่บันทึก" })).toBeNull());
    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe("M53-12 / M56-2 the red zone buttons", () => {
  const wipe = () => screen.getByRole("button", { name: /^ล้างข้อมูล/ }) as HTMLButtonElement;
  const all = () => screen.getByRole("button", { name: /^ล้างทั้งหมด/ }) as HTMLButtonElement;
  // the label that belongs to a button sits in the same row as that button
  const rowOf = (b: HTMLElement) => b.parentElement as HTMLElement;

  it("offline: each of the two buttons is off and has its own ต้องออนไลน์ beside it", () => {
    online.value = false;
    render(<DangerSection onReset={vi.fn()} />);
    for (const b of [wipe(), all()]) {
      expect(b.disabled).toBe(true);
      expect(within(rowOf(b)).getByText("ต้องออนไลน์")).toBeTruthy();
    }
    expect(document.querySelectorAll(".set-need-online").length).toBe(2);
  });

  it("online: both are on and no label is shown", () => {
    const onReset = vi.fn();
    render(<DangerSection onReset={onReset} />);
    expect(wipe().disabled || all().disabled).toBe(false);
    expect(document.querySelectorAll(".set-need-online").length).toBe(0);
  });

  it("projecting (online): each button is off on its own, no request, and no wrong 'need online' label", () => {
    projectorOn.value = true;
    const onReset = vi.fn();
    render(<DangerSection onReset={onReset} />);
    expect(wipe().disabled).toBe(true);
    expect(all().disabled).toBe(true);
    wipe().click(); all().click(); // a real click: blocked on a disabled button
    expect(onReset).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("ต้องออนไลน์");
  });

  it("projecting starts while the section is on screen: both buttons go off at once", async () => {
    render(<DangerSection onReset={vi.fn()} />);
    expect(wipe().disabled).toBe(false);
    projectorOn.value = true;
    await waitFor(() => { expect(wipe().disabled).toBe(true); expect(all().disabled).toBe(true); });
  });

  it("on the page: the red section while projecting leaves no enabled wipe button and no box", async () => {
    route.value = "/settings?section=reset";
    projectorOn.value = true;
    render(<SettingsPage />);
    await screen.findByRole("heading", { level: 2, name: /เริ่มใหม่/ });
    await waitFor(() => { expect(wipe().disabled).toBe(true); expect(all().disabled).toBe(true); });
    wipe().click(); all().click();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the box already open when projecting starts: the red button goes off and sends nothing (step 2)", async () => {
    render(<ResetModal mode="data" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox")); // no safety copy: the press would go straight to the request
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    fireEvent.input(screen.getByLabelText("รหัสผ่านของคุณ"), { target: { value: "secret1" } });
    fireEvent.input(screen.getByPlaceholderText(/^ล้าง/), { target: { value: "ล้างข้อมูล" } });
    const red = screen.getByRole("button", { name: /^ล้างข้อมูลทดลอง/ }) as HTMLButtonElement;
    expect(red.disabled).toBe(false);
    projectorOn.value = true;
    await waitFor(() => expect(red.disabled).toBe(true));
    expect(screen.getByRole("dialog").textContent).toContain("ปิดอยู่ตอนฉายจอ");
    red.click();
    expect(post).not.toHaveBeenCalled();
    expect(runBackup).not.toHaveBeenCalled();
  });

  it("projecting from the start: even with the right password and phrase the red button stays off, both modes", () => {
    projectorOn.value = true;
    for (const [mode, phrase] of [["data", "ล้างข้อมูล"], ["all", "ล้างทั้งหมด"]] as const) {
      render(<ResetModal mode={mode} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
      fireEvent.input(screen.getByLabelText("รหัสผ่านของคุณ"), { target: { value: "secret1" } });
      fireEvent.input(screen.getByPlaceholderText(/^ล้าง/), { target: { value: phrase } });
      const red = screen.getByRole("button", { name: mode === "data" ? /^ล้างข้อมูลทดลอง/ : /^ล้างทั้งหมด/ }) as HTMLButtonElement;
      expect(red.disabled).toBe(true);
      red.click();
      cleanup();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it("projecting starts while the personal-data warning is open: confirming it sends no copy and no reset", async () => {
    render(<ResetModal mode="data" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    fireEvent.input(screen.getByLabelText("รหัสผ่านของคุณ"), { target: { value: "secret1" } });
    fireEvent.input(screen.getByPlaceholderText(/^ล้าง/), { target: { value: "ล้างข้อมูล" } });
    fireEvent.click(screen.getByRole("button", { name: /^ล้างข้อมูลทดลอง/ }));
    const warn = await screen.findByRole("dialog", { name: "ก่อนดาวน์โหลดไฟล์สำรอง" });
    projectorOn.value = true;
    await waitFor(() => expect(screen.getByText("ปิดอยู่ตอนฉายจอ")).toBeTruthy());
    fireEvent.click(within(warn).getByRole("button", { name: /เข้าใจแล้ว ดาวน์โหลด/ }));
    await new Promise((r) => setTimeout(r, 20));
    expect(runBackup).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
