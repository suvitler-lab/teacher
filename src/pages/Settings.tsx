import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/settings.css";
import "../styles/settings-cards.css";
import "../styles/home.css";
import { Icon } from "../components/Icon";
import { PageHeader, SyncBadge, useIsPhone } from "../components/ui";
import { settings, loadBootstrap } from "../store";
import type { Settings } from "@shared/types";
import { api, ApiError } from "../lib/api";
import { setSoundEnabled } from "../lib/sound";
import { runBackup, BackupInconsistentError } from "../lib/backup";
import { err, ok, notify, withToast } from "../lib/notify";
import { RestoreModal, BackupWarning } from "../components/RestoreModal";
import { ResetModal, type ResetMode } from "../components/ResetModal";
import { routeParams, setNavGuard, navigate } from "../router";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { SettingsNav, type NavLayout } from "../components/settings/SettingsNav";
import { resolveSection, type SectionKey, type CatalogTab } from "../components/settings/sections/registry";
import { useOffline, useReadOnly } from "../components/settings/sections/shared";
import { backupDue } from "../components/settings/sections/todo";
import { GeneralSection } from "../components/settings/sections/GeneralSection";
import { TimeSection } from "../components/settings/sections/TimeSection";
import { ScanSection } from "../components/settings/sections/ScanSection";
import { CatalogSection } from "../components/settings/sections/CatalogSection";
import { WorktypesSection } from "../components/settings/sections/WorktypesSection";
import { AccountSection } from "../components/settings/sections/AccountSection";
import { DangerSection } from "../components/settings/sections/DangerSection";
import { DeviceSection } from "../components/settings/sections/DevicesSection";
import { PrivacySection } from "../components/settings/sections/PrivacySection";
import { BackupSection } from "../components/settings/sections/BackupSection";
import { HistorySection } from "../components/settings/sections/HistorySection";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { SETTINGS_CARD_META, SETTINGS_LOCKED } from "../components/cards/meta";
import { settingsLayout } from "../lib/pageCards";
import { useConfirm } from "../components/ConfirmDialog";
import { schoolLabel, teacherLabel, nameField } from "../lib/orgNames";

/** The keys the text form edits and the save bar counts. Switches save at once (the look: AppearanceSection); cards and last_backup_at have their own writers. */
const FORM_KEYS = ["school_name", "teacher_name", "late_after"] as const satisfies readonly (keyof Settings)[];

/** The settings as the text form holds them: the built-in school / teacher names show as placeholders (empty), not as text. */
const formOf = (s: Settings): Settings => ({ ...s, school_name: nameField(s.school_name), teacher_name: nameField(s.teacher_name) });

