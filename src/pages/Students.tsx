import { Dialog } from "../components/Dialog";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/home.css";
import "../styles/students.css";
import "../styles/stickers.css";
import "../styles/print.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Avatar, EmptyState, YearBanner, TermPicker, DateField } from "../components/ui";
import { useConfirm } from "../components/ConfirmDialog";
import { StudentsBody, MoveStudentDialog, LeaveDialog, sortRoster, loadStuSort, saveStuSort, nextStuSort, studentBody, SORT_LABEL, SORT_ORDER, type StuSort, type StuSortState, type StuFilter } from "../components/students/StudentParts";
import { visibleCards } from "../lib/cardLayout";
import { menuKeys, focusFirstItem } from "../lib/menuKeys";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { STUDENTS_CARD_META, STUDENTS_LOCKED, STUDENTS_PINNED } from "../components/cards/meta";
import { studentsLayout } from "../lib/pageCards";
import { StudentDrawer } from "../components/StudentDrawer";
import { StickerSheet } from "../components/StickerSheet";
import { activeClasses, viewClasses, rosterCount, classById, viewTerm, viewingPastYear, studentsByClass, students as allStudents, qrRotatedAt, loadBootstrap } from "../store";
import { rosterOf } from "@shared/roster";
import { computeReport, type ReportPayload, type StudentReport } from "../lib/report";
import { selectedTermId, startClass, rememberClass } from "../store";
import type { Student } from "@shared/types";
import { attendancePercent, averageAttendancePercent } from "@shared/metrics";
import { api } from "../lib/api";
import { swrPeek, swrFetch } from "../lib/swr";
import { fullName } from "../lib/names";
import { ok, withToast } from "../lib/notify";
import { routeParams, navigate } from "../router";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import { parseImport, fileToSheets, bestSheet, studentFormErrors, CODE_RULE_TEXT, REQUIRED_FIELDS_TEXT, type SheetText, type StudentFormErrors } from "../lib/importParse";

const STATUS_LABEL: Record<string, string> = { active: "กำลังเรียน", finished: "จบปีการศึกษา", moved: "ย้ายออก", inactive: "ไม่ใช้งาน" };

const HEAD_COLS: { by: StuSort; text: string; label: string; c?: boolean }[] = [
  { by: "number", text: "เลขที่", label: "เรียงตามเลขที่", c: true }, { by: "name", text: "ชื่อ - สกุล", label: "เรียงตามชื่อ" },
  { by: "submit", text: "ส่งงาน", label: "เรียงตามส่งงาน" }, { by: "missing", text: "ค้าง", label: "เรียงตามค้างส่ง", c: true }, { by: "att", text: "มาเรียน", label: "เรียงตามมาเรียน", c: true },
];

