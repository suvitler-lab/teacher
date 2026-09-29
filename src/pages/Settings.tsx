import { useEffect, useState } from "preact/hooks";
import "../styles/settings.css";
import { Icon } from "../components/Icon";
import { PageHeader, Segmented } from "../components/ui";
import { settings, applyTheme, loadBootstrap, revokedTokens, students as allStudents, studentsById } from "../store";
import type { Settings, DeviceInfo } from "@shared/types";
import { api } from "../lib/api";
import { setSoundEnabled } from "../lib/sound";
import { runBackup, BackupInconsistentError } from "../lib/backup";
import { err, ok, withToast } from "../lib/notify";
import { AuditHistory } from "../components/AuditHistory";
import { RestoreModal } from "../components/RestoreModal";
import { CatalogEditor } from "../components/CatalogEditor";
import { installHidScanner } from "../lib/hid";
import { buildIndex, resolveScan } from "@shared/scan";
import { fullName } from "../lib/names";
import { routeParams, setNavGuard } from "../router";
import { isPersisted, isInstalledApp, requestPersist } from "../lib/storage";
import { offlineState, offlineNote, applyUpdate, type OfflineState } from "../lib/offline";
import { collectDeviceFacts, judgeDevice, worst, VERDICT, deviceReportText, describeAgent, type Check, type DeviceFacts } from "../lib/deviceCheck";

type Section = "general" | "time" | "scan" | "catalog" | "devices" | "backup" | "history";
const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "general", label: "ทั่วไป", icon: "school" },
  { key: "time", label: "เวลาเรียน", icon: "clock" },
  { key: "scan", label: "การสแกน", icon: "barcode" },
  { key: "catalog", label: "ข้อมูลพื้นฐาน", icon: "books" },
  { key: "devices", label: "อุปกรณ์และรหัสผ่าน", icon: "shield-lock" },
  { key: "backup", label: "สำรองข้อมูล", icon: "database-export" },
  { key: "history", label: "ประวัติการแก้ไข", icon: "history" },
];

// Where unsent work waits on this device — and whether the browser promises to keep it.
function StorageRow() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const installed = isInstalledApp();
  useEffect(() => { isPersisted().then(setPersisted); }, []);
  const safe = persisted === true || installed;
  return (
    <div class="set-row" style="align-items:flex-start">
      <div>
        <div style="font-weight:500;font-size:14px">ที่เก็บข้อมูลในเครื่องนี้</div>
        <div class="page-sub">
          {safe
            ? "เบราว์เซอร์มีโอกาสลบข้อมูลของเว็บนี้น้อยลง แต่ไม่ใช่การรับประกัน — งานที่ยังรอส่งควรถูกส่งขึ้นระบบให้เร็วที่สุด (ดูตัวเลข \"รอส่ง\" แล้วต่อเน็ต)"
            : "ถ้าไม่ได้เปิดเว็บนี้นานราว 7 วัน (เช่นช่วงปิดเทอม) Safari บน iPad อาจลบงานที่ยังไม่ได้ส่ง — แนะนำให้เพิ่มไว้ที่หน้าจอโฮม และอย่าปล่อยงานค้างส่งข้ามช่วงปิดเทอม"}
        </div>
      </div>
      {safe
        ? <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="shield-check" size={13} /> {installed ? "ติดตั้งแล้ว" : "ขอเก็บถาวรแล้ว"}</span>
        : <button style="height:30px;font-size:12px;white-space:nowrap;flex:none" onClick={async () => { const okk = await requestPersist(); setPersisted(okk); if (!okk) err("เบราว์เซอร์ไม่อนุญาต — ลองเพิ่มไว้ที่หน้าจอโฮม"); }}>ขอเก็บถาวร</button>}
    </div>
  );
}