export function SettingsPage() {
  const s = settings.value;
  const params = routeParams();
  const phone = useIsPhone(720);
  const narrow = useIsPhone(1023);
  const layout: NavLayout = phone ? "phone" : narrow ? "tablet" : "side";
  // on a phone the list is page 1; a section is page 2 (its address carries ?section=)
  const listPage = layout === "phone" && !params.section;
  const ro = useReadOnly();
  const offline = useOffline();
  const [section, setSection] = useState<SectionKey>(resolveSection(params.section, params.tab).section);
  const [catTab, setCatTab] = useState<CatalogTab | undefined>(resolveSection(params.section, params.tab).tab);
  // a link to another section (#/settings?section=backup) while this page is already open must switch to it
  useEffect(() => {
    if (!params.section) return;
    const r = resolveSection(params.section, params.tab);
    setSection(r.section); setCatTab(r.tab);
  }, [params.section, params.tab]);
  const [draft, setDraft] = useState<Settings | null>(s ? formOf(s) : null);
  useEffect(() => { if (!draft && s) setDraft(formOf(s)); }, [!!s]);
  const [busy, setBusy] = useState("");
  const [saveFail, setSaveFail] = useState<null | "failed" | "term">(null);
  const [showRestore, setShowRestore] = useState(false);
  const [backupWarn, setBackupWarn] = useState(false); // S-04: say what is in the file before it is downloaded
  const [resetMode, setResetMode] = useState<ResetMode | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<{ pending: boolean; maintenance: boolean } | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [statusTry, setStatusTry] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const { ask, node: askNode } = useConfirm();
  const body = useRef<HTMLDivElement>(null);

  // keys the teacher edits here — last_backup_at is written by the backup button, not by this form
  const changed: (typeof FORM_KEYS)[number][] = draft ? FORM_KEYS.filter((k) => !s || draft[k] !== formOf(s)[k]) : [];

  // Unsaved edits: ask before leaving the page (menu, back button, closing the tab). Moving between sections is not leaving.
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
    setRestoreFailed(false);
    api.get<{ pending: boolean; maintenance: boolean }>("/api/restore/status").then(setRestoreInfo).catch(() => { setRestoreInfo(null); setRestoreFailed(true); });
  }, [section, showRestore, statusTry]);

  // after the section changes, the heading of the new section takes the focus (AC-213) — not on the first paint
  const first = useRef(true);
  // (on a phone the page appears after the route changes, so this also waits for listPage; going back to the list focuses the section just left)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (listPage) { document.querySelector<HTMLElement>(".set-nav [aria-current=page]")?.focus({ preventScroll: true }); return; }
    const h = body.current?.querySelector<HTMLElement>("h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }, [section, listPage]);

  // Projecting: only the controls that write are switched off (R-5305) — tabs, filters and links to another section keep working.
  useEffect(() => {
    const el = body.current;
    if (!ro || !el) return;
    const keep = "[data-nav],.stu-tabs,.chips-row,.set-todo,.set-moved,.set-back";
    const apply = () => el.querySelectorAll<HTMLElement>("input,select,textarea,button").forEach((c) => {
      if (c.closest(keep) || c.hasAttribute("disabled")) return;
      c.setAttribute("disabled", ""); c.setAttribute("data-ro", "1");
    });
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    return () => { mo.disconnect(); el.querySelectorAll("[data-ro]").forEach((c) => { c.removeAttribute("disabled"); c.removeAttribute("data-ro"); }); };
  }, [ro, section, listPage]);

  const loading = !draft || !s;
  const cur = s as Settings; // switches and the theme are read from the saved settings, not from the form copy, so flipping one never raises the save bar

  function set<K extends keyof Settings>(k: K, v: Settings[K]) { setDraft((d) => (d ? { ...d, [k]: v } : d)); }

  /** A link inside the page: opens the section (and a tab of the catalog); on a phone it is a new page, so Back returns to the list. */
  function go(sec: SectionKey, tab?: CatalogTab) { setSection(sec); setCatTab(tab); navigate("/settings", { section: sec, tab }); }
  function pick(sec: SectionKey) { if (phone) go(sec); else { setSection(sec); setCatTab(undefined); } }

  // The two switches are saved the moment they are used (no save bar). The store changes first, so the
  // screen answers at once; a failed save puts the old value back and says so.
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
    if (!draft) return;
    setBusy("save"); setSaveFail(null);
    const sent: Record<string, unknown> = {};
    for (const k of changed) sent[k] = draft[k];
    try { if (changed.length) await api.put("/api/settings", sent); }
    catch (e) { setBusy(""); setSaveFail(e instanceof ApiError && e.code === "term_changed" ? "term" : "failed"); err("บันทึกการตั้งค่าไม่สำเร็จ"); return; }
    // only the keys of the form: a card layout or a switch changed meanwhile must not be put back to an old value
    settings.value = { ...(settings.value ?? cur), ...sent } as Settings;
    await loadBootstrap();
    setDraft(settings.value ? formOf(settings.value) : null);
    setBusy("");
    ok("บันทึกการตั้งค่าแล้ว");
  }

  async function backup() {
    if (ro) return; // projecting: the file holds every child's name, never written out from a shared screen (AC-248)
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
  const backupStale = backupDue(lastBackup);

  const content = loading ? (
    <div class="set-skel" aria-busy="true">
      <p role="status" class="page-sub">กำลังโหลดการตั้งค่า…</p>
      <span class="set-skel-bar" /><span class="set-skel-bar" /><span class="set-skel-bar" />
    </div>
  ) : (<>
    {section === "general" && <GeneralSection draft={draft!} set={set} lastBackup={lastBackup} onBackup={() => setBackupWarn(true)} onRestore={() => setShowRestore(true)} go={go} />}
    {section === "appearance" && <AppearanceSection />}
    {section === "time" && <TimeSection draft={draft!} set={set} />}
    {section === "scan" && <ScanSection cur={cur} saveNow={saveNow} />}
    {section === "catalog" && <CatalogSection tab={catTab} />}
    {section === "worktypes" && <WorktypesSection />}
    {section === "privacy" && <PrivacySection cur={cur} saveNow={saveNow} />}
    {section === "device" && <DeviceSection />}
    {section === "devices" && <AccountSection />}
    {section === "backup" && <BackupSection lastBackup={lastBackup} backupStale={backupStale} busy={busy} restoreInfo={restoreInfo} restoreFailed={restoreFailed}
      onBackup={() => setBackupWarn(true)} onRestore={() => setShowRestore(true)} onCancelRestore={cancelRestore} onRetryStatus={() => setStatusTry((n) => n + 1)} />}
    {section === "history" && <HistorySection />}
    {section === "reset" && <DangerSection onReset={setResetMode} />}
  </>);

  return (
    <div class="set-page pg">
      <PageHeader icon="settings" title="ตั้งค่า" sub={<span>{schoolLabel(s?.school_name)}{ro ? "" : <> · {teacherLabel(s?.teacher_name)}</>}</span>}
        actions={<>
          <SyncBadge />
          {section === "general" && !listPage && !loading && <button class="ghost" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ดภาพรวม" disabled={ro}><Icon name="layout-grid" size={20} /> <span class="att-hide-sm">ปรับการ์ดภาพรวม</span></button>}
        </>} />

      <div class="set-cols">
        {(layout !== "phone" || listPage) && <SettingsNav layout={layout} section={section} onPick={pick} backupDue={backupStale} />}

        {!listPage && (
          <div class="set-body" ref={body}>
            {layout === "phone" && <button class="set-back" onClick={() => navigate("/settings")} aria-label="กลับไปรายการตั้งค่า"><Icon name="chevron-left" size={20} /> ตั้งค่า</button>}
            {offline && <div class="set-banner warn" role="status"><Icon name="wifi-off" size={20} /><span class="grow">ออฟไลน์อยู่ — ดูการตั้งค่าที่โหลดไว้ได้ · แก้ไข/สำรอง/กู้คืนทำได้เมื่อออนไลน์</span></div>}
            {ro && <div class="set-banner warn" role="status"><Icon name="eye-off" size={20} /><span class="grow">กำลังฉายจอ — หน้านี้อ่านอย่างเดียว · ปิดอยู่ตอนฉายจอ</span></div>}
            <fieldset class="set-fs">
              {content}
              {changed.length > 0 && (
                <div class="set-savebar" role="region" aria-label="การแก้ไขที่ยังไม่บันทึก">
                  <Icon name="pencil" size={20} style="color:var(--text-accent)" />
                  <span class="grow" style="font-size:var(--fs-sm)" role="status" aria-live="polite">แก้ไขแล้ว {changed.length} รายการ ยังไม่บันทึก</span>
                  <button onClick={() => { setDraft(s ? formOf(s) : null); setSaveFail(null); }}>ยกเลิก</button>
                  <button class="primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? <><Icon name="loader-2" size={20} class="spin" /> กำลังบันทึก…</> : <><Icon name="device-floppy" size={20} /> บันทึก</>}</button>
                  {saveFail && (
                    <div class="set-save-alert" role="alert">
                      <Icon name="alert-triangle" size={20} />
                      <span class="grow">{saveFail === "term" ? "ภาคเรียนปัจจุบันเปลี่ยนไปแล้ว — โหลดข้อมูลใหม่ก่อนทำต่อ" : "บันทึกไม่สำเร็จ — ข้อมูลเดิมยังอยู่ ตรวจเน็ตแล้วลองอีกครั้ง"}</span>
                      {saveFail === "term"
                        ? <button onClick={async () => { await loadBootstrap(); setSaveFail(null); }}>โหลดใหม่</button>
                        : <button onClick={save} disabled={busy === "save"}>ลองอีกครั้ง</button>}
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          </div>
        )}
      </div>

      {askNode}
      {prefsOpen && <PageCardSettings page="settings" title="หน้าตั้งค่า" layout={settingsLayout.value} meta={SETTINGS_CARD_META} locked={SETTINGS_LOCKED} onClose={() => setPrefsOpen(false)} />}
      {resetMode && <ResetModal mode={resetMode} onClose={() => setResetMode(null)} />}
      {backupWarn && <BackupWarning onClose={() => setBackupWarn(false)} onConfirm={() => { setBackupWarn(false); backup(); }} />}
      {showRestore && <RestoreModal onClose={() => setShowRestore(false)} onDone={() => { setShowRestore(false); loadBootstrap(); }} />}
    </div>
  );
}
