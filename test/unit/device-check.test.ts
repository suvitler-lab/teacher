// "Check this device": every verdict and the words that go with it, and how the server's clock is read.
import { describe, it, expect, vi } from "vitest";
import {
  judgeDevice, worst, deviceReportText, describeAgent, pingServer, SKEW_WARN_MS, SKEW_FAIL_MS, type DeviceFacts,
} from "@client/lib/deviceCheck";

const healthy: DeviceFacts = {
  secure: true, host: "https://school.example", online: true, reachable: true, latencyMs: 180,
  health: { ok: true, schema: 5, db: { reachable: true, schema: 5, schemaOk: true }, config: { pepper: true } },
  skewMs: 800, offline: "ready", offlineNote: "", installed: true, persisted: true, freeMb: 5000, storageWorks: true,
  pending: 0, failed: 0, drafts: 0, hasCamera: true, workerVersion: "5dbeca6b6fee",
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  screen: "820×1180", touch: true,
};
const judged = (over: Partial<DeviceFacts>) => judgeDevice({ ...healthy, ...over });
const by = (checks: ReturnType<typeof judgeDevice>, id: string) => checks.find((c) => c.id === id)!;

describe("a device that is ready", () => {
  it("passes every check, in the order a teacher reads them", () => {
    const c = judgeDevice(healthy);
    expect(c.map((x) => x.id)).toEqual(["https", "server", "offline", "storage", "clock", "queue", "camera"]);
    expect(c.every((x) => x.level === "ok")).toBe(true);
    expect(worst(c)).toBe("ok");
    expect(by(c, "offline").detail).toContain("5dbeca6b6fee"); // which release the offline files belong to
  });
});

describe("what is wrong, said so the teacher can act", () => {
  it("not https: fail, and says camera and offline are lost", () => {
    const c = by(judged({ secure: false, host: "http://192.168.1.5:5173" }), "https");
    expect(c.level).toBe("fail");
    expect(c.detail).toMatch(/http:\/\/192\.168\.1\.5.*กล้องและการใช้ออฟไลน์/);
  });

  it("offline right now: a warning, not a failure — scanning still works", () => {
    const c = by(judged({ online: false, reachable: false, skewMs: null }), "server");
    expect(c.level).toBe("warn");
    expect(c.detail).toMatch(/สแกนและเช็คชื่อต่อได้/);
  });

  it("online but the server does not answer: fail, and suggests another signal", () => {
    const c = by(judged({ reachable: false }), "server");
    expect(c.level).toBe("fail");
    expect(c.detail).toMatch(/สัญญาณมือถือ/);
  });

  it.each([
    [{ ok: false, db: { reachable: false } }, /ฐานข้อมูลใช้ไม่ได้/],
    [{ ok: false, db: { reachable: true, schema: 4, schemaOk: false } }, /คนละรุ่น/],
    [{ ok: false, db: { reachable: true, schema: 5, schemaOk: true }, config: { pepper: false } }, /SESSION_PEPPER/],
    [{ ok: false }, /ไม่พร้อม/],
  ])("the server says it is not healthy (%j)", (health, words) => {
    const c = by(judged({ health }), "server");
    expect(c.level).toBe("fail");
    expect(c.detail).toMatch(words);
    expect(c.detail).toMatch(/OPERATIONS/);
  });

  it("a slow server is a warning that nothing is lost", () => {
    const c = by(judged({ latencyMs: 4200 }), "server");
    expect(c.level).toBe("warn");
    expect(c.detail).toMatch(/ไม่หาย/);
  });

  it.each([
    ["preparing", "warn", /รอให้เสร็จ/],
    ["update", "warn", /อัปเดตเลย/],
    ["error", "fail", /ไม่สำเร็จ/],
    ["unsupported", "fail", /เปิดใหม่ไม่ได้/],
  ] as const)("offline readiness %s → %s", (state, level, words) => {
    const c = by(judged({ offline: state }), "offline");
    expect(c.level).toBe(level);
    expect(c.detail).toMatch(words);
  });

  it("offline readiness 'unsupported' on an insecure page is the https problem's echo, not a second failure", () => {
    expect(by(judged({ secure: false, offline: "unsupported" }), "offline").level).toBe("warn");
  });

  it("the offline error carries the worker's own reason", () => {
    expect(by(judged({ offline: "error", offlineNote: "ดาวน์โหลดไฟล์สำหรับใช้ออฟไลน์ไม่ครบ" }), "offline").detail).toBe("ดาวน์โหลดไฟล์สำหรับใช้ออฟไลน์ไม่ครบ");
  });

  it("storage that cannot be written is the worst thing: queued scans would be lost", () => {
    const c = by(judged({ storageWorks: false }), "storage");
    expect(c.level).toBe("fail");
    expect(c.detail).toMatch(/ห้ามใช้เครื่องนี้สแกน/);
  });

  it("low space, and not installed / not persistent, are warnings — with the honest 'not a guarantee'", () => {
    expect(by(judged({ freeMb: 40 }), "storage").level).toBe("warn");
    const c = by(judged({ installed: false, persisted: false }), "storage");
    expect(c.level).toBe("warn");
    expect(c.detail).toMatch(/หน้าจอโฮม/);
    expect(by(judged({ installed: false, persisted: true }), "storage").detail).toMatch(/ไม่ใช่การรับประกัน/);
  });

  it("clock: within 30 s fine, then a warning, past 5 minutes a failure — either direction", () => {
    expect(by(judged({ skewMs: SKEW_WARN_MS }), "clock").level).toBe("ok");
    expect(by(judged({ skewMs: SKEW_WARN_MS + 1 }), "clock").level).toBe("warn");
    expect(by(judged({ skewMs: -(SKEW_WARN_MS + 1) }), "clock").level).toBe("warn");
    expect(by(judged({ skewMs: SKEW_FAIL_MS + 1 }), "clock").level).toBe("fail");
    const fast = by(judged({ skewMs: -10 * 60_000 }), "clock");
    expect(fast.detail).toMatch(/เร็วกว่าเซิร์ฟเวอร์ 10 นาที/);
    expect(by(judged({ skewMs: 10 * 60_000 }), "clock").detail).toMatch(/ช้ากว่าเซิร์ฟเวอร์ 10 นาที/);
    expect(by(judged({ skewMs: null }), "clock").level).toBe("warn");
  });

  it("queue: work waiting is a warning; work the server refused is a failure", () => {
    expect(by(judged({ pending: 3, drafts: 1 }), "queue").detail).toMatch(/3 รายการ.*1 รายการ/);
    expect(by(judged({ pending: 3 }), "queue").level).toBe("warn");
    const f = by(judged({ failed: 2, pending: 3 }), "queue");
    expect(f.level).toBe("fail");
    expect(f.detail).toMatch(/2 รายการ/);
  });

  it("no camera support is a warning that names the alternatives", () => {
    const c = by(judged({ hasCamera: false }), "camera");
    expect(c.level).toBe("warn");
    expect(c.detail).toMatch(/เครื่องยิงหรือพิมพ์เลขที่/);
  });

  it("the overall verdict is the worst single one", () => {
    expect(worst(judged({ pending: 1 }))).toBe("warn");
    expect(worst(judged({ pending: 1, storageWorks: false }))).toBe("fail");
  });
});