// Can this device open the app and keep scanning with no network at all?
function OfflineRow() {
  const st = offlineState.value;
  const text: Record<OfflineState, string> = {
    unsupported: "เบราว์เซอร์หรือที่อยู่นี้ใช้ออฟไลน์ไม่ได้ (ต้องเปิดผ่านลิงก์ https:// ของระบบ และเป็นแอปที่ deploy แล้ว ไม่ใช่โหมดพัฒนา)",
    preparing: "กำลังดาวน์โหลดไฟล์ของแอปไว้ในเครื่อง — รอให้เสร็จก่อนพาไปห้องที่สัญญาณไม่ดี",
    ready: "เปิดแอปและสแกนได้แม้ไม่มีอินเทอร์เน็ต — งานที่สแกนจะเข้าคิวในเครื่อง แล้วส่งเองเมื่อกลับมาออนไลน์",
    update: "มีเวอร์ชันใหม่ดาวน์โหลดไว้แล้ว — กดอัปเดตเมื่อสะดวก (งานที่ค้างส่งไม่หาย)",
    error: offlineNote.value || "เตรียมไฟล์สำหรับใช้ออฟไลน์ไม่สำเร็จ — ต่อเน็ตแล้วเปิดแอปใหม่อีกครั้ง",
  };
  return (
    <div class="set-row" style="align-items:flex-start">
      <div>
        <div style="font-weight:500;font-size:14px">ใช้ออฟไลน์</div>
        <div class="page-sub">{text[st]}{st === "ready" && offlineNote.value ? " · " + offlineNote.value : ""}</div>
      </div>
      {st === "ready" && <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="circle-check" size={13} /> พร้อม</span>}
      {st === "preparing" && <span class="chip" style="background:var(--bg-accent);color:var(--text-accent)"><Icon name="loader-2" size={13} class="spin" /> กำลังเตรียม</span>}
      {st === "update" && <button class="primary" style="height:30px;font-size:12px;white-space:nowrap;flex:none" onClick={applyUpdate}>อัปเดตเลย</button>}
      {st === "error" && <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)"><Icon name="alert-triangle" size={13} /> ไม่พร้อม</span>}
      {st === "unsupported" && <span class="chip" style="background:var(--surface-1);color:var(--text-secondary)">ไม่รองรับ</span>}
    </div>
  );
}

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return <button class={"switch " + (on ? "on" : "")} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}><span class="knob" /></button>;
}

