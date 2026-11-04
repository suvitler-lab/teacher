// B-F4 / N-2: attendance dated after the end of the CURRENT term (the teacher keeps checking until a new term is started)
// must stay in the term report; a past term still stops at its own end date.
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { bkkToday } from "@shared/time";
import { call, json, login, seed } from "./helpers";

const mark = (cookie: string, date: string) =>
  call("/api/attendance/batch", json({ date, classId: "c1", rows: [{ studentId: "st1", status: "present" }, { studentId: "st2", status: "absent" }] }), cookie);
const report = async (cookie: string, q: string) => (await (await call(`/api/reports/summary?${q}`, {}, cookie)).json()) as any;
const setTerm = (id: string, start: string | null, end: string | null, cur: number) =>
  env.DB.prepare("UPDATE terms SET start_date = ?, end_date = ?, is_current = ? WHERE id = ?").bind(start, end, cur, id).run();

describe("report attendance window after the term end", () => {
  let cookie: string;
  const today = bkkToday();
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("current term: days after its end date are still counted, range.to follows today", async () => {
    await setTerm("t1", "2026-05-16", "2026-10-10", 1);
    expect((await mark(cookie, "2026-10-09")).status).toBe(200);
    expect((await mark(cookie, today)).status).toBe(200);
    const rep = await report(cookie, "class=c1&term=t1");
    expect(rep.attendanceSessions.map((s: any) => s.date)).toEqual(["2026-10-09", today]);
    expect(rep.attendance.length).toBe(4);
    expect(rep.range.from).toBe("2026-05-16");
    expect(rep.range.to).toBe(today);
  });

  it("current term still inside its dates: the end date stays the bound", async () => {
    await setTerm("t1", "2026-05-16", "2999-12-31", 1);
    await mark(cookie, today);
    const rep = await report(cookie, "class=c1&term=t1");
    expect(rep.range.to).toBe("2999-12-31");
    expect(rep.attendanceSessions.length).toBe(1);
  });

  it("a PAST term (not current) keeps stopping at its end date", async () => {
    await setTerm("t1", "2026-05-16", "2026-10-10", 0);
    await mark(cookie, "2026-10-09");
    await mark(cookie, today);
    const rep = await report(cookie, "class=c1&term=t1");
    expect(rep.attendanceSessions.map((s: any) => s.date)).toEqual(["2026-10-09"]);
    expect(rep.range.to).toBe("2026-10-10");
  });

  it("a month filter still bounds the window, and a current term without an end date stays open", async () => {
    await setTerm("t1", "2026-05-16", "2026-10-10", 1);
    await mark(cookie, "2026-10-09");
    await mark(cookie, today);
    const oct = await report(cookie, "class=c1&term=t1&month=2026-10");
    expect(oct.attendanceSessions.map((s: any) => s.date)).toEqual(["2026-10-09"]);
    expect(oct.range.to).toBe("2026-10-31");
    await setTerm("t1", "2026-05-16", null, 1);
    const open = await report(cookie, "class=c1&term=t1");
    expect(open.range.to).toBeNull();
    expect(open.attendanceSessions.length).toBe(2);
  });
});
