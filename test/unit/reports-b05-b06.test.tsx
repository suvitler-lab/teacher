// ui-redesign audit B-05 / B-06: the printed term line says "ภาคเรียนที่" once, and the monthly report never opens on a
// month the term does not have (so "ช่วงข้อมูล" cannot run backwards).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));

import { ReportsPage, clampMonthToTerm, termPrintLabel } from "@client/pages/Reports";
import { rangeText } from "@client/components/reports/ReportParts";
import { classes, currentTermId, selectedTermId, settings, students, subjects, terms, assignments } from "@client/store";

describe("B-05 term line of the print header", () => {
  it("prints 'ภาคเรียนที่' exactly once whichever way the term is named", () => {
    expect(termPrintLabel("1/2569")).toBe("ภาคเรียนที่ 1/2569");
    expect(termPrintLabel("ภาคเรียนที่ 1/2569")).toBe("ภาคเรียนที่ 1/2569");
    expect(termPrintLabel(undefined)).toBe("ภาคเรียนที่");
  });
});

describe("B-06 monthly report default month", () => {
  const term = { start_date: "2026-05-16", end_date: "2026-10-10" };
  it("a month after the term clamps to the term's last month; before, to its first; inside stays", () => {
    expect(clampMonthToTerm("2026-11", term)).toBe("2026-10");
    expect(clampMonthToTerm("2026-03", term)).toBe("2026-05");
    expect(clampMonthToTerm("2026-08", term)).toBe("2026-08");
    expect(clampMonthToTerm("2026-11", { start_date: null, end_date: null })).toBe("2026-11");
    expect(clampMonthToTerm("2026-11", undefined)).toBe("2026-11");
  });
  it("a range that would run backwards says the month is outside the term instead", () => {
    expect(rangeText({ from: "2026-11-01", to: "2026-10-10" })).toMatch(/นอกภาคเรียน/);
    expect(rangeText({ from: "2026-10-01", to: "2026-10-10" })).toContain("–");
    expect(rangeText({ from: "2026-10-01", to: null })).toContain("ปัจจุบัน");
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T05:00:00Z"));
    get.mockReset();
    get.mockImplementation(async (p: string) => (p.startsWith("/api/audit") ? { rows: [] } : {
      classId: "c1", range: { from: "2026-10-01", to: "2026-10-10", month: "2026-10", termId: "t1", att: "daily" },
      students: [], assignments: [], submissions: [], attendanceSessions: [], attendance: [],
    }));
    terms.value = [{ id: "t1", year: 2569, term: 1, name: "ภาคเรียนที่ 1/2569", is_current: true, start_date: "2026-05-16", end_date: "2026-10-10", updated_at: 0 }];
    currentTermId.value = selectedTermId.value = "t1";
    classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, year: 2569, archived: false, updated_at: 0 }];
    students.value = []; assignments.value = []; subjects.value = [];
    settings.value = { school_name: "x", teacher_name: "", home_cards: "", reports_cards: "", period_times: "{}" } as never;
  });
  afterEach(() => vi.useRealTimers());

  it("opening 'รายเดือน' after the term ended asks for the term's last month, not the current one", async () => {
    render(<ReportsPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "รายเดือน" }).catch(() => screen.getByText("รายเดือน")));
    await waitFor(() => expect(get.mock.calls.some((c) => String(c[0]).includes("month=2026-10"))).toBe(true));
    expect(get.mock.calls.some((c) => String(c[0]).includes("month=2026-11"))).toBe(false);
  });
});
