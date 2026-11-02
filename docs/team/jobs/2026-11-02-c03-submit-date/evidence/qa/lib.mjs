export const BASE = "http://127.0.0.1:4101";
export function client(deviceId) {
  let cookie = "";
  async function call(method, path, body, extra = {}) {
    const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extra },
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j };
  }
  return { call, async login() { const r = await call("POST", "/api/auth/login", { email: "fixture@example.com", password: "FixturePassword2026", deviceId, deviceName: deviceId }); if (r.status !== 200) throw new Error("login " + r.status); return r; } };
}
export const DAY = 86400000;
export const bkkDate = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
export const noon = (d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd, 5); };
