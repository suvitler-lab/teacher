import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import "../styles/settings.css";
import "../styles/settings-cards.css";
import "../styles/home.css";
import { Icon } from "../components/Icon";
import { PageHeader, Segmented, Switch, SyncBadge } from "../components/ui";
import { settings, applyTheme, loadBootstrap, revokedTokens, students as allStudents, studentsById } from "../store";
import type { Settings, DeviceInfo } from "@shared/types";
import { api } from "../lib/api";
import { setSoundEnabled } from "../lib/sound";
import { runBackup, BackupInconsistentError } from "../lib/backup";
import { err, ok, notify, withToast } from "../lib/notify";
import { AuditHistory } from "../components/AuditHistory";
import { RestoreModal, BackupWarning } from "../components/RestoreModal";
import { ResetModal, type ResetMode } from "../components/ResetModal";
import { CatalogEditor } from "../components/CatalogEditor";
import { installHidScanner } from "../lib/hid";
import { buildIndex, resolveScan } from "@shared/scan";
import { fullName } from "../lib/names";
import { routeParams, setNavGuard, navigate } from "../router";
import { SettingsCards } from "../components/settings/SettingsCards";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { SETTINGS_CARD_META, SETTINGS_LOCKED } from "../components/cards/meta";
import { settingsLayout } from "../lib/pageCards";
import { useConfirm } from "../components/ConfirmDialog";
import { isPersisted, isInstalledApp, requestPersist } from "../lib/storage";
import { offlineState, offlineNote, applyUpdate, type OfflineState } from "../lib/offline";
import { collectDeviceFacts, judgeDevice, worst, VERDICT, deviceReportText, describeAgent, type Check, type DeviceFacts } from "../lib/deviceCheck";
import { getFontSize, getDensity, setFontSize, resetFontSize, setDensity, defaultFont, isCoarse, FONT_MIN, FONT_MAX, DENSITY_LABEL, type Density } from "../lib/display";
import { formatThaiDateTimeMs, formatThaiDayMonthMs } from "../lib/dates";

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

/** The keys the text form edits and the save bar counts. Switches and the theme save at once; cards and last_backup_at have their own writers. */
const FORM_KEYS = ["school_name", "teacher_name", "late_after", "period_times"] as const satisfies readonly (keyof Settings)[];
const THEME_TH: Record<Settings["theme"], string> = { system: "ตามเครื่อง", light: "สว่าง", dark: "มืด" };

/** Where a setting applies: synced to every device, or kept on this one only (display.ts, storage). */
function Scope({ all }: { all?: boolean }) {
  return <span class="chip set-scope" title={all ? "ค่านี้ใช้กับทุกเครื่องที่เข้าสู่ระบบ" : "ค่านี้ไม่ซิงก์ไปเครื่องอื่น"} style="background:var(--surface-1);color:var(--text-secondary)"><Icon name={all ? "cloud" : "device-mobile"} size={13} /> {all ? "ทุกเครื่อง" : "เครื่องนี้เท่านั้น"}</span>;
}

/** The yellow dot on "สำรองข้อมูล" when a backup is due (with words for a screen reader). */
function WarnDot() {
  return <><span class="warndot" aria-hidden="true" /><span class="sr-only">ควรสำรองข้อมูล</span></>;
}

/** One setting: name + hint on the left, the control on the right. */
function Row({ label, hint, scope, children }: { label: string; hint?: string; scope?: "all" | "device"; children: ComponentChildren }) {
  return (
    <div class="set-row">
      <div class="set-l">
        <div style="font-weight:500;font-size:1rem">{label}{scope && <Scope all={scope === "all"} />}</div>
        {hint && <div class="page-sub">{hint}</div>}
      </div>
      <div class="set-r">{children}</div>
    </div>
  );
}