export function SettingsPage() {
  const s = settings.value;
  const params = routeParams();
  const [section, setSection] = useState<Section>((params.section as Section) || "general");
  const [draft, setDraft] = useState<Settings | null>(s ? { ...s } : null);
  const [busy, setBusy] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<{ pending: boolean; maintenance: boolean } | null>(null);

  // keys the teacher edits here — last_backup_at is written by the backup button, not by this form
  const changed: (keyof Settings)[] = draft
    ? (Object.keys(draft) as (keyof Settings)[]).filter((k) => k !== "last_backup_at" && (!s || draft[k] !== s[k]))
    : [];

  // Unsaved edits: ask before leaving the page (menu, back button, closing the tab).
  useEffect(() => {
    if (changed.length === 0) return;
    setNavGuard((next) =>
      next.split("?")[0] === "/settings" ||
      confirm(`มีการตั้งค่าที่แก้ไขแล้ว ${changed.length} รายการ ยังไม่ได้บันทึก

ออกจากหน้านี้และทิ้งการแก้ไขเหล่านี้ใช่ไหม?`));
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setNavGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [changed.length]);

  // a restore that was validated/uploaded but never finished (or a lock an older version left behind)
  useEffect(() => {
    if (section !== "backup") return;
    api.get<{ pending: boolean; maintenance: boolean }>("/api/restore/status").then(setRestoreInfo).catch(() => setRestoreInfo(null));
  }, [section, showRestore]);

  if (!draft) return <div class="empty">กำลังโหลด…</div>;

  function set<K extends keyof Settings>(k: K, v: Settings[K]) { setDraft((d) => (d ? { ...d, [k]: v } : d)); }

  async function save() {
    setBusy("save");
    const body: Record<string, unknown> = {};
    for (const k of changed) body[k] = draft![k];
    try { if (changed.length) await api.put("/api/settings", body); }
    catch { setBusy(""); err("บันทึกการตั้งค่าไม่สำเร็จ"); return; }
    settings.value = draft;
    setSoundEnabled(draft!.sound_enabled);
    applyTheme(draft!.theme);
    await loadBootstrap();
    setDraft({ ...draft! });
    setBusy("");
    ok("บันทึกการตั้งค่าแล้ว");
  }

  async function backup() {
    setBusy("backup");
    try { await runBackup({ onRetry: () => ok("มีการบันทึกจากเครื่องอื่นระหว่างสำรอง — กำลังอ่านใหม่") }); ok("ดาวน์โหลดไฟล์สำรองแล้ว"); }
    catch (e) { err(e instanceof BackupInconsistentError ? e.message : "สำรองข้อมูลไม่สำเร็จ"); }
    setBusy("");
  }

  async function cancelRestore() {
    setBusy("cancel");
    const done = await withToast(() => api.post("/api/restore/cancel"), "ยกเลิกงานกู้คืนไม่สำเร็จ");
    if (done) { setRestoreInfo({ pending: false, maintenance: false }); ok("ยกเลิกงานกู้คืนที่ค้างแล้ว"); }
    setBusy("");
  }

  const lastBackup = s?.last_backup_at ? Number(s.last_backup_at) : 0; // the saved value, not the form's copy
  const backupStale = !lastBackup || Date.now() - lastBackup > 7 * 86400000;

  return (
    <div>
      <PageHeader icon="settings" title="ตั้งค่า" sub={<span>{draft.school_name} · {draft.teacher_name}</span>} />

      <div class="set-nav-chips">
        {SECTIONS.map((sec) => <button class={"pill" + (section === sec.key ? " on" : "")} onClick={() => setSection(sec.key)}><Icon name={sec.icon} size={14} /> {sec.label}{sec.key === "backup" && backupStale && <span style="width:6px;height:6px;border-radius:50%;background:var(--fill-warning)" />}</button>)}
      </div>

      <div class="set-cols">
        <nav class="set-nav">
          {SECTIONS.map((sec) => (
            <button class={section === sec.key ? "on" : ""} onClick={() => setSection(sec.key)}>
              <Icon name={sec.icon} size={16} /> {sec.label}
              {sec.key === "backup" && backupStale && <span class="warndot" />}
            </button>
          ))}
        </nav>

        <div class="set-body">
          {section === "general" && (
            <div class="card">
              <div class="set-section-title"><Icon name="school" /> ทั่วไป</div>
              <div class="modal-grid2">
                <label class="field"><span>ชื่อโรงเรียน</span><input value={draft.school_name} onInput={(e) => set("school_name", (e.target as HTMLInputElement).value)} /></label>
                <label class="field"><span>ชื่อครู</span><input value={draft.teacher_name} onInput={(e) => set("teacher_name", (e.target as HTMLInputElement).value)} /></label>
              </div>
              <div class="set-row"><span>ธีม</span>
                <Segmented value={draft.theme} onChange={(v) => { set("theme", v as Settings["theme"]); applyTheme(v as Settings["theme"]); }} options={[{ value: "system", label: "ตามเครื่อง" }, { value: "light", label: "สว่าง" }, { value: "dark", label: "มืด" }]} />
              </div>
              <OfflineRow />
              <StorageRow />
            </div>
          )}

          {section === "time" && (
            <div class="card">
              <div class="set-section-title"><Icon name="clock" /> เวลาเรียน</div>
              <div class="set-row"><div><div style="font-weight:500;font-size:14px">เริ่มนับสาย (เช็คชื่อรายวัน)</div><div class="page-sub">สแกนหลังเวลานี้ = สาย</div></div>
                <input type="time" value={draft.late_after} onInput={(e) => set("late_after", (e.target as HTMLInputElement).value)} style="width:auto" /></div>
              <div style="padding-top:10px;border-top:0.5px solid var(--border)">
                <div style="font-weight:500;font-size:14px">เวลาเริ่มคาบ (สำหรับเช็คชื่อรายคาบ)</div>
                <div class="page-sub" style="margin-bottom:8px">สแกนหลังเวลาเริ่มคาบจะนับเป็นสาย · เว้นว่างได้ถ้าไม่ใช้คาบนั้น</div>
                <PeriodTimes value={draft.period_times} onChange={(v) => set("period_times", v)} />
              </div>
            </div>
          )}

          {section === "scan" && (
            <div class="card">
              <div class="set-section-title"><Icon name="barcode" /> การสแกน</div>
              <div class="set-row"><div><div style="font-weight:500;font-size:14px">เสียงตอบรับ</div><div class="page-sub">ติ๊ด = สำเร็จ · ตื๊ด = ซ้ำ/ไม่พบ</div></div>
                <Switch on={draft.sound_enabled} onToggle={() => set("sound_enabled", !draft.sound_enabled)} label="เสียงตอบรับ" /></div>
              <div class="set-row"><div><div style="font-weight:500;font-size:14px">รับบาร์โค้ดบัตรนักเรียนเดิม</div><div class="page-sub">สแกนรหัสนักเรียนตรงๆ ได้ นอกจาก QR ของระบบ</div></div>
                <Switch on={draft.accept_student_code_scan} onToggle={() => set("accept_student_code_scan", !draft.accept_student_code_scan)} label="รับบาร์โค้ดบัตรเดิม" /></div>
              <div style="padding-top:10px;border-top:0.5px solid var(--border)"><HidTest allowCode={draft.accept_student_code_scan} /></div>
              <div style="padding-top:10px;margin-top:10px;border-top:0.5px solid var(--border)"><CameraTest /></div>
            </div>
          )}

          {section === "catalog" && (
            <div class="card">
              <div class="set-section-title"><Icon name="books" /> ห้องเรียน วิชา และภาคเรียน</div>
              <CatalogEditor />
            </div>
          )}

          {section === "devices" && (<>
            <DeviceCheck />
            <DeviceList />
            <div class="card">
              <div class="set-section-title"><Icon name="key" /> รหัสผ่าน</div>
              <ChangePassword />
            </div>
          </>)}

          {section === "backup" && (
            <div class="card">
              <div class="set-section-title"><Icon name="database-export" /> สำรองข้อมูล</div>
              {(restoreInfo?.pending || restoreInfo?.maintenance) && (
                <div class="row" style="gap:8px;padding:8px 10px;border-radius:10px;background:var(--bg-warning);color:var(--text-warning);margin-bottom:8px;font-size:13px;flex-wrap:wrap">
                  <Icon name="alert-triangle" size={16} />
                  <span class="grow" style="min-width:180px">{restoreInfo.maintenance ? "ระบบถูกล็อกจากการกู้คืนครั้งก่อนที่ไม่จบ — ปลดล็อกเพื่อใช้งานต่อ" : "มีงานกู้คืนที่ส่งไฟล์ค้างไว้ (ข้อมูลจริงยังไม่ถูกเปลี่ยน)"}</span>
                  <button style="height:28px;font-size:12px" onClick={cancelRestore} disabled={busy === "cancel"}>{restoreInfo.maintenance ? "ปลดล็อก" : "ยกเลิกงานนี้"}</button>
                </div>
              )}
              {backupStale && <div class="row" style="gap:8px;padding:8px 10px;border-radius:10px;background:var(--bg-warning);color:var(--text-warning);margin-bottom:8px;font-size:13px"><Icon name="alert-triangle" size={16} /> {lastBackup ? `สำรองล่าสุด ${Math.round((Date.now() - lastBackup) / 86400000)} วันก่อน` : "ยังไม่เคยสำรอง"} · ควรสำรองสัปดาห์ละครั้ง</div>}
              <div class="set-row"><div><div style="font-weight:500;font-size:14px">ดาวน์โหลดไฟล์สำรอง (JSON)</div><div class="page-sub">สำรองล่าสุด: {lastBackup ? new Date(lastBackup).toLocaleString("th-TH") : "ยังไม่เคย"}</div></div>
                <button onClick={backup} disabled={busy === "backup"}>{busy === "backup" ? <Icon name="loader-2" class="spin" size={16} /> : <Icon name="download" size={16} />} ดาวน์โหลด</button></div>
              <div class="set-row"><div><div style="font-weight:500;font-size:14px">กู้คืนจากไฟล์สำรอง</div><div class="page-sub">ตรวจไฟล์ก่อน · สำรองข้อมูลปัจจุบันให้อัตโนมัติ · เปลี่ยนทีเดียว ล้มเหลวแล้วไม่มีอะไรเปลี่ยน</div></div>
                <button onClick={() => setShowRestore(true)}><Icon name="database-import" size={16} /> กู้คืน</button></div>
            </div>
          )}

          {section === "history" && <HistorySection />}
        </div>
      </div>

      {changed.length > 0 && (
        <div class="set-savebar">
          <Icon name="pencil" size={16} style="color:var(--text-accent)" />
          <span class="grow" style="font-size:13px">แก้ไขแล้ว {changed.length} รายการ ยังไม่บันทึก</span>
          <button onClick={() => setDraft(s ? { ...s } : null)}>ยกเลิก</button>
          <button class="primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? <Icon name="loader-2" class="spin" /> : <Icon name="device-floppy" />} บันทึก</button>
        </div>
      )}

      {showRestore && <RestoreModal onClose={() => setShowRestore(false)} onDone={() => { setShowRestore(false); loadBootstrap(); }} />}
    </div>
  );
}

function PeriodTimes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let times: Record<string, string> = {};
  try { times = JSON.parse(value || "{}"); } catch { times = {}; }
  function setPeriod(p: number, t: string) { const next = { ...times }; if (t) next[String(p)] = t; else delete next[String(p)]; onChange(JSON.stringify(next)); }
  return (
    <div class="set-periods">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
        <label><span class="muted">คาบ {p}</span><input type="time" value={times[String(p)] ?? ""} onInput={(e) => setPeriod(p, (e.target as HTMLInputElement).value)} /></label>
      ))}
    </div>
  );
}

