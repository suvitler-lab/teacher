import { Dialog } from "./Dialog";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { api } from "../lib/api";
import { runBackup } from "../lib/backup";
import { clearLocalWork } from "../lib/idb";
import { pauseSync } from "../lib/outbox";
import { stopAttSync } from "../lib/attSync";
import { online } from "../lib/outbox";
import { projectorOn } from "../lib/projector";
import { BackupWarning } from "./RestoreModal";

export type ResetMode = "data" | "all";

// the same words the server asks for (worker/routes/reset.ts)
export const PHRASE: Record<ResetMode, string> = { data: "ล้างข้อมูล", all: "ล้างทั้งหมด" };

const TEXT: Record<ResetMode, { title: string; goes: string; stays: string; after: string }> = {
  data: {
    title: "ล้างข้อมูลทดลอง",
    goes: "ห้องเรียน นักเรียน วิชา ภาคเรียน งาน คะแนน การเช็คชื่อ และประวัติการแก้ไข ทั้งหมด",
    stays: "บัญชีครู อุปกรณ์ที่เข้าสู่ระบบ การตั้งค่า และประเภทงาน",
    after: "กลับไปหน้าต้อนรับครั้งแรก (ตั้งโรงเรียน ภาคเรียน ห้อง วิชา)",
  },
  all: {
    title: "ล้างทั้งหมด เริ่มใหม่ตั้งแต่ต้น",
    goes: "ทุกอย่างข้างต้น รวมทั้งบัญชีครู อุปกรณ์ที่เข้าสู่ระบบ การตั้งค่า และประเภทงาน (กลับเป็นค่าเริ่มต้น)",
    stays: "ไม่มี — เหมือนเว็บใหม่เอี่ยม",
    after: "กลับไปหน้าตั้งบัญชีครั้งแรก (ต้องใช้รหัสติดตั้ง)",
  },
};

/**
 * Wipe / start over (BR-59, SE-S13): TWO steps. Step 1 says what goes and what stays and asks for the safety copy (ticked);
 * step 2 asks for the password and the exact phrase. The red button stays off until everything is right, the safe answer
 * (cancel) holds the first focus of step 1 and the password field the first focus of step 2, and the box cannot be closed while it works.
 * Offline or while projecting nothing can be sent.
 */
export function ResetModal({ mode, onClose }: { mode: ResetMode; onClose: () => void }) {
  const t = TEXT[mode];
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [backupFirst, setBackupFirst] = useState(true);
  const [warn, setWarn] = useState(false); // the personal-data warning before the safety copy is downloaded (AC-242)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pwRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const offline = !online.value;
  const projecting = projectorOn.value;
  const ready = !!password && confirm.trim() === PHRASE[mode] && !busy && !offline && !projecting;
  const cancel1 = useRef<HTMLButtonElement>(null);
  const wentBack = useRef(false);
  // step 2: the password field; back to step 1 (R-5602): the safe button, so the focus never falls to the page
  useLayoutEffect(() => { if (step === 2) pwRef.current?.focus(); else if (wentBack.current) cancel1.current?.focus(); }, [step]);

  async function go() {
    if (sending.current || !ready) return;
    sending.current = true;
    setErr(""); setBusy(true);
    try {
      // the safety copy comes FIRST: if it can't be made, nothing is deleted
      if (backupFirst) {
        try { await runBackup({}); } catch { setErr("สำรองข้อมูลก่อนลบไม่สำเร็จ — ยังไม่มีอะไรถูกลบ (เอาติ๊กสำรองออกได้ถ้าไม่ต้องการ)"); setBusy(false); return; }
      }
      await api.post("/api/admin/reset", { mode, password, confirm: confirm.trim() });
      pauseSync(); stopAttSync();
      await clearLocalWork();
      location.hash = "";
      location.reload();
    } catch (e: any) {
      setErr(e?.message || "ล้างข้อมูลไม่สำเร็จ — ยังไม่มีอะไรถูกลบ");
      setBusy(false);
    } finally { sending.current = false; }
  }
  // with the safety copy ticked, the warning comes before anything is sent
  function press() { if (!ready) return; if (backupFirst) setWarn(true); else void go(); }

  return (
    <>
    <div class="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <Dialog label={t.title} onClose={onClose} dismissible={!busy} style="max-width:520px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:1.2rem">{t.title}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose} disabled={busy}><Icon name="x" /></button>
        </div>
        <p class="dz-steps">ขั้นที่ {step} จาก 2 · {step === 1 ? "ดูว่าอะไรจะหาย" : "ยืนยันตัวตน"}</p>
        <div class="imp-warn danger" style="margin:0 0 10px"><Icon name="alert-triangle" size={20} /> <span>ย้อนกลับไม่ได้ ถ้าไม่มีไฟล์สำรอง ข้อมูลจะหายถาวร</span></div>

        {step === 1 ? (
          <>
            <ul class="dz-list">
              <li><Icon name="trash" size={20} /> <span><b style="font-weight:500">ที่จะถูกลบ:</b> {t.goes}</span></li>
              <li><Icon name="check" size={20} /> <span><b style="font-weight:500">ที่เก็บไว้:</b> {t.stays}</span></li>
              <li><Icon name="chevron-right" size={20} /> <span><b style="font-weight:500">หลังจากนั้น:</b> {t.after}</span></li>
            </ul>
            <label class="dz-check">
              <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst((e.target as HTMLInputElement).checked)} />
              <span>ดาวน์โหลดไฟล์สำรองก่อนลบ (แนะนำ)</span>
            </label>
            <div class="dz-modal-actions">
              <button data-autofocus ref={cancel1} onClick={onClose}>ยกเลิก</button>
              <button class="primary" onClick={() => setStep(2)}>ถัดไป <Icon name="chevron-right" size={20} /></button>
            </div>
          </>
        ) : (
          <>
            <label class="field"><span>รหัสผ่านของคุณ</span>
              <input ref={pwRef} type="password" autocomplete="current-password" value={password} disabled={busy}
                aria-describedby={err ? "rs-err" : undefined} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
            </label>
            <label class="field"><span>พิมพ์ “{PHRASE[mode]}” เพื่อยืนยัน</span>
              <input value={confirm} disabled={busy} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} placeholder={PHRASE[mode]} />
            </label>
            {err && <div id="rs-err" role="alert" class="acct-err"><Icon name="alert-triangle" size={16} /> <span>{err}</span></div>}
            <div class="dz-modal-actions">
              {(offline || projecting) && <span class="page-sub set-need-online">{projecting ? "ปิดอยู่ตอนฉายจอ" : "ต้องออนไลน์"}</span>}
              <button onClick={() => { setErr(""); wentBack.current = true; setStep(1); }} disabled={busy}>ย้อนกลับ</button>
              <button onClick={onClose} disabled={busy}>ยกเลิก</button>
              <button class="danger" disabled={!ready} onClick={press}>
                {busy ? <Icon name="loader-2" class="spin" size={20} /> : <Icon name="trash" size={20} />} {t.title}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
    {warn && <BackupWarning onClose={() => setWarn(false)} onConfirm={() => { setWarn(false); void go(); }} />}
    </>
  );
}