describe("the text to paste into the trial log", () => {
  it("has the time in Bangkok, the verdict, one line per check with its mark, and which device this was", () => {
    const text = deviceReportText(judged({ pending: 2, skewMs: 90_000 }), healthy, new Date("2026-09-30T01:12:00Z"));
    const lines = text.split("\n");
    expect(lines[0]).toBe("งานครบ — ตรวจเครื่อง 2026-09-30 08:12");
    expect(lines[1]).toBe("ผล: ใช้ได้ แต่มีข้อควรดู");
    expect(text).toMatch(/✔ เปิดผ่าน HTTPS — https:\/\/school\.example/);
    expect(text).toMatch(/▲ นาฬิกาเครื่อง — .*เร็วกว่า|▲ นาฬิกาเครื่อง — .*ช้ากว่า/);
    expect(text).toMatch(/▲ งานที่ค้างในเครื่อง/);
    expect(lines.at(-1)).toBe("เครื่อง: iPad · Safari 17 · จอ 820×1180 · จอสัมผัส");
  });
});

describe("naming the device", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Android · Chrome 124"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1", "iPhone · Chrome 123"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0", "Windows · Edge 125"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "Mac · Safari 17"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0", "Linux · Firefox 126"],
    ["unknown", "อุปกรณ์ · เบราว์เซอร์"],
  ])("%s → %s", (ua, name) => expect(describeAgent(ua)).toBe(name));
});

describe("pingServer — the server's clock comes from the HTTP Date header", () => {
  const answer = (headers: Record<string, string>, body: unknown = { ok: true }, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));

  it("measures the skew against the middle of the round trip, and reports the latency", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T01:00:10.400Z"));
    // the server says 01:00:00 (the header has second resolution) while this device thinks it is ~01:00:10: 10 s fast
    const fetchImpl = vi.fn(async () => {
      vi.setSystemTime(new Date("2026-09-30T01:00:10.600Z")); // 200 ms round trip
      return new Response(JSON.stringify({ ok: true }), { headers: { Date: "Wed, 30 Sep 2026 01:00:00 GMT" } });
    });
    const r = await pingServer(fetchImpl as unknown as typeof fetch);
    vi.useRealTimers();
    expect(r.reachable).toBe(true);
    expect(r.latencyMs).toBe(200);
    expect(r.skewMs).toBe(Date.parse("2026-09-30T01:00:00Z") - Date.parse("2026-09-30T01:00:10.500Z")); // −10.5 s: this device is ahead
    expect(r.health).toEqual({ ok: true });
  });

  it("a 503 with the app's JSON is still 'reachable' — its health says what is wrong", async () => {
    const r = await pingServer(answer({ Date: "Wed, 30 Sep 2026 01:00:00 GMT" }, { ok: false, config: { pepper: false } }, 503) as unknown as typeof fetch);
    expect(r.reachable).toBe(true);
    expect(r.health).toMatchObject({ ok: false, config: { pepper: false } });
  });

  it("no answer at all is 'not reachable'; an answer that is not the app's JSON leaves health empty; no Date header leaves the skew unknown", async () => {
    expect(await pingServer(vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toMatchObject({ reachable: false, skewMs: null, health: null });
    const page = await pingServer(vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch);
    expect(page).toMatchObject({ reachable: true, health: null });
    const noDate = await pingServer(answer({}) as unknown as typeof fetch);
    expect(noDate.skewMs).toBeNull();
  });

  it("gives up after the timeout instead of hanging (a stalled wifi)", async () => {
    vi.useFakeTimers();
    const stalled = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const p = pingServer(stalled as unknown as typeof fetch, 5000);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await p).toMatchObject({ reachable: false });
    vi.useRealTimers();
  });
});
