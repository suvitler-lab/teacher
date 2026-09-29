// "Check this device" — what a teacher runs on each phone/tablet/computer BEFORE walking into the room, and can read out
// or copy to whoever looks after the system. The judging is a pure function of facts about the device, so every verdict
// (and the wording that goes with it) is tested; gathering the facts is the only part that touches the browser.
import { offlineState, offlineNote, type OfflineState } from "./offline";
import { isPersisted, isInstalledApp } from "./storage";
import { kvGet, kvSet } from "./idb";
import { pendingCount, failedCount } from "./outbox";
import { attDraftCount } from "./attSync";

export type Level = "ok" | "warn" | "fail";
export interface Check { id: string; label: string; level: Level; detail: string }

export interface DeviceFacts {
  secure: boolean;
  host: string;
  online: boolean;
  /** the server answered at all (false too when this device is offline and nobody asked) */
  reachable: boolean;
  latencyMs: number | null;
  /** what the server says about itself (/api/health), null if it did not answer with JSON */
  health: { ok?: boolean; db?: { reachable?: boolean; schema?: number | null; schemaOk?: boolean }; config?: { pepper?: boolean }; schema?: number } | null;
  /** the server's clock minus this device's, in ms (null = could not be measured) */
  skewMs: number | null;
  offline: OfflineState;
  offlineNote: string;
  installed: boolean;
  persisted: boolean | null;
  freeMb: number | null;
  storageWorks: boolean;
  pending: number;
  failed: number;
  drafts: number;
  hasCamera: boolean;
  workerVersion: string | null;
  userAgent: string;
  screen: string;
  touch: boolean;
}

/** How far a device's clock may be from the server's before it is worth saying so. */
export const SKEW_WARN_MS = 30_000;
export const SKEW_FAIL_MS = 5 * 60_000;
const SLOW_MS = 2000;
const LOW_STORAGE_MB = 100;

const secs = (ms: number) => Math.round(Math.abs(ms) / 1000);
const minsText = (ms: number) => (Math.abs(ms) >= 90_000 ? `${Math.round(Math.abs(ms) / 60_000)} นาที` : `${secs(ms)} วินาที`);

