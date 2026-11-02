// c03-submit-date: the one received-date rule shared by the server and the screens (D-c03-submit-date-01).
// Written by QA (T-01) BEFORE the module exists — expected to fail at import until T-02 adds shared/received-date.ts.
// Signatures from api-contract.md v3 (EP-01 "วันที่รับงาน"); expected values computed by hand in test-plan.md (ตาราง UH).
import { describe, it, expect } from "vitest";
import { isCeDate, bkkNoonMs, checkReceivedDate, receivedAtMs } from "@shared/received-date";

const NOW = 1793584800000; //         2026-11-02 09:00 ไทย
const NOON_1030 = 1793336400000; //   2026-10-30 12:00 ไทย
const NOON_1102 = Date.UTC(2026, 10, 2, 5);
const DAY = 86_400_000;
const o = { today: "2026-11-02", assignedDate: "2026-10-26" };

describe("isCeDate (CE 1900–2099, a real calendar day)", () => {
  for (const v of ["2026-10-30", "2028-02-29", "1900-01-01", "2099-12-31"]) {
    it(`${v} → true`, () => expect(isCeDate(v)).toBe(true));
  }
  for (const v of ["2569-10-30", "2026-02-30", "2027-02-29", "2026-13-01", "30/10/2026", "2026-1-5", "", "1899-12-31", "2100-01-01", " 2026-10-30", 20261030, null, undefined]) {
    it(`${JSON.stringify(v)} → false`, () => expect(isCeDate(v)).toBe(false));
  }
});

describe("bkkNoonMs (12:00 Bangkok = 05:00Z)", () => {
  it("2026-10-30 → 1793336400000 (requirements example)", () => expect(bkkNoonMs("2026-10-30")).toBe(NOON_1030));
  it("2026-04-16 → 1776315600000", () => expect(bkkNoonMs("2026-04-16")).toBe(1776315600000));
  it("month/year ends do not slip a day", () => {
    expect(new Date(bkkNoonMs("2026-12-31")).toISOString()).toBe("2026-12-31T05:00:00.000Z");
    expect(new Date(bkkNoonMs("2028-02-29")).toISOString()).toBe("2028-02-29T05:00:00.000Z");
  });
});

describe("checkReceivedDate (first match wins: invalid → future → before_assigned)", () => {
  for (const v of ["2026-10-30", "2026-11-02", "2026-10-26"]) {
    it(`${v} (assigned 10-26, today 11-02) → null`, () => expect(checkReceivedDate(v, o)).toBeNull());
  }
  it("2026-11-03 → received_date_future", () => expect(checkReceivedDate("2026-11-03", o)).toBe("received_date_future"));
  it("2026-10-25 → received_date_before_assigned", () => expect(checkReceivedDate("2026-10-25", o)).toBe("received_date_before_assigned"));
  for (const v of ["2569-10-30", "2026-02-30", "", 123, null, undefined, "2569-11-03"]) {
    it(`${JSON.stringify(v)} → received_date_invalid`, () => expect(checkReceivedDate(v, o)).toBe("received_date_invalid"));
  }
  it("no cap going back (Q2): 2026-04-16 with no assigned date → null", () =>
    expect(checkReceivedDate("2026-04-16", { today: "2026-11-02", assignedDate: null })).toBeNull());
  it("D-04: a Buddhist-era assigned date is not a floor", () =>
    expect(checkReceivedDate("2026-04-16", { today: "2026-11-02", assignedDate: "2569-10-26" })).toBeNull());
  it("D-04: an assigned date in the future is not a floor — today always passes", () => {
    expect(checkReceivedDate("2026-11-02", { today: "2026-11-02", assignedDate: "2026-11-05" })).toBeNull();
    expect(checkReceivedDate("2026-10-01", { today: "2026-11-02", assignedDate: "2026-11-05" })).toBeNull();
  });
  it("future wins over before_assigned when both hold (order)", () =>
    expect(checkReceivedDate("2026-11-03", { today: "2026-11-02", assignedDate: "2026-11-02" })).toBe("received_date_future"));
});

describe("receivedAtMs (BR-02)", () => {
  it("no date → eventAt", () => {
    expect(receivedAtMs(undefined, NOW, NOW + 5000)).toBe(NOW);
    expect(receivedAtMs(null, NOW, NOW + 5000)).toBe(NOW);
  });
  it("the event's own Thai day → eventAt (real time)", () => expect(receivedAtMs("2026-11-02", NOW, NOW + 5000)).toBe(NOW));
  it("another day → noon of that day", () => expect(receivedAtMs("2026-10-30", NOW, NOW + 5000)).toBe(NOON_1030));
  it("another day whose noon is after now → now (never in the future)", () => {
    const e = Date.UTC(2026, 10, 1, 16); // 11-01 23:00 ไทย
    expect(receivedAtMs("2026-11-02", e, NOW)).toBe(Math.min(NOON_1102, NOW));
    expect(receivedAtMs("2026-11-02", e, NOW)).toBe(NOW);
  });
  it("same day at 08:00 → that time", () => {
    const t = Date.UTC(2026, 10, 2, 1);
    expect(receivedAtMs("2026-11-02", t, t)).toBe(t);
  });
  it("AC-06 (ก): event clamped to now−7d (10-21), date 10-20 → 10-20 noon", () => {
    const now = Date.UTC(2026, 9, 28, 3);
    expect(receivedAtMs("2026-10-20", now - 7 * DAY, now)).toBe(1792472400000);
  });
});

import { checkReceivedDate as __check, MIN_RECEIVED_DATE } from "@shared/received-date";
describe("MIN_RECEIVED_DATE (review R-01 / QA B-01): a typo year must not become a negative submitted_at", () => {
  const o = { today: "2026-11-02", assignedDate: null };
  it("1926, 1969, 1999 are invalid; 2000-01-01 and 200 days back are fine", () => {
    expect(__check("1926-10-30", o)).toBe("received_date_invalid");
    expect(__check("1969-12-31", o)).toBe("received_date_invalid");
    expect(__check("1999-12-31", o)).toBe("received_date_invalid");
    expect(MIN_RECEIVED_DATE).toBe("2000-01-01");
    expect(__check("2000-01-01", o)).toBeNull();
    expect(__check("2026-04-16", o)).toBeNull();
  });
});
