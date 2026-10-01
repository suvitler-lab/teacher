import { env } from "cloudflare:test";
import { app } from "../../worker/app";

// Child-first order so FK enforcement (on in the test runtime) is satisfied.
// work_types + settings keep their migration defaults (assignments FK -> work_types).
const ALL_TABLES = [
  "audit_logs", "attendance", "attendance_sessions", "submissions", "scan_sessions",
  "assignment_classes", "assignments", "revoked_qr_tokens", "students",
  "subjects", "classes", "terms", "login_attempts", "sessions", "devices", "teacher",
  "restore_staging", "restore_jobs",
];

/** Wipe every table and restore the schema_version marker. Run before each test. */
export async function reset() {
  await env.DB.batch(ALL_TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('schema_version','6')"),
    env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('maintenance','0')"),
    env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('data_epoch','1')"),
  ]);
}

export function call(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return app.request(path, { ...init, headers }, env as any);
}

export function json(body: unknown, init: RequestInit = {}): RequestInit {
  return { method: "POST", body: JSON.stringify(body), ...init };
}

export function cookieFrom(res: Response): string {
  const set = res.headers.get("Set-Cookie") || "";
  const m = /gk_session=([^;]+)/.exec(set);
  return m ? `gk_session=${m[1]}` : "";
}

/** Create the teacher and return an auth cookie. */
export async function login(): Promise<string> {
  const res = await call(
    "/api/setup",
    json({ setupCode: "test-code", email: "teacher@example.com", password: "pw123456", deviceId: "dev_test", deviceName: "เครื่องทดสอบ" }),
  );
  if (res.status !== 200) throw new Error("setup failed " + res.status);
  return cookieFrom(res);
}

/** Insert a minimal academic dataset directly via SQL. */
export async function seed() {
  const now = 0;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO terms (id,year,term,name,is_current,updated_at) VALUES ('t1',2569,1,'1/2569',1,?)").bind(now),
    env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c1','ป.6/1','ป.6',10,0,2569,?)").bind(now),
    env.DB.prepare("INSERT INTO classes (id,name,grade,sort,archived,year,updated_at) VALUES ('c2','ป.6/2','ป.6',20,0,2569,?)").bind(now),
    env.DB.prepare("INSERT INTO subjects (id,code,name,color,sort,archived,updated_at) VALUES ('s1','ว16101','วิทย์','blue',10,0,?)").bind(now),
    env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES ('st1','101','Q-AAAAAAAAAA','ด.ช.','ก','ข','c1',1,'active',?)").bind(now),
    env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES ('st2','102','Q-BBBBBBBBBB','ด.ญ.','ค','ง','c1',2,'active',?)").bind(now),
    env.DB.prepare("INSERT INTO students (id,code,qr_token,prefix,first_name,last_name,class_id,number,status,updated_at) VALUES ('st9','201','Q-CCCCCCCCCC','ด.ช.','จ','ฉ','c2',1,'active',?)").bind(now),
    env.DB.prepare("INSERT INTO assignments (id,term_id,subject_id,type_id,title,full_score,assigned_date,due_date,publish_scores,status,created_at,updated_at) VALUES ('a1','t1','s1','wt_worksheet','ใบงาน 1',10,'2569-09-01','2569-12-31',1,'open',?,?)").bind(now, now),
    env.DB.prepare("INSERT INTO assignment_classes (assignment_id,class_id) VALUES ('a1','c1')"),
  ]);
}

/**
 * Hold ONE request just before its D1 write, so a test can decide what happens in the gap between "the
 * request checked the data" and "the request wrote it" (another device, a restore, a settings change).
 * Pass `gate.env` as the third argument of `app.request` for the request to hold; everything else uses
 * the normal env. `await gate.ready` = the held request has reached its write; `gate.release()` lets it go.
 */
export function gateBatch() {
  let release!: () => void;
  let reached!: () => void;
  const ready = new Promise<void>((r) => (reached = r));
  const wait = new Promise<void>((r) => (release = r));
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "batch") return async (stmts: D1PreparedStatement[]) => { reached(); await wait; return target.batch(stmts); };
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { env: { ...env, DB } as typeof env, ready, release };
}

/** Like `call`, but against another env (see gateBatch). */
export function callIn(e: typeof env, path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return app.request(path, { ...init, headers }, e as any);
}
