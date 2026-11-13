import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { revokedTokens, students as allStudents, studentsById } from "../../../store";
import { installHidScanner } from "../../../lib/hid";
import { buildIndex, resolveScan } from "@shared/scan";
import { fullName } from "../../../lib/names";
import { navigate } from "../../../router";
import type { Settings } from "@shared/types";
import { Row, Scope, SwitchRow, useReadOnly } from "./shared";

function HidTest({ allowCode }: { allowCode: boolean }) {
  const ro = useReadOnly();
  const [log, setLog] = useState<{ raw: string; who: string | null; ok: boolean; ms: number; at: number }[]>([]);
  useEffect(() => {
    if (ro) return; // projecting: a scanned card would put a child's name on the screen (AC-248)
    return installHidScanner((raw) => {
      const t0 = performance.now();
      const idx = buildIndex(allStudents.value, revokedTokens.value, null);
      const r = resolveScan(raw, idx, { allowStudentCode: allowCode });
      const st = r.studentId ? studentsById.value.get(r.studentId) : null;
      setLog((l) => [{ raw, who: st ? fullName(st) : (r.kind === "revoked" ? "บัตรถูกยกเลิก" : null), ok: r.kind === "student", ms: Math.round(performance.now() - t0), at: Date.now() }, ...l].slice(0, 6));
    });
  }, [allowCode, ro]);
  return (
    <div>
      <div class="set-label">ทดสอบเครื่องยิง <Scope /></div>
      <div class="page-sub" style="margin-bottom:8px">ยิงสติกเกอร์ใบไหนก็ได้ ระบบจะบอกว่าอ่านได้ถูกไหม (ไม่บันทึกอะไร)</div>
      {ro ? <div class="page-sub" role="status"><Icon name="eye-off" size={16} /> ปิดอยู่ตอนฉายจอ (ผลการยิงมีชื่อนักเรียน)</div> : log.length === 0 ? <div class="page-sub" style="padding:8px;background:var(--surface-1);border-radius:10px;text-align:center">รอการยิง…</div> : log.map((r) => (
        <div class="row" style={`gap:8px;padding:6px 10px;border-radius:10px;margin-bottom:4px;${r.ok ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-danger);color:var(--text-danger)"}`}>
          <Icon name={r.ok ? "circle-check" : "x"} size={16} />
          <span class="grow" style="font-size:var(--fs-sm);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="font-family:var(--font-mono)">{r.raw.slice(0, 16)}</span>{r.who ? ` → ${r.who}` : " — ไม่พบ"}</span>
          <span style="font-size:var(--fs-xs)">{r.ms} ms</span>
        </div>
      ))}
    </div>
  );
}

/** Runs every step the camera scanner needs on THIS device and shows each result, so a problem can be read out, not guessed. */
function CameraTest() {
  const [rows, setRows] = useState<{ label: string; ok: boolean; detail: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setRows(null);
    try {
      const { diagnoseCamera } = await import("../../../lib/camera");
      setRows(await diagnoseCamera());
    } catch (e) {
      setRows([{ label: "โหลดตัวตรวจสอบ", ok: false, detail: "ต่อเน็ตแล้วลองอีกครั้ง (" + ((e as Error)?.message || "ไม่ทราบสาเหตุ") + ")" }]);
    } finally { setBusy(false); }
  }
  const allOk = !!rows && rows.every((r) => r.ok);
  return (
    <div>
      <div class="set-label">ทดสอบกล้อง <Scope /></div>
      <div class="page-sub" style="margin-bottom:8px">ตรวจว่าเครื่องนี้สแกนด้วยกล้องได้ไหม และถ้าไม่ได้ เพราะอะไร (ระบบจะขอเปิดกล้องแวบเดียวแล้วปิด ไม่บันทึกภาพ)</div>
      <button onClick={run} disabled={busy || useReadOnly()}>{busy ? <Icon name="loader-2" size={16} class="spin" /> : <Icon name="camera" size={16} />} {rows ? "ทดสอบอีกครั้ง" : "เริ่มทดสอบกล้อง"}</button>
      {rows && (
        <div style="margin-top:8px">
          <div class="imp-warn" style={`margin:0 0 6px;${allOk ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-danger);color:var(--text-danger)"}`} role="status">
            <Icon name={allOk ? "circle-check" : "alert-triangle"} size={15} />
            <span>{allOk ? "ผ่านทุกขั้น — เครื่องนี้สแกนด้วยกล้องได้" : "มีขั้นที่ไม่ผ่าน — ดูรายละเอียดด้านล่าง (ถ่ายหน้าจอส่งให้ผู้ดูแลได้)"}</span>
          </div>
          {rows.map((r) => (
            <div class="row" style="gap:8px;align-items:flex-start;padding:5px 0;border-top:0.5px solid var(--border);font-size:var(--fs-sm)">
              <Icon name={r.ok ? "circle-check" : "circle-x"} size={16} style={r.ok ? "color:var(--text-success);margin-top:2px" : "color:var(--text-danger);margin-top:2px"} />
              <div style="min-width:0"><div style="font-weight:500">{r.label}</div><div class="page-sub" style="word-break:break-word">{r.detail}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScanSection({ cur, saveNow }: { cur: Settings; saveNow: (k: "sound_enabled" | "accept_student_code_scan", v: boolean, label: string) => void }) {
  return (
    <div class="set-forms">
      <section class="card" aria-labelledby="se-sh">
        <h2 id="se-sh" class="set-section-title"><Icon name="barcode" /> การสแกน</h2>
        <Row label="เสียงตอบรับ" hint="ติ๊ด = สำเร็จ · ตื๊ด = ซ้ำ/ไม่พบ" scope="all" mode="now">
          <SwitchRow on={cur.sound_enabled} onToggle={() => saveNow("sound_enabled", !cur.sound_enabled, "เสียงตอบรับ")} label="เสียงตอบรับ" />
        </Row>
        <Row label="รับบาร์โค้ดบัตรนักเรียนเดิม" hint="สแกนรหัสนักเรียนตรงๆ ได้ นอกจาก QR ของระบบ" scope="all" mode="now">
          <SwitchRow on={cur.accept_student_code_scan} onToggle={() => saveNow("accept_student_code_scan", !cur.accept_student_code_scan, "รับบาร์โค้ดบัตรเดิม")} label="รับบาร์โค้ดบัตรเดิม" />
        </Row>
        <div class="set-sub"><HidTest allowCode={cur.accept_student_code_scan} /></div>
        <div class="set-sub"><CameraTest /></div>
        <Row label="พิมพ์บัตร QR ของนักเรียน" hint="หน้านักเรียนมีปุ่มพิมพ์บัตรและสติกเกอร์ QR (P3)">
          <button data-nav onClick={() => navigate("/students")}><Icon name="printer" size={20} /> ไปพิมพ์ที่ นักเรียน ›</button>
        </Row>
      </section>
    </div>
  );
}
