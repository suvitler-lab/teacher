import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, json, login, seed, cookieFrom } from "./helpers";

describe("attendance/days", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("tallies daily sessions per day and ignores per-subject sessions", async () => {
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [
      { studentId: "st1", status: "present" }, { studentId: "st2", status: "late" },
    ] }), cookie);
    await call("/api/attendance/batch", json({ date: "2026-09-11", classId: "c1", rows: [
      { studentId: "st1", status: "absent" },
    ] }), cookie);
    // a per-subject session on the same range must not appear
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", subjectId: "s1", period: 1, rows: [
      { studentId: "st1", status: "leave" },
    ] }), cookie);

    const res = await call("/api/attendance/days?from=2026-09-08&to=2026-09-14&class=c1", {}, cookie);
    const days = ((await res.json()) as any).days;
    expect(days.length).toBe(2);
    const d10 = days.find((d: any) => d.date === "2026-09-10");
    expect(d10).toMatchObject({ present: 1, late: 1, marked: 2, total: 2 });
    const d11 = days.find((d: any) => d.date === "2026-09-11");
    expect(d11).toMatchObject({ absent: 1, marked: 1 });
  });

  it("rejects a range longer than 62 days", async () => {
    const res = await call("/api/attendance/days?from=2026-01-01&to=2026-12-31&class=c1", {}, cookie);
    expect(res.status).toBe(400);
  });
});

describe("reports term date range", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("scopes attendance to the term's start/end dates", async () => {
    await call("/api/terms", json({ id: "t1", year: 2569, term: 1, name: "1/2569", start_date: "2026-09-05", end_date: "2026-09-20", is_current: true }), cookie);
    // one inside the window, one before it
    await call("/api/attendance/batch", json({ date: "2026-09-10", classId: "c1", rows: [{ studentId: "st1", status: "present" }] }), cookie);
    await call("/api/attendance/batch", json({ date: "2026-09-01", classId: "c1", rows: [{ studentId: "st1", status: "present" }] }), cookie);

    const res = await call("/api/reports/summary?class=c1&term=t1", {}, cookie);
    const body = (await res.json()) as any;
    expect(body.attendanceSessions.length).toBe(1); // only 2026-09-10
    expect(body.range.from).toBe("2026-09-05");
    expect(body.range.to).toBe("2026-09-20");
    expect(body.range.termDatesMissing).toBe(false);
  });

  it("flags termDatesMissing when the term has no dates and no month is picked", async () => {
    const res = await call("/api/reports/summary?class=c1&term=t1", {}, cookie);
    const body = (await res.json()) as any;
    expect(body.range.termDatesMissing).toBe(true);
  });
});

describe("student status is preserved on edit", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("editing a moved student keeps them moved, and the filter finds them", async () => {
    await env.DB.prepare("UPDATE students SET status = 'moved' WHERE id = 'st1'").run();
    // edit without sending a status field
    await call("/api/students", json({ id: "st1", code: "101", first_name: "ก", last_name: "ข", class_id: "c1", number: 1 }), cookie);
    const row = await env.DB.prepare("SELECT status FROM students WHERE id = 'st1'").first<{ status: string }>();
    expect(row?.status).toBe("moved");

    const listed = await call("/api/students?class=c1&status=moved", {}, cookie);
    const students = ((await listed.json()) as any).students;
    expect(students.some((s: any) => s.id === "st1")).toBe(true);
  });
});

describe("device sign-out", () => {
  it("signs out another device without affecting the current one", async () => {
    const cookieA = await login();
    // a second device logs in
    const resB = await call("/api/auth/login", json({ password: "pw123456", deviceId: "dev_b", deviceName: "เครื่อง B" }));
    const cookieB = cookieFrom(resB);
    expect((await call("/api/bootstrap", {}, cookieB)).status).toBe(200);

    // device A signs device B out
    await call("/api/devices/dev_b/signout", json({}), cookieA);
    expect((await call("/api/bootstrap", {}, cookieB)).status).toBe(401);
    expect((await call("/api/bootstrap", {}, cookieA)).status).toBe(200);

    const devices = ((await (await call("/api/devices", {}, cookieA)).json()) as any).devices;
    expect(devices.find((d: any) => d.id === "dev_test")?.current).toBe(true);
  });
});
