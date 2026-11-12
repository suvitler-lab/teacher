// @vitest-environment node
// T-65: the fixture server's data sets (X-1 .. X-6 in docs/team/jobs/2026-11-11-home-redesign/fixtures.md).
// Starts the real worker on an in-memory D1 (Miniflare) — a few seconds per data set — on a free port.
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { buildIndex, resolveScan } from "@shared/scan";
import { isQrToken } from "@shared/ids";

const nodeRequire = createRequire(import.meta.url);
const fx = nodeRequire("../../scripts/fixture-server.cjs");
const { startFixtureServer, DATASETS, CLS, TERM, dayAdd, dashboardProblems } = fx;

type Fixture = Awaited<ReturnType<typeof startFixtureServer>>;
/** a Response whose json() is not `unknown` (these are throw-away test checks) */
type Res = Omit<Response, "json"> & { json(): Promise<any> };

async function withFixture<T>(opts: Record<string, unknown>, fn: (s: Fixture) => Promise<T>): Promise<T> {
  const s: Fixture = await startFixtureServer({ port: 0, ...opts });
  try { return await fn(s); } finally { await s.close(); }
}

/** sign in as the fixture's teacher; returns a fetch that sends the session cookie */
async function signedIn(s: Fixture) {
  const res = await fetch(s.url + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: s.email, password: s.password, deviceId: "unit", deviceName: "Unit" }),
  });
  expect(res.status).toBe(200);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return (p: string, init: RequestInit = {}) => fetch(s.url + p, { ...init, headers: { Cookie: cookie, ...(init.headers ?? {}) } }) as Promise<Res>;
}
const ctl = (s: Fixture, method: string, p: string, body?: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(s.url + p, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as Promise<Res>;
const rows = async (s: Fixture, sql: string) => ((await s.DB.prepare(sql).all()).results ?? []) as any[];

const T10 = 120_000;

describe("X-2 · every data set flag starts and passes its self-check (X-5)", () => {
  it("lists the flags of fixtures.md plus home-extra-b (F-H6b)", () => {
    expect(DATASETS).toEqual(expect.arrayContaining([
      "demo", "empty", "home", "home-empty-year", "home-no-students", "home-clear", "home-many", "home-extra", "home-extra-b", "home-one",
      "scan", "scan-all-62", "scan-noroom", "scan-empty",
    ]));
  });

  it("each opt-in data set starts and reports self-check ok", async () => {
    for (const dataset of DATASETS.filter((d: string) => d !== "demo" && d !== "empty")) {
      await withFixture({ dataset }, async (s) => { expect(s.info.selfCheck, dataset).toBe("ok"); });
    }
  }, 300_000);

  it("--empty / seed:false is a school with no rooms; the default data set is the old demo seed", async () => {
    await withFixture({ dataset: "empty" }, async (s) => { expect(await rows(s, "SELECT id FROM classes")).toEqual([]); });
    await withFixture({ seed: false }, async (s) => { expect(s.dataset).toBe("empty"); });
    await withFixture({}, async (s) => {
      expect(s.dataset).toBe("demo");
      expect((await rows(s, "SELECT COUNT(*) n FROM students WHERE class_id = 'cls_61' AND status = 'active'"))[0].n).toBe(32);
    });
  }, T10);

  it("rejects an unknown data set, and --gb14/--layout on an opt-in set", async () => {
    await expect(startFixtureServer({ port: 0, dataset: "nope" })).rejects.toThrow(/unknown data set/);
    await expect(startFixtureServer({ port: 0, dataset: "home", gradebook14: true })).rejects.toThrow(/default data set/);
  });
});

describe("existing options still work (gb14, layout, setDown, setDbLatency)", () => {
  it("gradebook14 gives 44 children and 14 more pieces of work in ป.6/1", async () => {
    await withFixture({ gradebook14: true }, async (s) => {
      expect((await rows(s, "SELECT COUNT(*) n FROM students WHERE class_id = 'cls_61' AND status = 'active'"))[0].n).toBe(44);
      expect((await rows(s, "SELECT COUNT(*) n FROM assignments WHERE id LIKE 'asg_gb_%'"))[0].n).toBe(14);
    });
  }, T10);
  it("layout adds the long-title data", async () => {
    await withFixture({ layout: true }, async (s) => {
      expect((await rows(s, "SELECT COUNT(*) n FROM subjects WHERE id IN ('sub_eng','sub_art')"))[0].n).toBe(2);
    });
  }, T10);
  it("setDown cuts the network for everyone, setDbLatency slows D1", async () => {
    await withFixture({ dataset: "empty" }, async (s) => {
      expect((await fetch(s.url + "/api/bootstrap")).status).toBe(401);
      s.setDown(true);
      await expect(fetch(s.url + "/api/bootstrap")).rejects.toThrow();
      s.setDown(false);
      expect((await fetch(s.url + "/api/bootstrap")).status).toBe(401);
      s.setDbLatency(150);
      const t0 = Date.now();
      await (await signedIn(s))("/api/dashboard");
      expect(Date.now() - t0).toBeGreaterThanOrEqual(150);
    });
  }, T10);
});

describe("X-1 · dates follow today in Asia/Bangkok", () => {
  it("builds F-H1 from the real Bangkok day by default", async () => {
    await withFixture({ dataset: "home-one" }, async (s) => {
      // compared with s.today only (not a second bkkToday() call, which could cross Thai midnight between the two)
      expect(s.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [a1] = await rows(s, "SELECT due_date FROM assignments WHERE id = 'asg_h_a1'");
      expect(a1.due_date).toBe(s.today);
    });
  }, T10);

  it("a fixed day moves every date with it (O1 is 7 days overdue, A2 due tomorrow, term 2/2569 is T-30..T+120)", async () => {
    await withFixture({ dataset: "home", today: "2031-02-28" }, async (s) => {
      const due = Object.fromEntries((await rows(s, "SELECT id, due_date FROM assignments WHERE term_id = 'term_h2'")).map((r) => [r.id, r.due_date]));
      expect(due).toEqual({ asg_h_a1: "2031-02-28", asg_h_a2: "2031-03-01", asg_h_o1: "2031-02-21", asg_h_o2: "2031-02-25", asg_h_o3: "2031-02-26" });
      const [term] = await rows(s, "SELECT start_date, end_date, is_current FROM terms WHERE id = 'term_h2'");
      expect(term).toEqual({ start_date: "2031-01-29", end_date: "2031-06-28", is_current: 1 });
      expect((await rows(s, "SELECT date FROM attendance_sessions GROUP BY date")).map((r) => r.date)).toEqual(["2031-02-28"]);
    });
  }, T10);

  it("rejects a day that is not a real date", async () => {
    await expect(startFixtureServer({ port: 0, dataset: "home-one", today: "2031-02-30" })).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("dayAdd crosses month and year ends", () => {
    expect(dayAdd("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayAdd("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("F-H1 numbers (self-check tables) · O1 at T-7 · F-H8", () => {
  it("EP-06 returns the BR-01/03/04/06 example numbers", async () => {
    await withFixture({ dataset: "home" }, async (s) => {
      const get = await signedIn(s);
      const d = await (await get(`/api/dashboard?term=${TERM.cur}`)).json();
      expect([d.awaitingCount, d.missingCount, d.followUp.length]).toEqual([30, 22, 8]);
      const att = d.attendanceToday.map((a: any) => [a.classId, a.present + a.late, a.marked, a.total]);
      expect(att).toEqual([[CLS.g61, 30, 32, 32], [CLS.g62, 27, 30, 30], [CLS.g51, 0, 0, 28]]);
      expect(d.dueSoon.map((x: any) => x.studentIds.length)).toEqual([5, 9, 12]);
      const o1 = d.openAssignments.find((a: any) => a.assignment.id === "asg_h_o1");
      expect(o1.assignment.due_date).toBe(dayAdd(s.today, -7));
      // F-H8: the earlier term of this year has its own work, and the old year has its own rooms
      const prev = await (await get(`/api/dashboard?term=${TERM.prev}`)).json();
      expect([prev.awaitingCount, prev.missingCount]).toEqual([3, 4]);
      const old = await rows(s, "SELECT id, year, archived FROM classes WHERE year = 2568 ORDER BY id");
      expect(old).toEqual([{ id: CLS.old51, year: 2568, archived: 1 }, { id: CLS.old52, year: 2568, archived: 1 }]);
    });
  }, T10);

  it("F-H6b (--home-extra-b): ป.6/1 checked, ป.6/2 not, ป.6/3 empty → 'ยังเหลือ 1 ห้อง'", async () => {
    await withFixture({ dataset: "home-extra-b" }, async (s) => {
      const d = await (await (await signedIn(s))(`/api/dashboard?term=${TERM.cur}`)).json();
      expect(d.attendanceToday.map((a: any) => [a.classId, a.marked, a.total])).toEqual([[CLS.g61, 32, 32], [CLS.g62, 0, 30], [CLS.g63, 0, 0]]);
    });
  }, T10);

  it("F-H5 (--home-many): long room names and child name are exactly 25 characters", async () => {
    await withFixture({ dataset: "home-many" }, async (s) => {
      const names = (await rows(s, "SELECT name FROM classes ORDER BY sort")).map((r) => r.name as string);
      expect(names).toHaveLength(8);
      expect(names.every((n) => n.length === 25)).toBe(true);
      const [kid] = await rows(s, "SELECT first_name || ' ' || last_name AS full, nickname FROM students WHERE id = 'stu_m1_1'");
      expect(kid.full.length).toBe(25);
      expect(kid.nickname).toBe("ข้าวหอม🌾");
      const [{ n }] = await rows(s, "SELECT COUNT(*) n FROM assignments WHERE status = 'open'");
      expect(n).toBe(30);
    });
  }, T10);
});

describe("X-5 · the self-check refuses wrong data (exit 1 from the CLI)", () => {
  it("startFixtureServer rejects with the numbers it got when the data is off", async () => {
    const err = await startFixtureServer({
      port: 0, dataset: "home",
      afterSeed: async (DB: any) => { await DB.prepare("DELETE FROM submissions WHERE assignment_id = 'asg_h_o3'").run(); },
    }).then(() => null, (e: any) => e);
    expect(err).toBeTruthy();
    expect(err.code).toBe("FIXTURE_SELF_CHECK");
    expect(err.message).toMatch(/awaitingCount: expected 30 got 24/);
    expect(err.message).toMatch(/ป\.5\/1 progress/);
  }, T10);

  it("dashboardProblems is silent on right numbers and loud on the BR-03 trap (79% instead of 88%)", () => {
    const T = "2026-11-11";
    const d = { date: T, openAssignments: [], gradingAssignments: [], awaitingCount: 0, missingCount: 0, followUp: [], dueSoon: [], absentToday: [], attendanceToday: [] };
    expect(dashboardProblems("home-empty-year", d, T)).toEqual([]);
    expect(dashboardProblems("home", d, T).length).toBeGreaterThan(5);
    expect(dashboardProblems("home-empty-year", { ...d, date: "2026-11-12" }, T)[0]).toMatch(/^date: expected "2026-11-11"/);
  });
});

describe("X-3 · /__fixture/* controls", () => {
  it("fault: fails the next N matching API calls, then recovers; clear removes the rest", async () => {
    await withFixture({ dataset: "home-one" }, async (s) => {
      const get = await signedIn(s);
      const q = `/api/dashboard?term=${TERM.cur}`;
      expect((await get(q)).status).toBe(200);
      let r = await ctl(s, "POST", "/__fixture/fault", { method: "GET", path: "/api/dashboard", status: 500, times: 2 });
      expect((await r.json()).faults).toEqual([{ method: "GET", path: "/api/dashboard", status: 500, times: 2 }]);
      expect((await get(q)).status).toBe(500);
      expect((await get(q)).status).toBe(500);
      expect((await get(q)).status).toBe(200);
      expect(s.apiLog.filter((x: any) => x.fault)).toHaveLength(2);
      // no `times` = until cleared; another path / method is untouched; prefix patterns end with *
      await ctl(s, "POST", "/__fixture/fault", { method: "PUT", path: "/api/settings", status: 503 });
      expect((await get("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(503);
      expect((await get("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(503);
      expect((await get("/api/bootstrap")).status).toBe(200);
      await ctl(s, "POST", "/__fixture/fault", { path: "/api/scan-*", status: 500, times: 1 });
      expect((await get("/api/scan-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(500);
      r = await ctl(s, "DELETE", "/__fixture/fault");
      expect((await r.json()).faults).toEqual([]);
      expect((await get("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ school_name: "โรงเรียนสมมติ" }) })).status).toBe(200);
    });
  }, T10);

  it("fault: bad input is a 422, and a page of another site cannot send controls (415 without JSON type)", async () => {
    await withFixture({ dataset: "empty" }, async (s) => {
      expect((await ctl(s, "POST", "/__fixture/fault", { path: "api/x", status: 500 })).status).toBe(422);
      expect((await ctl(s, "POST", "/__fixture/fault", { path: "/api/x", status: 42 })).status).toBe(422);
      expect((await ctl(s, "POST", "/__fixture/fault", { path: "/api/x", status: 500, times: 0 })).status).toBe(422);
      expect((await ctl(s, "POST", "/__fixture/latency", { ms: -1 })).status).toBe(422);
      expect((await ctl(s, "POST", "/__fixture/down", { on: true }, { "Content-Type": "text/plain" })).status).toBe(415);
      expect((await ctl(s, "GET", "/__fixture/nothing")).status).toBe(404);
    });
  }, T10);

  it("down cuts the app but the control still answers and can restore it; latency slows API calls", async () => {
    await withFixture({ dataset: "empty" }, async (s) => {
      expect((await ctl(s, "POST", "/__fixture/down", { on: true })).status).toBe(200);
      await expect(fetch(s.url + "/api/bootstrap")).rejects.toThrow();
      expect((await (await ctl(s, "GET", "/__fixture/state")).json()).down).toBe(true);
      await ctl(s, "POST", "/__fixture/down", { on: false });
      expect((await fetch(s.url + "/api/bootstrap")).status).toBe(401);
      await ctl(s, "POST", "/__fixture/latency", { ms: 200 });
      const t0 = Date.now();
      await fetch(s.url + "/api/bootstrap");
      expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
      await ctl(s, "POST", "/__fixture/latency", { ms: 0 });
      // control calls are not counted as page hits
      expect(s.hits.some((h: string) => h.startsWith("/__fixture"))).toBe(false);
    });
  }, T10);

  it("kill-sessions signs everyone out (next API call is 401)", async () => {
    await withFixture({ dataset: "home-one" }, async (s) => {
      const get = await signedIn(s);
      expect((await get("/api/bootstrap")).status).toBe(200);
      const out = await (await ctl(s, "POST", "/__fixture/kill-sessions", {})).json();
      expect(out.removed).toBeGreaterThanOrEqual(1);
      expect((await get("/api/bootstrap")).status).toBe(401);
    });
  }, T10);

  it("GET /__fixture/settings shows what the server holds; POST changes it (and the app's own PUT shows up)", async () => {
    await withFixture({ dataset: "home-one" }, async (s) => {
      const get = await signedIn(s);
      let st = (await (await ctl(s, "GET", "/__fixture/settings")).json()).settings;
      expect(st.teacher_name).toBe("ครูสมมติ ใจดี");
      expect(st.late_after).toBe("08:30");
      await get("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accent: '{"v":1,"skin":"playful","layout":"c"}' }) });
      await ctl(s, "POST", "/__fixture/settings", { set: { late_after: "08:45" }, unset: ["school_name"] });
      st = (await (await ctl(s, "GET", "/__fixture/settings")).json()).settings;
      expect(st.accent).toBe('{"v":1,"skin":"playful","layout":"c"}');
      expect(st.late_after).toBe("08:45");
      expect(st.school_name).toBeUndefined();
    });
  }, T10);
});

describe("R-6501 / R-6502 / R-6504 · the CLI refuses what would mislead, and a stale day is reported", () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, ["scripts/fixture-server.cjs", ...args], { encoding: "utf8", timeout: 30_000 });
  it("exit 2 with a message: --today, bad --backup-days / --port / --late-after, unknown flags, missing values", () => {
    for (const [args, msg] of [
      [["--home", "--today", "2026-11-20"], /--today is not supported/],
      [["--home", "--backup-days", "abc"], /--backup-days wants/],
      [["--home", "--port", "x"], /--port wants/],
      [["--home", "--late-after", "25:00"], /--late-after wants/],
      [["--hom"], /unknown option --hom/],
      [["--port"], /--port needs a value/],
      [["--home", "--set", "novalue"], /--set wants key=value/],
      [["--home", "--scan"], /pick one data set/],
    ] as [string[], RegExp][]) {
      const r = cli(...args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toMatch(msg);
    }
  }, T10);

  it("accepts valid numbers: --port 4109 --backup-days 3 --late-after 08:45 opens the port (regex escapes), and bad values still exit 2", async () => {
    const child = spawn(process.execPath, ["scripts/fixture-server.cjs", "--home-one", "--port", "4109", "--backup-days", "3", "--late-after", "08:45"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    try {
      const deadline = Date.now() + 90_000;
      while (!out.includes("fixture server on") && child.exitCode === null && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      expect(err, "stderr").toBe("");
      expect(out).toContain("fixture server on http://127.0.0.1:4109");
      const st = ((await (await fetch("http://127.0.0.1:4109/__fixture/settings")).json()) as { settings: Record<string, string> }).settings;
      expect(st.late_after).toBe("08:45");
      expect(Math.round((Date.now() - Number(st.last_backup_at)) / 86_400_000)).toBe(3);
    } finally {
      child.kill();
      await exited;
    }
    for (const args of [["--home", "--port", "abc"], ["--home", "--backup-days", "abc"], ["--home", "--late-after", "8:5x"], ["--home", "--port", "70000"]]) {
      expect(cli(...args).status, args.join(" ")).toBe(2);
    }
  }, 180_000);

  it("/__fixture/state says stale:true once the Bangkok day has moved on, and warns once", async () => {
    await withFixture({ dataset: "home-one" }, async (s) => {
      expect((await (await ctl(s, "GET", "/__fixture/state")).json()).stale).toBe(false);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2 * 86_400_000 });
      try {
        expect((await (await ctl(s, "GET", "/__fixture/state")).json()).stale).toBe(true);
        await ctl(s, "GET", "/__fixture/state");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toMatch(/day changed/);
      } finally { vi.useRealTimers(); warn.mockRestore(); }
    });
  }, T10);
});

describe("X-4 · settings at start", () => {
  it("home defaults: teacher, 08:30, last backup 9 days ago (BR-01 example)", async () => {
    await withFixture({ dataset: "home-one" }, async (s) => {
      const st = (await (await ctl(s, "GET", "/__fixture/settings")).json()).settings;
      expect(st.teacher_name).toBe("ครูสมมติ ใจดี");
      expect(Math.round((Date.now() - Number(st.last_backup_at)) / 86_400_000)).toBe(9);
    });
  }, T10);

  it("overrides: name, late_after, backup (never / today), broken appearance values and removed keys", async () => {
    const bad = ['{"v":1,"skin":"luxe","layout":"b"}', "blue", '{"v":1,"skin":"warm","layout":"z"}', ""];
    for (const accent of bad) {
      await withFixture({ dataset: "home-no-students", teacherName: "ครูสมมติ ชื่อยาวเป็นพิเศษ ใจดีมาก 🌟", lateAfter: "07:15", backupDaysAgo: null, settings: { accent, theme: "dark" } }, async (s) => {
        const st = (await (await ctl(s, "GET", "/__fixture/settings")).json()).settings;
        expect(st).toMatchObject({ teacher_name: "ครูสมมติ ชื่อยาวเป็นพิเศษ ใจดีมาก 🌟", late_after: "07:15", last_backup_at: "", accent, theme: "dark" });
      });
    }
    await withFixture({ dataset: "home-clear", unsetSettings: ["accent"] }, async (s) => {
      const st = (await (await ctl(s, "GET", "/__fixture/settings")).json()).settings;
      expect(st.accent).toBeUndefined();
      expect(Math.abs(Date.now() - Number(st.last_backup_at))).toBeLessThan(60_000); // home-clear: backed up today
    });
  }, 180_000);
});

describe("F-S1 / F-S2 (--scan) and X-6 reissued card", () => {
  it("rooms, children and works match fixtures.md §4", async () => {
    await withFixture({ dataset: "scan" }, async (s) => {
      const per = await rows(s, "SELECT class_id, COUNT(*) n FROM students WHERE status = 'active' GROUP BY class_id ORDER BY class_id");
      expect(per.filter((r) => !String(r.class_id).includes("_o_") && !String(r.class_id).includes("_p_")).map((r) => [r.class_id, r.n])).toEqual([[CLS.g61, 33], [CLS.g62, 30], [CLS.g51, 28], [CLS.g64, 40]]);
      expect((await rows(s, "SELECT number, status FROM students WHERE class_id = 'cls_a_g61' AND number = 9"))).toEqual([{ number: 9, status: "moved" }]);
      expect((await rows(s, `SELECT COUNT(*) n FROM students WHERE class_id = '${CLS.g51}' AND number = 7`))[0].n).toBe(2);
      expect((await rows(s, `SELECT COUNT(*) n FROM students WHERE class_id = '${CLS.g65}'`))[0].n).toBe(0);
      const [kid4] = await rows(s, "SELECT first_name || ' ' || last_name AS full FROM students WHERE id = 'stu_g61_4'");
      expect(kid4.full.length).toBe(25);
      expect((await rows(s, "SELECT nickname FROM students WHERE id = 'stu_g61_5'"))[0].nickname).toBe("ข้าวหอม🌾");
      const [s6] = await rows(s, "SELECT title FROM assignments WHERE id = 'asg_s6'");
      expect(s6.title.length).toBe(60);
      expect((await rows(s, "SELECT COUNT(*) n FROM assignments WHERE status = 'open' AND term_id = 'term_h2'"))[0].n).toBe(7);
    });
  }, T10);

  it("the old card of ป.6/1 no. 2 resolves to 'revoked', the new one to the child", async () => {
    await withFixture({ dataset: "scan" }, async (s) => {
      const boot = await (await (await signedIn(s))("/api/bootstrap")).json();
      expect(isQrToken(fx.OLD_CARD_VALID)).toBe(true);
      expect(boot.revokedTokens[fx.OLD_CARD_VALID]).toBe("stu_g61_2");
      const idx = buildIndex(boot.students, boot.revokedTokens, CLS.g61);
      expect(resolveScan(fx.OLD_CARD_VALID, idx)).toEqual({ kind: "revoked", studentId: "stu_g61_2", raw: fx.OLD_CARD_VALID });
      expect(resolveScan(fx.NEW_CARD, idx)).toMatchObject({ kind: "student", studentId: "stu_g61_2" });
      // two children numbered 7 in ป.5/1 → never guessed
      expect(resolveScan("7", buildIndex(boot.students, boot.revokedTokens, CLS.g51))).toMatchObject({ kind: "ambiguous" });
      // the literal text from fixtures.md is kept too, but it is not a well-formed token so the app cannot call it revoked
      expect(boot.revokedTokens[fx.OLD_CARD_LITERAL]).toBe("stu_g61_2");
      expect(isQrToken(fx.OLD_CARD_LITERAL)).toBe(false);
      expect(s.info.cards.current).toBe(fx.NEW_CARD);
    });
  }, T10);

  it("F-S1b: ป.6/2 is complete, so the room after ป.6/1 is ป.5/1; F-S3 has a work whose only room is archived", async () => {
    await withFixture({ dataset: "scan-all-62" }, async (s) => {
      const d = await (await (await signedIn(s))(`/api/dashboard?term=${TERM.cur}`)).json();
      const s1 = d.openAssignments.find((a: any) => a.assignment.id === "asg_s1");
      expect(s1.assignment.class_ids).toEqual([CLS.g61, CLS.g62, CLS.g51]);
      expect(s1.perClass.find((p: any) => p.classId === CLS.g62)).toMatchObject({ total: 30, submitted: 30 });
    });
    await withFixture({ dataset: "scan-noroom" }, async (s) => {
      const [c] = await rows(s, `SELECT archived FROM classes WHERE id = '${CLS.g66}'`);
      expect(c.archived).toBe(1);
      expect((await rows(s, "SELECT class_id FROM assignment_classes WHERE assignment_id = 'asg_s8'"))).toEqual([{ class_id: CLS.g66 }]);
    });
  }, 180_000);
});