// Where unsent work waits on this device — and whether the browser promises to keep it.
function StorageRow() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const installed = isInstalledApp();
  useEffect(() => { isPersisted().then(setPersisted); }, []);
  const safe = persisted === true || installed;
  return (
    <div class="set-row" style="align-items:flex-start">
      <div>
        <div style="font-weight:500;font-size:1rem">ที่เก็บข้อมูลในเครื่องนี้ <Scope /></div>
        <div class="page-sub">
          {safe
            ? "เบราว์เซอร์มีโอกาสลบข้อมูลของเว็บนี้น้อยลง แต่ไม่ใช่การรับประกัน — งานที่ยังรอส่งควรถูกส่งขึ้นระบบให้เร็วที่สุด (ดูตัวเลข \"รอส่ง\" แล้วต่อเน็ต)"
            : "ถ้าไม่ได้เปิดเว็บนี้นานราว 7 วัน (เช่นช่วงปิดเทอม) Safari บน iPad อาจลบงานที่ยังไม่ได้ส่ง — แนะนำให้เพิ่มไว้ที่หน้าจอโฮม และอย่าปล่อยงานค้างส่งข้ามช่วงปิดเทอม"}
        </div>
      </div>
      {safe
        ? <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="shield-check" size={13} /> {installed ? "ติดตั้งแล้ว" : "ขอเก็บถาวรแล้ว"}</span>
        : <button style="height:2rem;font-size:var(--fs-xs);white-space:nowrap;flex:none" onClick={async () => { const okk = await requestPersist(); setPersisted(okk); if (!okk) err("เบราว์เซอร์ไม่อนุญาต — ลองเพิ่มไว้ที่หน้าจอโฮม"); }}>ขอเก็บถาวร</button>}
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
        <div style="font-weight:500;font-size:1rem">ใช้ออฟไลน์ <Scope /></div>
        <div class="page-sub">{text[st]}{st === "ready" && offlineNote.value ? " · " + offlineNote.value : ""}</div>
      </div>
      {st === "ready" && <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="circle-check" size={13} /> พร้อม</span>}
      {st === "preparing" && <span class="chip" style="background:var(--bg-accent);color:var(--text-accent)"><Icon name="loader-2" size={13} class="spin" /> กำลังเตรียม</span>}
      {st === "update" && <button class="primary" style="height:2rem;font-size:var(--fs-xs);white-space:nowrap;flex:none" onClick={applyUpdate}>อัปเดตเลย</button>}
      {st === "error" && <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)"><Icon name="alert-triangle" size={13} /> ไม่พร้อม</span>}
      {st === "unsupported" && <span class="chip" style="background:var(--surface-1);color:var(--text-secondary)">ไม่รองรับ</span>}
    </div>
  );
}

