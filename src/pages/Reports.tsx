import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/home.css";
import "../styles/report.css";
import { Icon } from "../components/Icon";
import { LoadError, TermPicker, YearBanner, PageHeader, ClassChips, Segmented, EmptyState, NoClasses } from "../components/ui";
import { ReportBody, ReportCards, ReportPrint, ReportProjector, rangeText, sortStudents, nextSort, sortAnnouncement, type SortState, type SortKey } from "../components/reports/ReportParts";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { REPORTS_CARD_META, REPORTS_LOCKED } from "../components/cards/meta";
import { reportsLayout } from "../lib/pageCards";
import { ProjectorButton } from "../components/Projector";
import { projectorOn, pjSize } from "../lib/projector";
import { navigate } from "../router";
import { StudentDrawer } from "../components/StudentDrawer";
import { viewClasses, activeSubjects, rosterCount, classById, workTypeById, selectedTermId, terms, UNASSIGNED, startClass, rememberClass } from "../store";
import { api } from "../lib/api";
import { swrPeek, swrFetch } from "../lib/swr";
import { ok, err } from "../lib/notify";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import { computeReport, followUpText, type ReportModel, type ReportPayload } from "../lib/report";
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
  const loading = useRef(false);
  const refresh = useRef(() => {});
  // "per period" belongs to one subject: with no subject picked it is per day (the button said period, the data said day)
  const attMode = subjectId ? att : "daily";

  async function load(background = false) {
    if (background && loading.current) return;
    const fresh = begin();
    if (!classId) { setStatus("ready"); setPayload(null); setModel(null); setUpdatedAt(null); loading.current = false; setRefreshing(false); return; }
    const q = new URLSearchParams({ class: classId });
    if (selectedTermId.value) q.set("term", selectedTermId.value);
    if (period === "month") q.set("month", month);
    if (subjectId) q.set("subject", subjectId);
    if (attMode === "subject") q.set("att", "subject");
    const url = `/api/reports/summary?${q}`;
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
  const termLabel = selectedTermId.value === UNASSIGNED ? "ยังไม่ระบุเทอม" : (term?.name ?? "ทั้งเทอม");
  const monthLabel = monthOptions().find((m) => m.value === month)?.label ?? month;
  const periodLabel = period === "term" ? termLabel : monthLabel;

  async function exportExcel() {
    if (!model || !payload) return;
    setMsg("กำลังสร้างไฟล์ Excel…");
    try {
      const { exportExcel } = await import("../lib/excel");
      await exportExcel(model, payload, {
        className: cls?.name ?? "", subjectName: subj?.name ?? "ทุกวิชา", periodLabel,
        workTypeName: (id) => workTypeById(id)?.name ?? "-", fullName,
      });
      setMsg(""); ok("ดาวน์โหลด Excel แล้ว");
    } catch { setMsg(""); err("สร้างไฟล์ Excel ไม่สำเร็จ — ลองอีกครั้ง"); }
  }
  async function copyLine(): Promise<boolean> {
    if (!model) return false;
    const lines = followUpText(model.followUp, `${cls?.name ?? ""} ${subj?.name ?? ""}`, formatThaiDateMs(Date.now()));
    try { await navigator.clipboard.writeText(lines); ok("คัดลอกไปวางใน LINE ได้เลย"); return true; }
    catch { err("คัดลอกไม่สำเร็จ"); return false; }
  }
  function sortBy(k: SortKey) { const n = nextSort(sort, k); setSort(n); setSortNote(sortAnnouncement(n)); }

  const unitLabel = model?.attendance.unit === "period" ? "คาบ" : "วัน";
  const sorted = model ? sortStudents(model.students, sort) : [];
  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));
  const clock = updatedAt ? formatThaiTimeMs(updatedAt) : "";
  // a sortable column head: the whole cell is the button; the arrow says which way (and "arrows" when it is not the sorted one)
  const th = (h: (typeof HEADS)[number]) => (
    <th scope="col" class={(h.key === "number" ? "" : "num ") + (h.key === "att" ? "c-att " : "") + (sort.key === h.key ? "on" : "")} aria-sort={sort.key === h.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" class="rp-sortbtn" onClick={() => sortBy(h.key)} aria-label={`เรียงตาม${h.name}`}>
        {h.short}<Icon name={sort.key === h.key ? (sort.dir === "asc" ? "sort-ascending" : "sort-descending") : "arrows-sort"} size={16} />
      </button>
    </th>
  );

  if (printing && model) {
    const termText = selectedTermId.value === UNASSIGNED ? "ยังไม่ระบุเทอม" : termPrintLabel(term?.name);
    return <ReportPrint model={model} payload={payload} className={cls?.name ?? ""} subjectName={subj?.name ?? "ทุกวิชา"} termLabel={termText}
      monthLabel={period === "month" ? monthLabel : null} updatedAt={updatedAt} sort={sort} onClose={() => setPrinting(false)} />;
  }

  return (
    <div class="rp-page pg">
      <PageHeader icon="chart-bar" title="รายงานสรุป" sub={<span>{cls?.name} · {subj?.name ?? "ทุกวิชา"} · {periodLabel}</span>}
        actions={<>
          <TermPicker />
          <button class="ghost rp-ibtn" onClick={() => load(true)} disabled={!classId || refreshing} aria-label="โหลดใหม่"><Icon name="refresh" size={20} class={refreshing ? "spin" : undefined} /> <span class="rp-lbl">โหลดใหม่</span></button>
          <button class="ghost rp-ibtn" onClick={() => setPrinting(true)} disabled={status !== "ready" || !model} aria-label="พิมพ์"><Icon name="printer" size={20} /> <span class="rp-lbl">พิมพ์</span></button>
          {msg && <span class="hm-chip success" role="status">{msg}</span>}
          <ProjectorButton />
          <button class="primary rp-ibtn" onClick={exportExcel} disabled={status !== "ready" || !model} aria-label="ส่งออก Excel"><Icon name="file-spreadsheet" size={20} /> <span class="rp-lbl">ส่งออก Excel</span></button>
          <button class="ghost rp-ibtn" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={20} /> <span class="rp-lbl">ปรับการ์ด</span></button>
        </>}
      />

      <YearBanner note="รายงานและ Excel ตรงกับตอนนั้น" />

      <div class="rp-bar">
        <ClassChips items={classItems} value={classId} onPick={(id) => { setClassId(id); setDrawer(null); }} />
        <div class="rp-tb">
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
          <span class="page-sub">เช็คชื่อ:</span>
          <Segmented label="แบบเช็คชื่อ" value={attMode} onChange={setAtt}
            options={[{ value: "daily", label: "รายวัน" }, { value: "subject", label: <span title={subjectId ? undefined : "เลือกวิชาก่อน"}>รายคาบ (วิชานี้)</span>, disabled: !subjectId }]} />
        </div>
      </div>

      {classId && (
        <div class="rp-status">
          {refreshing ? <span class="hm-chip muted"><Icon name="loader-2" size={16} class="spin" />กำลังอัปเดตรายงาน…</span>
            : refreshFailed ? <span class="hm-chip warning" role="status"><Icon name="cloud-off" size={16} />อัปเดตไม่สำเร็จ — ยังแสดงข้อมูลครั้งก่อน{clock ? ` (${clock})` : ""} · กดโหลดใหม่ได้</span>
            : updatedAt ? <span class="hm-chip success"><Icon name="cloud-check" size={16} />ข้อมูลล่าสุด {clock} · อัปเดตอัตโนมัติทุก 1 นาทีเมื่อเปิดหน้านี้</span> : null}
        </div>
      )}

      {payload?.range.termDatesMissing && (
        <div class="rp-warn" role="status">
          <Icon name="alert-triangle" size={20} /> <span class="grow">เทอมนี้ยังไม่ได้ตั้งช่วงวันที่ การนับเช็คชื่ออาจไม่ครบ</span>
          <button onClick={() => navigate("/settings", { section: "catalog" })}>ตั้งวันที่ภาคเรียน</button>
        </div>
      )}
      {payload?.range.from && (
        <div class="rp-range"><Icon name="calendar-stats" size={16} /> ช่วงข้อมูล {rangeText(payload.range)} · งาน {payload.assignments.length} ชิ้น · เช็คชื่อ {payload.attendanceSessions.length} {payload.range.att === "subject" ? "คาบ" : "วัน"}</div>
      )}

      {!classId ? <NoClasses /> : status === "error" ? (
        <LoadError onRetry={() => load()} />
      ) : !model ? (
        <div class="card" role="status"><div class="uc-empty"><div class="ei"><Icon name="loader-2" size={30} class="spin" /></div><div>กำลังโหลด…</div></div></div>
      ) : model.students.length === 0 ? (
        <div class="card"><EmptyState icon="users" text="ห้องนี้ยังไม่มีนักเรียน" action={<button class="primary" onClick={() => navigate("/students", { class: classId })}>ไปหน้านักเรียน</button>} /></div>
      ) : (
        <ReportBody
          cards={(max) => <ReportCards model={model} classId={classId} unitLabel={unitLabel} max={max} periodLabel={periodLabel} onOpenStudent={setDrawer} onCopyLine={copyLine} onFullTerm={period === "month" ? () => setPeriod("term") : undefined} />}
          table={
          <section class="card rp-card" aria-labelledby="rp-people">
            <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
              <h2 id="rp-people" style="font-size:1rem;display:flex;align-items:center;gap:6px"><Icon name="users" size={20} /> รายบุคคล</h2>
              <span class="rp-tiphint">แตะหัวตารางเพื่อเรียง · แตะชื่อเพื่อดูรายละเอียด</span>
            </div>
            <table class="rp-table">
              <caption class="sr-only">รายบุคคล {cls?.name} {subj?.name ?? "ทุกวิชา"} {periodLabel}</caption>
              <colgroup><col style="width:2.6rem" /><col /><col style="width:4.4rem" /><col style="width:6.8rem" /><col class="c-att" style="width:3.8rem" /></colgroup>
              <thead><tr>
                {th(HEADS[0])}
                <th scope="col"><span class="rp-thplain">ชื่อ</span></th>
                {th(HEADS[1])}{th(HEADS[2])}{th(HEADS[3])}
              </tr></thead>
              <tbody>
                {sorted.map((s) => {
                  const scorePct = scorePercent(s.score, s.fullScore);
                  const attPct = attendancePercent(s.attendance);
                  return (
                    <tr key={s.student.id} class={drawer === s.student.id ? "sel" : ""} onClick={() => setDrawer(s.student.id)}>
                      <td class="muted">{s.student.number ?? "-"}</td>
                      <td class="name"><button type="button" class="rp-namebtn" aria-label={`ดูข้อมูล ${fullName(s.student)}`} title={fullName(s.student)}>{fullName(s.student)}</button></td>
                      <td class={"num" + (s.missing > 0 ? " bad" : "")}>{s.submitted}/{s.applicable}</td>
                      <td class="num">{scorePct != null ? <><span class="rp-mini"><i class={scorePct < 60 ? "f-mid" : "f-succ"} style={`width:${scorePct}%`} /></span>{scorePct}%</> : "—"}</td>
                      <td class="num c-att">{attPct != null ? attPct + "%" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <span class="sr-only" role="status" aria-live="polite">{sortNote}</span>
          </section>
          } />
      )}

      {drawer && <StudentDrawer studentId={drawer} classId={classId} from="reports" onClose={() => setDrawer(null)} onEdit={(s) => { setDrawer(null); setEditStu(s); }}
        data={model && payload ? { model, payload } : undefined}
        scopeLabel={`${subj?.name ?? "ทุกวิชา"} · ${period === "month" ? monthLabel : "ทั้งเทอม"}`}
        onFullTerm={subjectId || period === "month" ? () => { setSubjectId(""); setPeriod("term"); } : undefined} />}
      {prefsOpen && <PageCardSettings page="reports" title="หน้ารายงาน" layout={reportsLayout.value} meta={REPORTS_CARD_META} locked={REPORTS_LOCKED} onClose={() => setPrefsOpen(false)} />}
      {projectorOn.value && model && model.students.length > 0 && (
        <ReportProjector model={model} className={cls?.name ?? ""} subjectName={subj?.name ?? "ทุกวิชา"} periodLabel={periodLabel} size={pjSize.value} unitLabel={unitLabel} />
      )}
      {editStu && <StudentModal student={editStu} classId={classId} onClose={() => setEditStu(null)} onSaved={() => { setEditStu(null); load(); }} />}
    </div>
  );
}