function HidTest({ allowCode }: { allowCode: boolean }) {
  const [log, setLog] = useState<{ raw: string; who: string | null; ok: boolean; ms: number; at: number }[]>([]);
  useEffect(() => {
    return installHidScanner((raw) => {
      const t0 = performance.now();
      const idx = buildIndex(allStudents.value, revokedTokens.value, null);
      const r = resolveScan(raw, idx, { allowStudentCode: allowCode });
      const st = r.studentId ? studentsById.value.get(r.studentId) : null;
      setLog((l) => [{ raw, who: st ? fullName(st) : (r.kind === "revoked" ? "บัตรถูกยกเลิก" : null), ok: r.kind === "student", ms: Math.round(performance.now() - t0), at: Date.now() }, ...l].slice(0, 6));
    });
  }, [allowCode]);
  return (
    <div>
      <div style="font-weight:500;font-size:14px">ทดสอบเครื่องยิง</div>
      <div class="page-sub" style="margin-bottom:8px">ยิงสติกเกอร์ใบไหนก็ได้ ระบบจะบอกว่าอ่านได้ถูกไหม (ไม่บันทึกอะไร)</div>
      {log.length === 0 ? <div class="page-sub" style="padding:8px;background:var(--surface-1);border-radius:10px;text-align:center">รอการยิง…</div> : log.map((r) => (
        <div class="row" style={`gap:8px;padding:6px 10px;border-radius:10px;margin-bottom:4px;${r.ok ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-danger);color:var(--text-danger)"}`}>
          <Icon name={r.ok ? "circle-check" : "x"} size={16} />
          <span class="grow" style="font-size:13px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="font-family:var(--font-mono)">{r.raw.slice(0, 16)}</span>{r.who ? ` → ${r.who}` : " — ไม่พบ"}</span>
          <span style="font-size:11px">{r.ms} ms</span>
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
      const { diagnoseCamera } = await import("../lib/camera");
      setRows(await diagnoseCamera());
    } catch (e) {
      setRows([{ label: "โหลดตัวตรวจสอบ", ok: false, detail: "ต่อเน็ตแล้วลองอีกครั้ง (" + ((e as Error)?.message || "ไม่ทราบสาเหตุ") + ")" }]);
    } finally { setBusy(false); }
  }
  const allOk = !!rows && rows.every((r) => r.ok);
  return (
    <div>
      <div style="font-weight:500;font-size:14px">ทดสอบกล้อง</div>
      <div class="page-sub" style="margin-bottom:8px">ตรวจว่าเครื่องนี้สแกนด้วยกล้องได้ไหม และถ้าไม่ได้ เพราะอะไร (ระบบจะขอเปิดกล้องแวบเดียวแล้วปิด ไม่บันทึกภาพ)</div>
      <button onClick={run} disabled={busy}>{busy ? <Icon name="loader-2" size={16} class="spin" /> : <Icon name="camera" size={16} />} {rows ? "ทดสอบอีกครั้ง" : "เริ่มทดสอบกล้อง"}</button>
      {rows && (
        <div style="margin-top:8px">
          <div class="imp-warn" style={`margin:0 0 6px;${allOk ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-danger);color:var(--text-danger)"}`} role="status">
            <Icon name={allOk ? "circle-check" : "alert-triangle"} size={15} />
            <span>{allOk ? "ผ่านทุกขั้น — เครื่องนี้สแกนด้วยกล้องได้" : "มีขั้นที่ไม่ผ่าน — ดูรายละเอียดด้านล่าง (ถ่ายหน้าจอส่งให้ผู้ดูแลได้)"}</span>
          </div>
          {rows.map((r) => (
            <div class="row" style="gap:8px;align-items:flex-start;padding:5px 0;border-top:0.5px solid var(--border);font-size:13px">
              <Icon name={r.ok ? "circle-check" : "circle-x"} size={16} style={r.ok ? "color:var(--text-success);margin-top:2px" : "color:var(--text-danger);margin-top:2px"} />
              <div style="min-width:0"><div style="font-weight:500">{r.label}</div><div class="page-sub" style="word-break:break-word">{r.detail}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Everything worth knowing about THIS device before class, in one tap — readable aloud, or copied into the trial log. */
function DeviceCheck() {
  const [state, setState] = useState<{ checks: Check[]; facts: DeviceFacts } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const facts = await collectDeviceFacts();
      setState({ facts, checks: judgeDevice(facts) });
    } catch (e) {
      err("ตรวจเครื่องไม่สำเร็จ: " + ((e as Error)?.message || "ไม่ทราบสาเหตุ"));
    } finally { setBusy(false); }
  }
  async function copy() {
    if (!state) return;
    const text = deviceReportText(state.checks, state.facts);
    try { await navigator.clipboard.writeText(text); ok("คัดลอกผลตรวจแล้ว"); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      const done = document.execCommand?.("copy"); ta.remove();
      done ? ok("คัดลอกผลตรวจแล้ว") : err("คัดลอกไม่ได้ — ถ่ายหน้าจอแทน");
    }
  }
  const verdict = state ? worst(state.checks) : null;
  const tone = { ok: "var(--bg-success);color:var(--text-success)", warn: "var(--bg-warning);color:var(--text-warning)", fail: "var(--bg-danger);color:var(--text-danger)" };
  const icon = { ok: ["circle-check", "var(--text-success)"], warn: ["alert-triangle", "var(--text-warning)"], fail: ["circle-x", "var(--text-danger)"] } as const;
  return (
    <div class="card">
      <div class="set-section-title"><Icon name="device-mobile-check" /> ตรวจเครื่องนี้</div>
      <div class="page-sub" style="margin-bottom:8px">รันก่อนเข้าห้องทุกครั้งที่เปลี่ยนเครื่อง — ตรวจ HTTPS, เซิร์ฟเวอร์, การใช้ออฟไลน์, ที่เก็บข้อมูล, นาฬิกา และงานค้าง (ตรวจกล้องแบบละเอียดที่ การสแกน › ทดสอบกล้อง)</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="primary" onClick={run} disabled={busy}>{busy ? <Icon name="loader-2" size={16} class="spin" /> : <Icon name="stethoscope" size={16} />} {state ? "ตรวจอีกครั้ง" : "ตรวจเครื่องนี้"}</button>
        {state && <button onClick={copy}><Icon name="copy" size={16} /> คัดลอกผลตรวจ</button>}
      </div>
      {state && verdict && (
        <div style="margin-top:8px">
          <div class="imp-warn" style={`margin:0 0 6px;background:${tone[verdict]}`} role="status">
            <Icon name={icon[verdict][0]} size={15} /> <span>{VERDICT[verdict]}</span>
          </div>
          {state.checks.map((c) => (
            <div class="row" style="gap:8px;align-items:flex-start;padding:5px 0;border-top:0.5px solid var(--border);font-size:13px">
              <Icon name={icon[c.level][0]} size={16} style={`color:${icon[c.level][1]};margin-top:2px`} />
              <div style="min-width:0"><div style="font-weight:500">{c.label}</div><div class="page-sub" style="word-break:break-word">{c.detail}</div></div>
            </div>
          ))}
          <div class="page-sub" style="margin-top:6px">{describeAgent(state.facts.userAgent)} · จอ {state.facts.screen}{state.facts.touch ? " · จอสัมผัส" : ""}</div>
        </div>
      )}
    </div>
  );
}

function DeviceList() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  async function load() { try { const r = await api.get<{ devices: DeviceInfo[] }>("/api/devices"); setDevices(r.devices); } catch { setDevices([]); } }
  useEffect(() => { load(); }, []);
  async function signout(id: string, name: string) {
    if (!confirm(`ออกจากระบบเครื่อง "${name}"? เครื่องนั้นต้องเข้าสู่ระบบใหม่`)) return;
    const done = await withToast(() => api.post(`/api/devices/${id}/signout`), "ออกจากระบบเครื่องนี้ไม่สำเร็จ");
    if (done) { ok("ออกจากระบบเครื่องนั้นแล้ว"); load(); }
  }
  return (
    <div class="card">
      <div class="set-section-title"><Icon name="devices" /> อุปกรณ์ที่เข้าสู่ระบบ</div>
      {devices.map((d) => (
        <div class="set-row">
          <div class="row" style="gap:8px;min-width:0"><Icon name="device-mobile" size={18} class="muted" /><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{d.name} {d.current && <span class="chip" style="background:var(--bg-success);color:var(--text-success)">เครื่องนี้</span>}</span></div>
          <div class="row" style="gap:8px"><span class="page-sub" style="white-space:nowrap">{new Date(d.last_seen).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
            {!d.current && <button style="height:28px;font-size:12px" onClick={() => signout(d.id, d.name)}>ออกจากระบบ</button>}</div>
        </div>
      ))}
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  async function submit() {
    setMsg("");
    if (next.length < 6) return setMsg("รหัสใหม่อย่างน้อย 6 ตัว");
    try { await api.post("/api/auth/change-password", { current: cur, next }); setMsg("เปลี่ยนรหัสผ่านแล้ว"); setCur(""); setNext(""); setOpen(false); }
    catch (e: any) { setMsg(e.message || "ไม่สำเร็จ"); }
  }
  if (!open) return <button onClick={() => setOpen(true)}><Icon name="key" size={15} /> เปลี่ยนรหัสผ่าน</button>;
  return (
    <div class="row" style="gap:6px;flex-wrap:wrap">
      <input type="password" placeholder="รหัสเดิม" value={cur} onInput={(e) => setCur((e.target as HTMLInputElement).value)} style="width:140px" />
      <input type="password" placeholder="รหัสใหม่" value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} style="width:140px" />
      <button class="primary" onClick={submit}>บันทึก</button>
      <button onClick={() => setOpen(false)}>ยกเลิก</button>
      {msg && <div style="font-size:12px;color:var(--text-secondary);width:100%">{msg}</div>}
    </div>
  );
}

function HistorySection() {
  const [filter, setFilter] = useState("");
  const FILTERS = [{ v: "", l: "ทั้งหมด" }, { v: "submission", l: "ส่งงาน" }, { v: "attendance", l: "เช็คชื่อ" }, { v: "student", l: "นักเรียน" }, { v: "qr", l: "บัตร QR" }];
  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div class="set-section-title" style="margin:0"><Icon name="history" /> ประวัติการแก้ไข</div>
        <div class="chips-row">{FILTERS.map((f) => <button class={"pill" + (filter === f.v ? " on" : "")} style="height:26px" onClick={() => setFilter(f.v)}>{f.l}</button>)}</div>
      </div>
      <AuditHistory entity={filter || undefined} />
    </div>
  );
}
