import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/home.css";
import "../styles/report.css";
import { Icon } from "../components/Icon";
import { LoadError, TermPicker, YearBanner, PageHeader, ClassChips, Segmented, EmptyState, NoClasses, Drawer } from "../components/ui";
import { ReportBody, ReportCards, ReportHero, FollowRows, ReportPrint, ReportProjector, rangeText, sortStudents, nextSort, sortAnnouncement, type SortState, type SortKey } from "../components/reports/ReportParts";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { REPORTS_CARD_META, REPORTS_LOCKED } from "../components/cards/meta";
import { reportsLayout } from "../lib/pageCards";
import { visibleCards } from "../lib/cardLayout";
import { hideSignal, setHide } from "../lib/hideNames";
import { online } from "../lib/outbox";
import { nameOf, unassignedCount } from "../lib/reportView";
import { ProjectorButton } from "../components/Projector";
import { projectorOn, pjSize } from "../lib/projector";
import { navigate } from "../router";
import { StudentDrawer } from "../components/StudentDrawer";
import { viewClasses, activeSubjects, rosterCount, classById, selectedTermId, terms, UNASSIGNED, startClass, rememberClass } from "../store";
import { api } from "../lib/api";
import { swrPeek, swrFetch } from "../lib/swr";
import { ok, err } from "../lib/notify";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import { computeReport, followUpText, type ReportModel, type ReportPayload } from "../lib/report";
import { reportSummaryUrl, termPeriodLabel, downloadReportExcel } from "../lib/reportExport";
import { fullName } from "../lib/names";
import { currentMonthIso, monthOptions, formatThaiDateMs, formatThaiTimeMs } from "../lib/dates";
import { StudentModal } from "./Students";
import type { Student } from "@shared/types";
import { scorePercent, attendancePercent } from "@shared/metrics";

const HEADS: { key: SortKey; short: string; name: string }[] = [
  { key: "number", short: "#", name: "เลขที่" }, { key: "submit", short: "ส่ง", name: "ส่งงาน" },
  { key: "score", short: "สะสม", name: "คะแนนสะสม" }, { key: "att", short: "มา", name: "มาเรียน" },
];

/** B-06: the month the report opens on is the current one — unless the term is over (or not begun), then the nearest month the term has */
export function clampMonthToTerm(month: string, term: { start_date: string | null; end_date: string | null } | undefined): string {
  const first = term?.start_date?.slice(0, 7);
  const last = term?.end_date?.slice(0, 7);
  if (last && /^\d{4}-\d{2}$/.test(last) && month > last) return last;
  if (first && /^\d{4}-\d{2}$/.test(first) && month < first) return first;
  return month;
}

/** B-05: the term name may already say "ภาคเรียนที่ 1/2569" — the words are printed exactly once */
export function termPrintLabel(name: string | undefined): string {
  const n = (name ?? "").trim();
  return /^ภาคเรียน/.test(n) ? n : `ภาคเรียนที่ ${n}`.trim();
}

