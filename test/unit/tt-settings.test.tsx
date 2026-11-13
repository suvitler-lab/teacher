// T-22: Settings > เวลาเรียน shows the frame and opens the shared sheet (AC-13, AC-17); history rows (AC-45).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put } }));

import { currentTermId, settings, terms } from "@client/store";
import { online } from "@client/lib/outbox";
import { resetTimetableStoreForTests } from "@client/lib/timetable/store";
import { TERM_2_2569 } from "@client/lib/timetable/testdata";
import { TimeSection } from "@client/components/settings/sections/TimeSection";
import { AuditHistory } from "@client/components/AuditHistory";
import { serializeFrame, type Frame } from "@shared/timetable";
import type { Settings } from "@shared/types";

const base = (over: Partial<Settings> = {}): Settings => ({
  school_name: "", teacher_name: "", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "", period_frame: "",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});
const frame: Frame = {
  v: 1, rev: 3, saved: true, days: [1, 2, 3, 4, 5],
  periods: [{ start: "08:20", end: "09:20" }, { start: "09:30", end: "10:30" }],
  breaks: [{ name: "พักเช้า", start: "10:30", end: "10:45" }],
};

beforeEach(() => {
  get.mockReset(); put.mockReset(); post.mockReset();
  resetTimetableStoreForTests();
  online.value = true;
  terms.value = [TERM_2_2569]; currentTermId.value = TERM_2_2569.id;
  settings.value = base({ period_frame: serializeFrame(frame, 3), period_times: '{"1":"08:20","2":"09:30"}' });
});
afterEach(() => { cleanup(); online.value = true; });

const renderTime = () => render(<TimeSection draft={settings.value as Settings} set={() => {}} />);

describe("TimeSection (AC-17)", () => {
  it("shows the frame values, no period time inputs", () => {
    renderTime();
    expect(screen.getByText(/2 คาบต่อวัน/)).toBeTruthy();
    expect(screen.getByText("08:20–09:20")).toBeTruthy();
    expect(screen.getByText("พักเช้า")).toBeTruthy();
    expect(screen.queryByLabelText("เวลาเริ่มคาบ 1")).toBeNull();
  });
  it("opens the shared sheet from the button", () => {
    renderTime();
    fireEvent.click(screen.getByRole("button", { name: /ตั้งเวลาคาบ/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText("เวลาเริ่มคาบ 1") as HTMLInputElement).value).toBe("08:20");
  });
  it("offline: button disabled with the reason", () => {
    online.value = false;
    renderTime();
    expect((screen.getByRole("button", { name: /ตั้งเวลาคาบ/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("ออฟไลน์ — ตั้งเวลาคาบได้เมื่อออนไลน์")).toBeTruthy();
  });
  it("never set: says defaults are in use", () => {
    settings.value = base();
    renderTime();
    expect(screen.getByText(/ยังไม่ได้ตั้ง ใช้ค่าเริ่มต้น/)).toBeTruthy();
  });
});

describe("AuditHistory rows (AC-45)", () => {
  it("labels timetable and period_frame rows with counts only", async () => {
    get.mockResolvedValue({ rows: [
      { id: 2, at: Date.now(), device_name: null, entity: "timetable", entity_id: TERM_2_2569.id, action: "update", before: { slots: 14, rev: 7 }, after: { slots: 15, rev: 8 }, method: "manual", student_id: null, assignment_id: null },
      { id: 1, at: Date.now(), device_name: null, entity: "period_frame", entity_id: "frame", action: "update", before: { periods: [1, 2, 3], breaks: [], days: [] }, after: { periods: [1, 2, 3, 4], breaks: [], days: [] }, method: "manual", student_id: null, assignment_id: null },
    ] });
    render(<AuditHistory />);
    await waitFor(() => expect(screen.getByText(`${TERM_2_2569.term}/${TERM_2_2569.year} · 14 → 15`)).toBeTruthy());
    expect(screen.getByText("3 → 4 คาบ")).toBeTruthy();
    expect(screen.getByText(/ตารางสอน/)).toBeTruthy();
    expect(screen.getByText(/โครงเวลา/)).toBeTruthy();
  });
});