/** The verdicts, in the order a teacher would want to read them. */
export function judgeDevice(f: DeviceFacts): Check[] {
  const out: Check[] = [];
  const add = (id: string, label: string, level: Level, detail: string) => out.push({ id, label, level, detail });

  // 1 ─ the address: without https there is no camera and no offline use
  f.secure
    ? add("https", "เปิดผ่าน HTTPS", "ok", f.host)
    : add("https", "เปิดผ่าน HTTPS", "fail", `ตอนนี้เปิดจาก ${f.host} ซึ่งไม่ใช่ HTTPS — กล้องและการใช้ออฟไลน์จะใช้ไม่ได้ เปิดจากลิงก์ https:// ของระบบ`);

  // 2 ─ the network and the server
  if (!f.online) {
    add("server", "เครือข่ายและเซิร์ฟเวอร์", "warn", "เครื่องนี้ออฟไลน์อยู่ — สแกนและเช็คชื่อต่อได้ งานจะรอในเครื่องแล้วส่งเองเมื่อมีเน็ต (ตรวจเซิร์ฟเวอร์ไม่ได้ตอนนี้)");
  } else if (!f.reachable) {
    add("server", "เครือข่ายและเซิร์ฟเวอร์", "fail", "ต่อเน็ตได้ แต่เข้าเซิร์ฟเวอร์ของระบบไม่ได้ (ไม่ตอบ) — wifi อาจค้าง ลองสลับไปสัญญาณมือถือ");
  } else if (f.health && f.health.ok === false) {
    const why = f.health.db?.reachable === false ? "ฐานข้อมูลใช้ไม่ได้"
      : f.health.db && f.health.db.schemaOk === false ? "ฐานข้อมูลกับแอปคนละรุ่น (ต้องอัปเดตฐานข้อมูล)"
      : f.health.config?.pepper === false ? "ยังไม่ได้ตั้ง SESSION_PEPPER บนเซิร์ฟเวอร์"
      : "เซิร์ฟเวอร์บอกว่าไม่พร้อม";
    add("server", "เครือข่ายและเซิร์ฟเวอร์", "fail", `เซิร์ฟเวอร์ตอบ แต่ ${why} — แจ้งผู้ดูแลระบบ (docs/OPERATIONS.md)`);
  } else if (f.latencyMs != null && f.latencyMs > SLOW_MS) {
    add("server", "เครือข่ายและเซิร์ฟเวอร์", "warn", `ตอบช้า (${f.latencyMs} ms) — สัญญาณอ่อน งานจะช้าแต่ไม่หาย`);
  } else {
    add("server", "เครือข่ายและเซิร์ฟเวอร์", "ok", `เซิร์ฟเวอร์พร้อม${f.latencyMs != null ? ` (ตอบใน ${f.latencyMs} ms)` : ""}`);
  }

  // 3 ─ can it work with no network at all
  const offlineText: Record<OfflineState, [Level, string]> = {
    ready: ["ok", "เปิดแอปและสแกนได้แม้ไม่มีอินเทอร์เน็ต" + (f.workerVersion ? ` (ไฟล์รุ่น ${f.workerVersion})` : "")],
    preparing: ["warn", "กำลังโหลดไฟล์ไว้ในเครื่อง — รอให้เสร็จก่อนพาไปห้องที่สัญญาณไม่ดี"],
    update: ["warn", "มีเวอร์ชันใหม่ดาวน์โหลดไว้แล้ว — กด \"อัปเดตเลย\" ก่อนเริ่มสแกน (งานที่ค้างไม่หาย)"],
    error: ["fail", f.offlineNote || "เตรียมไฟล์สำหรับใช้ออฟไลน์ไม่สำเร็จ — ต่อเน็ตแล้วเปิดแอปใหม่"],
    unsupported: [f.secure ? "fail" : "warn", "เบราว์เซอร์หรือที่อยู่นี้ใช้ออฟไลน์ไม่ได้ — ถ้าเน็ตหลุดกลางคาบ แอปจะเปิดใหม่ไม่ได้"],
  };
  add("offline", "ใช้ออฟไลน์", ...offlineText[f.offline]);

  // 4 ─ will what waits on this device survive
  if (!f.storageWorks) {
    add("storage", "ที่เก็บข้อมูลในเครื่อง", "fail", "เขียนที่เก็บของเบราว์เซอร์ไม่ได้ (โหมดส่วนตัว หรือพื้นที่เต็ม) — ถ้าเน็ตหลุด งานที่สแกนจะเก็บไว้ไม่ได้ ห้ามใช้เครื่องนี้สแกน");
  } else if (f.freeMb != null && f.freeMb < LOW_STORAGE_MB) {
    add("storage", "ที่เก็บข้อมูลในเครื่อง", "warn", `พื้นที่ของเบราว์เซอร์เหลือน้อย (${Math.round(f.freeMb)} MB) — ลบไฟล์/แอปในเครื่องก่อน`);
  } else if (!f.installed && f.persisted !== true) {
    add("storage", "ที่เก็บข้อมูลในเครื่อง", "warn", "เบราว์เซอร์อาจลบงานที่ยังไม่ได้ส่งถ้าไม่ได้เปิดเว็บนานราว 7 วัน (Safari) — เพิ่มไว้ที่หน้าจอโฮม และอย่าปล่อยงานค้างข้ามช่วงปิดเทอม");
  } else {
    add("storage", "ที่เก็บข้อมูลในเครื่อง", "ok", (f.installed ? "ติดตั้งเป็นแอปแล้ว" : "ขอเก็บถาวรแล้ว") + " — ลดโอกาสถูกลบ (ไม่ใช่การรับประกัน จึงควรส่งงานที่ค้างให้เร็ว)");
  }

  // 5 ─ the clock
  if (f.skewMs == null) {
    add("clock", "นาฬิกาเครื่อง", "warn", "เทียบกับเซิร์ฟเวอร์ไม่ได้ตอนนี้ (ออฟไลน์)");
  } else if (Math.abs(f.skewMs) > SKEW_FAIL_MS) {
    add("clock", "นาฬิกาเครื่อง", "fail", `เวลาเครื่อง${f.skewMs > 0 ? "ช้า" : "เร็ว"}กว่าเซิร์ฟเวอร์ ${minsText(f.skewMs)} — "วันนี้" และเวลาสายบนหน้าจออาจผิด ตั้งวันเวลาของเครื่องเป็นอัตโนมัติ`);
  } else if (Math.abs(f.skewMs) > SKEW_WARN_MS) {
    add("clock", "นาฬิกาเครื่อง", "warn", `เวลาเครื่อง${f.skewMs > 0 ? "ช้า" : "เร็ว"}กว่าเซิร์ฟเวอร์ ${minsText(f.skewMs)} — แอปแก้เวลาที่บันทึกให้แล้ว แต่ควรตั้งเวลาเครื่องเป็นอัตโนมัติ`);
  } else {
    add("clock", "นาฬิกาเครื่อง", "ok", `ตรงกับเซิร์ฟเวอร์ (ต่าง ${secs(f.skewMs)} วินาที)`);
  }

  // 6 ─ work that has not reached the server
  if (f.failed > 0) {
    add("queue", "งานที่ค้างในเครื่อง", "fail", `มี ${f.failed} รายการที่ส่งไม่สำเร็จ ต้องตรวจสอบ (แถบ "ส่งไม่สำเร็จ" ที่มุมจอ) — ยังไม่ควรเริ่มรอบใหม่ทับ`);
  } else if (f.pending + f.drafts > 0) {
    add("queue", "งานที่ค้างในเครื่อง", "warn", `มีงานรอส่ง ${f.pending} รายการ และร่างเช็คชื่อ ${f.drafts} รายการ — ต่อเน็ตให้ส่งจนหมดก่อนเริ่ม`);
  } else {
    add("queue", "งานที่ค้างในเครื่อง", "ok", "ไม่มีงานค้าง");
  }

  // 7 ─ the camera exists at all (the step-by-step test is Settings ▸ การสแกน ▸ ทดสอบกล้อง)
  f.hasCamera
    ? add("camera", "กล้อง", "ok", "เบราว์เซอร์นี้รองรับกล้อง — ตรวจการอ่าน QR จริงที่ ตั้งค่า › การสแกน › ทดสอบกล้อง")
    : add("camera", "กล้อง", "warn", "เบราว์เซอร์นี้ใช้กล้องไม่ได้ — ใช้เครื่องยิงหรือพิมพ์เลขที่แทน");
  return out;
}

