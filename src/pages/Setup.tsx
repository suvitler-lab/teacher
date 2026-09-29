import { useState } from "preact/hooks";
import { api } from "../lib/api";
import { deviceId, deviceName, setDeviceName } from "../lib/device";
import { authState, loadBootstrap } from "../store";
import { Icon } from "../components/Icon";

export function Setup({ mode }: { mode: "setup" | "login" }) {
  const isSetup = mode === "setup";
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState(deviceName());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setErr("");
    if (!password) return setErr("กรอกรหัสผ่าน");
    if (isSetup && password.length < 6) return setErr("รหัสผ่านอย่างน้อย 6 ตัวอักษร");
    if (isSetup && password !== confirm) return setErr("รหัสผ่านยืนยันไม่ตรงกัน");
    if (!name.trim()) return setErr("ตั้งชื่ออุปกรณ์นี้");
    setBusy(true);
    setDeviceName(name.trim());
    try {
      if (isSetup) {
        await api.post("/api/setup", {
          setupCode: code,
          password,
          deviceId: deviceId(),
          deviceName: name.trim(),
        });
      } else {
        await api.post("/api/auth/login", {
          password,
          deviceId: deviceId(),
          deviceName: name.trim(),
        });
      }
      await loadBootstrap();
      const { clearLoggedOut } = await import("../store");
      await clearLoggedOut();
      const { startOutbox, resumeSync } = await import("../lib/outbox");
      startOutbox();
      resumeSync(); // deliver whatever was kept while signed out
      authState.value = "ready";
      location.hash = "/home";
    } catch (e: any) {
      setErr(e.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="auth-wrap">
      <form class="auth-card card" onSubmit={submit}>
        <div class="auth-logo">
          <Icon name="checks" size={30} />
        </div>
        <h1 style="text-align:center;font-size:22px">งานครบ</h1>
        <p style="text-align:center;color:var(--text-secondary);margin:4px 0 18px">
          {isSetup ? "ตั้งค่าระบบครั้งแรก — สร้างรหัสผ่านครู" : "เข้าสู่ระบบสำหรับครู"}
        </p>

        {isSetup && (
          <label class="field">
            <span>รหัสติดตั้ง (SETUP_CODE)</span>
            <input value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} autocomplete="off" />
          </label>
        )}

        <label class="field">
          <span>รหัสผ่าน</span>
          <input type="password" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
        </label>

        {isSetup && (
          <label class="field">
            <span>ยืนยันรหัสผ่าน</span>
            <input type="password" value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} />
          </label>
        )}

        <label class="field">
          <span>ชื่ออุปกรณ์นี้ (ใช้ในประวัติการแก้ไข)</span>
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="เช่น มือถือครู" />
        </label>

        {err && <div class="auth-err" role="alert">{err}</div>}

        <button class="primary" style="width:100%;height:44px;margin-top:6px" disabled={busy}>
          {busy ? <Icon name="loader-2" class="spin" /> : <Icon name="login" />}
          {isSetup ? "สร้างบัญชีครู" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
