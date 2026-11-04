import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async orig => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post: vi.fn(), put: vi.fn() } }));
import { ReportsPage } from "@client/pages/Reports";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import type { ReportPayload } from "@client/lib/report";
import { dashboard, dashboardAt, dashboardStale, dashboardStatus, loadDashboard } from "@client/lib/dashboard";
import { swrClear, SWR_FRESH_MS } from "@client/lib/swr";

function payload(name: string, classId = "c1"): ReportPayload {
  return {
    classId, range: { from: "2026-05-01", to: "2026-10-31", month: null, termId: "t1", att: "daily" },
    students: [{ id: classId + "s", code: "001", qr_token: "test", prefix: null, first_name: name, last_name: "", nickname: null, class_id: classId, number: 1, status: "active", left_at: null, updated_at: 0 }],
    assignments: [], submissions: [], attendanceSessions: [], attendance: [],
  };
}
const defer = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const dash = (termId: string | null, awaiting: number) => ({ date: "2026-09-29", termId, openAssignments: [], gradingAssignments: [], awaitingCount: awaiting, missingCount: 0, attendanceToday: [], followUp: [], serverTime: 1 });

beforeEach(() => {
  get.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-01", end_date: "2026-10-31", updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = ["c1", "c2"].map((id, i) => ({ id, name: `ป.6/${i + 1}`, grade: "ป.6", sort: i, year: 2569, archived: false, updated_at: 0 }));
  students.value = []; subjects.value = []; assignments.value = [];
  swrClear();
});
afterEach(() => { vi.useRealTimers(); });

describe("reports page + saved reads", () => {
  it("coming back within the fresh window paints at once without a request", async () => {
    get.mockResolvedValue(payload("ข้อมูลแรก"));
    const first = render(<ReportsPage />);
    await screen.findByText("ข้อมูลแรก");
    first.unmount();
    expect(get).toHaveBeenCalledTimes(1);
    render(<ReportsPage />);
    expect(screen.getByText("ข้อมูลแรก")).toBeTruthy(); // synchronously, no "กำลังโหลด…"
    expect(screen.queryByText("กำลังโหลด…")).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("an old answer is painted first and renewed quietly", async () => {
    get.mockResolvedValueOnce(payload("ข้อมูลเก่า"));
    const first = render(<ReportsPage />);
    await screen.findByText("ข้อมูลเก่า");
    first.unmount();
    vi.setSystemTime(Date.now() + SWR_FRESH_MS + 1000);
    const next = defer<ReportPayload>();
    get.mockReturnValueOnce(next.promise);
    render(<ReportsPage />);
    expect(screen.getByText("ข้อมูลเก่า")).toBeTruthy();
    expect(screen.queryByText("กำลังโหลด…")).toBeNull();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    next.resolve(payload("ข้อมูลใหม่"));
    await screen.findByText("ข้อมูลใหม่");
    expect(screen.queryByText("ข้อมูลเก่า")).toBeNull();
  });

  it("a different class never shows another class's saved answer (cold load shows the spinner)", async () => {
    get.mockResolvedValueOnce(payload("ห้องหนึ่ง", "c1"));
    const first = render(<ReportsPage />);
    await screen.findByText("ห้องหนึ่ง");
    first.unmount();
    const c2 = defer<ReportPayload>();
    get.mockReturnValueOnce(c2.promise);
    selectedTermId.value = "t1";
    const view = render(<ReportsPage />);
    view.getByRole("tab", { name: /ป.6\/2/ }).click();
    await waitFor(() => expect(get.mock.calls[1]?.[0]).toContain("class=c2"));
    expect(screen.queryByText("ห้องหนึ่ง")).toBeNull();
    expect(screen.getByText("กำลังโหลด…")).toBeTruthy();
    c2.resolve(payload("ห้องสอง", "c2"));
    await screen.findByText("ห้องสอง");
  });
});

describe("dashboard + saved reads", () => {
  beforeEach(() => { dashboard.value = null; dashboardAt.value = null; dashboardStale.value = false; dashboardStatus.value = "loading"; });

  it("a second load inside the fresh window makes no request; force and a write do", async () => {
    get.mockResolvedValue(dash("t1", 4));
    await loadDashboard("t1");
    await loadDashboard("t1");
    expect(get).toHaveBeenCalledTimes(1);
    await loadDashboard("t1", { force: true });
    expect(get).toHaveBeenCalledTimes(2);
    swrClear(); // any write
    await loadDashboard("t1");
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("Scan's 60 s window: numbers 40 s old are reused, 70 s old are renewed", async () => {
    get.mockResolvedValue(dash("t1", 4));
    await loadDashboard("t1");
    vi.setSystemTime(Date.now() + 40_000);
    await loadDashboard("t1", { maxAgeMs: 60_000 });
    expect(get).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 30_000);
    await loadDashboard("t1", { maxAgeMs: 60_000 });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("Scan's 60 s window does not reuse numbers read before a write", async () => {
    get.mockResolvedValue(dash("t1", 4));
    await loadDashboard("t1");
    swrClear();
    await loadDashboard("t1", { maxAgeMs: 60_000 });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("another term is never served from the saved answer of this term", async () => {
    get.mockResolvedValueOnce(dash("t1", 4)).mockResolvedValueOnce(dash("t2", 9));
    await loadDashboard("t1");
    await loadDashboard("t2");
    expect(get).toHaveBeenCalledTimes(2);
    expect((dashboard.value as { awaitingCount?: number } | null)?.awaitingCount).toBe(9);
  });

  it("an old saved answer paints first, then is renewed", async () => {
    get.mockResolvedValueOnce(dash("t1", 4));
    await loadDashboard("t1");
    vi.setSystemTime(Date.now() + SWR_FRESH_MS + 1000);
    dashboard.value = null; // the page was left and the numbers dropped
    const next = defer<ReturnType<typeof dash>>();
    get.mockReturnValueOnce(next.promise);
    const p = loadDashboard("t1");
    expect((dashboard.value as { awaitingCount?: number } | null)?.awaitingCount).toBe(4);
    expect(dashboardStatus.value).toBe("ready");
    next.resolve(dash("t1", 6));
    await p;
    expect((dashboard.value as { awaitingCount?: number } | null)?.awaitingCount).toBe(6);
  });
});
