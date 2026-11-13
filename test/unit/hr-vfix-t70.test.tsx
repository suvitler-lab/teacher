// T-70 (Verify round 1): security review S-01..S-05, S-08 — mock only, no real server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put } }));
vi.mock("@client/lib/backup", async (orig) => ({ ...(await orig<typeof import("@client/lib/backup")>()), runBackup: vi.fn(async () => {}) }));

import { StartTermModal } from "@client/components/StartTermModal";
import { RestoreModal } from "@client/components/RestoreModal";
import { BackupCard, TermCard as SettingsTermCard } from "@client/components/settings/SettingsCards";
import { AccountSection } from "@client/components/settings/sections/AccountSection";
import { TermCard as HomeTermCard } from "@client/components/home/cards";
import { startTermOrExplain } from "@client/components/home/model";
import { StudentsPage, MAX_IMPORT_FILE } from "@client/pages/Students";
import { assignments, classes, currentTermId, selectedTermId, startTermOpen, students, terms, settings, qrRotatedAt } from "@client/store";
import { online } from "@client/lib/outbox";
import { projectorOn } from "@client/lib/projector";
import { route } from "@client/router";
import { swrClear } from "@client/lib/swr";

const ENDED = { id: "old", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-01", end_date: "2026-10-01", updated_at: 0 } as any;

beforeEach(() => {
  vi.clearAllMocks(); cleanup(); swrClear();
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  terms.value = [ENDED]; classes.value = []; students.value = []; assignments.value = [];
  currentTermId.value = selectedTermId.value = "old"; startTermOpen.value = false;
  online.value = true; projectorOn.value = false;
  post.mockImplementation(() => new Promise(() => {}));
  get.mockResolvedValue({ devices: [], email: null, rows: [] });
});
afterEach(() => { cleanup(); online.value = true; projectorOn.value = false; });

describe("S-02: start a new term while projecting / offline (BR-59)", () => {
  const tick = () => screen.getByRole("checkbox", { name: /ตรวจแล้ว/ }) as HTMLInputElement;
  const startBtn = () => screen.getByRole("button", { name: /^เริ่มภาคเรียน \d/ }) as HTMLButtonElement;

  it("projecting: box opens, the ticked confirm button stays off and says why; no request goes out", () => {
    projectorOn.value = true;
    render(<StartTermModal onClose={() => {}} />);
    fireEvent.click(tick());
    expect(startBtn().disabled).toBe(true);
    expect(document.body.textContent).toContain("ปิดอยู่ตอนฉายจอ");
    fireEvent.click(startBtn());
    expect(post).not.toHaveBeenCalled();
  });
  it("offline: off across offline -> online -> projecting -> offline (read live, not once)", async () => {
    online.value = false;
    render(<StartTermModal onClose={() => {}} />);
    fireEvent.click(tick());
    expect(startBtn().disabled).toBe(true);
    expect(document.body.textContent).toContain("ต้องออนไลน์");
    online.value = true; await waitFor(() => expect(startBtn().disabled).toBe(false));
    projectorOn.value = true; await waitFor(() => expect(startBtn().disabled).toBe(true));
    projectorOn.value = false; online.value = false; await waitFor(() => expect(startBtn().disabled).toBe(true));
  });
  it("home entry points: the term card button is off, the todo handler does not open the box", () => {
    projectorOn.value = true;
    render(<HomeTermCard />);
    expect((screen.getByRole("button", { name: /เริ่มภาคเรียนใหม่/ }) as HTMLButtonElement).disabled).toBe(true);
    startTermOrExplain();
    expect(startTermOpen.value).toBe(false);
    projectorOn.value = false; online.value = false;
    startTermOrExplain();
    expect(startTermOpen.value).toBe(false);
    online.value = true;
    startTermOrExplain();
    expect(startTermOpen.value).toBe(true);
  });
  it("S-03 settings cards: the term + backup buttons are off while projecting by themselves", () => {
    projectorOn.value = true;
    render(<><SettingsTermCard goCatalog={() => {}} /><BackupCard last={0} onBackup={() => {}} onRestore={() => {}} /></>);
    for (const n of [/เริ่มภาคเรียนใหม่/, /ดาวน์โหลด/, /กู้คืน/]) expect((screen.getByRole("button", { name: n }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("S-01 / S-04: restore", () => {
  const body = JSON.stringify({ app: "ngankrob", schema_version: 1, counts: { students: 2 }, exported_at: new Date().toISOString(), data: { settings: [] } });
  const pick = () => {
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [{ text: async () => body }], configurable: true });
    fireEvent.change(input);
  };
  it("validated step warns about the safety-copy download (same wording as BackupWarning) and the tick covers it", async () => {
    post.mockImplementation(async (u: string) => (u === "/api/restore/validate" ? { ok: true, restoreId: "r1" } : { ok: true }));
    render(<RestoreModal onClose={() => {}} onDone={() => {}} />);
    pick();
    const red = (await screen.findByRole("button", { name: /กู้คืนและแทนที่ข้อมูล/ })) as HTMLButtonElement;
    const t = document.body.textContent!;
    expect(t).toContain("ไฟล์นี้มีข้อมูลส่วนบุคคลของนักเรียน (ผู้เยาว์) และไม่ได้เข้ารหัส");
    expect(t).toContain("อย่าส่งทาง LINE อีเมล");
    expect(t).toContain("ออกบัตร QR ใหม่");
    expect(screen.getByRole("checkbox").closest("label")!.textContent).toContain("ระบบจะดาวน์โหลดสำรองข้อมูลปัจจุบันของคุณลงเครื่องนี้ก่อนกู้คืน");
    expect(red.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(red.disabled).toBe(false);
  });
  it("the file picker is off while projecting and offline", () => {
    projectorOn.value = true;
    render(<RestoreModal onClose={() => {}} onDone={() => {}} />);
    expect((document.querySelector("input[type=file]") as HTMLInputElement).disabled).toBe(true);
    cleanup(); projectorOn.value = false; online.value = false;
    render(<RestoreModal onClose={() => {}} onDone={() => {}} />);
    expect((document.querySelector("input[type=file]") as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("ต้องออนไลน์");
  });
});

describe("S-05: a shown password is hidden again when projecting starts", () => {
  it("type goes text -> password without the teacher pressing anything", async () => {
    render(<AccountSection />);
    fireEvent.click(await screen.findByRole("button", { name: "เปลี่ยนรหัสผ่าน" }));
    const field = () => screen.getByLabelText("รหัสผ่านเดิม") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "แสดงรหัสผ่านเดิม" }));
    expect(field().type).toBe("text");
    projectorOn.value = true;
    await waitFor(() => expect(field().type).toBe("password"));
  });
});

describe("S-08: import file size", () => {
  it("a file over 5 MB is refused with a message and never read", async () => {
    settings.value = { school_name: "", teacher_name: "", app_title: "", late_after: "08:30", theme: "light", accent: "blue", sound_enabled: false, accept_student_code_scan: false,
      parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}",
      home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "" } as never;
    qrRotatedAt.value = {};
    terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
    currentTermId.value = selectedTermId.value = "t1";
    classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
    route.value = "/students";
    get.mockImplementation(async (p: string) => (p.startsWith("/api/students") ? { students: [] } : { classId: "c1", range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" }, students: [], assignments: [], submissions: [], attendanceSessions: [], attendance: [] }));
    render(<StudentsPage />);
    await waitFor(() => expect(document.querySelector(".stu-hero")?.getAttribute("aria-busy")).toBeNull());
    fireEvent.click((await screen.findAllByRole("button", { name: "นำเข้า Excel" }))[0]);
    const d = await screen.findByRole("dialog", { name: "นำเข้านักเรียน" });
    const input = within(d).getByLabelText("ไฟล์รายชื่อนักเรียน") as HTMLInputElement;
    const arrayBuffer = vi.fn(), text = vi.fn();
    Object.defineProperty(input, "files", { value: [{ name: "big.xlsx", size: MAX_IMPORT_FILE + 1, arrayBuffer, text }], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(within(d).getByText(/ไฟล์ใหญ่เกินไป/)).toBeTruthy());
    expect(arrayBuffer).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
  });
});
