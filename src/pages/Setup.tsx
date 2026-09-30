import { useState } from "preact/hooks";
import { api } from "../lib/api";
import { deviceId, deviceName, savedEmail, saveEmail } from "../lib/device";
import { accountEmailSet, authState, loadBootstrap } from "../store";
import { Icon } from "../components/Icon";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PasswordField({ label, value, onInput, autocomplete, hint }: {
  label: string; value: string; onInput: (v: string) => void; autocomplete: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label class="field">
      <span>{label}</span>
      <div class="auth-input">
        <Icon name="lock" size={18} />
        <input
          type={show ? "text" : "password"}
          value={value}
          autocomplete={autocomplete}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        />
        <button type="button" class="ghost auth-eye" aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} onClick={() => setShow(!show)}>
          <Icon name={show ? "eye-off" : "eye"} size={18} />
        </button>
      </div>
      {hint && <small class="auth-hint">{hint}</small>}
    </label>
  );
}

export function Setup({ mode }: { mode: "setup" | "login" }) {
  const isSetup = mode === "setup";
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(savedEmail());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const legacy = !isSetup && !accountEmailSet.value;

  async function submit(e: Event) {
    e.preventDefault();
    setErr("");
    const mail = email.trim().toLowerCase();
    if (isSetup && !code.trim()) return setErr("กรอกรหัสติดตั้ง");
    if (!mail) return setErr("กรอกอีเมล");
    if (!EMAIL_RE.test(mail)) return setErr("รูปแบบอีเมลไม่ถูกต้อง");
    if (!password) return setErr("กรอกรหัสผ่าน");
    if (isSetup && password.length < 6) return setErr("รหัสผ่านอย่างน้อย 6 ตัวอักษร");
    if (isSetup && password !== confirm) return setErr("รหัสผ่านยืนยันไม่ตรงกัน");
    setBusy(true);
    try {
      const device = { deviceId: deviceId(), deviceName: deviceName() };
      if (isSetup) await api.post("/api/setup", { setupCode: code.trim(), email: mail, password, ...device });
      else await api.post("/api/auth/login", { email: mail, password, ...device });
      saveEmail(mail);
      accountEmailSet.value = true;
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
      <form class="auth-card card" onSubmit={submit} noValidate>
        <div class="auth-logo">
          <Icon name="checks" size={30} />
        </div>
        <h1 class="auth-title">{isSetup ? "สร้างบัญชีครู" : "เข้าสู่ระบบ"}</h1>
        <p class="auth-sub">
          {isSetup ? "ตั้งค่าครั้งแรก · ใช้อีเมลและรหัสผ่านนี้เข้าจากทุกเครื่อง" : "งานครบ · ระบบเก็บงานและเช็คชื่อสำหรับครู"}
        </p>

        {legacy && (
          <div class="auth-note" role="note">
            <Icon name="info-circle" size={18} />
            <span>ระบบเปลี่ยนมาใช้อีเมลเข้าสู่ระบบ — ใส่อีเมลที่ต้องการใช้ พร้อมรหัสผ่านเดิม ระบบจะผูกอีเมลนี้ให้ครั้งเดียว</span>
          </div>
        )}

        {isSetup && (
          <label class="field">
            <span>รหัสติดตั้ง</span>
            <div class="auth-input">
              <Icon name="key" size={18} />
              <input value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} autocomplete="off" spellcheck={false} />
            </div>
            <small class="auth-hint">รหัสที่ผู้ดูแลระบบตั้งไว้ (SETUP_CODE) ใช้เฉพาะตอนสร้างบัญชี</small>
          </label>
        )}

        <label class="field">
          <span>อีเมล</span>
          <div class="auth-input">
            <Icon name="mail" size={18} />
            <input
              type="email"
              inputMode="email"
              value={email}
              autocomplete="username"
              autofocus={!email}
              placeholder="name@example.com"
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            />
          </div>
        </label>

        <PasswordField
          label="รหัสผ่าน"
          value={password}
          onInput={setPassword}
          autocomplete={isSetup ? "new-password" : "current-password"}
          hint={isSetup ? "อย่างน้อย 6 ตัวอักษร" : undefined}
        />
        {isSetup && <PasswordField label="ยืนยันรหัสผ่าน" value={confirm} onInput={setConfirm} autocomplete="new-password" />}

        {err && <div class="auth-err" role="alert">{err}</div>}

        <button class="primary auth-submit" disabled={busy}>
          {busy ? <Icon name="loader-2" class="spin" /> : <Icon name={isSetup ? "user-plus" : "login"} />}
          {isSetup ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
        </button>

        {!isSetup && (
          <details class="auth-forgot">
            <summary>ลืมรหัสผ่าน?</summary>
            <p>
              ระบบนี้มีครูคนเดียว จึงรีเซ็ตโดยผู้ดูแลระบบ: รันคำสั่งรีเซ็ตตาม <b>docs/OPERATIONS.md หัวข้อ 3</b> แล้วเปิดแอปใหม่
              จะกลับมาหน้าสร้างบัญชี (ข้อมูลนักเรียนและคะแนนไม่หาย)
            </p>
          </details>
        )}
      </form>
    </div>
  );
}
