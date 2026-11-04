import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { Chip, CardHead } from "../home/shared";
import { SyncBadge } from "../ui";
import { currentTerm, startTermOpen } from "../../store";
import { navigate } from "../../router";
import { api } from "../../lib/api";
import { formatThaiDate, formatThaiDateMs, formatThaiDateTimeMs, formatThaiDayMonthMs } from "../../lib/dates";
import { pendingCount } from "../../lib/outbox";
import { attDraftCount } from "../../lib/attSync";
import { isPersisted, isInstalledApp, requestPersist } from "../../lib/storage";
import { offlineState, applyUpdate } from "../../lib/offline";
import { err } from "../../lib/notify";
import { bkkToday } from "@shared/time";
import type { DeviceInfo } from "@shared/types";
import { settingsLayout } from "../../lib/pageCards";
import { visibleCards } from "../../lib/cardLayout";
import type { SettingsCard } from "../../lib/pageCards";
import { PageCols } from "../PageCols";
import { W } from "../../lib/pageColumns";

const DAY = 86_400_000;

/** Whole days from today to an ISO date (negative = already past). Both are plain calendar days, no time zone. */
export function daysUntil(iso: string, today = bkkToday()): number {
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / DAY);
}

/** "สำรองล่าสุด 9 วันก่อน · ควรสำรองสัปดาห์ละครั้ง" / "ยังไม่เคยสำรอง" — the same wording as the backup section. */
export function backupLine(last: number, now = Date.now()): { text: string; stale: boolean } {
  if (!last) return { text: "ยังไม่เคยสำรอง", stale: true };
  const days = Math.floor((now - last) / DAY);
  return days > 7
    ? { text: `สำรองล่าสุด ${days} วันก่อน · ควรสำรองสัปดาห์ละครั้ง`, stale: true }
    : { text: `สำรองล่าสุด ${formatThaiDateTimeMs(last)}`, stale: false };
}

/** "1/2569 · เหลือ 24 วัน (สิ้นสุด 27 พ.ย.)" and its three exceptions: ended, no end date, no term. */
export function termLine(t: { name: string; end_date: string | null } | null, today = bkkToday()):
  { text: string; ended: boolean; noEnd: boolean; none: boolean } {
  if (!t) return { text: "ยังไม่ได้ตั้งภาคเรียน", ended: false, noEnd: false, none: true };
  if (!t.end_date) return { text: `${t.name} · ยังไม่ได้ตั้งวันสิ้นสุด`, ended: false, noEnd: true, none: false };
  const d = daysUntil(t.end_date, today);
  if (d < 0) return { text: `${t.name} · สิ้นสุดแล้ว ${-d} วัน`, ended: true, noEnd: false, none: false };
  return { text: `${t.name} · เหลือ ${d} วัน (สิ้นสุด ${formatThaiDate(t.end_date)})`, ended: false, noEnd: false, none: false };
}

function StatusCard() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  useEffect(() => { isPersisted().then(setPersisted); }, []);
  const installed = isInstalledApp();
  const safe = persisted === true || installed;
  const waiting = pendingCount.value + attDraftCount.value;
  const off = offlineState.value;
  return (
    <section class="card" aria-labelledby="sc-st">
      <CardHead id="sc-st" icon="device-mobile-check" title="เครื่องนี้" extra={<SyncBadge />} />
      <div class="row" style="gap:8px;flex-wrap:wrap">
        {waiting > 0
          ? <button class="hm-chip hm-chipbtn warning" onClick={() => navigate("/scan")}><Icon name="clock" size={16} /> รอส่ง {waiting} รายการ</button>
          : <Chip tone="success" icon="circle-check">ไม่มีงานค้างส่ง</Chip>}
        {safe
          ? <Chip tone="success" icon="shield-check">{installed ? "ติดตั้งแล้ว" : "เก็บถาวรแล้ว"}</Chip>
          : <button class="hm-chip hm-chipbtn warning" onClick={async () => { const okk = await requestPersist(); setPersisted(okk); if (!okk) err("เบราว์เซอร์ไม่อนุญาต — ลองเพิ่มไว้ที่หน้าจอโฮม"); }}><Icon name="shield" size={16} /> ขอเก็บถาวร</button>}
        {off === "ready" && <Chip tone="success" icon="circle-check">ใช้ออฟไลน์ได้</Chip>}
        {off === "preparing" && <Chip tone="accent" icon="loader-2">กำลังเตรียมใช้ออฟไลน์</Chip>}
        {off === "update" && <button class="hm-chip hm-chipbtn accent" onClick={applyUpdate}><Icon name="refresh" size={16} /> อัปเดตเลย</button>}
        {(off === "error" || off === "unsupported") && <Chip tone="danger" icon="alert-triangle">{off === "error" ? "ใช้ออฟไลน์ไม่พร้อม" : "ไม่รองรับการใช้ออฟไลน์"}</Chip>}
      </div>
    </section>
  );
}

function BackupCard({ last, onBackup, onRestore }: { last: number; onBackup: () => void; onRestore: () => void }) {
  const b = backupLine(last);
  return (
    <section class="card" aria-labelledby="sc-bk">
      <CardHead id="sc-bk" icon="database-export" title="สำรองล่าสุด" />
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style={b.stale ? "color:var(--text-warning)" : ""}>{b.stale && <Icon name="alert-triangle" size={16} />} {b.text}</div>
        <div class="row" style="gap:8px"><button onClick={onBackup}><Icon name="download" size={20} /> ดาวน์โหลด</button><button onClick={onRestore}><Icon name="database-import" size={20} /> กู้คืน</button></div>
      </div>
    </section>
  );
}