// Text size + row density: per device, applied at once (no Save button), see lib/display.ts.
function DisplayRows() {
  const [fs, setFs] = useState(getFontSize);
  const [den, setDen] = useState<Density>(getDensity);
  const def = defaultFont(isCoarse());
  return (
    <>
      <div class="set-row"><div><div style="font-weight:500">ขนาดตัวอักษร <Scope /></div><div class="page-sub">ใช้ทั้งแอป · จำไว้ในเครื่องนี้ · ค่าเริ่มต้น {def}</div></div>
        <div class="fs-step">
          <button aria-label="ลดขนาดตัวอักษร" disabled={fs <= FONT_MIN} onClick={() => setFs(setFontSize(fs - 1))}><Icon name="minus" size={24} /></button>
          <div class="v" role="status" aria-live="polite" aria-label={`ขนาดตัวอักษร ${fs}`}>{fs}</div>
          <button aria-label="เพิ่มขนาดตัวอักษร" disabled={fs >= FONT_MAX} onClick={() => setFs(setFontSize(fs + 1))}><Icon name="plus" size={24} /></button>
          <button aria-label={`ใช้ขนาดค่าเริ่มต้น ${def}`} disabled={fs === def} onClick={() => setFs(resetFontSize())}>ค่าเริ่มต้น</button>
        </div>
      </div>
      <div class="set-row"><div><div style="font-weight:500">ความหนาแน่น <Scope /></div><div class="page-sub">ระยะห่างระหว่างแถวและปุ่ม (ไม่ต่ำกว่า 44px บนจอสัมผัส)</div></div>
        <Segmented label="ความหนาแน่น" value={den} onChange={(v) => setDen(setDensity(v))} options={(["compact", "normal", "roomy"] as Density[]).map((d) => ({ value: d, label: DENSITY_LABEL[d] }))} />
      </div>
      <div class="fs-live" role="group" aria-label="ตัวอย่างสด">
        <div style="font-weight:500">ตัวอย่างสด <span class="page-sub">— ขนาดนี้ใช้กับสมุดคะแนน สแกน เช็คชื่อ รายงานทั้งหมด</span></div>
        <div class="fs-prev">
          <div class="fs-prev-title">ใบงานบทที่ 3 การคูณ</div>
          <div class="page-sub">คณิตศาสตร์ · ป.6/1 · ส่งภายใน 3 พ.ย.</div>
          <div class="fs-trow"><b>21</b><span class="grow">นักเรียน ตัวอย่าง</span><span class="fs-pill" style="background:var(--bg-warning);color:var(--text-warning)">8</span><span class="fs-pill" style="background:var(--bg-accent);color:var(--text-accent)"><Icon name="check" size={18} /></span><span class="fs-pill" style="background:var(--bg-danger);color:var(--text-danger)">–</span></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="circle-check" size={16} /> เครื่องยิงพร้อม</span><button class="primary">บันทึก 8/10</button><button>ยกเลิก</button></div>
        </div>
      </div>
    </>
  );
}

