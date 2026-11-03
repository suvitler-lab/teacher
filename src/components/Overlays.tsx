import { FAIL_REASON } from "../lib/failReasons";
import { Dialog } from "./Dialog";
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { Icon } from "./Icon";
import { toasts, dismiss, err } from "../lib/notify";
import { epochStale } from "../lib/session";
import { offlineState, applyUpdate } from "../lib/offline";
import { loadBootstrap, startTermOpen, assignments } from "../store";
import { authRequired, resumeAfterAuth, pendingCount, failedCount, listFailed, retryFailed, discardFailed } from "../lib/outbox";
import { api } from "../lib/api";
import { attDraftCount } from "../lib/attSync";
import { deviceId, deviceName, savedEmail, saveEmail } from "../lib/device";
import { studentsById } from "../store";
import { fullName } from "../lib/names";
import type { FailedItem } from "../lib/idb";

const KIND_ICON = { success: "circle-check", error: "alert-triangle", info: "info-circle" } as const;

export function Toasts() {
  return (
    <div class="toast-stack" aria-live="polite">
      {toasts.value.map((t) => (
        <div class={"toast " + t.kind} role="status">
          <Icon name={KIND_ICON[t.kind]} size={18} />
          <span class="grow">{t.message}</span>
          {t.action && (
            <button class="ghost" style="height:1.87rem;font-size:var(--fs-sm);color:inherit" onClick={() => { t.action!.run(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button class="icon ghost" aria-label="ปิด" style="width:1.73rem;height:1.73rem;color:inherit" onClick={() => dismiss(t.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Another device restored the data: this screen is looking at data that no longer exists.
/** The start-a-new-term window, fetched the first time it is asked for (it is used a couple of times a year). */
export function StartTermHost() {
  const [Comp, setComp] = useState<((p: { onClose: () => void }) => any) | null>(null);
  useEffect(() => {
    if (startTermOpen.value && !Comp) import("./StartTermModal").then((m) => setComp(() => m.StartTermModal)).catch(() => { startTermOpen.value = false; err("เปิดหน้าต่างไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองอีกครั้ง"); });
  }, [startTermOpen.value]);
  if (!startTermOpen.value || !Comp) return null;
  return <Comp onClose={() => { startTermOpen.value = false; }} />;
}

/** A newer version of the app is downloaded and waiting. Never swapped in under the teacher's hands. */
export function UpdateBanner() {
  if (offlineState.value !== "update") return null;
  return (
    <div class="epoch-banner" role="status">
      <Icon name="download" size={18} />
      <span class="grow">มีเวอร์ชันใหม่ของแอปพร้อมใช้ — งานที่ค้างส่งในเครื่องนี้ไม่หาย กดเมื่อสะดวก (ไม่ต้องรีบระหว่างสแกน)</span>
      <button class="primary" style="height:2rem" onClick={applyUpdate}><Icon name="refresh" size={15} /> อัปเดตเลย</button>
    </div>
  );
}

export function EpochBanner() {
  const [busy, setBusy] = useState(false);
  if (!epochStale.value) return null;
  // Everything on screen (gradebook cells, attendance tiles, dashboard numbers) was read from the data that
  // was replaced, so a whole-page reload is the only reliable way to show the restored data.
  async function reload() {
    setBusy(true);
    try { await loadBootstrap(); epochStale.value = false; location.reload(); }
    catch { err("โหลดข้อมูลใหม่ไม่สำเร็จ ลองอีกครั้ง"); setBusy(false); }
  }
  return (
    <div class="epoch-banner" role="alert">
      <Icon name="database-import" size={18} />
      <span class="grow">ข้อมูลถูกกู้คืนจากไฟล์สำรอง (อาจทำจากอีกเครื่อง) — หน้านี้ยังเป็นข้อมูลก่อนกู้คืน รายการที่ค้างส่งจะถูกพักไว้ให้ตรวจสอบ ไม่ถูกส่งเข้าข้อมูลใหม่เอง</span>
      <button class="primary" style="height:2rem" onClick={reload} disabled={busy}>{busy ? <Icon name="loader-2" class="spin" /> : <Icon name="refresh" size={15} />} โหลดข้อมูลใหม่</button>
    </div>
  );
}

export function ReloginOverlay() {
  if (!authRequired.value) return null;
  return <ReloginForm />;
}

/** The list of sends that failed: opened by the floating button or from the home page. */
export const failedPanelOpen = signal(false);

export function FailedPanel() {
  const open = failedPanelOpen.value;
  const setOpen = (v: boolean) => { failedPanelOpen.value = v; };
  const [items, setItems] = useState<FailedItem[]>([]);
  const [dropAsk, setDropAsk] = useState("");
  const n = failedCount.value;

  async function refresh() { setItems(await listFailed()); }
  useEffect(() => { if (open) refresh(); }, [open, n]);

  if (n === 0) return null;
  const REASON = FAIL_REASON;
  return (
    <>
      <button class="failed-fab" onClick={() => setOpen(true)}>
        <Icon name="alert-triangle" size={16} /> ส่งไม่สำเร็จ {n}
      </button>
      {open && (
        <div class="modal-overlay" style="z-index:150" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <Dialog label="รายการส่งไม่สำเร็จ" style="max-width:460px" onClose={() => setOpen(false)}>
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <h2 style="font-size:1.2rem">ส่งไม่สำเร็จ {n} รายการ</h2>
              <button class="icon ghost" aria-label="ปิด" onClick={() => setOpen(false)}><Icon name="x" /></button>
            </div>
            <div style="max-height:60vh;overflow-y:auto">
              {items.map((it) => {
                const st = studentsById.value.get(it.payload.studentId);
                return (
                  <div class="row" style="gap:8px;padding:8px 0;border-top:0.5px solid var(--border)">
                    <div class="grow" style="min-width:0">
                      <div style="font-size:var(--fs-sm)">{st ? fullName(st) : it.payload.studentId}</div>
                      <div class="page-sub">{assignments.value.find((x) => x.id === it.payload.assignmentId)?.title ?? ""} · {new Date(it.failedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
                      <div class="page-sub" style="color:var(--text-danger)">{REASON[it.reason] ?? it.reason}{it.payload.score != null ? ` · คะแนน ${it.payload.score}` : ""}</div>
                    </div>
                    <button style="height:2rem;font-size:var(--fs-xs)" onClick={async () => { try { await retryFailed(it.opId); } catch { err("ลองใหม่ไม่ได้ — เครื่องนี้บันทึกข้อมูลไม่ได้ รายการยังอยู่ตามเดิม"); } refresh(); }}>ลองใหม่</button>
                    {dropAsk === it.opId
                      ? <><button class="ghost" style="height:2rem;font-size:var(--fs-xs)" onClick={() => setDropAsk("")}>ไม่ทิ้ง</button><button style="height:2rem;font-size:var(--fs-xs);color:var(--text-danger)" onClick={async () => { setDropAsk(""); await discardFailed(it.opId); refresh(); }}>ทิ้งเลย</button></>
                      : <button class="ghost" style="height:2rem;font-size:var(--fs-xs)" onClick={() => setDropAsk(it.opId)}>ทิ้ง</button>}
                  </div>
                );
              })}
            </div>
          </Dialog>
        </div>
      )}
    </>
  );
}

function ReloginForm() {
  const [email, setEmail] = useState(savedEmail());
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setErr("");
    if (!email.trim()) return setErr("กรอกอีเมล");
    if (!password) return setErr("กรอกรหัสผ่าน");
    setBusy(true);
    try {
      await api.post("/api/auth/login", { email: email.trim(), password, deviceId: deviceId(), deviceName: deviceName() });
      saveEmail(email.trim().toLowerCase());
      resumeAfterAuth();
    } catch (e: any) {
      setErr(e.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="modal-overlay" style="z-index:200">
      <Dialog label="เข้าสู่ระบบอีกครั้ง" style="max-width:400px" onClose={() => {}} dismissible={false}>
      <form onSubmit={submit}>
        <div class="row" style="gap:8px;margin-bottom:8px">
          <Icon name="lock" size={20} class="muted" />
          <h2 style="font-size:1.2rem">เข้าสู่ระบบอีกครั้ง</h2>
        </div>
        <p class="page-sub" style="margin-bottom:12px">
          เซสชันหมดอายุ{pendingCount.value + attDraftCount.value > 0 ? ` — มีข้อมูลรอส่ง ${pendingCount.value + attDraftCount.value} รายการ (เก็บไว้ในเครื่องแล้ว)` : ""} เข้าสู่ระบบเพื่อส่งต่อ
        </p>
        <label class="field">
          <span>อีเมล</span>
          <input type="email" autocomplete="username" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>รหัสผ่าน</span>
          <input type="password" autocomplete="current-password" autofocus={!!email} value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
        </label>
        {err && <div class="auth-err" role="alert">{err}</div>}
        <button class="primary" style="width:100%;height:2.8rem;margin-top:6px" disabled={busy}>
          {busy ? <Icon name="loader-2" class="spin" /> : <Icon name="login" />} เข้าสู่ระบบ
        </button>
      </form>
      </Dialog>
    </div>
  );
}