function TermCard({ goCatalog }: { goCatalog: () => void }) {
  const t = currentTerm.value;
  const l = termLine(t);
  return (
    <section class="card" aria-labelledby="sc-tm">
      <CardHead id="sc-tm" icon="calendar-stats" title="ภาคเรียนปัจจุบัน" />
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>{l.text}</div>
        {l.ended && <button class="primary" onClick={() => { startTermOpen.value = true; }}><Icon name="calendar-event" size={20} /> เริ่มภาคเรียนใหม่</button>}
        {!l.ended && (l.noEnd || l.none) && <button onClick={goCatalog}><Icon name="calendar" size={20} /> {l.none ? "ตั้งภาคเรียน" : "ตั้งวันที่"}</button>}
        {!l.ended && !l.noEnd && !l.none && <button onClick={() => { startTermOpen.value = true; }}><Icon name="calendar-event" size={20} /> เริ่มภาคเรียนใหม่</button>}
      </div>
    </section>
  );
}

function DevicesCard({ goDevices }: { goDevices: () => void }) {
  const [list, setList] = useState<DeviceInfo[] | null>(null);
  useEffect(() => { api.get<{ devices: DeviceInfo[] }>("/api/devices").then((r) => setList(r.devices), () => setList([])); }, []);
  const shown = (list ?? []).slice(0, 3);
  return (
    <section class="card" aria-labelledby="sc-dv">
      <CardHead id="sc-dv" icon="devices" title="อุปกรณ์ล่าสุด" link="ดูทั้งหมด ›" onLink={goDevices} />
      {list === null ? <div class="page-sub">กำลังโหลด…</div> : shown.length === 0 ? <div class="page-sub">ยังไม่มีข้อมูลอุปกรณ์</div> : shown.map((d) => (
        <div class="hm-kv" key={d.id}><span>{d.name}{d.current ? " · เครื่องนี้" : ""}</span><b>{formatThaiDayMonthMs(d.last_seen)}</b></div>
      ))}
    </section>
  );
}

const ENTITY: Record<string, string> = { submission: "ส่งงาน/คะแนน", attendance: "เช็คชื่อ", assignment: "งาน", student: "นักเรียน", qr: "บัตร QR", settings: "ตั้งค่า", restore: "กู้คืน", auth: "บัญชี" };
/** What the audit log calls an action, in words a teacher reads (anything unknown is shown as it is). */
export const ACTION_TH: Record<string, string> = { create: "เพิ่ม", update: "แก้ไข", void: "ยกเลิก", delete: "ลบ", revoke: "ยกเลิก", reissue: "ออกใหม่", restore: "กู้คืน", reset: "ล้างข้อมูล", login: "เข้าสู่ระบบ", logout: "ออกจากระบบ", upsert: "แก้ไข", close: "ปิดรับ", reopen: "เปิดรับ" };
interface AuditLite { id: number; at: number; entity: string; action: string; device_name: string | null }
function HistoryCard({ goHistory }: { goHistory: () => void }) {
  const [rows, setRows] = useState<AuditLite[] | null>(null);
  useEffect(() => { api.get<{ rows: AuditLite[] }>("/api/audit?limit=5").then((r) => setRows(r.rows ?? []), () => setRows([])); }, []);
  return (
    <section class="card" aria-labelledby="sc-hs">
      <CardHead id="sc-hs" icon="history" title="แก้ไขล่าสุด" link="ดูทั้งหมด ›" onLink={goHistory} />
      {rows === null ? <div class="page-sub">กำลังโหลด…</div> : rows.length === 0 ? <div class="page-sub">ยังไม่มีการแก้ไข</div> : rows.map((r) => (
        <div class="hm-kv" key={r.id}><span>{ENTITY[r.entity] ?? r.entity} · {ACTION_TH[r.action] ?? r.action}{r.device_name ? ` · ${r.device_name}` : ""}</span><b>{formatThaiDateMs(r.at)}</b></div>
      ))}
    </section>
  );
}

/** Rough card heights for balancing the columns (spec §2): status S, backup S, term M, devices M, history M. */
const SETTINGS_WEIGHT: Record<SettingsCard, number> = { status: W.S, backup: W.S, term: W.M, devices: W.M, history: W.M };

/** The cards on top of the "ทั่วไป" section, in the order and with the visibility the teacher chose. */
export function SettingsCards({ lastBackup, onBackup, onRestore, goSection }: {
  lastBackup: number; onBackup: () => void; onRestore: () => void; goSection: (s: "catalog" | "devices" | "history") => void;
}) {
  const keys = visibleCards(settingsLayout.value) as SettingsCard[];
  if (keys.length === 0) return null;
  const view: Record<SettingsCard, () => preact.JSX.Element> = {
    status: () => <StatusCard />,
    backup: () => <BackupCard last={lastBackup} onBackup={onBackup} onRestore={onRestore} />,
    term: () => <TermCard goCatalog={() => goSection("catalog")} />,
    devices: () => <DevicesCard goDevices={() => goSection("devices")} />,
    history: () => <HistoryCard goHistory={() => goSection("history")} />,
  };
  return <PageCols keys={keys} max={2} minCol={20} weightOf={(k) => SETTINGS_WEIGHT[k]} render={(k) => view[k]()} class="set-cards" />;
}
