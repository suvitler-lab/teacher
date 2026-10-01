import { useState } from "preact/hooks";
import { Icon } from "./Icon";
import { api } from "../lib/api";
import { runBackup } from "../lib/backup";
import { clearLocalWork } from "../lib/idb";
import { pauseSync } from "../lib/outbox";
import { stopAttSync } from "../lib/attSync";

export type ResetMode = "data" | "all";

// the same words the server asks for (worker/routes/reset.ts)
const PHRASE: Record<ResetMode, string> = { data: "ล้างข้อมูล", all: "ล้างทั้งหมด" };

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

export function ResetModal({ mode, onClose }: { mode: ResetMode; onClose: () => void }) {
  const t = TEXT[mode];
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [backupFirst, setBackupFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = !!password && confirm.trim() === PHRASE[mode] && !busy;

  async function go() {
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
      setErr(e?.message || "ล้างข้อมูลไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div class="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <div class="modal" role="dialog" aria-label={t.title} style="max-width:520px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:18px">{t.title}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose} disabled={busy}><Icon name="x" /></button>
        </div>
        <div class="imp-warn danger" style="margin:0 0 10px"><Icon name="alert-triangle" size={15} /> ย้อนกลับไม่ได้ ถ้าไม่มีไฟล์สำรอง ข้อมูลจะหายถาวร</div>
        <div style="font-size:13px;line-height:1.6;margin-bottom:10px">
          <div><b style="font-weight:500">ที่จะถูกลบ:</b> {t.goes}</div>
          <div><b style="font-weight:500">ที่เก็บไว้:</b> {t.stays}</div>
          <div><b style="font-weight:500">หลังจากนั้น:</b> {t.after}</div>
        </div>
        <label class="row" style="gap:8px;margin-bottom:10px;font-size:13px">
          <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst((e.target as HTMLInputElement).checked)} style="width:auto" />
          <span>ดาวน์โหลดไฟล์สำรองก่อนลบ (แนะนำ)</span>
        </label>
        <label class="field"><span>รหัสผ่านของคุณ</span>
          <input type="password" autocomplete="current-password" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field"><span>พิมพ์ “{PHRASE[mode]}” เพื่อยืนยัน</span>
          <input value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} placeholder={PHRASE[mode]} />
        </label>
        {err && <div style="color:var(--text-danger);font-size:13px;margin:6px 0">{err}</div>}
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px">
          <button onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button class="primary" style="background:var(--fill-danger);border-color:var(--fill-danger)" disabled={!ready} onClick={go}>
            {busy ? <Icon name="loader-2" class="spin" size={16} /> : <Icon name="trash" size={16} />} {t.title}
          </button>
        </div>
      </div>
    </div>
  );
}