export function SettingsPage() {
  const s = settings.value;
  const params = routeParams();
  const [section, setSection] = useState<Section>((params.section as Section) || "general");
  // a link to another section (#/settings?section=backup) while this page is already open must switch to it
  useEffect(() => { if (params.section && SECTIONS.some((x) => x.key === params.section)) setSection(params.section as Section); }, [params.section]);
  const [draft, setDraft] = useState<Settings | null>(s ? { ...s } : null);
  const [busy, setBusy] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [backupWarn, setBackupWarn] = useState(false); // S-04: say what is in the file before it is downloaded
  const [resetMode, setResetMode] = useState<ResetMode | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<{ pending: boolean; maintenance: boolean } | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const { ask, node: askNode } = useConfirm();

  // keys the teacher edits here — last_backup_at is written by the backup button, not by this form
  const changed: (typeof FORM_KEYS)[number][] = draft ? FORM_KEYS.filter((k) => !s || draft[k] !== s[k]) : [];

  // Unsaved edits: ask before leaving the page (menu, back button, closing the tab).
  useEffect(() => {
    if (changed.length === 0) return;
    setNavGuard((next) =>
      next.split("?")[0] === "/settings" ||
      ask({ title: "ออกจากหน้านี้?", body: `มีการตั้งค่าที่แก้ไขแล้ว ${changed.length} รายการ ยังไม่ได้บันทึก`, yes: "ออกโดยไม่บันทึก", no: "อยู่ต่อ", danger: true }));
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setNavGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [changed.length]);

  // a restore that was validated/uploaded but never finished (or a lock an older version left behind)
  useEffect(() => {
    if (section !== "backup") return;
    api.get<{ pending: boolean; maintenance: boolean }>("/api/restore/status").then(setRestoreInfo).catch(() => setRestoreInfo(null));
  }, [section, showRestore]);

  if (!draft || !s) return <div class="empty">กำลังโหลด…</div>;
  const cur: Settings = s; // switches and the theme are read from the saved settings, not from the form copy, so flipping one never raises the save bar

  function set<K extends keyof Settings>(k: K, v: Settings[K]) { setDraft((d) => (d ? { ...d, [k]: v } : d)); }

  // The theme and the two switches are saved the moment they are used (no save bar). The store changes first, so the
  // screen answers at once; a failed save puts the old value back and says so.
  async function chooseTheme(theme: Settings["theme"], withUndo = true) {
    const was = cur.theme;
    if (theme === was) return;
    settings.value = { ...cur, theme };
    applyTheme(theme);
    try {
      await api.put("/api/settings", { theme });
      notify("success", `บันทึกแล้ว · ธีม: ${THEME_TH[theme]}`, withUndo ? { action: { label: "เลิกทำ", run: () => { chooseTheme(was, false); } } } : {});
    } catch {
      if (settings.value) settings.value = { ...settings.value, theme: was };
      applyTheme(was);
      err("บันทึกธีมไม่สำเร็จ — ยังเป็นค่าเดิม");
    }
  }

  async function saveNow(k: "sound_enabled" | "accept_student_code_scan", v: boolean, label: string, withUndo = true) {
    const was = settings.value ? settings.value[k] : !v;
    settings.value = { ...cur, ...(settings.value ?? {}), [k]: v };
    if (k === "sound_enabled") setSoundEnabled(v);
    try {
      await api.put("/api/settings", { [k]: v });
      notify("success", `บันทึกแล้ว · ${label}: ${v ? "เปิด" : "ปิด"}`, withUndo ? { action: { label: "เลิกทำ", run: () => { saveNow(k, was, label, false); } } } : {});
    } catch {
      if (settings.value) settings.value = { ...settings.value, [k]: was };
      if (k === "sound_enabled") setSoundEnabled(was);
      err("บันทึกไม่สำเร็จ — ยังเป็นค่าเดิม");
    }
  }

  async function save() {
    setBusy("save");
    const body: Record<string, unknown> = {};
    for (const k of changed) body[k] = draft![k];
    try { if (changed.length) await api.put("/api/settings", body); }
    catch { setBusy(""); err("บันทึกการตั้งค่าไม่สำเร็จ"); return; }
    // only the keys of the form: a card layout or a switch changed meanwhile must not be put back to an old value
    settings.value = { ...(settings.value ?? cur), ...body } as Settings;
    await loadBootstrap();
    setDraft(settings.value ? { ...settings.value } : null);
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
    <div class="set-page pg">
      <PageHeader icon="settings" title="ตั้งค่า" sub={<span>{draft.school_name} · {draft.teacher_name}</span>}
        actions={<>
          <SyncBadge />
          {section === "general" && <button class="ghost" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={20} /> <span class="att-hide-sm">ปรับการ์ด</span></button>}
        </>} />

      <div class="set-nav-chips" role="tablist" aria-label="หมวดตั้งค่า">
        {SECTIONS.map((sec) => (
          <button class={"pill" + (section === sec.key ? " on" : "")} role="tab" aria-selected={section === sec.key} onClick={() => setSection(sec.key)}>
            <Icon name={sec.icon} size={20} /> {sec.label}{sec.key === "backup" && backupStale && <WarnDot />}
          </button>
        ))}
      </div>

      <div class="set-cols">
        <nav class="set-nav" aria-label="หมวดตั้งค่า">
          {SECTIONS.map((sec) => (
            <button class={section === sec.key ? "on" : ""} aria-current={section === sec.key ? "page" : undefined} onClick={() => setSection(sec.key)}>
              <Icon name={sec.icon} size={20} /> <span>{sec.label}</span>
              {sec.key === "backup" && backupStale && <WarnDot />}
            </button>
          ))}
        </nav>

        <div class="set-body">
          {section === "general" && <SettingsCards lastBackup={lastBackup} onBackup={() => setBackupWarn(true)} onRestore={() => setShowRestore(true)} goSection={(x) => { setSection(x); navigate("/settings", { section: x }); }} />}
          {section === "general" && (<div class="set-forms">
            <section class="card" aria-labelledby="se-gh">
              <h2 id="se-gh" class="set-section-title"><Icon name="school" /> ข้อมูลโรงเรียน <Scope all /></h2>
              <div class="modal-grid2">
                <label class="field"><span>ชื่อโรงเรียน</span><input value={draft.school_name} onInput={(e) => set("school_name", (e.target as HTMLInputElement).value)} /></label>
                <label class="field"><span>ชื่อครู</span><input value={draft.teacher_name} onInput={(e) => set("teacher_name", (e.target as HTMLInputElement).value)} /></label>
              </div>
              <Row label="ธีม" hint="ใช้กับทุกเครื่อง · บันทึกทันที" scope="all">
                <Segmented label="ธีม" value={cur.theme} onChange={(v) => chooseTheme(v as Settings["theme"])} options={(Object.keys(THEME_TH) as Settings["theme"][]).map((t) => ({ value: t, label: THEME_TH[t] }))} />
              </Row>
            </section>
            <section class="card" aria-labelledby="se-dh">
              <h2 id="se-dh" class="set-section-title"><Icon name="device-mobile" /> การแสดงผลบนเครื่องนี้ <Scope /></h2>
              <DisplayRows />
              <OfflineRow />
              <StorageRow />
            </section>
          </div>)}

          {section === "time" && (<div class="set-forms">
            <section class="card" aria-labelledby="se-th">
              <h2 id="se-th" class="set-section-title"><Icon name="clock" /> เวลาเรียน <Scope all /></h2>
              <Row label="เริ่มนับสาย (เช็คชื่อรายวัน)" hint="สแกนหลังเวลานี้ = สาย">
                <input type="time" aria-label="เวลาเริ่มนับสาย" value={draft.late_after} onInput={(e) => set("late_after", (e.target as HTMLInputElement).value)} style="width:auto" />
              </Row>
              <div class="set-periods-wrap">
                <div style="font-weight:500;font-size:1rem">เวลาเริ่มคาบ (สำหรับเช็คชื่อรายคาบ)</div>
                <div class="page-sub" style="margin-bottom:8px">สแกนหลังเวลาเริ่มคาบจะนับเป็นสาย · เว้นว่างได้ถ้าไม่ใช้คาบนั้น</div>
                <PeriodTimes value={draft.period_times} onChange={(v) => set("period_times", v)} />
              </div>
            </section>
          </div>)}

          {section === "scan" && (<div class="set-forms">
            <section class="card" aria-labelledby="se-sh">
              <h2 id="se-sh" class="set-section-title"><Icon name="barcode" /> การสแกน</h2>
              <Row label="เสียงตอบรับ" hint="ติ๊ด = สำเร็จ · ตื๊ด = ซ้ำ/ไม่พบ" scope="all">
                <Switch on={cur.sound_enabled} onToggle={() => saveNow("sound_enabled", !cur.sound_enabled, "เสียงตอบรับ")} label="เสียงตอบรับ" />
              </Row>
              <Row label="รับบาร์โค้ดบัตรนักเรียนเดิม" hint="สแกนรหัสนักเรียนตรงๆ ได้ นอกจาก QR ของระบบ" scope="all">
                <Switch on={cur.accept_student_code_scan} onToggle={() => saveNow("accept_student_code_scan", !cur.accept_student_code_scan, "รับบาร์โค้ดบัตรเดิม")} label="รับบาร์โค้ดบัตรเดิม" />
              </Row>
              <div class="set-sub"><HidTest allowCode={cur.accept_student_code_scan} /></div>
              <div class="set-sub"><CameraTest /></div>
            </section>
          </div>)}

          {section === "catalog" && (
            <section class="card" aria-labelledby="se-ch">
              <h2 id="se-ch" class="set-section-title"><Icon name="books" /> ห้องเรียน วิชา และภาคเรียน</h2>
              <CatalogEditor />
            </section>
          )}

          {section === "devices" && (<>
            <DeviceCheck />
            <DeviceList />
            <section class="card" aria-labelledby="se-ph">
              <h2 id="se-ph" class="set-section-title"><Icon name="key" /> บัญชีและรหัสผ่าน</h2>
              <EmailRow />
              <ChangePassword />
            </section>
          </>)}

          {section === "backup" && (<>
            {(restoreInfo?.pending || restoreInfo?.maintenance) && (
              <div class="set-banner warn" role="status">
                <Icon name="alert-triangle" size={20} />
                <span class="grow">{restoreInfo.maintenance ? "ระบบถูกล็อกจากการกู้คืนครั้งก่อนที่ไม่จบ — ปลดล็อกเพื่อใช้งานต่อ" : "มีงานกู้คืนที่ส่งไฟล์ค้างไว้ (ข้อมูลจริงยังไม่ถูกเปลี่ยน)"}</span>
                <button onClick={cancelRestore} disabled={busy === "cancel"}>{restoreInfo.maintenance ? "ปลดล็อก" : "ยกเลิกงานนี้"}</button>
              </div>
            )}
            {backupStale && (
              <div class="set-banner warn" role="status">
                <Icon name="alert-triangle" size={20} />
                <span class="grow">{lastBackup ? `สำรองล่าสุด ${Math.round((Date.now() - lastBackup) / 86400000)} วันก่อน` : "ยังไม่เคยสำรอง"} · ควรสำรองสัปดาห์ละครั้ง</span>
                <button onClick={() => setBackupWarn(true)} disabled={busy === "backup"}>สำรองเลย</button>
              </div>
            )}
            <div class="set-forms">
            <section class="card" aria-labelledby="se-bh">
              <h2 id="se-bh" class="set-section-title"><Icon name="database-export" /> สำรองและกู้คืน</h2>
              <Row label="ดาวน์โหลดไฟล์สำรอง (JSON)" hint={`สำรองล่าสุด: ${lastBackup ? formatThaiDateTimeMs(lastBackup) : "ยังไม่เคย"}`}>
                <button class="primary" onClick={() => setBackupWarn(true)} disabled={busy === "backup"}>{busy === "backup" ? <Icon name="loader-2" class="spin" size={20} /> : <Icon name="download" size={20} />} ดาวน์โหลด</button>
              </Row>
              <div class="set-pdpa" role="note">
                <Icon name="alert-triangle" size={20} />
                <div><b>ไฟล์สำรองมีข้อมูลส่วนบุคคลของนักเรียน (ผู้เยาว์) และไม่ได้เข้ารหัส</b>
                  <div class="page-sub" style="color:inherit">เก็บในเครื่อง/ไดรฟ์ที่มีรหัสผ่าน · อย่าส่งทาง LINE หรืออีเมล · ถ้าหลุด ออก QR ใหม่ที่หน้านักเรียน · จะมีหน้าต่างเตือนอีกครั้งก่อนดาวน์โหลด</div></div>
              </div>
              <Row label="กู้คืนจากไฟล์สำรอง" hint="ตรวจไฟล์ก่อน · สำรองข้อมูลปัจจุบันให้อัตโนมัติ · เปลี่ยนทีเดียว ล้มเหลวแล้วไม่มีอะไรเปลี่ยน">
                <button onClick={() => setShowRestore(true)}><Icon name="database-import" size={20} /> กู้คืน</button>
              </Row>
            </section>
            <section class="card set-danger" aria-labelledby="se-zh">
              <h2 id="se-zh" class="set-section-title"><Icon name="alert-triangle" /> เริ่มใหม่ (ล้างข้อมูล)</h2>
              <Row label="ล้างข้อมูลทดลอง" hint="ลบห้อง นักเรียน งาน คะแนน เช็คชื่อ · เก็บบัญชีและการตั้งค่า · กลับไปหน้าต้อนรับครั้งแรก">
                <button class="dan" onClick={() => setResetMode("data")}><Icon name="trash" size={20} /> ล้างข้อมูล</button>
              </Row>
              <Row label="ล้างทั้งหมด เริ่มใหม่ตั้งแต่ต้น" hint="ลบทุกอย่างรวมบัญชีครู · กลับไปหน้าตั้งบัญชีครั้งแรก">
                <button class="dan" onClick={() => setResetMode("all")}><Icon name="trash-x" size={20} /> ล้างทั้งหมด</button>
              </Row>
            </section>
            </div>
          </>)}

          {section === "history" && <HistorySection />}

          {changed.length > 0 && (
            <div class="set-savebar" role="region" aria-label="การแก้ไขที่ยังไม่บันทึก">
              <Icon name="pencil" size={20} style="color:var(--text-accent)" />
              <span class="grow" style="font-size:var(--fs-sm)" role="status" aria-live="polite">แก้ไขแล้ว {changed.length} รายการ ยังไม่บันทึก</span>
              <button onClick={() => setDraft(s ? { ...s } : null)}>ยกเลิก</button>
              <button class="primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? <Icon name="loader-2" class="spin" size={20} /> : <Icon name="device-floppy" size={20} />} บันทึก</button>
            </div>
          )}
        </div>
      </div>

      {askNode}
      {prefsOpen && <PageCardSettings page="settings" title="หน้าตั้งค่า" layout={settingsLayout.value} meta={SETTINGS_CARD_META} locked={SETTINGS_LOCKED} onClose={() => setPrefsOpen(false)} />}
      {resetMode && <ResetModal mode={resetMode} onClose={() => setResetMode(null)} />}
      {backupWarn && <BackupWarning onClose={() => setBackupWarn(false)} onConfirm={() => { setBackupWarn(false); backup(); }} />}
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
        <label><span class="muted">คาบ {p}</span><input type="time" aria-label={`เวลาเริ่มคาบ ${p}`} value={times[String(p)] ?? ""} onInput={(e) => setPeriod(p, (e.target as HTMLInputElement).value)} /></label>
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
      <div style="font-weight:500;font-size:1rem">ทดสอบเครื่องยิง</div>
      <div class="page-sub" style="margin-bottom:8px">ยิงสติกเกอร์ใบไหนก็ได้ ระบบจะบอกว่าอ่านได้ถูกไหม (ไม่บันทึกอะไร)</div>
      {log.length === 0 ? <div class="page-sub" style="padding:8px;background:var(--surface-1);border-radius:10px;text-align:center">รอการยิง…</div> : log.map((r) => (
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
      const { diagnoseCamera } = await import("../lib/camera");
      setRows(await diagnoseCamera());
    } catch (e) {
      setRows([{ label: "โหลดตัวตรวจสอบ", ok: false, detail: "ต่อเน็ตแล้วลองอีกครั้ง (" + ((e as Error)?.message || "ไม่ทราบสาเหตุ") + ")" }]);
    } finally { setBusy(false); }
  }
  const allOk = !!rows && rows.every((r) => r.ok);
  return (
    <div>
      <div style="font-weight:500;font-size:1rem">ทดสอบกล้อง</div>
      <div class="page-sub" style="margin-bottom:8px">ตรวจว่าเครื่องนี้สแกนด้วยกล้องได้ไหม และถ้าไม่ได้ เพราะอะไร (ระบบจะขอเปิดกล้องแวบเดียวแล้วปิด ไม่บันทึกภาพ)</div>
      <button onClick={run} disabled={busy}>{busy ? <Icon name="loader-2" size={16} class="spin" /> : <Icon name="camera" size={16} />} {rows ? "ทดสอบอีกครั้ง" : "เริ่มทดสอบกล้อง"}</button>
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
      <h2 class="set-section-title"><Icon name="device-mobile-check" /> ตรวจเครื่องนี้ <Scope /></h2>
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
            <div class="row" style="gap:8px;align-items:flex-start;padding:5px 0;border-top:0.5px solid var(--border);font-size:var(--fs-sm)">
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
  const { ask, node: askNode } = useConfirm();
  async function load() { try { const r = await api.get<{ devices: DeviceInfo[] }>("/api/devices"); setDevices(r.devices); } catch { setDevices([]); } }
  useEffect(() => { load(); }, []);
  async function signout(id: string, name: string) {
    if (!(await ask({ title: `ออกจากระบบเครื่อง "${name}"?`, body: "เครื่องนั้นต้องเข้าสู่ระบบใหม่", yes: "ออกจากระบบ", danger: true }))) return;
    const done = await withToast(() => api.post(`/api/devices/${id}/signout`), "ออกจากระบบเครื่องนี้ไม่สำเร็จ");
    if (done) { ok("ออกจากระบบเครื่องนั้นแล้ว"); load(); }
  }
  return (
    <div class="card">
      {askNode}
      <h2 class="set-section-title"><Icon name="devices" /> อุปกรณ์ที่เข้าสู่ระบบ</h2>
      {devices.map((d) => (
        <div class="set-row">
          <div class="row" style="gap:10px;min-width:0;flex:1 1 12em"><Icon name="device-mobile" size={20} class="muted" /><div style="min-width:0"><div style="overflow-wrap:anywhere">{d.name} {d.current && <span class="chip" style="background:var(--bg-success);color:var(--text-success)">เครื่องนี้</span>}</div><div class="page-sub">{d.user_agent ? describeAgent(d.user_agent) + " · " : ""}ใช้ล่าสุด {formatThaiDayMonthMs(d.last_seen)}</div></div></div>
          {!d.current && <button class="ghost" onClick={() => signout(d.id, d.name)}>ออกจากระบบ</button>}
        </div>
      ))}
    </div>
  );
}

/** The sign-in e-mail, read only: there is no way to change it in this version (needs a new API). */
function EmailRow() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => { api.get<{ email?: string | null }>("/api/auth/me").then((m) => setEmail(m.email ?? null), () => setEmail(null)); }, []);
  return (
    <div class="set-row"><div><div style="font-weight:500">อีเมลเข้าสู่ระบบ</div><div class="page-sub">ใช้ยืนยันตัวตนตอนเข้าสู่ระบบ · เปลี่ยนไม่ได้ในเวอร์ชันนี้</div></div>
      <span style="overflow-wrap:anywhere">{email === undefined ? "กำลังโหลด…" : email ?? "ยังไม่ได้ตั้ง"}</span></div>
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
  if (!open) return (
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button onClick={() => { setMsg(""); setOpen(true); }}><Icon name="key" size={15} /> เปลี่ยนรหัสผ่าน</button>
      {msg && <span style="font-size:var(--fs-sm);color:var(--text-success)"><Icon name="circle-check" size={14} /> {msg}</span>}
    </div>
  );
  return (
    <div class="row" style="gap:6px;flex-wrap:wrap">
      <input type="password" aria-label="รหัสเดิม" placeholder="รหัสเดิม" autocomplete="current-password" value={cur} onInput={(e) => setCur((e.target as HTMLInputElement).value)} style="width:140px" />
      <input type="password" aria-label="รหัสใหม่ (อย่างน้อย 6 ตัว)" placeholder="รหัสใหม่" autocomplete="new-password" value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} style="width:140px" />
      <button class="primary" onClick={submit}>บันทึก</button>
      <button onClick={() => { setMsg(""); setOpen(false); }}>ยกเลิก</button>
      {msg && <div style="font-size:var(--fs-xs);color:var(--text-secondary);width:100%">{msg}</div>}
    </div>
  );
}

function HistorySection() {
  const [filter, setFilter] = useState("");
  const FILTERS = [{ v: "", l: "ทั้งหมด" }, { v: "submission", l: "ส่งงาน" }, { v: "attendance", l: "เช็คชื่อ" }, { v: "student", l: "นักเรียน" }, { v: "qr", l: "บัตร QR" }];
  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <h2 class="set-section-title" style="margin:0"><Icon name="history" /> ประวัติการแก้ไข</h2>
        <div class="chips-row">{FILTERS.map((f) => <button class={"pill" + (filter === f.v ? " on" : "")} aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>{f.l}</button>)}</div>
      </div>
      <AuditHistory entity={filter || undefined} />
    </div>
  );
}