export function worst(checks: Check[]): Level {
  return checks.some((c) => c.level === "fail") ? "fail" : checks.some((c) => c.level === "warn") ? "warn" : "ok";
}

export const VERDICT: Record<Level, string> = {
  ok: "พร้อมใช้งาน",
  warn: "ใช้ได้ แต่มีข้อควรดู",
  fail: "ยังไม่พร้อม — แก้ข้อที่ไม่ผ่านก่อน",
};

/** "iPad · Safari 17" from a user-agent string — enough to tell devices apart in a trial log. */
export function describeAgent(ua: string): string {
  const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "อุปกรณ์";
  const pick = (re: RegExp, name: string) => { const m = re.exec(ua); return m ? `${name} ${m[1]}` : null; };
  const browser = pick(/Edg\/(\d+)/, "Edge") ?? pick(/(?:Chrome|CriOS)\/(\d+)/, "Chrome") ?? pick(/Firefox\/(\d+)/, "Firefox") ?? pick(/Version\/(\d+)[\d.]* .*Safari/, "Safari") ?? "เบราว์เซอร์";
  return `${os} · ${browser}`;
}

const MARK: Record<Level, string> = { ok: "✔", warn: "▲", fail: "✘" };

/** Plain text of the result, to paste into the trial log or a message. */
export function deviceReportText(checks: Check[], f: DeviceFacts, at: Date = new Date()): string {
  const stamp = new Date(at.getTime() + 7 * 3600_000).toISOString().replace("T", " ").slice(0, 16); // Bangkok
  return [
    `งานครบ — ตรวจเครื่อง ${stamp}`,
    `ผล: ${VERDICT[worst(checks)]}`,
    "",
    ...checks.map((c) => `${MARK[c.level]} ${c.label} — ${c.detail}`),
    "",
    `เครื่อง: ${describeAgent(f.userAgent)} · จอ ${f.screen}${f.touch ? " · จอสัมผัส" : ""}`,
  ].join("\n");
}

