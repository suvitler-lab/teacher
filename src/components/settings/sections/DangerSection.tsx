import { Icon } from "../../Icon";
import type { ResetMode } from "../../ResetModal";
import { Row, NeedOnline, useOffline, useReadOnly } from "./shared";

/**
 * เริ่มใหม่ (ล้างข้อมูล): the red zone, last in the list (G-T4, AC-245). Each button only opens the two-step box (ResetModal, BR-59);
 * nothing is sent from here. Offline: disabled + "ต้องออนไลน์". Projecting: the whole page is read only (AC-248).
 */
export function DangerSection({ onReset }: { onReset: (m: ResetMode) => void }) {
  const offline = useOffline();
  const ro = useReadOnly();
  const off = offline || ro;
  return (
    <section class="card dz-zone" aria-labelledby="se-zh">
      <h2 id="se-zh" class="set-section-title"><Icon name="alert-triangle" /> เริ่มใหม่ (ล้างข้อมูล)</h2>
      <p class="page-sub acct-note">การกระทำในหมวดนี้ย้อนกลับไม่ได้ · ทุกครั้งต้องผ่าน 2 ขั้นตอน (ดูรายการที่จะหาย → รหัสผ่านและพิมพ์ข้อความยืนยัน) · แนะนำให้ดาวน์โหลดไฟล์สำรองก่อน</p>
      <Row label="ล้างข้อมูลทดลอง" hint="ลบห้อง นักเรียน งาน คะแนน เช็คชื่อ · เก็บบัญชีและการตั้งค่า · กลับไปหน้าต้อนรับครั้งแรก">
        <button class="dz-btn" onClick={() => onReset("data")} disabled={off}><Icon name="trash" size={20} /> ล้างข้อมูล</button>
        {offline && <NeedOnline />}
      </Row>
      <Row label="ล้างทั้งหมด เริ่มใหม่ตั้งแต่ต้น" hint="ลบทุกอย่างรวมบัญชีครู · กลับไปหน้าตั้งบัญชีครั้งแรก">
        <button class="dz-btn" onClick={() => onReset("all")} disabled={off}><Icon name="trash-x" size={20} /> ล้างทั้งหมด</button>
        {offline && <NeedOnline />}
      </Row>
    </section>
  );
}