export function StudentsPage() {
  const params = routeParams();
  const [classId, setClassId] = useState(startClass(params.class, viewClasses.value));
  const [edit, setEdit] = useState<Student | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [printing, setPrinting] = useState<false | "all" | "rotated">(false);
  const [showFormer, setShowFormer] = useState(false);
  const [former, setFormer] = useState<Student[]>([]);
  const [formerFailed, setFormerFailed] = useState(false);
  const [drawer, setDrawer] = useState<string | null>(params.student || null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState("");
  const [sort, setSortState] = useState<StuSortState>(loadStuSort); // kept on this device
  const [filter, setFilter] = useState<StuFilter>("all");
  const [sortNote, setSortNote] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null); // the ⋮ of one row
  const [rowMenuUp, setRowMenuUp] = useState(false); // near the bottom of the screen the menu opens upwards
  const [moveFor, setMoveFor] = useState<Student | null>(null);
  const [leaveFor, setLeaveFor] = useState<Student | null>(null);
  const { ask, node: askNode } = useConfirm();
  const [reports, setReports] = useState<Map<string, StudentReport>>(new Map());
  const [statsStatus, setStatsStatus] = useState<LoadStatus>("loading");
  const begin = useLoadGuard();
  const wasPrinting = useRef(false);

  // this year: who is in the class today. An earlier year: that year's class as it was (children who finished
  // included) — read-only here, since the class was closed when the new year started
  const past = viewingPastYear.value;
  const active = past
    ? rosterOf(allStudents.value, classId, classById(classId)?.year, viewTerm.value)
    : studentsByClass.value.get(classId) ?? [];
  const cls = classById(classId);
  // the term changed: the class we were on may not exist in that year
  useEffect(() => { rememberClass(classId); setFilter("all"); }, [classId]);
  useEffect(() => {
    if (!viewClasses.value.some((c) => c.id === classId)) setClassId(viewClasses.value[0]?.id ?? "");
  }, [selectedTermId.value]);
  // back from the sticker sheet: focus goes back to the button that opened it
  useEffect(() => {
    if (!printing && wasPrinting.current) setTimeout(() => (document.getElementById("stu-print") ?? document.getElementById("stu-print-card"))?.focus(), 0);
    wasPrinting.current = !!printing;
  }, [printing]);
  const rotated = qrRotatedAt.value;
  const setSort = (v: StuSortState) => { setSortState(v); saveStuSort(v); };

  // per-student stats for this class (submit rate, attendance)
  async function loadStats() {
    if (!classId) { setStatsStatus("ready"); return; } // no class yet: nothing to load (don't spin forever)
    const fresh = begin();
    const q = new URLSearchParams({ class: classId });
    if (selectedTermId.value) q.set("term", selectedTermId.value);
    const url = `/api/reports/summary?${q}`;
    // the last answer for this exact class + term (shared with the Reports page) paints at once; an old one is renewed quietly
    const hit = swrPeek<ReportPayload>(url);
    if (hit) {
      setReports(new Map(computeReport(hit.data).students.map((s) => [s.student.id, s]))); setStatsStatus("ready");
      if (hit.fresh) return;
    } else {
      // the previous class's numbers must not sit under this class's names while loading or after a failure
      setReports(new Map()); setStatsStatus("loading");
    }
    try {
      const p = await swrFetch(url, () => api.get<ReportPayload>(url));
      if (!fresh()) return;
      const model = computeReport(p);
      setReports(new Map(model.students.map((s) => [s.student.id, s])));
      setStatsStatus("ready");
    } catch {
      if (fresh() && !hit) setStatsStatus("error");
    }
  }
  useEffect(() => { loadStats(); }, [classId, selectedTermId.value]);
  // the "moved out / not in use" list is read when it is on screen: asked for in the ⋮ menu, or the card is switched on
  const [formerTick, setFormerTick] = useState(0);
  const wantFormer = showFormer || (visibleCards(studentsLayout.value) as string[]).includes("moved");
  useEffect(() => {
    if (!wantFormer) { setFormer([]); setFormerFailed(false); return; }
    setFormerFailed(false);
    api.get<{ students: Student[] }>(`/api/students?class=${classId}&status=moved,inactive`).then((r) => setFormer(r.students)).catch(() => { setFormer([]); setFormerFailed(true); });
  }, [wantFormer, classId, formerTick]);
  async function reactivate(st: Student) {
    const done = await withToast(() => api.post("/api/students", studentBody(st, { status: "active", left_at: null })), "กลับมาใช้งานไม่สำเร็จ");
    if (done) { await loadBootstrap(); loadStats(); setFormerTick((t) => t + 1); ok(`${fullName(st)} กลับมาใช้งานแล้ว`); }
  }

  async function rotateClass() {
    setMenu(false);
    if (!(await ask({ title: `ออก QR ใหม่ทั้งห้อง ${cls?.name}?`, body: `ออกบัตรใหม่ให้ ${active.length} คน — บัตรเดิมของทุกคนจะใช้ไม่ได้ ต้องพิมพ์สติกเกอร์ใหม่`, yes: `ออก QR ใหม่ ${active.length} คน`, danger: true }))) return;
    setBusy("rotate");
    const done = await withToast(() => api.post(`/api/classes/${classId}/qr/rotate`), "ออก QR ใหม่ไม่สำเร็จ");
    if (done) { await loadBootstrap(); ok("ออก QR ใหม่ทั้งห้องแล้ว"); }
    setBusy("");
  }

  async function rotateOne(st: Student) {
    if (!(await ask({ title: `ออก QR ใหม่ให้ ${fullName(st)}?`, body: "บัตรเดิมของคนนี้จะใช้ไม่ได้ ต้องพิมพ์สติกเกอร์ใหม่", yes: "ออก QR ใหม่", danger: true }))) return;
    const done = await withToast(() => api.post(`/api/students/${st.id}/qr/rotate`), "ออก QR ใหม่ไม่สำเร็จ — บัตรเดิมยังใช้ได้อยู่");
    if (done) { await loadBootstrap(); ok(`ออก QR ใหม่ให้ ${fullName(st)} แล้ว`); }
  }
  // the ⋮ menu of a row: focus goes back to its button first, so a dialog opened from it returns there when it closes
  function closeRowMenu(id: string | null = rowMenu) {
    if (id) document.getElementById("stu-more-" + id)?.focus();
    setRowMenu(null);
  }
  const pickSort = (by: StuSort) => {
    const n = nextStuSort(sort, by);
    setSort(n);
    setSortNote(`เรียงตาม ${SORT_LABEL[by]}${n.flip ? " (กลับด้าน)" : ""}`);
  };

  if (printing) return <StickerSheet classId={classId} initialScope={printing} onClose={() => setPrinting(false)} />;

  const q = query.trim().toLowerCase();
  // the class number must match whole ("1" is child 1, not 10–19); the rest match any part
  const classNo = /^\d{1,2}$/.test(q); // one or two digits can only mean a class number
  const found = q ? active.filter((s) => (s.number != null && String(s.number) === q) || !classNo && [s.first_name, s.last_name, s.nickname, s.code, s.prefix].some((v) => (v ?? "").toLowerCase().includes(q))) : active;
  const withMissing = active.filter((s) => (reports.get(s.id)?.missing ?? 0) > 0).length;
  const byFilter = statsStatus !== "ready" || filter === "all" ? found : found.filter((s) => ((reports.get(s.id)?.missing ?? 0) > 0) === (filter === "missing"));
  const shown = sortRoster(byFilter, reports, sort.by, sort.flip);
  // two children on one class number: the number picks a child when the card is forgotten, so this must be fixed
  const dupNumbers = (() => {
    const by = new Map<number, Student[]>();
    for (const s of active) if (s.number != null) by.set(s.number, [...(by.get(s.number) ?? []), s]);
    return [...by.entries()].filter(([, kids]) => kids.length > 1).sort((a, b) => a[0] - b[0]);
  })();
  const avgAtt = averageAttendancePercent([...reports.values()].map((r) => r.attendance));
  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));
  const cardProps = { classId, active, statsReady: statsStatus === "ready", statsLoading: statsStatus === "loading", withMissing, avgAtt, past, former, formerFailed, showFormer: wantFormer, filter, onFilter: setFilter,
    onPrint: (sc: "all" | "rotated") => setPrinting(sc), onEdit: setEdit, onOpen: setDrawer, onReactivate: reactivate };

  return (
    <div class="stu-page pg">
      <PageHeader icon="id-badge-2" title="นักเรียน" sub={<span>{cls?.name} · {active.length} คน</span>}
        actions={<>
          <TermPicker />
          {!past && cls && <>
          <button class="stu-ibtn" onClick={() => setImporting(true)} aria-label="นำเข้า Excel"><Icon name="table-import" size={20} /> <span class="stu-lbl">นำเข้า Excel</span></button>
          <button class="primary stu-ibtn" onClick={() => setEdit("new")} aria-label="เพิ่มนักเรียน"><Icon name="user-plus" size={20} /> <span class="stu-lbl">เพิ่มนักเรียน</span></button>
          </>}
          <button class="ghost stu-ibtn" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={20} /> <span class="stu-lbl">ปรับการ์ด</span></button>
        </>}
      />

      <YearBanner note="เพิ่ม/นำเข้านักเรียนทำได้เฉพาะห้องของปีนี้" />
      <div class="stu-bar">
        <ClassChips items={classItems} value={classId} onPick={setClassId} />
        <div class="stu-tb">
          <div class="stu-search"><Icon name="search" size={20} class="muted" /><input aria-label="ค้นหานักเรียน" placeholder="ค้นหาชื่อ ชื่อเล่น รหัส หรือเลขที่" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} /></div>
          <label class="stu-sortsel"><Icon name="arrows-sort" size={20} /> เรียง:
            <select class="stu-sort" aria-label="เรียงรายชื่อ" value={sort.by} onInput={(e) => { const by = (e.target as HTMLSelectElement).value as StuSort; setSort({ by, flip: false }); setSortNote(`เรียงตาม ${SORT_LABEL[by]}`); }}>
              {SORT_ORDER.map((k) => <option value={k}>{SORT_LABEL[k]}</option>)}
            </select>
          </label>
          {!past && <button id="stu-print" onClick={() => setPrinting("all")}><Icon name="printer" size={20} /> พิมพ์สติกเกอร์ QR</button>}
          {!past && <div style="position:relative">
            <button class="icon" aria-label="เพิ่มเติม" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><Icon name="dots-vertical" size={20} /></button>
            {menu && (<>
              <div class="stu-backdrop" onClick={() => setMenu(false)} />
              <div class="stu-menu" role="menu" ref={focusFirstItem} onKeyDown={menuKeys(() => setMenu(false))}>
                <button role="menuitem" onClick={rotateClass} disabled={busy === "rotate"}><Icon name="refresh" size={20} /> ออก QR ใหม่ทั้งห้อง…</button>
                <button role="menuitem" onClick={() => { setMenu(false); setShowFormer((v) => !v); }}><Icon name="user-off" size={20} /> {showFormer ? "ซ่อน" : "แสดง"}คนที่ย้ายออก/ไม่ใช้งาน</button>
              </div>
            </>)}
          </div>}
        </div>
      </div>

      {dupNumbers.length > 0 && (
        <div class="imp-warn danger" style="margin:0" role="alert">
          <Icon name="alert-triangle" size={20} />
          <span>เลขที่ซ้ำในห้องนี้: {dupNumbers.map(([n, kids], i) => <span key={n}>{i > 0 ? " · " : ""}เลขที่ {n} (
            {kids.map((k, j) => <span key={k.id}>{j > 0 ? ", " : ""}<button type="button" class="lk" style="background:none;border:none;padding:0;min-height:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer" aria-label={`แก้ไข ${fullName(k)} (เลขที่ซ้ำ)`} onClick={() => setEdit(k)}>{k.first_name}</button></span>)}
            )</span>)} — แตะชื่อเพื่อแก้เลขที่ให้ไม่ซ้ำ ไม่เช่นนั้นสแกนด้วยเลขที่จะเลือกคนไม่ได้</span>
        </div>
      )}

      {statsStatus !== "ready" && (
        <div class="stu-stats">
          {statsStatus === "loading" ? (
            <span class="hm-chip muted"><Icon name="loader-2" size={16} class="spin" /> กำลังโหลดสถิติ…</span>
          ) : (
            <span class="hm-chip warning"><Icon name="cloud-off" size={16} /> โหลดสถิติไม่สำเร็จ{navigator.onLine ? "" : " (ออฟไลน์)"} <button class="lk" onClick={() => loadStats()}>ลองอีกครั้ง</button></span>
          )}
        </div>
      )}
      {filter !== "all" && statsStatus === "ready" && (
        <div class="stu-stats"><span class="hm-chip accent" role="status"><Icon name="filter" size={16} /> แสดง {shown.length} คน · {filter === "done" ? "ส่งงานครบ" : "มีงานค้าง"}</span><button class="ghost" onClick={() => setFilter("all")}>ล้าง</button></div>
      )}

      <StudentsBody {...cardProps} cards={!!cls} list={
      <div class={"card stu-listcard" + (rowMenu ? " menu-open" : "")}>
        <div class="stu-list-head">
          {HEAD_COLS.slice(0, 2).map((h, i) => (
            <Fragment key={h.by}>
              <span><button type="button" class={"stu-hbtn" + (h.c ? " c" : "") + (sort.by === h.by ? " on" : "")} aria-label={h.label} aria-pressed={sort.by === h.by} onClick={() => pickSort(h.by)}>{h.text}{sort.by === h.by && <Icon name={sort.flip ? "sort-descending" : "sort-ascending"} size={16} />}</button></span>
              {i === 0 && <span>รหัสนักเรียน</span>}
            </Fragment>
          ))}
          {HEAD_COLS.slice(2).map((h) => (
            <span><button type="button" class={"stu-hbtn" + (h.c ? " c" : "") + (sort.by === h.by ? " on" : "")} aria-label={h.label} aria-pressed={sort.by === h.by} onClick={() => pickSort(h.by)}>{h.text}{sort.by === h.by && <Icon name={sort.flip ? "sort-descending" : "sort-ascending"} size={16} />}</button></span>
          ))}
          <span />
        </div>
        {!cls ? (
          <EmptyState icon="school" text="ยังไม่มีห้องเรียน — สร้างห้องก่อน แล้วค่อยนำเข้านักเรียน" action={<button class="primary" onClick={() => navigate("/settings", { section: "catalog" })}><Icon name="settings" size={16} /> ไปที่ตั้งค่า › ห้องเรียน</button>} />
        ) : shown.length === 0 ? (
          <EmptyState icon="user-question" text={q ? "ไม่พบนักเรียนที่ค้นหา" : filter !== "all" ? "ไม่มีนักเรียนตามตัวกรองนี้" : "ยังไม่มีนักเรียนในห้องนี้"} action={q ? <button onClick={() => setQuery("")}><Icon name="x" size={16} /> ล้างคำค้น</button> : filter !== "all" ? <button onClick={() => setFilter("all")}>ล้างตัวกรอง</button> : !past && <span class="row" style="gap:8px;justify-content:center;flex-wrap:wrap"><button class="primary" onClick={() => setEdit("new")}><Icon name="user-plus" size={20} /> เพิ่มนักเรียน</button><button onClick={() => setImporting(true)}><Icon name="table-import" size={20} /> นำเข้า Excel</button></span>} />
        ) : shown.map((st, i) => {
          const r = reports.get(st.id);
          const attPct = r ? attendancePercent(r.attendance) : null;
          const submitPct = r ? r.percent : 0; // no stats yet ≠ "handed everything in"
          return (
            <div class="stu-rowwrap" key={st.id}>
            <button type="button" class={"stu-lrow" + (drawer === st.id ? " sel" : "")} aria-label={`ดูข้อมูล ${fullName(st)} เลขที่ ${st.number ?? i + 1}`} onClick={() => { if (rowMenu) setRowMenu(null); setDrawer(st.id); }}>
              <Avatar text={String(st.number ?? i + 1)} size={36} />
              <span class="code">{st.code}</span>
              <div class="who"><div class="name"><span class="nm" title={fullName(st)}>{fullName(st)}</span>{st.status !== "active" && <span class="chip">{STATUS_LABEL[st.status]}</span>}{rotated[st.id] && <span class="stu-qrnew"><Icon name="refresh" size={12} /> QR ใหม่</span>}</div>{st.nickname && <div class="page-sub">“{st.nickname}”</div>}<div class="page-sub stu-sub">รหัส {st.code} · ส่ง {r ? `${r.submitted}/${r.applicable}` : "—"} · มา {attPct != null ? attPct + "%" : "—"}</div></div>
              <span class="stu-stat sc num"><span class="stu-mini"><i style={`width:${submitPct}%${submitPct < 85 ? ";background:var(--fill-warning)" : ""}`} /></span><span>{r ? `${r.submitted}/${r.applicable}` : "—"}</span></span>
              <span class="stu-stat missing num">{r && r.missing > 0 ? <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)">{r.missing}</span> : <span class="muted">–</span>}</span>
              <span class="stu-stat att num">{attPct != null ? attPct + "%" : "—"}</span>
              <span />
            </button>
            {!past && (
              <>
                <button type="button" id={"stu-more-" + st.id} class="stu-more icon ghost" aria-label={`จัดการ ${fullName(st)}`} aria-haspopup="menu" aria-expanded={rowMenu === st.id} onClick={(e) => { setRowMenuUp(innerHeight - (e.currentTarget as HTMLElement).getBoundingClientRect().bottom < 230); setRowMenu(rowMenu === st.id ? null : st.id); }}><Icon name="dots-vertical" size={20} /></button>
                {rowMenu === st.id && (
                  <div class={"stu-rowmenu" + (rowMenuUp ? " up" : "")} role="menu" ref={focusFirstItem} onKeyDown={menuKeys(() => closeRowMenu(st.id))}>
                    <button role="menuitem" onClick={() => { closeRowMenu(st.id); setEdit(st); }}><Icon name="edit" size={20} /> แก้ไข</button>
                    <button role="menuitem" onClick={() => { closeRowMenu(st.id); void rotateOne(st); }}><Icon name="refresh" size={20} /> ออก QR ใหม่…</button>
                    <button role="menuitem" onClick={() => { closeRowMenu(st.id); setMoveFor(st); }}><Icon name="arrows-exchange" size={20} /> ย้ายห้อง…</button>
                    <button role="menuitem" onClick={() => { closeRowMenu(st.id); setLeaveFor(st); }} style="color:var(--text-danger)"><Icon name="user-off" size={20} /> ย้ายออก/ไม่ใช้งาน…</button>
                  </div>
                )}
              </>
            )}
            </div>
          );
        })}
      </div>
      } />
      {rowMenu && <div class="stu-backdrop" onClick={() => closeRowMenu()} />}
      <span class="sr-only" role="status" aria-live="polite">{sortNote}</span>

      {drawer && <StudentDrawer studentId={drawer} classId={classId} from="students" onClose={() => setDrawer(null)} onEdit={(s) => { setDrawer(null); setEdit(s); }} onRotate={past ? undefined : rotateOne} />}
      {edit && <StudentModal student={edit === "new" ? null : edit} classId={classId} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await loadBootstrap(); loadStats(); setFormerTick((t) => t + 1); }} />}
      {askNode}
      {prefsOpen && <PageCardSettings page="students" title="หน้านักเรียน" layout={studentsLayout.value} meta={STUDENTS_CARD_META} locked={STUDENTS_LOCKED} pinned={STUDENTS_PINNED} onClose={() => setPrefsOpen(false)} />}
      {moveFor && <MoveStudentDialog student={moveFor} fromClassId={classId} onClose={() => setMoveFor(null)} onDone={async () => { setMoveFor(null); await loadBootstrap(); loadStats(); ok("ย้ายห้องแล้ว"); }} />}
      {leaveFor && <LeaveDialog student={leaveFor} onClose={() => setLeaveFor(null)} onDone={async () => { setLeaveFor(null); await loadBootstrap(); loadStats(); setFormerTick((t) => t + 1); ok("บันทึกแล้ว"); }} />}
      {importing && <ImportModal classId={classId} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await loadBootstrap(); loadStats(); }} />}
    </div>
  );
}