// ---- gathering the facts (the only part that touches the browser) ---------------------------------

/** Ask the server how it is and what time it thinks it is (the HTTP Date header, to the second). */
export async function pingServer(fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<Pick<DeviceFacts, "reachable" | "latencyMs" | "health" | "skewMs">> {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl("/api/health", { cache: "no-store", signal: ctl.signal });
    const t1 = Date.now();
    let health: DeviceFacts["health"] = null;
    try { health = await res.json(); } catch { /* not the app's answer */ }
    const date = Date.parse(res.headers.get("Date") ?? "");
    return { reachable: true, latencyMs: t1 - t0, health, skewMs: Number.isFinite(date) ? date - Math.round((t0 + t1) / 2) : null };
  } catch {
    return { reachable: false, latencyMs: null, health: null, skewMs: null };
  } finally {
    clearTimeout(timer);
  }
}

async function workerVersion(): Promise<string | null> {
  const c = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
  if (!c) return null;
  return new Promise((resolve) => {
    const done = (v: string | null) => { navigator.serviceWorker.removeEventListener("message", on); resolve(v); };
    const on = (e: MessageEvent) => { if (e.data?.type === "VERSION") done(String(e.data.version)); };
    navigator.serviceWorker.addEventListener("message", on);
    c.postMessage({ type: "VERSION" });
    setTimeout(() => done(null), 1500);
  });
}

async function storageProbe(): Promise<{ works: boolean; freeMb: number | null }> {
  let works = false;
  try {
    const stamp = String(Date.now());
    await kvSet("deviceCheck", stamp);
    works = (await kvGet<string>("deviceCheck")) === stamp;
  } catch { works = false; }
  let freeMb: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota != null && est.usage != null) freeMb = (est.quota - est.usage) / 1048576;
  } catch { /* the browser will not say */ }
  return { works, freeMb };
}

export async function collectDeviceFacts(): Promise<DeviceFacts> {
  const [ping, storage, persisted, version] = await Promise.all([
    navigator.onLine ? pingServer() : Promise.resolve({ reachable: false, latencyMs: null, health: null, skewMs: null }),
    storageProbe(),
    isPersisted(),
    workerVersion(),
  ]);
  return {
    secure: window.isSecureContext !== false,
    host: location.protocol + "//" + location.host,
    online: navigator.onLine,
    ...ping,
    offline: offlineState.value,
    offlineNote: offlineNote.value,
    installed: isInstalledApp(),
    persisted,
    freeMb: storage.freeMb,
    storageWorks: storage.works,
    pending: pendingCount.value,
    failed: failedCount.value,
    drafts: attDraftCount.value,
    hasCamera: !!navigator.mediaDevices?.getUserMedia,
    workerVersion: version,
    userAgent: navigator.userAgent,
    screen: `${window.screen?.width ?? 0}×${window.screen?.height ?? 0}`,
    touch: (navigator.maxTouchPoints ?? 0) > 0,
  };
}