/** a phone-wide screen (AC-172): the filters, the export list and the sort live in bottom sheets */
function usePhone(): boolean {
  const q = "(max-width: 720px)";
  const get = () => { try { return typeof matchMedia === "function" && matchMedia(q).matches; } catch { return false; } };
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(q), f = () => setOn(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return on;
}

export function ReportsPage() {
  const [classId, setClassId] = useState(startClass(null, viewClasses.value));
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState<"term" | "month">("term");
  const [month, setMonth] = useState(() => clampMonthToTerm(currentMonthIso(), terms.value.find((t) => t.id === selectedTermId.value)));
  const monthPicked = useRef(false); // once the teacher picks a month herself, the term changing does not move it
  const [att, setAtt] = useState<"daily" | "subject">("daily");
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [model, setModel] = useState<ReportModel | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const begin = useLoadGuard();
  const [msg, setMsg] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "submit", dir: "asc" }); // the ones who need a look come first
  const [sortNote, setSortNote] = useState(""); // said aloud after a sort tap
  const [printing, setPrinting] = useState(false); // the A4 preview in the page
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [editStu, setEditStu] = useState<Student | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [focusFollow, setFocusFollow] = useState(0);
  const handledFollow = useRef(0);
  const [followSheet, setFollowSheet] = useState(false);
  const phone = usePhone();
  const [sheet, setSheet] = useState<null | "filters" | "export" | "sort" | "more">(null);
  const hide = hideSignal("reports").value;
  const isOnline = online.value;
  const loading = useRef(false);
  const exporting = useRef(false);
  const refresh = useRef(() => {});
  // "per period" belongs to one subject: with no subject picked it is per day (the button said period, the data said day)
  const attMode = subjectId ? att : "daily";

  async function load(background = false) {
    if (background && (loading.current || !navigator.onLine)) return; // an automatic refresh never runs while offline: it would only fail
    const fresh = begin();
    if (!classId) { setStatus("ready"); setPayload(null); setModel(null); setUpdatedAt(null); loading.current = false; setRefreshing(false); return; }
    const url = reportSummaryUrl({ classId, termId: selectedTermId.value, month: period === "month" ? month : null, subjectId, attBySubject: attMode === "subject" });
    // the last answer for this exact class/term/month/subject (saved when the teacher was here or on Students) paints at once;
    // an explicit refresh / the minute timer always asks the server
    const hit = background ? null : swrPeek<ReportPayload>(url);
    const keep = (background && !!model) || !!hit;
    // never keep showing the previous class/term/month while the new one loads (or fails)
    if (!keep) { setStatus("loading"); setPayload(null); setModel(null); setUpdatedAt(null); }
    if (hit) {
      setPayload(hit.data); setModel(computeReport(hit.data)); setStatus("ready"); setUpdatedAt(hit.at);
      if (hit.fresh) { loading.current = false; setRefreshing(false); setRefreshFailed(false); return; }
    }
    loading.current = true;
    setRefreshing(true); setRefreshFailed(false);
    try {
      const p = await swrFetch(url, () => api.get<ReportPayload>(url));
      if (!fresh()) return; // the teacher already picked something else
      setPayload(p);
      setModel(computeReport(p));
      setStatus("ready");
      setUpdatedAt(Date.now());
    } catch {
      if (fresh()) { if (keep) setRefreshFailed(true); else setStatus("error"); }
    } finally {
      if (fresh()) { loading.current = false; setRefreshing(false); }
    }
  }
  useEffect(() => { if (!subjectId && att === "subject") setAtt("daily"); }, [subjectId]);
  // another term (or the terms arriving late): the default month follows it, so "ช่วงข้อมูล" never runs backwards
  useEffect(() => {
    if (monthPicked.current) return;
    const m = clampMonthToTerm(currentMonthIso(), terms.value.find((t) => t.id === selectedTermId.value));
    setMonth((cur) => (cur === m ? cur : m));
  }, [selectedTermId.value, terms.value]);
  useEffect(() => { load(); }, [classId, subjectId, month, period, attMode, selectedTermId.value]);
  refresh.current = () => { void load(true); };
  useEffect(() => {
    const visible = () => { if (document.visibilityState !== "hidden") refresh.current(); };
    const timer = setInterval(visible, 60000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, []);
  // the term changed: the class we were on may not exist in that year
  useEffect(() => { rememberClass(classId); }, [classId]);
  useEffect(() => {
    if (!viewClasses.value.some((c) => c.id === classId)) setClassId(viewClasses.value[0]?.id ?? "");
  }, [selectedTermId.value]);

  const cls = classById(classId);
  const subj = activeSubjects.value.find((s) => s.id === subjectId);
  const term = terms.value.find((t) => t.id === selectedTermId.value);
  const termLabel = termPeriodLabel(selectedTermId.value);
  const monthLabel = monthOptions().find((m) => m.value === month)?.label ?? month;
  const periodLabel = period === "term" ? termLabel : monthLabel;

  const empty = !!model && model.students.length === 0; // no child in the room: nothing to print, project or export (AC-251)
  const scopeText = period === "term" ? "ทั้งเทอม" : monthLabel; // AC-166 names the span "ทั้งเทอม", not the term's own name
  const excelScope = `${cls?.name ?? ""} ${subj?.name ?? "ทุกวิชา"} ${scopeText}`;
  const excelBtn = useRef<HTMLButtonElement>(null);
  async function exportExcel() {
    if (!model || !payload || empty || exporting.current) return;
    exporting.current = true; // a quick second tap never starts a second file
    setMsg("กำลังสร้างไฟล์ Excel…");
    try {
      await downloadReportExcel(model, payload, { className: cls?.name ?? "", subjectName: subj?.name ?? "ทุกวิชา", periodLabel });
      setMsg(""); ok(`ดาวน์โหลด Excel แล้ว · ${excelScope}${hide ? " · ไฟล์ Excel มีชื่อนักเรียน" : ""}`);
    } catch { setMsg(""); err("สร้างไฟล์ Excel ไม่สำเร็จ — ลองอีกครั้ง"); }
    finally { exporting.current = false; setTimeout(() => excelBtn.current?.focus(), 0); }
  }
  async function copyLine(): Promise<boolean> {
    if (!model) return false;
    if (hide) return false; // the card is a list of names: closed while names are hidden
    const lines = followUpText(model.followUp, `${cls?.name ?? ""} ${subj?.name ?? ""}`, formatThaiDateMs(Date.now()));
    try { await navigator.clipboard.writeText(lines); ok("คัดลอกไปวางใน LINE ได้เลย"); return true; }
    catch { err("คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเอง"); return false; }
  }
  function sortBy(k: SortKey) { const n = nextSort(sort, k); setSort(n); setSortNote(sortAnnouncement(n)); }

  const unitLabel = model?.attendance.unit === "period" ? "คาบ" : "วัน";
  const sorted = model ? sortStudents(model.students, sort) : [];
  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));
  const clock = updatedAt ? formatThaiTimeMs(updatedAt) : "";
  // a sortable column head: the whole cell is the button; the arrow says which way (and "arrows" when it is not the sorted one)
  const th = (h: (typeof HEADS)[number]) => (
    <th scope="col" class={(h.key === "number" ? "" : "num ") + (h.key === "att" ? "c-att " : h.key === "score" ? "c-sc " : "") + (sort.key === h.key ? "on" : "")} aria-sort={sort.key === h.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" class="rp-sortbtn" onClick={() => sortBy(h.key)} aria-label={`เรียงตาม${h.name}`}>
        {h.short}<Icon name={sort.key === h.key ? (sort.dir === "asc" ? "sort-ascending" : "sort-descending") : "arrows-sort"} size={16} />
      </button>
    </th>
  );

  if (printing && model && !empty) {
    const termText = selectedTermId.value === UNASSIGNED ? "ยังไม่ระบุเทอม" : termPrintLabel(term?.name);
    return <ReportPrint model={model} payload={payload} className={cls?.name ?? ""} subjectName={subj?.name ?? "ทุกวิชา"} termLabel={termText}
      monthLabel={period === "month" ? monthLabel : null} updatedAt={updatedAt} sort={sort} hide={hide}
      onClose={() => { setPrinting(false); setTimeout(() => document.getElementById("rp-print-btn")?.focus(), 0); }} />;
  }

  const hasCards = visibleCards(reportsLayout.value).length > 0;
  const monthly = period === "month";
  const monthRangeBad = !!payload?.range.from && !!payload.range.to && payload.range.to < payload.range.from;
  const noUnassigned = unassignedCount(payload, monthly);
  function closeDrawer() {
    const id = drawer; setDrawer(null);
    if (id) setTimeout(() => document.querySelector<HTMLElement>(`[data-rp-name="${id}"]`)?.focus(), 0);
  }
  function openFollow() {
    if (hasCards && (visibleCards(reportsLayout.value) as string[]).includes("follow")) setFocusFollow((n) => n + 1);
    else setFollowSheet(true);
  }
  const heroOff = !classId || !model;
  const filterCount = (subjectId ? 1 : 0) + (period === "month" ? 1 : 0) + (attMode === "subject" ? 1 : 0);
  const filtersJsx = (<>
          <select class="rp-sel" aria-label="วิชาของรายงาน" value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)}>
            <option value="">ทุกวิชา</option>
            {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
          </select>
          <Segmented label="ช่วงเวลา" value={period} onChange={setPeriod} options={[{ value: "term", label: "ทั้งเทอม" }, { value: "month", label: "รายเดือน" }]} />
          {period === "month" && (
            <select class="rp-sel" aria-label="เดือนของรายงาน" value={month} onInput={(e) => { monthPicked.current = true; setMonth((e.target as HTMLSelectElement).value); }}>
              {monthOptions().map((m) => <option value={m.value}>{m.label}</option>)}
            </select>
          )}
          <span class="page-sub rp-attlbl">เช็คชื่อ:</span>
          <div role="group" aria-label="เช็คชื่อ" aria-describedby={subjectId ? undefined : "rp-why"} class="rp-attgrp">
            <Segmented label="แบบเช็คชื่อ" value={attMode} onChange={setAtt}
              options={[{ value: "daily", label: "รายวัน" }, { value: "subject", label: <span title={subjectId ? undefined : "เลือกวิชาก่อน"}>รายคาบ (วิชานี้)</span>, disabled: !subjectId }]} />
            {!subjectId && <span id="rp-why" class="rp-why rp-why-tb">รายคาบใช้ได้เมื่อเลือกวิชา</span>}
          </div>
  </>);
  const reloadBtn = <button class="ghost rp-ibtn" onClick={() => load(true)} disabled={!classId || refreshing || !isOnline} aria-label="โหลดใหม่" title={isOnline ? undefined : "โหลดใหม่ได้เมื่อมีเน็ต"}><Icon name="refresh" size={20} class={refreshing ? "spin" : undefined} /> <span class="rp-lbl rp-quiet">โหลดใหม่</span></button>;
  const printBtn = <button id="rp-print-btn" class="ghost rp-ibtn" onClick={() => { if (!empty) { setSheet(null); setPrinting(true); } }} disabled={status !== "ready" || !model || empty} aria-label="พิมพ์"><Icon name="printer" size={20} /> <span class="rp-lbl rp-quiet">พิมพ์</span></button>;
  const pjBtn = empty
    ? <button class="ghost" disabled aria-label="โหมดฉายจอ"><Icon name="presentation" size={18} /> <span class="att-hide-sm">โหมดฉายจอ</span></button>
    : <ProjectorButton />;
  const xlBtn = <button class="primary rp-ibtn" ref={excelBtn} onClick={exportExcel} disabled={status !== "ready" || !model || empty || !!msg} aria-label="ส่งออก Excel" aria-describedby={model && !empty ? "rp-xl-note" : undefined}><Icon name="file-spreadsheet" size={20} /> <span class="rp-lbl">ส่งออก Excel</span></button>;


  return (
    <div class="rp-page pg">
      <PageHeader icon="chart-bar" title="รายงานสรุป" sub={<span>{cls?.name} · {subj?.name ?? "ทุกวิชา"} · {periodLabel}</span>}
        actions={<>
          {!phone && <TermPicker />}
          <button class="ghost rp-ibtn rp-hidebtn" aria-pressed={hide} onClick={() => setHide("reports", !hide)} aria-label={hide ? "ซ่อนชื่ออยู่ — แตะเพื่อแสดงชื่อ" : "ซ่อนชื่อนักเรียน"}><Icon name="eye-off" size={20} /> <span class="rp-lbl">{hide ? "ซ่อนชื่ออยู่" : "ซ่อนชื่อ"}</span></button>
          {phone
            ? <button class="ghost rp-ibtn" aria-haspopup="dialog" onClick={() => setSheet("more")} aria-label="เมนูเพิ่มเติม"><Icon name="dots-vertical" size={20} /></button>
            : <button class="ghost rp-ibtn" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={20} /> <span class="rp-lbl">ปรับการ์ด</span></button>}
        </>}
      />

      <div class="rp-alerts">
        <YearBanner note="รายงานและ Excel ตรงกับตอนนั้น" />
        {hide && (
          <div class="rp-warn" role="status"><Icon name="eye-off" size={20} /> <span class="grow"><b>ซ่อนชื่อนักเรียนอยู่</b> · แสดงเฉพาะเลขที่</span>
            <button onClick={() => setHide("reports", false)}>แสดงชื่อ</button></div>
        )}
        {payload?.range.termDatesMissing && (
          <div class="rp-warn" role="status">
            <Icon name="alert-triangle" size={20} /> <span class="grow">เทอมนี้ยังไม่ได้ตั้งช่วงวันที่ การนับเช็คชื่ออาจไม่ครบ</span>
            <button onClick={() => navigate("/settings", { section: "catalog" })}>ตั้งวันที่ภาคเรียน</button>
          </div>
        )}
        {!isOnline && model && (
          <div class="rp-warn" role="status"><Icon name="wifi-off" size={20} /> <span class="grow">ออฟไลน์อยู่ — แสดงรายงานที่โหลดไว้เมื่อ {clock} · คะแนนใหม่จะยังไม่ปรากฏ</span></div>
        )}
        {isOnline && refreshFailed && model && (
          <div class="rp-warn" role="status"><Icon name="cloud-off" size={20} /> <span class="grow">อัปเดตไม่สำเร็จ — ยังแสดงข้อมูลครั้งก่อน{clock ? ` (${clock})` : ""} · กดโหลดใหม่ได้</span></div>
        )}
      </div>

      {status === "loading" && !model && classId && (
        <div class="rp-skel" role="status" aria-busy="true"><span class="sr-only">กำลังโหลดรายงาน…</span><span class="rp-skmsg" aria-hidden="true">กำลังโหลด…</span><div class="rp-skhero" aria-hidden="true" /><div class="rp-skbody" aria-hidden="true" /></div>
      )}
      {!heroOff && model && (
        <ReportHero model={model} classId={classId} monthLabel={monthLabel} monthly={monthly} onFollow={openFollow} />
      )}

      <div class="rp-bar">
        <ClassChips items={classItems} value={classId} onPick={(id) => { setClassId(id); setDrawer(null); }} />
        {phone ? (
          <div class="rp-mob">
            <button class="ghost" aria-haspopup="dialog" onClick={() => setSheet("filters")}><Icon name="adjustments" size={20} /> ตัวกรอง ({filterCount})</button>
            <button class="ghost" aria-haspopup="dialog" onClick={() => setSheet("export")}>ส่งออก <Icon name="chevron-down" size={16} /></button>
          </div>
        ) : (
        <div class="rp-tb">
          {filtersJsx}
          <span class="rp-actions">{reloadBtn}{printBtn}{msg && <span class="hm-chip success" role="status">{msg}</span>}{pjBtn}{xlBtn}</span>
        </div>
        )}
      </div>

      {classId && (
        <div class="rp-status">
          {refreshing ? <span class="hm-chip muted"><Icon name="loader-2" size={16} class="spin" />กำลังอัปเดตรายงาน…</span>
            : isOnline && !refreshFailed && updatedAt ? <span class="hm-chip success" title="อัปเดตอัตโนมัติทุก 1 นาทีเมื่อเปิดหน้านี้"><Icon name="cloud-check" size={16} />ข้อมูลล่าสุด {clock}</span> : null}
          {!isOnline && <span class="rp-why">โหลดใหม่ได้เมื่อมีเน็ต</span>}
          {model && !empty && (
            <span class="rp-xl" id="rp-xl-note">
              <span class="rp-xl-scope"><Icon name="file-spreadsheet" size={16} /> ไฟล์ Excel: {cls?.name} · {subj?.name ?? "ทุกวิชา"} · {scopeText}</span>
              {hide && <span class="rp-xl-warn"><Icon name="alert-triangle" size={16} /> ไฟล์ Excel มีชื่อนักเรียน</span>}
            </span>
          )}
          {payload?.range.from && (
            <span class="rp-range"><Icon name="calendar-stats" size={16} /> ช่วงข้อมูล {rangeText(payload.range)} · งาน {payload.assignments.length} ชิ้น · เช็คชื่อ {payload.attendanceSessions.length} {payload.range.att === "subject" ? "คาบ" : "วัน"}
              {noUnassigned > 0 && <> · รวมงานที่ไม่ระบุวันมอบ {noUnassigned} งาน</>}
              {monthRangeBad && <> <button class="ghost" onClick={() => setPeriod("term")}>ดูทั้งเทอม</button></>}</span>
          )}
        </div>
      )}

      {!classId ? <NoClasses /> : status === "error" && !model ? (
        <LoadError onRetry={() => load()} text={!isOnline ? "ยังไม่เคยเปิดรายงานนี้ในเครื่องนี้ ต่อเน็ตแล้วลองใหม่" : "โหลดรายงานไม่สำเร็จ"} />
      ) : !model ? null : model.students.length === 0 ? (
        <div class="card"><EmptyState icon="users" text="ห้องนี้ยังไม่มีนักเรียน" action={<button class="primary" onClick={() => navigate("/students", { class: classId })}>ไปหน้านักเรียน</button>} /></div>
      ) : (
        <ReportBody
          cards={(max) => <ReportCards model={model} classId={classId} unitLabel={unitLabel} max={max} periodLabel={periodLabel} hide={hide} focusFollow={focusFollow} handled={handledFollow}
            onOpenStudent={setDrawer} onCopyLine={copyLine} onFullTerm={period === "month" ? () => setPeriod("term") : undefined} />}
          table={
          <section class="card rp-card rp-people" aria-labelledby="rp-people">
            <div class="row rp-people-head" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
              <h2 id="rp-people" style="font-size:1rem;display:flex;align-items:center;gap:6px"><Icon name="users" size={20} /> รายบุคคล</h2>
              {phone
                ? <button class="ghost" aria-haspopup="dialog" onClick={() => setSheet("sort")}>เรียงตาม {HEADS.find((h) => h.key === sort.key)?.name} <Icon name="chevron-down" size={16} /></button>
                : <span class="rp-tiphint">แตะหัวตารางเพื่อเรียง · แตะชื่อเพื่อดูรายละเอียด</span>}
            </div>
            <div class="rp-scroll">
            <table class="rp-table">
              <caption class="sr-only">รายบุคคล {cls?.name} {subj?.name ?? "ทุกวิชา"} {periodLabel}</caption>
              <colgroup><col style="width:2.6rem" /><col /><col style="width:4.4rem" /><col class="c-sc" style="width:6.8rem" /><col class="c-att" style="width:3.8rem" /></colgroup>
              <thead><tr>
                {th(HEADS[0])}
                <th scope="col"><span class="rp-thplain">ชื่อ</span></th>
                {th(HEADS[1])}{th(HEADS[2])}{th(HEADS[3])}
              </tr></thead>
              <tbody>
                {sorted.map((s) => {
                  const scorePct = scorePercent(s.score, s.fullScore);
                  const attPct = attendancePercent(s.attendance);
                  const nm = nameOf(s.student, fullName(s.student), hide);
                  const open = drawer === s.student.id;
                  return (
                    <tr key={s.student.id} class={open ? "sel" : ""} aria-current={open ? "true" : undefined} onClick={() => setDrawer(s.student.id)}>
                      <td class="muted">{s.student.number ?? "-"}</td>
                      <td class="name"><button type="button" class="rp-namebtn" data-rp-name={s.student.id} aria-label={`ดูข้อมูล ${nm}`} title={nm}>{nm}</button>
                        <span class="rp-sub">มา {attPct != null ? attPct + "%" : "—"} · สะสม {scorePct != null ? scorePct + "%" : "—"}</span></td>
                      <td class={"num" + (s.missing > 0 ? " bad" : "")}>{s.applicable > 0 ? <>{s.missing > 0 && <span role="img" aria-label={`ค้าง ${s.missing} งาน`}><Icon name="alert-triangle" size={14} /></span>}{s.submitted}/{s.applicable}</> : "—"}</td>
                      <td class="num c-sc">{scorePct != null ? <><span class="rp-mini"><i class={scorePct < 60 ? "f-mid" : "f-succ"} style={`width:${scorePct}%`} /></span>{scorePct}%</> : "—"}</td>
                      <td class="num c-att">{attPct != null ? attPct + "%" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <span class="sr-only" role="status" aria-live="polite">{sortNote}</span>
          </section>
          } />
      )}


      {phone && sheet === "filters" && <Drawer title="ตัวกรอง" onClose={() => setSheet(null)}><div class="rp-sheetbody">{filtersJsx}</div></Drawer>}
      {phone && sheet === "export" && (
        <Drawer title="ส่งออก" onClose={() => setSheet(null)}>
          <div class="rp-sheetbody">
            {model && !empty && <span class="rp-xl"><span class="rp-xl-scope"><Icon name="file-spreadsheet" size={16} /> ไฟล์ Excel: {cls?.name} · {subj?.name ?? "ทุกวิชา"} · {scopeText}</span>
              {hide && <span class="rp-xl-warn"><Icon name="alert-triangle" size={16} /> ไฟล์ Excel มีชื่อนักเรียน</span>}</span>}
            {pjBtn}{printBtn}{xlBtn}
          </div>
        </Drawer>
      )}
      {phone && sheet === "sort" && (
        <Drawer title="เรียงตาม" onClose={() => setSheet(null)}>
          <div class="rp-sheetbody">{HEADS.map((h) => (
            <button key={h.key} class={sort.key === h.key ? "primary" : "ghost"} aria-pressed={sort.key === h.key} onClick={() => { sortBy(h.key); setSheet(null); }}>{h.name}{sort.key === h.key ? (sort.dir === "asc" ? " · น้อยไปมาก" : " · มากไปน้อย") : ""}</button>
          ))}</div>
        </Drawer>
      )}
      {phone && sheet === "more" && (
        <Drawer title="เมนู" onClose={() => setSheet(null)}>
          <div class="rp-sheetbody"><TermPicker />{reloadBtn}<button class="ghost" onClick={() => { setSheet(null); setPrefsOpen(true); }}><Icon name="layout-grid" size={20} /> ปรับการ์ด</button></div>
        </Drawer>
      )}
      {followSheet && model && (
        <Drawer title={`ต้องติดตาม (${model.followUp.length} คน)`} onClose={() => setFollowSheet(false)}>
          {model.followUp.length === 0 ? <div class="page-sub">ส่งงานครบทุกคน</div> : <FollowRows model={model} hide={hide} onOpen={(id) => { setFollowSheet(false); setDrawer(id); }} />}
        </Drawer>
      )}
      {drawer && <StudentDrawer studentId={drawer} classId={classId} from="reports" hide={hide} onClose={closeDrawer} onEdit={(s) => { setDrawer(null); setEditStu(s); }}
        data={model && payload ? { model, payload } : undefined}
        scopeLabel={`${subj?.name ?? "ทุกวิชา"} · ${period === "month" ? monthLabel : "ทั้งเทอม"}`}
        onFullTerm={subjectId || period === "month" ? () => { setSubjectId(""); setPeriod("term"); } : undefined} />}
      {prefsOpen && <PageCardSettings page="reports" title="หน้ารายงาน" layout={reportsLayout.value} meta={REPORTS_CARD_META} locked={REPORTS_LOCKED} onClose={() => setPrefsOpen(false)} />}
      {projectorOn.value && model && !empty && (
        <ReportProjector model={model} className={cls?.name ?? ""} subjectName={subj?.name ?? "ทุกวิชา"} periodLabel={periodLabel} size={pjSize.value} unitLabel={unitLabel} />
      )}
      {editStu && <StudentModal student={editStu} classId={classId} onClose={() => setEditStu(null)} onSaved={() => { setEditStu(null); load(); }} />}
    </div>
  );
}
