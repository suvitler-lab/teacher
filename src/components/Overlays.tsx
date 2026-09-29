import { useEffect, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { toasts, dismiss, err } from "../lib/notify";
import { epochStale } from "../lib/session";
import { loadBootstrap, startTermOpen } from "../store";
import { authRequired, resumeAfterAuth, pendingCount, failedCount, listFailed, retryFailed, discardFailed } from "../lib/outbox";
import { api } from "../lib/api";
import { attDraftCount } from "../lib/attSync";
import { deviceId, deviceName } from "../lib/device";
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
            <button class="ghost" style="height:28px;font-size:13px;color:inherit" onClick={() => { t.action!.run(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button class="icon ghost" aria-label="ปิด" style="width:26px;height:26px;color:inherit" onClick={() => dismiss(t.id)}>
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
      <button class="primary" style="height:30px" onClick={reload} disabled={busy}>{busy ? <Icon name="loader-2" class="spin" /> : <Icon name="refresh" size={15} />} โหลดข้อมูลใหม่</button>
    </div>
  );
}

export function ReloginOverlay() {
  if (!authRequired.value) return null;
  return <ReloginForm />;
}

export function FailedPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FailedItem[]>([]);
  const n = failedCount.value;

  async function refresh() { setItems(await listFailed()); }
  useEffect(() => { if (open) refresh(); }, [open, n]);

  if (n === 0) return null;
  const REASON: Record<string, string> = {
    not_in_class: "ไม่ได้อยู่ในห้องนี้", full_score_changed: "คะแนนเต็มถูกแก้ไข",
    invalid: "ข้อมูลไม่ถูกต้อง", validation: "ข้อมูลไม่ถูกต้อง", assignment_closed: "งานปิดรับแล้ว",
    blocked_by_earlier_failure: "รอแก้รายการก่อนหน้า", no_response: "เซิร์ฟเวอร์ไม่ตอบรับ",
    superseded: "มีการแก้ไขที่ใหม่กว่าอยู่ในระบบแล้ว (เช่น ล้างทั้งห้อง) จึงไม่ใช้ค่านี้ — ส่งใหม่ถ้ายืนยันว่าค่านี้ถูก",
    epoch_changed: "ข้อมูลถูกกู้คืนจากไฟล์สำรองหลังจากรายการนี้ถูกบันทึกไว้ — ตรวจสอบก่อนส่งใหม่",
  };
  return (
    <>
      <button class="failed-fab" onClick={() => setOpen(true)}>
        <Icon name="alert-triangle" size={16} /> ส่งไม่สำเร็จ {n}
      </button>
      {open && (
        <div class="modal-overlay" style="z-index:150" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div class="modal" style="max-width:460px" role="dialog" aria-label="รายการส่งไม่สำเร็จ">
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <h2 style="font-size:18px">ส่งไม่สำเร็จ {n} รายการ</h2>
              <button class="icon ghost" aria-label="ปิด" onClick={() => setOpen(false)}><Icon name="x" /></button>
            </div>
            <div style="max-height:60vh;overflow-y:auto">
              {items.map((it) => {
                const st = studentsById.value.get(it.payload.studentId);
                return (
                  <div class="row" style="gap:8px;padding:8px 0;border-top:0.5px solid var(--border)">
                    <div class="grow" style="min-width:0">
                      <div style="font-size:13px">{st ? fullName(st) : it.payload.studentId}</div>
                      <div class="page-sub">{REASON[it.reason] ?? it.reason}{it.payload.score != null ? ` · คะแนน ${it.payload.score}` : ""}</div>
                    </div>
                    <button style="height:30px;font-size:12px" onClick={async () => { try { await retryFailed(it.opId); } catch { err("ลองใหม่ไม่ได้ — เครื่องนี้บันทึกข้อมูลไม่ได้ รายการยังอยู่ตามเดิม"); } refresh(); }}>ลองใหม่</button>
                    <button class="ghost" style="height:30px;font-size:12px" onClick={async () => { await discardFailed(it.opId); refresh(); }}>ทิ้ง</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReloginForm() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setErr("");
    if (!password) return setErr("กรอกรหัสผ่าน");
    setBusy(true);
    try {
      await api.post("/api/auth/login", { password, deviceId: deviceId(), deviceName: deviceName() });
      resumeAfterAuth();
    } catch (e: any) {
      setErr(e.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="modal-overlay" style="z-index:200">
      <form class="modal" style="max-width:400px" onSubmit={submit}>
        <div class="row" style="gap:8px;margin-bottom:8px">
          <Icon name="lock" size={20} class="muted" />
          <h2 style="font-size:18px">เข้าสู่ระบบอีกครั้ง</h2>
        </div>
        <p class="page-sub" style="margin-bottom:12px">
          เซสชันหมดอายุ{pendingCount.value + attDraftCount.value > 0 ? ` — มีข้อมูลรอส่ง ${pendingCount.value + attDraftCount.value} รายการ (เก็บไว้ในเครื่องแล้ว)` : ""} เข้าสู่ระบบเพื่อส่งต่อ
        </p>
        <label class="field">
          <span>รหัสผ่าน</span>
          <input type="password" autofocus value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
        </label>
        {err && <div class="auth-err" role="alert">{err}</div>}
        <button class="primary" style="width:100%;height:42px;margin-top:6px" disabled={busy}>
          {busy ? <Icon name="loader-2" class="spin" /> : <Icon name="login" />} เข้าสู่ระบบ
        </button>
      </form>
    </div>
  );
}