export function StudentModal({ student, classId, onClose, onSaved }: { student: Student | null; classId: string; onClose: () => void; onSaved: () => void }) {
  const [prefix, setPrefix] = useState(student?.prefix ?? "ด.ช.");
  const [firstName, setFirstName] = useState(student?.first_name ?? "");
  const [lastName, setLastName] = useState(student?.last_name ?? "");
  const [nickname, setNickname] = useState(student?.nickname ?? "");
  const [code, setCode] = useState(student?.code ?? "");
  const [number, setNumber] = useState<number | "">(student?.number ?? "");
  const [status, setStatus] = useState(student?.status ?? "active");
  // the day they left (moved / inactive): a past term still counts them; empty = today
  const [leftAt, setLeftAt] = useState(student?.left_at ?? "");
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<StudentFormErrors>({});
  const [busy, setBusy] = useState(false);
  const { ask, node: askNode } = useConfirm();
  // the message under a field goes away as soon as that field is touched
  const touch = (k: keyof StudentFormErrors) => setFieldErr((f) => (f[k] ? { ...f, [k]: undefined } : f));
  const fieldProps = (k: keyof StudentFormErrors) => ({ id: "stu-f-" + k, "aria-invalid": fieldErr[k] ? true : undefined, "aria-describedby": fieldErr[k] ? "stu-e-" + k : undefined });
  const fieldMsg = (k: keyof StudentFormErrors) => fieldErr[k] ? <span id={"stu-e-" + k} role="alert" style="color:var(--text-danger);margin:2px 0 0">{fieldErr[k]}</span> : null;

  async function save() {
    setErr("");
    // checked here, before anything is sent: the server needs name, last name and code, and says so in its own words only as a last resort
    const found = studentFormErrors({ code, first_name: firstName, last_name: lastName, number }, student?.code);
    setFieldErr(found);
    const firstBad = (["code", "first_name", "last_name", "number"] as const).find((k) => found[k]);
    if (firstBad) {
      if (!code.trim() || !firstName.trim() || !lastName.trim()) setErr(REQUIRED_FIELDS_TEXT);
      setTimeout(() => document.getElementById("stu-f-" + firstBad)?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/students", {
        id: student?.id, code: code.trim(), prefix, first_name: firstName.trim(), last_name: lastName.trim(),
        nickname: nickname || null, class_id: classId, number: number === "" ? null : Number(number), status,
        ...((status === "moved" || status === "inactive") && leftAt ? { left_at: leftAt } : {}),
      });
      onSaved();
    } catch (e: any) { setErr(e.message || "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  // a refused or failed rotate must NOT look done: the old card would still be valid while the teacher believes it is revoked
  async function rotate() {
    if (!student) return;
    setErr("");
    if (!(await ask({ title: `ออก QR ใหม่ให้ ${fullName(student)}?`, body: "บัตรเดิมของคนนี้จะใช้ไม่ได้ ต้องพิมพ์สติกเกอร์ใหม่", yes: "ออก QR ใหม่", danger: true }))) return;
    try { await api.post(`/api/students/${student.id}/qr/rotate`); onSaved(); }
    catch (e: any) { setErr(e.message || "ออก QR ใหม่ไม่สำเร็จ — บัตรเดิมยังใช้ได้อยู่"); }
  }

  return (
    <div class="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <Dialog label="นักเรียน" onClose={onClose} dismissible={!busy} style="max-width:480px">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <h2 style="font-size:1.2rem">{student ? "แก้ไขนักเรียน" : "เพิ่มนักเรียน"}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose} disabled={busy}><Icon name="x" /></button>
        </div>
        <div class="modal-grid3">
          <label class="field"><span>คำนำหน้า</span>
            <select value={prefix} onInput={(e) => setPrefix((e.target as HTMLSelectElement).value)}><option>ด.ช.</option><option>ด.ญ.</option><option>นาย</option><option>น.ส.</option></select>
          </label>
          <label class="field" style="grid-column:span 2"><span>รหัสนักเรียน</span><input {...fieldProps("code")} aria-required="true" value={code} onInput={(e) => { setCode((e.target as HTMLInputElement).value); touch("code"); }} />{fieldMsg("code")}</label>
        </div>
        <div class="modal-grid2">
          <label class="field"><span>ชื่อ</span><input {...fieldProps("first_name")} aria-required="true" value={firstName} onInput={(e) => { setFirstName((e.target as HTMLInputElement).value); touch("first_name"); }} />{fieldMsg("first_name")}</label>
          <label class="field"><span>สกุล</span><input {...fieldProps("last_name")} aria-required="true" value={lastName} onInput={(e) => { setLastName((e.target as HTMLInputElement).value); touch("last_name"); }} />{fieldMsg("last_name")}</label>
        </div>
        <div class="modal-grid3">
          <label class="field"><span>ชื่อเล่น</span><input value={nickname} onInput={(e) => setNickname((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>เลขที่</span><input {...fieldProps("number")} type="number" value={number} onInput={(e) => { setNumber((e.target as HTMLInputElement).value === "" ? "" : Number((e.target as HTMLInputElement).value)); touch("number"); }} />{fieldMsg("number")}</label>
          <label class="field"><span>สถานะ</span>
            <select value={status} onInput={(e) => setStatus((e.target as HTMLSelectElement).value as Student["status"])}><option value="active">กำลังเรียน</option><option value="moved">ย้ายออก</option><option value="inactive">ไม่ใช้งาน</option>{student?.status === "finished" && <option value="finished">จบปีการศึกษา</option>}</select>
          </label>
        </div>
        {(status === "moved" || status === "inactive") && (
          <label class="field"><span>ออกเมื่อ (เว้นว่าง = วันนี้)</span>
            <DateField value={leftAt} onChange={setLeftAt} />
          </label>
        )}
        {student && <div class="page-sub" style="margin:6px 0">QR ปัจจุบัน: <span style="font-family:var(--font-mono)">{student.qr_token}</span></div>}
        {err && <div role="alert" style="color:var(--text-danger);font-size:var(--fs-sm);margin:6px 0">{err}</div>}
        <div class="row" style="justify-content:space-between;margin-top:10px">
          {student ? <button onClick={rotate}><Icon name="refresh" size={16} /> ออก QR ใหม่</button> : <span />}
          <div class="row" style="gap:8px">
            <button onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button class="primary" onClick={save} disabled={busy}>{busy ? <Icon name="loader-2" class="spin" /> : <Icon name="device-floppy" />} บันทึก</button>
          </div>
        </div>
      </Dialog>
      {askNode}
    </div>
  );
}

interface ImportPreview {
  rows: { code: string; action: "create" | "update" | "same" | "move" | "reactivate"; reactivates?: boolean; from?: { class_id: string | null; status: string; number: number | null; name: string } }[];
  summary: { create: number; update: number; same: number; move: number; reactivate: number };
  dupCodes: string[]; dupNumbers: number[];
  numberClashes: { number: number; code: string; name: string }[];
  classActive?: number; notInPaste?: number; // children already in the class / of them, not in this paste
  blockedMoves?: { studentId: string; code: string; fromClassId: string | null; toClassId: string | null; reason: "cross_year" | "has_history" }[];
}
const MAX_IMPORT = 200;

const ACTION_LABEL = {
  create: { text: "ใหม่", style: "background:var(--bg-success);color:var(--text-success)" },
  update: { text: "แก้ข้อมูล", style: "background:var(--bg-accent);color:var(--text-accent)" },
  same: { text: "เหมือนเดิม", style: "background:var(--surface-1);color:var(--text-secondary)" },
  move: { text: "ย้ายห้อง", style: "background:var(--bg-warning);color:var(--text-warning)" },
  reactivate: { text: "กลับมาใช้งาน", style: "background:var(--bg-warning);color:var(--text-warning)" },
} as const;

function ImportModal({ classId, onClose, onDone }: { classId: string; onClose: () => void; onDone: () => void }) {
  const [pasted, setPasted] = useState("");
  const [sheets, setSheets] = useState<SheetText[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [fileName, setFileName] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [over, setOver] = useState(false);
  const begin = useLoadGuard();

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setErr(""); setFileBusy(true); setFileName(file.name);
    try { const s = await fileToSheets(file); setSheets(s); setSheetIdx(bestSheet(s)); }
    catch (e: any) { setSheets([]); setErr(e?.message || "อ่านไฟล์ไม่ได้ — ลองบันทึกเป็น .xlsx หรือ .csv ใหม่"); }
    finally { setFileBusy(false); }
  }

  // each tab keeps its own text; the one on screen is what is read
  const text = tab === "file" ? (sheets[sheetIdx]?.text ?? "") : pasted;
  const { rows, skipped, noLastName, badNumber } = parseImport(text);
  const badNumberOf = new Map(badNumber.map((b) => [b.code, b.text]));
  const tooMany = rows.length > MAX_IMPORT;
  const cls = activeClasses.value.find((c) => c.id === classId);

  // Ask the server what this paste WOULD do (it matches by code and overwrites — including moving
  // a student into this class and reactivating them) before anything is written.
  useEffect(() => {
    setConfirmed(false);
    const fresh = begin();
    if (rows.length === 0 || tooMany) { setPreview(null); setPreviewState("idle"); return; }
    setPreviewState("loading");
    const t = setTimeout(() => {
      api.post<ImportPreview>("/api/students/import/preview", { class_id: classId, students: rows })
        .then((p) => { if (fresh()) { setPreview(p); setPreviewState("ready"); } })
        .catch(() => { if (fresh()) { setPreview(null); setPreviewState("error"); } });
    }, 400);
    return () => clearTimeout(t);
  }, [text, classId, previewAttempt]);

  const risky = preview ? preview.summary.move + preview.summary.reactivate : 0;
  // most of the class isn't in this list: probably a new year's children going into last year's class
  const oldClassWarn = !!preview && (preview.notInPaste ?? 0) >= 5 && (preview.notInPaste ?? 0) * 2 >= (preview.classActive ?? 0);
  // children who finished last year and are being brought into this class: their old-year history stays with the old class
  const returning = preview ? preview.rows.filter((r) => r.from?.status === "finished").length : 0;
  // a repeated code, or two children on one class number, can't be imported (it would put a mark on the wrong child)
  const blocked = !!preview && (preview.dupCodes.length > 0 || preview.dupNumbers.length > 0 || preview.numberClashes.length > 0 || !!preview.blockedMoves?.length);
  const canImport = !busy && rows.length > 0 && !tooMany && previewState === "ready" && !blocked && (risky === 0 || confirmed);

  async function doImport() {
    setErr("");
    if (rows.length === 0) return setErr("ไม่พบข้อมูลที่อ่านได้ — วางจาก Excel (คอลัมน์: รหัส, คำนำหน้า ชื่อ สกุล, เลขที่)");
    setBusy(true);
    try { await api.post("/api/students/import", { class_id: classId, students: rows }); onDone(); }
    catch (e: any) { setErr(e.message || "นำเข้าไม่สำเร็จ"); } finally { setBusy(false); }
  }

  const sum = preview?.summary;
  const tabKeys = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const n = tab === "file" ? "paste" : "file"; setTab(n); setTimeout(() => document.getElementById("imp-tab-" + n)?.focus(), 0); }
  };
  return (
    <div class="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <Dialog label="นำเข้านักเรียน" onClose={onClose} dismissible={!busy} style="max-width:600px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:1.2rem">นำเข้านักเรียน → {cls?.name}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose} disabled={busy}><Icon name="x" /></button>
        </div>
        <div class="imp-tabs" role="tablist" aria-label="วิธีนำเข้า" onKeyDown={tabKeys}>
          <button id="imp-tab-file" role="tab" aria-selected={tab === "file"} tabIndex={tab === "file" ? 0 : -1} onClick={() => setTab("file")}><Icon name="file-type-xls" size={16} /> ไฟล์ .xlsx / .csv</button>
          <button id="imp-tab-paste" role="tab" aria-selected={tab === "paste"} tabIndex={tab === "paste" ? 0 : -1} onClick={() => setTab("paste")}><Icon name="clipboard-text" size={16} /> วางข้อความ</button>
        </div>
        <div class="page-sub" style="margin:8px 0">คอลัมน์: รหัส | คำนำหน้า ชื่อ สกุล | เลขที่ · ต้องมีชื่อและสกุล · {CODE_RULE_TEXT} · รหัสที่มีอยู่แล้วจะถูกอัปเดต · ไฟล์ถูกอ่านในเครื่องนี้ ไม่ได้ส่งไปที่ไหน</div>
        {tab === "file" ? (
          <div role="tabpanel" aria-labelledby="imp-tab-file">
            <label class={"imp-drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); void pickFile(e.dataTransfer?.files?.[0]); }}>
              <Icon name="upload" size={24} />
              <b>{fileName || "แตะเลือกไฟล์ หรือลากมาวาง"}</b>
              <span class="page-sub">{fileName ? "แตะเพื่อเปลี่ยนไฟล์" : `.xlsx หรือ .csv · แถวแรกเป็นหัวตารางได้ · ไม่เกิน ${MAX_IMPORT} คน`}</span>
              <input type="file" aria-label="ไฟล์รายชื่อนักเรียน" accept=".xlsx,.csv,.txt,text/csv" onChange={(e) => { void pickFile((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ""; }} />
            </label>
            {fileBusy && <div class="page-sub" role="status"><Icon name="loader-2" size={16} class="spin" /> กำลังอ่านไฟล์…</div>}
            {!fileBusy && sheets.length > 1 && (
              <label class="imp-sheet">เลือกชีต
                <select aria-label="ชีตที่นำเข้า" value={String(sheetIdx)} onInput={(e) => setSheetIdx(Number((e.target as HTMLSelectElement).value))}>
                  {sheets.map((s, i) => <option value={String(i)}>{s.name || `ชีต ${i + 1}`}</option>)}
                </select>
              </label>
            )}
            {!fileBusy && fileName && sheets.length > 0 && <div class="page-sub" role="status">อ่านได้ {rows.length} รายการจาก {fileName}{sheets.length > 1 ? ` (ชีต “${sheets[sheetIdx]?.name}”)` : ""}{skipped.length > 0 ? ` · อ่านไม่ได้ ${skipped.length} บรรทัด` : ""}{noLastName.length > 0 ? ` · ไม่มีสกุล ${noLastName.length} แถว (ไม่นำเข้า)` : ""}</div>}
          </div>
        ) : (
          <div role="tabpanel" aria-labelledby="imp-tab-paste"><textarea aria-label="รายชื่อนักเรียนที่คัดลอกจาก Excel" rows={6} value={pasted} onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)} placeholder={"10501\tด.ช. ภูมิพัฒน์ ใจดี\t1\n10502\tด.ญ. ปุณยวีร์ แสงทอง\t2"} style="font-family:var(--font-mono);font-size:var(--fs-sm);min-height:8rem" /></div>
        )}

        {rows.length > 0 && (
          <div class="imp-sum">
            {previewState === "loading" && <span class="muted"><Icon name="loader-2" size={16} class="spin" /> กำลังตรวจกับข้อมูลในระบบ…</span>}
            {previewState === "error" && <span style="color:var(--text-warning)"><Icon name="cloud-off" size={16} /> ตรวจกับระบบไม่ได้{navigator.onLine ? "" : " (ออฟไลน์)"} <button onClick={() => setPreviewAttempt((n) => n + 1)}>ตรวจอีกครั้ง</button></span>}
            {sum && (<>
              <span class="chip" style={ACTION_LABEL.create.style}>เพิ่มใหม่ {sum.create}</span>
              <span class="chip" style={ACTION_LABEL.update.style}>แก้ข้อมูล {sum.update}</span>
              <span class="chip" style={ACTION_LABEL.same.style}>เหมือนเดิม {sum.same}</span>
              {sum.move > 0 && <span class="chip" style={ACTION_LABEL.move.style}>ย้ายห้อง {sum.move}</span>}
              {sum.reactivate > 0 && <span class="chip" style={ACTION_LABEL.reactivate.style}>กลับมาใช้งาน {sum.reactivate}</span>}
            </>)}
          </div>
        )}

        {tooMany && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={20} /> นำเข้าได้ครั้งละไม่เกิน {MAX_IMPORT} คน (วางมา {rows.length}) — แบ่งเป็นหลายรอบ</div>}
        {preview && preview.dupCodes.length > 0 && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={20} /> รหัสซ้ำในรายการ: {preview.dupCodes.join(", ")} — แก้ให้เหลือแถวเดียวต่อรหัสก่อนนำเข้า</div>}
        {preview && preview.dupNumbers.length > 0 && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={20} /> เลขที่ซ้ำกันในรายการ: {preview.dupNumbers.join(", ")} — แก้ให้ไม่ซ้ำก่อนนำเข้า (เลขที่ใช้เลือกนักเรียนตอนสแกน)</div>}
        {preview && preview.numberClashes.length > 0 && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={20} /> เลขที่ชนกับนักเรียนที่ไม่ได้อยู่ในรายการ: {preview.numberClashes.map((c) => `เลขที่ ${c.number} (${c.name})`).join(", ")} — แก้เลขที่ในรายการ หรือย้ายเลขที่ของคนเดิมก่อน</div>}
        {oldClassWarn && (
          <div class="imp-warn" role="status"><Icon name="alert-triangle" size={20} /> ห้องนี้ยังมีนักเรียนเดิม {preview!.notInPaste} คนที่ไม่อยู่ในรายการนี้ — ถ้านี่คือนักเรียนของปีการศึกษาใหม่ ให้ปิดหน้าต่างนี้แล้วใช้ “เริ่มภาคเรียนใหม่” (ตั้งค่า › ภาคเรียน) ก่อน จะได้ห้องว่างของปีใหม่ และรายงานปีที่แล้วไม่ปนกับเด็กชุดใหม่</div>
        )}
        {!!preview?.blockedMoves?.length && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={20} /> ย้ายไม่ได้ {preview.blockedMoves.length} คน: {preview.blockedMoves.map((m) => m.code).join(", ")} — มีประวัติเดิมหรือเป็นการย้ายข้ามปี เก็บนักเรียนไว้ในห้องเดิมเพื่อรักษารายงานย้อนหลัง</div>}
        {returning > 0 && !preview?.blockedMoves?.length && (
          <div class="imp-warn info" role="status"><Icon name="info-circle" size={20} /> {returning} คนเคยเรียนกับครูปีที่แล้ว (จบปีการศึกษา) — นำเข้าจะย้ายมาห้องนี้ และประวัติปีเก่าของคนเหล่านี้จะไม่แสดงในรายงานปีเก่าอีก</div>
        )}
        {skipped.length > 0 && <div class="imp-warn info" role="status"><Icon name="info-circle" size={20} /> อ่านไม่ได้ {skipped.length} บรรทัด (ต้องมีรหัส — {CODE_RULE_TEXT} — และชื่อ): {skipped.slice(0, 3).join(" ⏎ ")}{skipped.length > 3 ? " …" : ""}</div>}
        {noLastName.length > 0 && <div class="imp-warn" role="alert"><Icon name="alert-triangle" size={20} /> <span>ไม่มีสกุล {noLastName.length} แถว — แถวเหล่านี้จะไม่ถูกนำเข้า (ต้องมีสกุลเหมือนตอนเพิ่มทีละคน) เติมสกุลแล้วนำเข้าอีกครั้ง: {noLastName.slice(0, 3).join(" ⏎ ")}{noLastName.length > 3 ? " …" : ""}</span></div>}
        {badNumber.length > 0 && <div class="imp-warn" role="status"><Icon name="alert-triangle" size={20} /> <span>เลขที่ไม่ถูกต้อง {badNumber.length} แถว (ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป): {badNumber.slice(0, 5).map((b) => `${b.code} → “${b.text}”`).join(", ")}{badNumber.length > 5 ? " …" : ""} — จะเว้นเลขที่ไว้ว่าง แก้เลขที่ภายหลังได้</span></div>}

        {rows.length > 0 && (
          <div class="card imp-table">
            <div class="imp-trow head"><span>รหัส</span><span>ชื่อ</span><span>เลขที่</span><span class="res">ผล</span></div>
            {rows.slice(0, MAX_IMPORT).map((r, i) => {
              const pr = preview?.rows[i];
              const lab = pr ? ACTION_LABEL[pr.action] : null;
              return (
                <div class="imp-trow">
                  <span class="code">{r.code}</span>
                  <span style="min-width:0">{r.prefix} {r.first_name} {r.last_name}
                    {pr?.action === "move" && pr.from && <span class="page-sub"> · จาก {(classById(pr.from!.class_id)?.name ?? "ห้องอื่น")}{pr.reactivates ? " (และกลับมาใช้งาน)" : ""}</span>}
                    {pr?.action === "reactivate" && pr.from && <span class="page-sub"> · เดิมสถานะ {STATUS_LABEL[pr.from.status] ?? pr.from.status}</span>}
                  </span>
                  {badNumberOf.has(r.code) ? <span style="color:var(--text-warning)" title="เลขที่ไม่ถูกต้อง — จะเว้นว่าง"><Icon name="alert-triangle" size={16} /> {badNumberOf.get(r.code)}</span> : <span>{r.number ?? "-"}</span>}
                  <span class="res">{lab && <span class="chip" style={lab.style}>{lab.text}</span>}</span>
                </div>
              );
            })}
          </div>
        )}

        {risky > 0 && !blocked && (
          <label class="imp-confirm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed((e.target as HTMLInputElement).checked)} />
            <span>ตรวจแล้ว — ยอมรับการ<b style="font-weight:500">ย้ายห้อง {sum!.move} คน</b>{sum!.reactivate > 0 ? <> และ<b style="font-weight:500">เปลี่ยนสถานะกลับมาใช้งาน {sum!.reactivate} คน</b></> : null} (ข้อมูลเดิมของนักเรียนเหล่านี้จะถูกแก้)</span>
          </label>
        )}

        {err && <div role="alert" style="color:var(--text-danger);font-size:var(--fs-sm);margin-top:8px">{err}</div>}
        <div class="imp-foot">
          <span class="page-sub">อ่านได้ {rows.length} รายการ</span>
          <div class="row" style="gap:8px">
            <button class="ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button class="primary" onClick={doImport} disabled={!canImport}>{busy ? <Icon name="loader-2" class="spin" /> : <Icon name="table-import" />} นำเข้า {rows.length} คน</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
