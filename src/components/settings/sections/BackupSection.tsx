import { Icon } from "../../Icon";
import { formatThaiDateTimeMs } from "../../../lib/dates";
import { Row, Scope, NeedOnline, useOffline, useReadOnly } from "./shared";

/** สำรองและกู้คืน (P7). No wipe buttons here: they live in the red "เริ่มใหม่" section (G-T4, AC-245). */
export function BackupSection({ lastBackup, backupStale, busy, restoreInfo, restoreFailed, onBackup, onRestore, onCancelRestore, onRetryStatus }: {
  lastBackup: number; backupStale: boolean; busy: string;
  restoreInfo: { pending: boolean; maintenance: boolean } | null; restoreFailed: boolean;
  onBackup: () => void; onRestore: () => void; onCancelRestore: () => void; onRetryStatus: () => void;
}) {
  const offline = useOffline();
  const off = offline || useReadOnly(); // projecting = read only (R-5601): every writing button is off
  return (
    <>
      {restoreFailed && (
        <div class="set-banner warn" role="alert">
          <Icon name="cloud-off" size={20} />
          <span class="grow">ตรวจสถานะการกู้คืนไม่สำเร็จ</span>
          <button onClick={onRetryStatus}>ลองอีกครั้ง</button>
        </div>
      )}
      {(restoreInfo?.pending || restoreInfo?.maintenance) && (
        <div class="set-banner warn" role="status">
          <Icon name="alert-triangle" size={20} />
          <span class="grow">{restoreInfo.maintenance ? "ระบบถูกล็อกจากการกู้คืนครั้งก่อนที่ไม่จบ — ปลดล็อกเพื่อใช้งานต่อ" : "มีงานกู้คืนที่ส่งไฟล์ค้างไว้ (ข้อมูลจริงยังไม่ถูกเปลี่ยน)"}</span>
          <button onClick={onCancelRestore} disabled={busy === "cancel" || off}>{restoreInfo.maintenance ? "ปลดล็อก" : "ยกเลิกงานนี้"}</button>
        </div>
      )}
      {backupStale && (
        <div class="set-banner warn" role="status">
          <Icon name="alert-triangle" size={20} />
          <span class="grow">{lastBackup ? `สำรองล่าสุด ${Math.floor((Date.now() - lastBackup) / 86400000)} วันก่อน` : "ยังไม่เคยสำรอง"} · ควรสำรองสัปดาห์ละครั้ง</span>
          <button onClick={onBackup} disabled={busy === "backup" || off}>สำรองเลย</button>
        </div>
      )}
      <div class="set-forms">
        <section class="card" aria-labelledby="se-bh">
          <h2 id="se-bh" class="set-section-title"><Icon name="database-export" /> สำรองและกู้คืน <Scope all /></h2>
          <Row label="ดาวน์โหลดไฟล์สำรอง (JSON)" hint={`สำรองล่าสุด: ${lastBackup ? formatThaiDateTimeMs(lastBackup) : "ยังไม่เคย"}`}>
            <button class="primary" onClick={onBackup} disabled={busy === "backup" || off}>{busy === "backup" ? <Icon name="loader-2" class="spin" size={20} /> : <Icon name="download" size={20} />} ดาวน์โหลด</button>
            {offline && <NeedOnline />}
          </Row>
          <div class="set-pdpa" role="note">
            <Icon name="alert-triangle" size={20} />
            <div><b>ไฟล์สำรองมีข้อมูลส่วนบุคคลของนักเรียน (ผู้เยาว์) และไม่ได้เข้ารหัส</b>
              <div class="page-sub" style="color:inherit">เก็บในเครื่อง/ไดรฟ์ที่มีรหัสผ่าน · อย่าส่งทาง LINE หรืออีเมล · ถ้าหลุด ออก QR ใหม่ที่หน้านักเรียน · จะมีหน้าต่างเตือนอีกครั้งก่อนดาวน์โหลด</div></div>
          </div>
          <Row label="กู้คืนจากไฟล์สำรอง" hint="ตรวจไฟล์ก่อน · สำรองข้อมูลปัจจุบันให้อัตโนมัติ · เปลี่ยนทีเดียว ล้มเหลวแล้วไม่มีอะไรเปลี่ยน">
            <button class="dz-btn" onClick={onRestore} disabled={off}><Icon name="database-import" size={20} /> กู้คืนจากไฟล์สำรอง</button>
            {offline && <NeedOnline />}
          </Row>
          <Row label="ส่งออกรายงาน (Excel)" hint="ไฟล์สำรองเป็น JSON สำหรับกู้คืนเท่านั้น · รายงานที่เปิดอ่านได้อยู่ที่หน้ารายงาน">
            <a class="set-link" href="#/reports">ส่งออกรายงานที่ รายงาน <Icon name="chevron-right" size={16} /></a>
          </Row>
        </section>
      </div>
    </>
  );
}
