import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { call, callIn, login, seed } from "./helpers";
import golden from "./read-shape.golden.json";

// Fixed rows (no clock, no random ids) so the replies of the read endpoints can be compared with literal expectations.
async function fixture() {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO attendance_sessions (id,date,class_id,subject_id,period,updated_at) VALUES ('as1','2569-09-10','c1',NULL,NULL,100)"),
    env.DB.prepare("INSERT INTO attendance_sessions (id,date,class_id,subject_id,period,updated_at) VALUES ('as2','2569-09-10','c1','s1',1,100)"),
    env.DB.prepare("INSERT INTO attendance_sessions (id,date,class_id,subject_id,period,updated_at) VALUES ('as3','2569-09-11','c1',NULL,NULL,100)"),
    env.DB.prepare("INSERT INTO attendance_sessions (id,date,class_id,subject_id,period,updated_at) VALUES ('as4','2569-09-10','c2',NULL,NULL,100)"),
    env.DB.prepare("INSERT INTO attendance (session_id,student_id,status,time,method,device_id,updated_at) VALUES ('as1','st1','present',1000,'grid',NULL,200)"),
    env.DB.prepare("INSERT INTO attendance (session_id,student_id,status,time,method,device_id,updated_at) VALUES ('as1','st2','absent',1000,'manual',NULL,210)"),
    env.DB.prepare("INSERT INTO attendance (session_id,student_id,status,time,method,device_id,updated_at) VALUES ('as2','st1','late',2000,'grid',NULL,220)"),
    env.DB.prepare("INSERT INTO attendance (session_id,student_id,status,time,method,device_id,updated_at) VALUES ('as3','st1','sick',3000,'grid',NULL,230)"),
    env.DB.prepare("INSERT INTO attendance (session_id,student_id,status,time,method,device_id,updated_at) VALUES ('as4','st9','leave',4000,'grid',NULL,240)"),
    env.DB.prepare("INSERT INTO submissions (assignment_id,student_id,status,score,late,submitted_at,method,device_id,scan_session_id,updated_at) VALUES ('a1','st1','submitted',8,0,500,'grid',NULL,'ss1',600)"),
    env.DB.prepare("INSERT INTO submissions (assignment_id,student_id,status,score,late,submitted_at,method,device_id,scan_session_id,updated_at) VALUES ('a1','st2','submitted',NULL,1,510,'camera',NULL,'ss1',610)"),
  ]);
}

// read-shape.golden.json = the replies captured from the code BEFORE the change (serverTime removed); key = "<status> <url>"
/**
 * The same database, but counting round trips: a call that starts while another is still in flight shares its
 * trip (queries side by side, or one batch); a call that starts after everything has answered is a new trip.
 */
function tripCounter() {
  let inFlight = 0, trips = 0;
  const track = async <T,>(run: () => Promise<T>): Promise<T> => {
    if (inFlight === 0) trips++;
    inFlight++;
    try { return await run(); } finally { inFlight--; }
  };
  const wrap = (stmt: D1PreparedStatement): D1PreparedStatement => new Proxy(stmt, {
    get(target, prop) {
      if (prop === "bind") return (...a: unknown[]) => wrap(target.bind(...a));
      if (prop === "all" || prop === "run" || prop === "first") return (...a: unknown[]) => track(() => (target as any)[prop](...a));
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => wrap(target.prepare(sql));
      if (prop === "batch") return (stmts: D1PreparedStatement[]) => track(() => target.batch(stmts.map((x) => (x as any).__raw ?? x)));
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { env: { ...env, DB } as typeof env, trips: () => trips };
}

describe("read endpoints keep their exact reply shape (queries run side by side, the reply must not change)", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); await fixture(); });

  it("every read endpoint replies exactly as it did before the queries were run side by side", async () => {
    for (const [key, expected] of Object.entries(golden as Record<string, unknown>)) {
      const [status, url] = [Number(key.slice(0, 3)), key.slice(4)];
      const res = await call(url, {}, cookie);
      expect(res.status, url).toBe(status);
      const body: any = await res.json();
      if ("serverTime" in body) { expect(typeof body.serverTime, url).toBe("number"); delete body.serverTime; }
      expect(body, url).toEqual(expected);
    }
  });

  it("costs few database round trips (the sign-in/schema check is 1; each read adds at most the number below)", async () => {
    const limits: Record<string, number> = {
      "/api/attendance?date=2569-09-10&class=c1": 1,
      "/api/attendance?date=2569-09-12&class=c1": 1,
      "/api/attendance/days?from=2569-09-09&to=2569-09-12": 1,
      "/api/bootstrap": 1,
      "/api/gradebook?class=c1&term=t1": 2,
      "/api/reports/summary?class=c1&term=t1&month=2569-09": 2,
      "/api/dashboard?term=t1&date=2569-09-10": 2,
    };
    for (const [url, extra] of Object.entries(limits)) {
      const m = tripCounter();
      const res = await callIn(m.env, url, {}, cookie);
      expect(res.status, url).toBe(200);
      await res.json();
      expect(m.trips(), url).toBeLessThanOrEqual(1 + extra);
    }
  });

  it("a reader that is not signed in gets nothing", async () => {
    for (const u of ["/api/attendance?date=2569-09-10&class=c1", "/api/attendance/days?from=2569-09-09&to=2569-09-12", "/api/gradebook?class=c1", "/api/reports/summary?class=c1", "/api/dashboard", "/api/bootstrap"]) {
      expect((await call(u)).status, u).toBe(401);
    }
  });
});
