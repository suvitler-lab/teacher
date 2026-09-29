import { describe, it, expect, beforeEach, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post: vi.fn(), put: vi.fn() } };
});

import { ApiError } from "@client/lib/api";
import { dashboard, dashboardStatus, dashboardStale, loadDashboard } from "@client/lib/dashboard";
import { applyBootstrap, loadSelectedTerm, setSelectedTerm, selectedTermId, UNASSIGNED } from "@client/store";
import { kvSet } from "@client/lib/idb";

const payload = (termId: string | null, awaiting: number) => ({
  date: "2026-09-29", termId, openAssignments: [], gradingAssignments: [],
  awaitingCount: awaiting, missingCount: 0, attendanceToday: [], followUp: [], serverTime: 1,
});
const offline = () => new ApiError(0, "network", "offline");
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe("dashboard: never shows another term's numbers", () => {
  beforeEach(async () => {
    get.mockReset();
    dashboard.value = null;
    dashboardStale.value = false;
    dashboardStatus.value = "loading";
    // no saved copies from a previous test
    for (const k of ["t1", "t2", ""]) await kvSet(`dashboard:${k}`, null);
  });

  it("term 1 loads, then term 2 while offline with no saved copy → nothing, not term 1's figures", async () => {
    get.mockResolvedValueOnce(payload("t1", 7));
    await loadDashboard("t1");
    expect(dashboard.value?.awaitingCount).toBe(7);
    expect(dashboardStatus.value).toBe("ready");

    get.mockRejectedValueOnce(offline());
    await loadDashboard("t2");
    expect(dashboard.value).toBeNull();          // the 7 belongs to t1
    expect(dashboardStatus.value).toBe("error");
    expect(dashboardStale.value).toBe(false);
  });

  it("offline WITH a saved copy of that term shows it, marked as stale", async () => {
    get.mockResolvedValueOnce(payload("t2", 3));
    await loadDashboard("t2"); // saves dashboard:t2
    get.mockResolvedValueOnce(payload("t1", 7));
    await loadDashboard("t1");

    get.mockRejectedValueOnce(offline());
    await loadDashboard("t2");
    expect(dashboard.value?.termId).toBe("t2");
    expect(dashboard.value?.awaitingCount).toBe(3);
    expect(dashboardStale.value).toBe(true);
  });

  it("a slow answer for a term the teacher already left is ignored", async () => {
    let releaseT1!: (v: unknown) => void;
    get.mockImplementationOnce(() => new Promise((r) => { releaseT1 = r; })); // t1: slow
    get.mockResolvedValueOnce(payload("t2", 2));                              // t2: fast

    const first = loadDashboard("t1");
    await tick();
    await loadDashboard("t2");
    expect(dashboard.value?.termId).toBe("t2");

    releaseT1(payload("t1", 99)); // t1 finally answers
    await first;
    expect(dashboard.value?.termId).toBe("t2");
    expect(dashboard.value?.awaitingCount).toBe(2);
  });
});

describe('the "no term yet" choice', () => {
  const bootstrap = (currentTermId: string) => ({
    settings: { theme: "light" }, terms: [{ id: "t1", name: "1/2569" }, { id: "t2", name: "2/2569" }],
    currentTermId, classes: [], subjects: [], workTypes: [], students: [], revokedTokens: {}, assignments: [], serverTime: Date.now(),
  }) as any;

  beforeEach(() => { selectedTermId.value = null; });

  it("survives a bootstrap refresh (it used to snap back to the current term)", () => {
    applyBootstrap(bootstrap("t1"));
    expect(selectedTermId.value).toBe("t1");

    setSelectedTerm(UNASSIGNED);
    applyBootstrap(bootstrap("t1"));
    expect(selectedTermId.value).toBe(UNASSIGNED);
  });

  it("is restored after a reload, and sent as term=unassigned (never as 'no filter')", async () => {
    applyBootstrap(bootstrap("t1"));
    setSelectedTerm(UNASSIGNED);
    await tick(20); // kvSet is fire-and-forget

    selectedTermId.value = null;
    applyBootstrap(bootstrap("t1"));
    await loadSelectedTerm();
    expect(selectedTermId.value).toBe(UNASSIGNED);

    get.mockResolvedValueOnce(payload(UNASSIGNED, 0));
    await loadDashboard(selectedTermId.value);
    expect(get).toHaveBeenLastCalledWith("/api/dashboard?term=unassigned");
  });

  it("a saved term that no longer exists falls back to the current term", async () => {
    await kvSet("termId", "gone");
    applyBootstrap(bootstrap("t2"));
    await loadSelectedTerm();
    expect(selectedTermId.value).toBe("t2");
  });
});
