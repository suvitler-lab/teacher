import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async orig => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put: vi.fn() } }));
import { ReportsPage } from "@client/pages/Reports";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import type { ReportPayload } from "@client/lib/report";

function payload(name = "ข้อมูลแรก", classId = "c1"): ReportPayload {
  return {
    classId, range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" },
    students: [{ id: classId + "s", code: "001", qr_token: "test", prefix: null, first_name: name, last_name: "", nickname: null, class_id: classId, number: 1, status: "active", left_at: null, updated_at: 0 }],
    assignments: [], submissions: [], attendanceSessions: [], attendance: [],
  };
}
const defer = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  get.mockReset();
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-01", end_date: "2026-10-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = ["c1", "c2"].map((id, i) => ({ id, name: `ป.6/${i + 1}`, grade: "ป.6", sort: i, year: 2569, archived: false, updated_at: 0 }));
  students.value = []; subjects.value = []; assignments.value = [];
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  get.mockResolvedValue(payload());
});
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });

describe("reports freshness", () => {
  it("refreshes while visible every minute, retains data while pending, and stops after unmount", async () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    const view = render(<ReportsPage />);
    await screen.findByText("ข้อมูลแรก");
    const next = defer<ReportPayload>();
    get.mockReturnValueOnce(next.promise);
    const timerIndex = interval.mock.calls.findIndex(([, ms]) => ms === 60000);
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    const tick = interval.mock.calls[timerIndex][0] as () => void;
    await act(async () => { tick(); await Promise.resolve(); });
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByText("ข้อมูลแรก")).toBeTruthy();
    expect(screen.getByText("กำลังอัปเดตรายงาน…")).toBeTruthy();
    await act(async () => { next.resolve(payload("ข้อมูลใหม่")); await next.promise; });
    expect(screen.queryByText("ข้อมูลแรก")).toBeNull();
    expect(screen.getByText("ข้อมูลใหม่")).toBeTruthy();
    view.unmount();
    expect(clear).toHaveBeenCalledWith(interval.mock.results[timerIndex].value);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not poll a hidden page, refreshes on return and reconnection", async () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    render(<ReportsPage />);
    await screen.findByText("ข้อมูลแรก");
    const tick = interval.mock.calls.find(([, ms]) => ms === 60000)![0] as () => void;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { tick(); await Promise.resolve(); });
    expect(get).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    expect(get).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("keeps the old snapshot with a warning if background refresh fails, and manual reload can recover", async () => {
    render(<ReportsPage />);
    await screen.findByText("ข้อมูลแรก");
    get.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "โหลดใหม่" }));
    await screen.findByText(/อัปเดตไม่สำเร็จ/);
    expect(screen.getByText("ข้อมูลแรก")).toBeTruthy();
    get.mockResolvedValueOnce(payload("กู้คืนการเชื่อมต่อ"));
    fireEvent.click(screen.getByRole("button", { name: "โหลดใหม่" }));
    await screen.findByText("กู้คืนการเชื่อมต่อ");
    expect(screen.queryByText(/อัปเดตไม่สำเร็จ/)).toBeNull();
  });

  it("never paints an older class response under the newer selected class", async () => {
    const old = defer<ReportPayload>();
    get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(payload("ห้องใหม่", "c2"));
    render(<ReportsPage />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("tab", { name: /ป.6\/2/ }));
    await screen.findByText("ห้องใหม่");
    await act(async () => { old.resolve(payload("คำตอบเก่า", "c1")); await old.promise; });
    expect(screen.queryByText("คำตอบเก่า")).toBeNull();
    expect(screen.getByText("ห้องใหม่")).toBeTruthy();
    expect(get.mock.calls[1][0]).toContain("class=c2");
  });
});
