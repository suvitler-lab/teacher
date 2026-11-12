import { Dialog } from "../components/Dialog";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/home.css";
import "../styles/students.css";
import "../styles/stickers.css";
import "../styles/print.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Avatar, EmptyState, YearBanner, TermPicker, Drawer } from "../components/ui";
import { useConfirm } from "../components/ConfirmDialog";
import { StudentsBody, rotatedIn, MoveStudentDialog, LeaveDialog, sortRoster, loadStuSort, saveStuSort, nextStuSort, studentBody, SORT_LABEL, SORT_ORDER, type StuSort, type StuSortState, type StuFilter } from "../components/students/StudentParts";
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
import { attendancePercent } from "@shared/metrics";
import { api } from "../lib/api";
import { hideSignal, setHide } from "../lib/hideNames";
import { projectorOn } from "../lib/projector";
import { online } from "../lib/outbox";
import { StudentsHero, StatsMeta } from "../components/students/StudentsHero";
import { StudentsProjector } from "../components/students/StudentsProjector";
import { searchRoster, searchAllRooms, heroNumbers, duplicateNumbers, withoutNumber, whoLabel } from "../components/students/studentsLogic";
import { swrPeek, swrFetch, swrClear } from "../lib/swr";
import { fullName } from "../lib/names";
import { formatThaiDate, formatThaiDateMs } from "../lib/dates";
import { ok, err, withToast } from "../lib/notify";
import { routeParams, navigate } from "../router";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import { downloadTemplate, isHeaderLine } from "../lib/importTemplate";
import { parseImport, fileToSheets, bestSheet, studentFormErrors, CODE_RULE_TEXT, REQUIRED_FIELDS_TEXT, type SheetText, type StudentFormErrors } from "../lib/importParse";

const STATUS_LABEL: Record<string, string> = { active: "กำลังเรียน", finished: "จบปีการศึกษา", moved: "ย้ายออก", inactive: "ไม่ใช้งาน" };

const HEAD_COLS: { by: StuSort; text: string; label: string; c?: boolean }[] = [
  { by: "number", text: "เลขที่", label: "เรียงตามเลขที่", c: true }, { by: "name", text: "ชื่อ - สกุล", label: "เรียงตามชื่อ" },
  { by: "submit", text: "ส่งงาน", label: "เรียงตามส่งงาน" }, { by: "missing", text: "ค้าง", label: "เรียงตามค้างส่ง", c: true }, { by: "att", text: "มาเรียน", label: "เรียงตามมาเรียน", c: true },
];

/** a phone-wide screen (AC-204): class chips / filter / sort / tabs live in a bottom sheet, the page actions in the ⋮ sheet */
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
  const [allRooms, setAllRooms] = useState(false); // "ค้นในทุกห้อง" (BR-46) — off while names are hidden / an earlier year
  const [tab, setTab] = useState<"active" | "former">("active");
  const [noNumOnly, setNoNumOnly] = useState(false);
  const [printWarn, setPrintWarn] = useState<null | "all" | "rotated">(null);
  const [payload, setPayload] = useState<ReportPayload | null>(null); // the drawer reads this: no second request (AC-183)
  const [announce, setAnnounce] = useState("");
  const [statsAt, setStatsAt] = useState<number | null>(null); // when the numbers on screen were read (a cached answer keeps its own time)
  const hide = hideSignal("students").value; // this page's own switch (per device, BR-50)
  const pj = projectorOn.value;
  const [menu, setMenu] = useState(false);
  const [qrMenu, setQrMenu] = useState(false);
  const [reactivateId, setReactivateId] = useState<string | null>(null); // the form was opened to fix a clashing number: saving brings the child back
  const phone = usePhone();
  const [sheet, setSheet] = useState<null | "more" | "filters">(null);
  const [busy, setBusy] = useState("");
  const [sort, setSortState] = useState<StuSortState>(loadStuSort); // kept on this device
  const [filter, setFilter] = useState<StuFilter>("all");
  const [sortNote, setSortNote] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null); // the ⋮ of one row
  const [rowSheet, setRowSheet] = useState<string | null>(null); // phone: the ⋮ of one row opens a bottom sheet instead of the small menu
  const [rowMenuUp, setRowMenuUp] = useState(false); // near the bottom of the screen the menu opens upwards
  const [clash, setClash] = useState<Student | null>(null); // came back to a number somebody else now holds
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
  // the address changed while this page stays mounted (e.g. [ไปห้องนี้] of "ค้นในทุกห้อง", or a link): follow it — room and drawer
  const linkClass = params.class, linkStudent = params.student;
  useEffect(() => {
    if (linkClass && linkClass !== classId && viewClasses.value.some((c) => c.id === linkClass)) { setClassId(linkClass); setQuery(""); setAllRooms(false); setTab("active"); }
    if (linkStudent) setDrawer(linkStudent);
  }, [linkClass, linkStudent]);
  useEffect(() => {
    if (!viewClasses.value.some((c) => c.id === classId)) setClassId(viewClasses.value[0]?.id ?? "");
  }, [selectedTermId.value]);
  // back from the sticker sheet: focus goes back to the button that opened it
  useEffect(() => {
    if (!printing && wasPrinting.current) setTimeout(() => (document.getElementById("stu-print") ?? document.getElementById("stu-print-card") ?? document.getElementById("stu-morebtn"))?.focus(), 0);
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
      setPayload(hit.data); setStatsAt(hit.at);
      setReports(new Map(computeReport(hit.data).students.map((s) => [s.student.id, s]))); setStatsStatus("ready");
      if (hit.fresh) return;
    } else {
      // the previous class's numbers must not sit under this class's names while loading or after a failure
      setReports(new Map()); setPayload(null); setStatsStatus("loading");
    }
    try {
      const p = await swrFetch(url, () => api.get<ReportPayload>(url));
      if (!fresh()) return;
      const model = computeReport(p);
      setPayload(p); setStatsAt(Date.now());
      setReports(new Map(model.students.map((s) => [s.student.id, s])));
      setStatsStatus("ready");
    } catch {
      if (fresh() && !hit) setStatsStatus("error");
    }
  }
  useEffect(() => { loadStats(); }, [classId, selectedTermId.value]);
  // the connection came back and the numbers had failed: read them again by themselves
  useEffect(() => { if (online.value && statsStatus === "error") loadStats(); }, [online.value]);
  // the "moved out / not in use" list is read when it is on screen: asked for in the ⋮ menu, or the card is switched on
  const [formerTick, setFormerTick] = useState(0);
  const wantFormer = true; // A24: read when the page opens, so the tab can say how many (n); a failure shows "—"
  useEffect(() => {
    if (!wantFormer) { setFormer([]); setFormerFailed(false); return; }
    setFormerFailed(false);
    api.get<{ students: Student[] }>(`/api/students?class=${classId}&status=moved,inactive`).then((r) => setFormer(r.students)).catch(() => { setFormer([]); setFormerFailed(true); });
  }, [wantFormer, classId, formerTick]);
  async function reactivate(st: Student) {
    const who = whoLabel(st, hide);
    if (!(await ask({ title: `ให้ ${who} กลับมาใช้งาน?`, body: `กลับเข้า ${classById(st.class_id ?? "")?.name ?? "ห้องเดิม"} เลขที่ ${st.number ?? "–"} · นับในสถิติและสแกนรับงานได้อีกครั้ง`, yes: "กลับมาใช้งาน" }))) return;
    try {
      await api.post("/api/students", studentBody(st, { status: "active", left_at: null }));
      await loadBootstrap(); loadStats(); setFormerTick((t) => t + 1); ok(`${who} กลับมาใช้งานแล้ว`);
    } catch (e: any) {
      if (e?.code === "number_taken") { setClash(st); return; } // ST-S14: the number was taken while they were away
      err("กลับมาใช้งานไม่สำเร็จ — ข้อมูลเดิมยังอยู่ ตรวจเน็ตแล้วลองอีกครั้ง");
    }
  }

  async function rotateClass() {
    setMenu(false);
    if (!(await ask({ title: `ออก QR ใหม่ทั้งห้อง ${cls?.name}?`, body: `ออกบัตรใหม่ให้ ${active.length} คน — บัตรเดิมของทุกคนจะใช้ไม่ได้ ต้องพิมพ์สติกเกอร์ใหม่`, yes: `ออก QR ใหม่ ${active.length} คน`, danger: true }))) return;
    setBusy("rotate");
    const done = await withToast(() => api.post(`/api/classes/${classId}/qr/rotate`), "ออก QR ใหม่ไม่สำเร็จ — บัตรเดิมยังใช้ได้อยู่");
    if (done) { await loadBootstrap(); ok("ออก QR ใหม่ทั้งห้องแล้ว"); }
    setBusy("");
  }

  async function rotateOne(st: Student) {
    if (!(await ask({ title: `ออก QR ใหม่ให้ ${whoLabel(st, hide)}?`, body: "บัตรเดิมของคนนี้จะใช้ไม่ได้ ต้องพิมพ์สติกเกอร์ใหม่", yes: "ออก QR ใหม่", danger: true }))) return;
    const done = await withToast(() => api.post(`/api/students/${st.id}/qr/rotate`), "ออก QR ใหม่ไม่สำเร็จ — บัตรเดิมยังใช้ได้อยู่");
    if (done) { await loadBootstrap(); ok(`ออก QR ใหม่ให้ ${whoLabel(st, hide)} แล้ว — พิมพ์สติกเกอร์ใหม่`); }
  }
  // the ⋮ menu of a row: focus goes back to its button first, so a dialog opened from it returns there when it closes
  function closeRowMenu(id: string | null = rowMenu) {
    if (id) document.getElementById("stu-more-" + id)?.focus();
    setRowMenu(null);
  }
  async function saveTemplate() {
    try { await downloadTemplate(); } catch { err("สร้างไฟล์ตัวอย่างไม่สำเร็จ — ลองอีกครั้ง"); }
  }
  // phone: the ⋮ of a row is a bottom sheet; closing it puts focus back on that ⋮ (R-5210)
  function closeRowSheet(id: string | null = rowSheet) {
    if (id) document.getElementById("stu-more-" + id)?.focus();
    setRowSheet(null);
  }
  const pickSort = (by: StuSort) => {
    const n = nextStuSort(sort, by);
    setSort(n);
    setSortNote(`เรียงตาม ${SORT_LABEL[by]}${n.flip ? " (กลับด้าน)" : ""}`);
  };

  if (printing) return <StickerSheet classId={classId} initialScope={printing} onClose={() => setPrinting(false)} />;

  const q = query.trim();
  const found = searchRoster(active, q, hide);
  const nums = heroNumbers(active, reports);
  const byFilter = statsStatus !== "ready" || filter === "all" ? found : found.filter((s) => ((reports.get(s.id)?.missing ?? 0) > 0) === (filter === "missing"));
  const shown = sortRoster(noNumOnly ? byFilter.filter((s) => s.number == null) : byFilter, reports, sort.by, sort.flip);
  const dupNumbers = duplicateNumbers(active);
  const noNumber = withoutNumber(active);
  const canAllRooms = !hide && !past && !!q;
  const otherRooms = allRooms && canAllRooms ? searchAllRooms(allStudents.value, activeClasses.value.map((c) => c.id), classId, q, hide) : [];
  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));
  const offline = !online.value; // follows the connection by itself (AC-200)
  const askPrint = (sc: "all" | "rotated") => { if (hide) setPrintWarn(sc); else setPrinting(sc); };
  const drawerData = payload ? { model: computeReport(payload), payload } : undefined;
  const cardProps = { classId, active, statsReady: statsStatus === "ready", statsLoading: statsStatus === "loading", withMissing: nums.withMissing, avgAtt: nums.avgAtt, past, former, formerFailed, showFormer, hide, onRetryFormer: () => setFormerTick((t) => t + 1), filter, onFilter: setFilter,
    onPrint: askPrint, onEdit: setEdit, onOpen: setDrawer, onReactivate: reactivate };
  // closing a bottom sheet: focus goes back to the button that opened it first, so a box opened from the sheet returns there too (R-5210)
  const leaveSheet = () => { document.getElementById(sheet === "filters" ? "stu-filterbtn" : "stu-morebtn")?.focus(); setSheet(null); };
  const toggleHide = () => { setHide("students", !hide); setAnnounce(hide ? "แสดงชื่อนักเรียนแล้ว" : "ซ่อนชื่อนักเรียนแล้ว"); };
  const activeFilters = (filter !== "all" ? 1 : 0) + (sort.by !== "number" || sort.flip ? 1 : 0) + (tab === "former" ? 1 : 0);
  const sortText = SORT_LABEL[sort.by] + (sort.flip ? " (กลับด้าน)" : "");

  return (
    <div class={"stu-page pg" + (phone ? " phone" : "")}>
      <PageHeader icon="id-badge-2" title="นักเรียน" sub={<span>{cls?.name} · {active.length} คน{viewTerm.value ? ` · ${viewTerm.value.name}` : ""}</span>}
        actions={phone ? <>
          <button class="ghost stu-ibtn stu-hidebtn" aria-pressed={hide} onClick={toggleHide} aria-label={hide ? "ซ่อนชื่ออยู่ — แตะเพื่อแสดงชื่อ" : "ซ่อนชื่อนักเรียน"}><Icon name="eye-off" size={20} /></button>
          <button id="stu-morebtn" class="ghost stu-ibtn" aria-label="เพิ่มเติม" aria-haspopup="dialog" onClick={() => setSheet("more")}><Icon name="dots-vertical" size={20} /></button>
        </> : <>
          <TermPicker />
          <button class="ghost stu-ibtn stu-hidebtn" aria-pressed={hide} onClick={toggleHide} aria-label={hide ? "ซ่อนชื่ออยู่ — แตะเพื่อแสดงชื่อ" : "ซ่อนชื่อนักเรียน"}><Icon name="eye-off" size={20} /> <span class="stu-lbl">{hide ? "ซ่อนชื่ออยู่" : "ซ่อนชื่อ"}</span></button>
          {!past && cls && <>
          <button class="stu-ibtn" onClick={() => setImporting(true)} disabled={offline || pj} title={pj ? "ปิดอยู่ตอนฉายจอ" : offline ? "ต้องออนไลน์" : undefined} aria-label="นำเข้า Excel"><Icon name="table-import" size={20} /> <span class="stu-lbl">นำเข้า Excel</span></button>
          <button class="primary stu-ibtn" onClick={() => setEdit("new")} disabled={pj} title={pj ? "ปิดอยู่ตอนฉายจอ" : undefined} aria-label="เพิ่มนักเรียน"><Icon name="user-plus" size={20} /> <span class="stu-lbl">เพิ่มนักเรียน</span></button>
          </>}
          <button class="ghost stu-ibtn" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={20} /> <span class="stu-lbl">ปรับการ์ด</span></button>
        </>}
      />

      <YearBanner note="เพิ่ม/นำเข้านักเรียนทำได้เฉพาะห้องของปีนี้" />
      {offline && <div class="stu-offline hm-chip warning" role="status"><Icon name="cloud-off" size={16} /> ออฟไลน์อยู่ — แสดงรายชื่อที่โหลดไว้ · เพิ่ม/แก้/ย้าย/นำเข้า/ออก QR ใหม่ทำได้เมื่อออนไลน์</div>}
      {hide && (
        <div class="stu-hidebanner" role="status"><Icon name="eye-off" size={20} /> <span>ซ่อนชื่อนักเรียนอยู่ · แสดงเฉพาะเลขที่</span>
          <button onClick={toggleHide}>แสดงชื่อ</button></div>
      )}
      {dupNumbers.length > 0 && !past && (
        <div class="imp-warn danger" style="margin:0" role="alert">
          <Icon name="alert-triangle" size={20} />
          <span>เลขที่ซ้ำในห้องนี้: {dupNumbers.map(([n, kids], i) => <span key={n}>{i > 0 ? " · " : ""}เลขที่ {n} (
            {hide ? `${kids.length} คน` : kids.map((k, j) => <span key={k.id}>{j > 0 ? ", " : ""}<button type="button" class="lk stu-lkbtn" aria-label={`แก้ไข ${fullName(k)} (เลขที่ซ้ำ)`} onClick={() => setEdit(k)}>{k.first_name}</button></span>)}
            )</span>)} — แตะชื่อเพื่อแก้เลขที่ให้ไม่ซ้ำ ไม่เช่นนั้นสแกนด้วยเลขที่จะเลือกคนไม่ได้</span>
        </div>
      )}
      {noNumber.length > 0 && !past && (
        <div class="imp-warn" style="margin:0" role="status">
          <Icon name="alert-triangle" size={20} />
          <span>ไม่มีเลขที่ {noNumber.length} คน — สแกนด้วยเลขที่ไม่ได้{" "}
            <button type="button" class="lk stu-lkbtn" onClick={() => setNoNumOnly((v) => !v)}>{noNumOnly ? "แสดงทุกคน" : "แสดงเฉพาะคนไม่มีเลขที่"}</button></span>
        </div>
      )}

      <StudentsHero n={nums} hasClass={!!cls} ready={statsStatus === "ready"} loading={statsStatus === "loading"} hide={hide} filter={filter} onFilter={setFilter} />
      {statsStatus === "loading" && <div class="stu-stats"><span class="hm-chip muted" role="status"><Icon name="loader-2" size={16} class="spin" /> กำลังโหลดสถิติ…</span></div>}
      {statsStatus === "error" && (
        <div class="stu-stats"><span class="hm-chip warning" role="status"><Icon name="cloud-off" size={16} /> โหลดสถิติไม่สำเร็จ{navigator.onLine ? "" : " (ออฟไลน์)"} · รายชื่อยังใช้ได้ ตัวเลขส่งงาน/มาเรียนจะกลับมาเมื่อโหลดได้ <button class="lk stu-lkbtn" onClick={() => loadStats()}>ลองอีกครั้ง</button></span></div>
      )}

      {phone ? (
        <div class="stu-bar stu-bar-phone">
          <div class="stu-search"><Icon name="search" size={20} class="muted" /><input aria-label="ค้นหานักเรียน" placeholder={hide ? "ค้นหาด้วยเลขที่" : "ค้นหาชื่อ รหัส หรือเลขที่"} value={query} onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setAllRooms(false); }} /></div>
          <button type="button" id="stu-filterbtn" class="stu-fbtn" aria-haspopup="dialog" onClick={() => setSheet("filters")}><Icon name="adjustments" size={20} /> ตัวกรอง{activeFilters > 0 ? ` (${activeFilters})` : ""}</button>
        </div>
      ) : (
      <div class="stu-bar">
        <ClassChips items={classItems} value={classId} onPick={setClassId} />
        <div class="stu-tb">
          <div class="stu-search"><Icon name="search" size={20} class="muted" /><input aria-label="ค้นหานักเรียน" placeholder={hide ? "ค้นหาด้วยเลขที่" : "ค้นหาชื่อ ชื่อเล่น รหัส หรือเลขที่"} value={query} onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setAllRooms(false); }} /></div>
          <label class="stu-sortsel"><Icon name="arrows-sort" size={20} /> เรียง:
            <select class="stu-sort" aria-label="เรียงรายชื่อ" value={sort.by} onInput={(e) => { const by = (e.target as HTMLSelectElement).value as StuSort; setSort({ by, flip: false }); setSortNote(`เรียงตาม ${SORT_LABEL[by]}`); }}>
              {SORT_ORDER.map((k) => <option value={k} disabled={(k === "submit" || k === "att") && statsStatus !== "ready"}>{SORT_LABEL[k]}</option>)}
            </select>
          </label>
          {!past && <div style="position:relative">
            <button id="stu-print" class="stu-printbtn" aria-label="บัตร QR" aria-haspopup="menu" aria-expanded={qrMenu} disabled={pj} title={pj ? "ปิดอยู่ตอนฉายจอ" : undefined} onClick={() => setQrMenu((v) => !v)}><Icon name="printer" size={20} /> <span class="stu-lbl">บัตร QR</span> <Icon name="chevron-down" size={16} /></button>
            {qrMenu && (<>
              <div class="stu-backdrop" onClick={() => setQrMenu(false)} />
              <div class="stu-menu" role="menu" ref={focusFirstItem} onKeyDown={menuKeys(() => { setQrMenu(false); document.getElementById("stu-print")?.focus(); })}>
                <button role="menuitem" onClick={() => { setQrMenu(false); askPrint("all"); }}><Icon name="printer" size={20} /> พิมพ์สติกเกอร์ทั้งห้อง · {active.length} คน</button>
                <button role="menuitem" disabled={rotatedIn(active, rotated).length === 0} onClick={() => { setQrMenu(false); askPrint("rotated"); }}><Icon name="printer" size={20} /> {rotatedIn(active, rotated).length === 0 ? "พิมพ์เฉพาะ QR ใหม่ · ยังไม่มี QR ใหม่ใน 60 วัน" : `พิมพ์เฉพาะ QR ใหม่ (${rotatedIn(active, rotated).length})`}</button>
                <button role="menuitem" onClick={() => { setQrMenu(false); void rotateClass(); }}><Icon name="refresh" size={20} /> ออก QR ใหม่ทั้งห้อง…</button>
              </div>
            </>)}
          </div>}
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
      )}
      {cls && <div class="stu-row2">
      {cls && <StatsMeta updatedAt={statsAt} onReload={() => { swrClear(); loadStats(); }} found={shown.length} total={active.length} sortText={sortText} />}
      {cls && !past && !phone && (
        <div class="stu-tabs" role="group" aria-label="สถานะนักเรียน">
          <button type="button" class="stu-tab" aria-pressed={tab === "active"} onClick={() => setTab("active")}>กำลังเรียน {active.length}</button>
          <button type="button" class="stu-tab" aria-pressed={tab === "former"} onClick={() => setTab("former")}>ย้ายออก/ไม่ใช้งาน {formerFailed ? "—" : former.length}</button>
        </div>
      )}
      </div>}
      {filter !== "all" && statsStatus === "ready" && (
        <div class="stu-stats"><span class="hm-chip accent" role="status"><Icon name="filter" size={16} /> แสดง {shown.length} คน · {filter === "done" ? "ส่งงานครบ" : "มีงานค้าง"}</span><button class="ghost" onClick={() => setFilter("all")}>ล้าง</button></div>
      )}

      <StudentsBody {...cardProps} cards={!!cls} list={
      tab === "former" && cls && !past ? (
        <div class="card stu-listcard">
          <div class="stu-lhead2"><b>ย้ายออก / ไม่ใช้งาน · {former.length} คน</b></div>
          {formerFailed ? <EmptyState icon="cloud-off" text="โหลดรายชื่อไม่สำเร็จ" action={<button onClick={() => setFormerTick((t) => t + 1)}>ลองอีกครั้ง</button>} />
            : former.length === 0 ? <EmptyState icon="user-off" text="ไม่มี — ยังไม่มีใครย้ายออกหรือเลิกใช้งานในห้องนี้" />
            : former.map((st) => (
              <div class="stu-former stu-frow" key={st.id}>
                <Avatar text={String(st.number ?? "–")} size={36} />
                <span class="grow"><span class="nm" title={whoLabel(st, hide)}>{whoLabel(st, hide)}</span> <span class="chip">{st.status === "moved" ? "ย้ายออก" : "ไม่ใช้งาน"}{st.left_at ? ` ${formatThaiDate(st.left_at)}` : ""}</span>
                  <span class="page-sub stu-sub2">ประวัติคะแนนและเช็คชื่อยังอยู่</span></span>
                <button onClick={() => setEdit(st)}><Icon name="edit" size={16} /> แก้ไข</button><button onClick={() => reactivate(st)}><Icon name="user-check" size={16} /> กลับมาใช้งาน</button>
              </div>
            ))}
        </div>
      ) : (
      <div class={"card stu-listcard" + (rowMenu ? " menu-open" : "")}>
        <div class="stu-lhead2"><b>รายชื่อ · {active.length} คน</b></div>
        <div class="stu-list-head">
          {HEAD_COLS.slice(0, 2).map((h, i) => (
            <Fragment key={h.by}>
              <span><button type="button" class={"stu-hbtn" + (h.c ? " c" : "") + (sort.by === h.by ? " on" : "")} aria-label={h.label} aria-pressed={sort.by === h.by} onClick={() => pickSort(h.by)}>{h.text}{sort.by === h.by && <Icon name={sort.flip ? "sort-descending" : "sort-ascending"} size={16} />}</button></span>
              {i === 0 && <span>รหัสนักเรียน</span>}
            </Fragment>
          ))}
          {HEAD_COLS.slice(2).map((h) => (
            <span><button type="button" class={"stu-hbtn" + (h.c ? " c" : "") + (sort.by === h.by ? " on" : "")} aria-label={h.label} aria-pressed={sort.by === h.by} disabled={(h.by === "submit" || h.by === "att") && statsStatus !== "ready"} onClick={() => pickSort(h.by)}>{h.text}{sort.by === h.by && <Icon name={sort.flip ? "sort-descending" : "sort-ascending"} size={16} />}</button></span>
          ))}
          <span />
        </div>
        {!cls ? (
          <EmptyState icon="school" text="ยังไม่มีห้องเรียน — สร้างห้องก่อน แล้วค่อยนำเข้านักเรียน" action={<button class="primary" onClick={() => navigate("/settings", { section: "catalog" })}><Icon name="settings" size={16} /> ไปที่ตั้งค่า › ห้องเรียน</button>} />
        ) : shown.length === 0 ? (
          <EmptyState icon="user-question" text={q ? "ไม่พบนักเรียนที่ค้นหา" : filter !== "all" || noNumOnly ? "ไม่มีนักเรียนตามตัวกรองนี้" : "ยังไม่มีนักเรียนในห้องนี้"}
            action={q ? <span class="col stu-nofound">
              <span class="page-sub">{hide ? "ตอนซ่อนชื่อค้นได้ด้วยเลขที่เท่านั้น" : "ลองค้นด้วยเลขที่หรือรหัส"}</span>
              <span class="row" style="gap:8px;flex-wrap:wrap;justify-content:center"><button onClick={() => { setQuery(""); setAllRooms(false); }}><Icon name="x" size={16} /> ล้างคำค้น</button>{canAllRooms && <button onClick={() => setAllRooms(true)}><Icon name="search" size={16} /> ค้นในทุกห้อง</button>}</span>
              {allRooms && canAllRooms && (otherRooms.length === 0 ? <span class="page-sub" role="status">ไม่พบในห้องอื่น</span> : (
                <span class="stu-allrooms" role="list" aria-label="ผลค้นในทุกห้อง">{otherRooms.map((st) => (
                  <span class="stu-allrow" role="listitem" key={st.id}><span class="grow">{fullName(st)} · {classById(st.class_id ?? "")?.name} · เลขที่ {st.number ?? "–"}</span>
                    <button onClick={() => navigate("/students", { class: st.class_id ?? "", student: st.id })}>ไปห้องนี้</button></span>))}</span>))}
            </span>
            : filter !== "all" || noNumOnly ? <button onClick={() => { setFilter("all"); setNoNumOnly(false); }}>ล้างตัวกรอง</button> : !past && <span class="row" style="gap:8px;justify-content:center;flex-wrap:wrap"><button class="primary" onClick={() => setEdit("new")}><Icon name="user-plus" size={20} /> เพิ่มนักเรียน</button><button onClick={() => setImporting(true)} disabled={offline || pj} title={pj ? "ปิดอยู่ตอนฉายจอ" : offline ? "ต้องออนไลน์" : undefined}><Icon name="table-import" size={20} /> นำเข้า Excel</button>
              {/* ST-S03 (P7): the sample file is built in the browser, so it works offline and while projecting */}
              <button class="stu-tplbtn stu-tplempty" onClick={() => void saveTemplate()}><Icon name="download" size={20} /> ดาวน์โหลดไฟล์ตัวอย่าง .xlsx</button></span>} />
        ) : shown.map((st) => {
          const r = reports.get(st.id);
          const attPct = r ? attendancePercent(r.attendance) : null;
          const submitPct = r ? r.percent : 0; // no stats yet ≠ "handed everything in"
          const who = whoLabel(st, hide);
          const statText = r ? `ส่งงาน ${r.submitted} จาก ${r.applicable}${r.missing > 0 ? ` ค้าง ${r.missing}` : ""} มาเรียน ${attPct != null ? attPct + " เปอร์เซ็นต์" : "ไม่มีข้อมูล"}` : "";
          return (
            <div class="stu-rowwrap" key={st.id}>
            <button type="button" class={"stu-lrow" + (drawer === st.id ? " sel" : "")} aria-current={drawer === st.id ? "true" : undefined}
              aria-label={(hide ? `ดูข้อมูล ${who} ${statText}` : `ดูข้อมูล ${who} ${st.number == null ? "ไม่มีเลขที่" : "เลขที่ " + st.number} ${statText}`).trim()}
              onClick={() => { if (rowMenu) setRowMenu(null); setDrawer(st.id); }}>
              <Avatar text={String(st.number ?? "–")} size={36} />
              <span class="code" aria-hidden={hide || undefined}>{hide ? "•••" : st.code}</span>
              <div class="who"><div class="name"><span class="nm" title={who}>{who}</span>{st.status !== "active" && <span class="chip">{STATUS_LABEL[st.status]}</span>}{rotated[st.id] && <span class="stu-qrnew"><Icon name="refresh" size={12} /> QR ใหม่</span>}{st.number == null && <span class="stu-qrnew warn"><Icon name="alert-triangle" size={12} /> ไม่มีเลขที่</span>}</div>{!hide && st.nickname && <div class="page-sub stu-nick" title={st.nickname}>“{st.nickname}”</div>}<div class="page-sub stu-sub">{hide ? "" : `รหัส ${st.code} · `}<span class="sx">ส่ง {r ? `${r.submitted}/${r.applicable}` : "—"} · </span>มา {attPct != null ? attPct + "%" : "—"}</div></div>
              <span class="stu-stat sc num"><span class="stu-mini"><i style={`width:${r ? submitPct : 0}%${submitPct < 85 ? ";background:var(--fill-warning)" : ""}`} /></span><span>{r ? `${r.submitted}/${r.applicable}` : "—"}</span></span>
              <span class="stu-stat missing num">{r && r.missing > 0 ? <span class="chip stu-bad"><Icon name="alert-triangle" size={14} /> ค้าง {r.missing}</span> : <span class="muted">{r ? "–" : "—"}</span>}</span>
              <span class="stu-stat att num">{attPct != null ? attPct + "%" : "—"}</span>
              <span />
            </button>
            {!past && (
              <>
                <button type="button" id={"stu-more-" + st.id} class="stu-more icon ghost" aria-label={`จัดการ ${who}`} aria-haspopup={phone ? "dialog" : "menu"} aria-expanded={phone ? rowSheet === st.id : rowMenu === st.id} onClick={(e) => { if (phone) { setRowSheet(st.id); return; } setRowMenuUp(innerHeight - (e.currentTarget as HTMLElement).getBoundingClientRect().bottom < 230); setRowMenu(rowMenu === st.id ? null : st.id); }}><Icon name="dots-vertical" size={20} /></button>
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
      )} />
      {rowMenu && <div class="stu-backdrop" onClick={() => closeRowMenu()} />}
      <span class="sr-only" role="status" aria-live="polite">{sortNote}</span>
      <span class="sr-only" role="status" aria-live="polite">{announce}</span>
      {printWarn && (
        <div class="modal-overlay"><Dialog label="หน้าพิมพ์แสดงชื่อจริง" onClose={() => setPrintWarn(null)}>
          <h2 style="font-size:1.2rem">หน้าพิมพ์แสดงชื่อจริง</h2>
          <p class="page-sub">ตอนนี้ซ่อนชื่ออยู่ แต่สติกเกอร์ QR ต้องมีชื่อเต็มของนักเรียน</p>
          <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button onClick={() => setPrintWarn(null)}>ยกเลิก</button><button class="primary" onClick={() => { const sc = printWarn; setPrintWarn(null); setPrinting(sc); }}>ไปหน้าพิมพ์</button></div>
        </Dialog></div>
      )}

      {drawer && <StudentDrawer studentId={drawer} classId={classId} from="students" hide={hide} readOnly={past} data={drawerData} onClose={() => setDrawer(null)}
        onEdit={(s) => { setDrawer(null); setEdit(s); }} onRotate={past ? undefined : rotateOne} onMove={past ? undefined : (s) => { setDrawer(null); setMoveFor(s); }} onLeave={past ? undefined : (s) => { setDrawer(null); setLeaveFor(s); }} />}
      {edit && <StudentModal student={edit === "new" ? null : edit} classId={classId} hide={hide} roster={active} reactivating={edit !== "new" && reactivateId === edit.id} onClose={() => { setEdit(null); setReactivateId(null); }} onSaved={async (saved) => { const isNew = edit === "new"; const back = !isNew && reactivateId === edit.id; setEdit(null); setReactivateId(null); await loadBootstrap(); loadStats(); setFormerTick((t) => t + 1);
        if (saved) ok(back ? `${hide ? `เลขที่ ${saved.number ?? "–"}` : saved.name} กลับมาใช้งานแล้ว` : !isNew ? "บันทึกแล้ว" : hide ? `เพิ่ม เลขที่ ${saved.number ?? "–"} แล้ว` : `เพิ่ม ${saved.name} แล้ว`); }} />}
      {askNode}
      {prefsOpen && <PageCardSettings page="students" title="หน้านักเรียน" layout={studentsLayout.value} meta={STUDENTS_CARD_META} locked={STUDENTS_LOCKED} pinned={STUDENTS_PINNED} onClose={() => setPrefsOpen(false)} />}
      {moveFor && <MoveStudentDialog student={moveFor} fromClassId={moveFor.class_id ?? classId} hide={hide} onClose={() => setMoveFor(null)} onDone={async () => { setMoveFor(null); await loadBootstrap(); loadStats(); ok("ย้ายห้องแล้ว"); }} />}
      {leaveFor && <LeaveDialog student={leaveFor} hide={hide} onClose={() => setLeaveFor(null)} onDone={async () => { const k = leaveFor; setLeaveFor(null); await loadBootstrap(); loadStats(); setFormerTick((t) => t + 1); ok(`${whoLabel(k, hide)} ย้ายออก/ไม่ใช้งานแล้ว`); }} />}
      {importing && <ImportModal classId={classId} hide={hide} onClose={() => setImporting(false)} onDone={async (msg) => { setImporting(false); await loadBootstrap(); loadStats(); setFormerTick((t) => t + 1); ok(msg); }} />}
      {clash && (
        <div class="modal-overlay"><Dialog role="alertdialog" label="เลขที่ชน" onClose={() => setClash(null)}>
          <h2 style="font-size:1.2rem">กลับมาใช้งานไม่ได้ — เลขที่ซ้ำ</h2>
          <p class="page-sub" role="alert">{hide ? `เลขที่ ${clash.number ?? "–"} ถูกใช้แล้ว` : `เลขที่ ${clash.number ?? "–"} มีคนอื่นใช้อยู่แล้ว`} — ใช้เลขอื่น หรือแก้เลขที่ของคนนั้นก่อน</p>
          <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button data-autofocus onClick={() => setClash(null)}>ปิด</button><button class="primary" onClick={() => { const k = clash; setClash(null); setReactivateId(k.id); setEdit(k); }}>แก้เลขที่</button></div>
        </Dialog></div>
      )}
      {phone && sheet === "more" && (
        <Drawer title="จัดการ" onClose={() => leaveSheet()}>
          <div class="stu-sheet">
            <div class="stu-sheet-row"><span>ภาคเรียน</span><TermPicker /></div>
            {!past && cls && <>
              <button onClick={() => { leaveSheet(); setImporting(true); }} disabled={offline || pj}><Icon name="table-import" size={20} /> นำเข้า Excel{offline ? " · ต้องออนไลน์" : ""}</button>
              <button onClick={() => { leaveSheet(); askPrint("all"); }} disabled={pj}><Icon name="printer" size={20} /> พิมพ์สติกเกอร์ทั้งห้อง · {active.length} คน</button>
              <button onClick={() => { leaveSheet(); askPrint("rotated"); }} disabled={pj || rotatedIn(active, rotated).length === 0}><Icon name="printer" size={20} /> {rotatedIn(active, rotated).length === 0 ? "พิมพ์เฉพาะ QR ใหม่ · ยังไม่มี QR ใหม่ใน 60 วัน" : `พิมพ์เฉพาะ QR ใหม่ (${rotatedIn(active, rotated).length})`}</button>
              <button onClick={() => { leaveSheet(); void rotateClass(); }} disabled={pj}><Icon name="refresh" size={20} /> ออก QR ใหม่ทั้งห้อง…</button>
            </>}
            <button onClick={() => { leaveSheet(); setPrefsOpen(true); }}><Icon name="layout-grid" size={20} /> ปรับการ์ด</button>
          </div>
        </Drawer>
      )}
      {phone && rowSheet && (() => {
        const st = active.find((s) => s.id === rowSheet);
        if (!st) return null;
        const who = whoLabel(st, hide);
        const off = offline || pj; // writes are off with no connection / while projecting (leave stays pressable offline: R-5211 answers with the failure text)
        const pick = (fn: () => void) => () => { closeRowSheet(st.id); fn(); };
        return (
          <Drawer title={`จัดการ ${who}`} label={`จัดการ ${who}`} onClose={() => closeRowSheet(st.id)}>
            <div class="stu-sheet" id="stu-rowsheet">
              <button data-autofocus onClick={pick(() => setDrawer(st.id))}><Icon name="user" size={20} /> ดูข้อมูล</button>
              <button onClick={pick(() => setEdit(st))} disabled={off}><Icon name="edit" size={20} /> แก้ไข{offline ? " · ต้องออนไลน์" : ""}</button>
              <button onClick={pick(() => setMoveFor(st))} disabled={off}><Icon name="arrows-exchange" size={20} /> ย้ายห้อง…{offline ? " · ต้องออนไลน์" : ""}</button>
              <button onClick={pick(() => void rotateOne(st))} disabled={off}><Icon name="refresh" size={20} /> ออกบัตร QR ใหม่…{offline ? " · ต้องออนไลน์" : ""}</button>
              <button onClick={pick(() => setLeaveFor(st))} disabled={pj} style="color:var(--text-danger)"><Icon name="user-off" size={20} /> ย้ายออก/ไม่ใช้งาน…</button>
            </div>
          </Drawer>
        );
      })()}
      {phone && sheet === "filters" && (
        <Drawer title="ตัวกรอง" onClose={() => leaveSheet()}>
          <div class="stu-sheet">
            <div class="stu-sheet-h">ห้อง</div>
            <ClassChips items={classItems} value={classId} onPick={(id) => { setClassId(id); setTab("active"); }} />
            <div class="stu-sheet-h">ส่งงาน</div>
            <div class="stu-sheet-seg" role="group" aria-label="กรองตามการส่งงาน">
              {([["all", "ทั้งหมด"], ["done", "ส่งงานครบ"], ["missing", "มีงานค้าง"]] as const).map(([k, t]) => (
                <button type="button" aria-pressed={filter === k} class={filter === k ? "primary" : ""} disabled={k !== "all" && statsStatus !== "ready"} onClick={() => setFilter(k)}>{t}</button>))}
            </div>
            <label class="stu-sheet-h" for="stu-sheet-sort">เรียง</label>
            <select id="stu-sheet-sort" class="stu-sort" aria-label="เรียงรายชื่อ" value={sort.by} onInput={(e) => { const by = (e.target as HTMLSelectElement).value as StuSort; setSort({ by, flip: false }); setSortNote(`เรียงตาม ${SORT_LABEL[by]}`); }}>
              {SORT_ORDER.map((k) => <option value={k} disabled={(k === "submit" || k === "att") && statsStatus !== "ready"}>{SORT_LABEL[k]}</option>)}
            </select>
            {!past && cls && <>
              <div class="stu-sheet-h">สถานะ</div>
              <div class="stu-sheet-seg" role="group" aria-label="สถานะนักเรียน">
                <button type="button" aria-pressed={tab === "active"} class={tab === "active" ? "primary" : ""} onClick={() => setTab("active")}>กำลังเรียน {active.length}</button>
                <button type="button" aria-pressed={tab === "former"} class={tab === "former" ? "primary" : ""} onClick={() => setTab("former")}>ย้ายออก/ไม่ใช้งาน {formerFailed ? "—" : former.length}</button>
              </div>
            </>}
            <button class="primary stu-sheet-go" onClick={() => leaveSheet()}>ดูผล {tab === "former" ? former.length : shown.length} คน</button>
          </div>
        </Drawer>
      )}
      {phone && !past && cls && !pj && !sheet && !rowSheet && !edit && (
        <button type="button" class="primary stu-fab" aria-label="เพิ่มนักเรียน" onClick={() => setEdit("new")}><Icon name="user-plus" size={24} /></button>
      )}
      {pj && cls && <StudentsProjector className={cls.name} n={nums} ready={statsStatus === "ready"} />}
    </div>
  );
}

const PREFIX_CHOICES = ["ไม่ระบุ", "ด.ช.", "ด.ญ.", "นาย", "น.ส."];

export function StudentModal({ student, classId, hide = false, roster: pageRoster = [], reactivating = false, onClose, onSaved }: { student: Student | null; classId: string; hide?: boolean; roster?: Student[]; reactivating?: boolean; onClose: () => void; onSaved: (saved?: { name: string; number: number | null }) => void }) {
  // a new child starts at "ไม่ระบุ" (sent as null, G-S4) · an old child with no prefix stays without one
  const initPrefix = student?.prefix || "ไม่ระบุ";
  const [prefix, setPrefix] = useState(initPrefix);
  const [firstName, setFirstName] = useState(student?.first_name ?? "");
  const [lastName, setLastName] = useState(student?.last_name ?? "");
  const [nickname, setNickname] = useState(student?.nickname ?? "");
  const [code, setCode] = useState(student?.code ?? "");
  const [number, setNumber] = useState<number | "">(student?.number ?? "");
  const [err, setErr] = useState("");
  const [note, setNote] = useState(""); // "ออก QR ใหม่แล้ว" (the form stays open)
  const [fieldErr, setFieldErr] = useState<StudentFormErrors>({});
  const [busy, setBusy] = useState(false);
  const { ask, node: askNode } = useConfirm();
  // the child's OWN class (a child opened from "ทุกห้อง" may sit in another room): never move them by saving (R-5201)
  const cid = student?.class_id ?? classId;
  const roster = cid === classId ? pageRoster : studentsByClass.value.get(cid) ?? [];
  const status = reactivating ? "active" : student?.status ?? "active";
  const dirty = prefix !== initPrefix || firstName !== (student?.first_name ?? "") || lastName !== (student?.last_name ?? "") || nickname !== (student?.nickname ?? "")
    || code !== (student?.code ?? "") || number !== (student?.number ?? "");
  // the message under a field goes away as soon as that field is touched
  const touch = (k: keyof StudentFormErrors) => setFieldErr((f) => (f[k] ? { ...f, [k]: undefined } : f));
  const fieldProps = (k: keyof StudentFormErrors, extra = "") => ({ id: "stu-f-" + k, "aria-invalid": fieldErr[k] ? true : undefined, "aria-describedby": ((fieldErr[k] ? "stu-e-" + k + " " : "") + extra).trim() || undefined });
  const fieldMsg = (k: keyof StudentFormErrors) => fieldErr[k] ? <span id={"stu-e-" + k} role="alert" style="color:var(--text-danger);margin:2px 0 0">{fieldErr[k]}</span> : null;

  // BR-45: the next number = the highest of the others in the class + 1; a number two children share is refused before it is sent
  const others = roster.filter((r) => r.id !== student?.id && r.status === "active");
  const nextNumber = others.reduce((m, r) => Math.max(m, r.number ?? 0), 0) + 1;
  const numN = number === "" ? null : Number(number);
  const holder = status === "active" && numN != null && Number.isInteger(numN) && numN >= 1 ? others.find((r) => r.number === numN) : undefined;
  const dupMsg = holder ? (hide ? `เลขที่ ${numN} ถูกใช้แล้ว` : `เลขที่ ${numN} มี${holder.first_name} ${holder.last_name}อยู่แล้ว — ใช้เลขอื่น หรือแก้เลขที่ของคนนั้นก่อน`) : "";

  async function requestClose() {
    if (busy) return;
    if (!dirty) return onClose();
    if (await ask({ title: "ยังไม่ได้บันทึก", body: "ปิดแล้วข้อมูลที่แก้จะหายไป", yes: "ปิดโดยไม่บันทึก", no: "กลับไปแก้" })) onClose();
  }

  async function save() {
    if (busy) return;
    setErr(""); setNote("");
    // checked here, before anything is sent: the server needs name, last name and code, and says so in its own words only as a last resort
    const found = studentFormErrors({ code, first_name: firstName, last_name: lastName, number }, student?.code);
    setFieldErr(found);
    const firstBad = (["code", "first_name", "last_name", "number"] as const).find((k) => found[k]);
    if (firstBad) {
      if (!code.trim() || !firstName.trim() || !lastName.trim()) setErr(REQUIRED_FIELDS_TEXT);
      setTimeout(() => document.getElementById("stu-f-" + firstBad)?.focus(), 0);
      return;
    }
    if (holder) { setTimeout(() => document.getElementById("stu-f-number")?.focus(), 0); return; }
    setBusy(true);
    try {
      await api.post("/api/students", {
        id: student?.id, code: code.trim(), prefix: prefix === "ไม่ระบุ" ? null : prefix, first_name: firstName.trim(), last_name: lastName.trim(),
        nickname: nickname || null, class_id: cid, number: number === "" ? null : Number(number), status,
        ...(reactivating ? { left_at: null } : {}),
      });
      onSaved({ name: `${firstName.trim()} ${lastName.trim()}`, number: number === "" ? null : Number(number) });
    } catch (e: any) {
      if (e?.code === "code_taken") { setFieldErr({ code: "รหัสนี้มีอยู่แล้ว" }); setTimeout(() => document.getElementById("stu-f-code")?.focus(), 0); }
      else if (e?.code === "number_taken") { setFieldErr({ number: hide || !e.message ? `เลขที่ ${numN ?? ""} ถูกใช้แล้ว`.replace("  ", " ") : e.message }); setTimeout(() => document.getElementById("stu-f-number")?.focus(), 0); }
      else setErr("บันทึกไม่สำเร็จ — ข้อมูลเดิมยังอยู่ ตรวจเน็ตแล้วลองอีกครั้ง"); // the list is untouched, the typed values stay (ST-S10)
    } finally { setBusy(false); }
  }
  // a refused or failed rotate must NOT look done: the old card would still be valid while the teacher believes it is revoked.
  // Success leaves the form open with what was typed (G-S3).
  async function rotate() {
    if (!student || busy) return;
    setErr(""); setNote("");
    if (!(await ask({ title: `ออก QR ใหม่ให้ ${fullName(student)}?`, body: "บัตรเดิมของคนนี้จะใช้ไม่ได้ ต้องพิมพ์สติกเกอร์ใหม่", yes: "ออก QR ใหม่", danger: true }))) return;
    setBusy(true);
    try { await api.post(`/api/students/${student.id}/qr/rotate`); await loadBootstrap(); setNote("ออก QR ใหม่แล้ว — พิมพ์สติกเกอร์ใหม่"); }
    catch { setErr("ออก QR ใหม่ไม่สำเร็จ — บัตรเดิมยังใช้ได้อยู่"); }
    finally { setBusy(false); }
  }
  const t = student ? qrRotatedAt.value[student.id] : undefined;
  const qrText = !student ? "" : t ? (`ออกใหม่ล่าสุด ${formatThaiDateMs(t)}`) : "ยังไม่เคยออกใหม่";

  return (
    <div class="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) void requestClose(); }}>
      <Dialog label="นักเรียน" onClose={() => void requestClose()} dismissible={!busy} style="max-width:480px">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <h2 style="font-size:1.2rem">{student ? "แก้ไขนักเรียน" : "เพิ่มนักเรียน"}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={() => void requestClose()} disabled={busy}><Icon name="x" /></button>
        </div>
        {hide && <div class="imp-warn info" role="status"><Icon name="eye-off" size={20} /> หน้าต่างนี้แสดงชื่อจริง (หน้ารายชื่อซ่อนชื่ออยู่)</div>}
        <div class="modal-grid3">
          <label class="field"><span>คำนำหน้า</span>
            <select value={prefix} onInput={(e) => setPrefix((e.target as HTMLSelectElement).value)}>{PREFIX_CHOICES.map((p) => <option>{p}</option>)}{!PREFIX_CHOICES.includes(initPrefix) && <option>{initPrefix}</option>}</select>
          </label>
          <label class="field" style="grid-column:span 2"><span>รหัสนักเรียน</span><input data-autofocus {...fieldProps("code", "stu-h-code")} aria-required="true" value={code} onInput={(e) => { setCode((e.target as HTMLInputElement).value); touch("code"); }} />
            <span id="stu-h-code" class="page-sub">3–30 ตัว ตัวเลขหรือตัวอักษรอังกฤษ</span>{fieldMsg("code")}</label>
        </div>
        <div class="modal-grid2">
          <label class="field"><span>ชื่อ</span><input {...fieldProps("first_name")} aria-required="true" value={firstName} onInput={(e) => { setFirstName((e.target as HTMLInputElement).value); touch("first_name"); }} />{fieldMsg("first_name")}</label>
          <label class="field"><span>สกุล</span><input {...fieldProps("last_name")} aria-required="true" value={lastName} onInput={(e) => { setLastName((e.target as HTMLInputElement).value); touch("last_name"); }} />{fieldMsg("last_name")}</label>
        </div>
        <div class="modal-grid2">
          <label class="field"><span>ชื่อเล่น</span><input value={nickname} onInput={(e) => setNickname((e.target as HTMLInputElement).value)} /></label>
          <div class="field"><span>ห้อง</span><div class="stu-roomtext">{classById(cid)?.name ?? "-"}</div></div>
        </div>
        <div class="field">
          <label for="stu-f-number"><span>เลขที่</span></label>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <input {...fieldProps("number", "stu-h-number")} aria-invalid={fieldErr.number || dupMsg ? true : undefined} type="number" value={number} style="max-width:9rem" onInput={(e) => { setNumber((e.target as HTMLInputElement).value === "" ? "" : Number((e.target as HTMLInputElement).value)); touch("number"); }} />
            {numN !== nextNumber && <button type="button" onClick={() => { setNumber(nextNumber); touch("number"); }}>ใช้เลขที่ถัดไป ({nextNumber})</button>}
          </div>
          {number === "" && <span id="stu-h-number" class="page-sub">เว้นว่างได้ แต่สแกนด้วยเลขที่จะเลือกคนนี้ไม่ได้</span>}
          {fieldMsg("number")}
          {dupMsg && !fieldErr.number && <span id="stu-e-dup" role="alert" style="color:var(--text-danger);margin:2px 0 0">{dupMsg}</span>}
        </div>
        {student && (
          <div class="page-sub" style="margin:6px 0">
            {reactivating ? <span>บันทึกแล้วจะกลับมาใช้งาน · นับในสถิติและสแกนรับงานได้</span> : status === "active" ? <span>กำลังเรียน · เปลี่ยนที่ “ย้ายออก/ไม่ใช้งาน…”</span> : <span>{status === "moved" ? "ย้ายออก" : status === "inactive" ? "ไม่ใช้งาน" : "จบปีการศึกษา"}{student.left_at ? ` ${formatThaiDate(student.left_at)}` : ""}</span>}
            <br />บัตร QR: {qrText}
          </div>
        )}
        {note && <div role="status" class="stu-okline"><Icon name="circle-check" size={16} /> {note}</div>}
        {err && <div role="alert" style="color:var(--text-danger);font-size:var(--fs-sm);margin:6px 0">{err}</div>}
        <div class="row" style="justify-content:space-between;margin-top:10px">
          {student ? <button onClick={rotate} disabled={busy}><Icon name="refresh" size={16} /> ออก QR ใหม่…</button> : <span />}
          <div class="row" style="gap:8px">
            <button onClick={() => void requestClose()} disabled={busy}>ยกเลิก</button>
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
export const MAX_IMPORT_FILE = 5 * 1024 * 1024; // a class list is a few KB: refuse a huge file before it is read (S-08)

const ACTION_LABEL = {
  create: { text: "ใหม่", style: "background:var(--bg-success);color:var(--text-success)" },
  update: { text: "แก้ข้อมูล", style: "background:var(--bg-accent);color:var(--text-accent)" },
  same: { text: "เหมือนเดิม", style: "background:var(--surface-1);color:var(--text-secondary)" },
  move: { text: "ย้ายห้อง", style: "background:var(--bg-warning);color:var(--text-warning)" },
  reactivate: { text: "กลับมาใช้งาน", style: "background:var(--bg-warning);color:var(--text-warning)" },
} as const;

function ImportModal({ classId, hide = false, onClose, onDone }: { classId: string; hide?: boolean; onClose: () => void; onDone: (toast: string) => void }) {
  const offline = !online.value; // reading the file works offline; checking against the system and importing need the network (AC-194)
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
    setErr(""); setFileName(file.name);
    if (file.size > MAX_IMPORT_FILE) { setSheets([]); setErr("ไฟล์ใหญ่เกินไป (เกิน 5 MB) — รายชื่อนักเรียนไม่ควรใหญ่ขนาดนี้ ตรวจว่าเลือกไฟล์ถูกต้อง"); return; }
    setFileBusy(true);
    try { const s = await fileToSheets(file); setSheets(s); setSheetIdx(bestSheet(s)); }
    catch (e: any) { setSheets([]); setErr(e?.message || "อ่านไฟล์ไม่ได้ — ลองบันทึกเป็น .xlsx หรือ .csv ใหม่"); }
    finally { setFileBusy(false); }
  }

  // each tab keeps its own text; the one on screen is what is read
  const text = tab === "file" ? (sheets[sheetIdx]?.text ?? "") : pasted;
  const parsed = parseImport(text);
  const { rows, noLastName, badNumber } = parsed;
  const skipped = parsed.skipped.filter((l) => !isHeaderLine(l)); // the table head of a file is not an unreadable line
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
  const canImport = !busy && !offline && rows.length > 0 && !tooMany && previewState === "ready" && !blocked && (risky === 0 || confirmed);

  async function doImport() {
    setErr("");
    if (rows.length === 0) return setErr("ไม่พบข้อมูลที่อ่านได้ — วางจาก Excel (คอลัมน์: รหัส, คำนำหน้า ชื่อ สกุล, เลขที่)");
    setBusy(true);
    try {
      const r = await api.post<{ imported?: number; created?: number }>("/api/students/import", { class_id: classId, students: rows });
      const sm = preview?.summary;
      // BR-49: the toast tells what the last check said; if the server created another number (somebody else added a code meanwhile) only the server's numbers are shown
      onDone(!sm || (r?.created != null && r.created !== sm.create)
        ? `นำเข้าแล้ว ${r?.imported ?? rows.length} คน${r?.created != null ? ` · เพิ่มใหม่ ${r.created}` : ""}`
        : `นำเข้าแล้ว — เพิ่มใหม่ ${sm.create} · แก้ข้อมูล ${sm.update} · เหมือนเดิม ${sm.same}${sm.move > 0 ? ` · ย้ายเข้า ${sm.move}` : ""}`);
    }
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
        {hide && <div class="imp-warn info" role="status"><Icon name="eye-off" size={20} /> หน้าต่างนี้แสดงชื่อจริง (หน้ารายชื่อซ่อนชื่ออยู่)</div>}
        <div class="imp-tabs" role="tablist" aria-label="วิธีนำเข้า" onKeyDown={tabKeys}>
          <button id="imp-tab-file" role="tab" aria-selected={tab === "file"} tabIndex={tab === "file" ? 0 : -1} onClick={() => setTab("file")}><Icon name="file-type-xls" size={16} /> ไฟล์ .xlsx / .csv</button>
          <button id="imp-tab-paste" role="tab" aria-selected={tab === "paste"} tabIndex={tab === "paste" ? 0 : -1} onClick={() => setTab("paste")}><Icon name="clipboard-text" size={16} /> วางข้อความ</button>
        </div>
        <div class="page-sub" style="margin:8px 0">คอลัมน์: รหัส | คำนำหน้า ชื่อ สกุล | เลขที่ · ต้องมีชื่อและสกุล · {CODE_RULE_TEXT} · รหัสที่มีอยู่แล้วจะถูกอัปเดต · ไฟล์ถูกอ่านในเครื่องนี้เท่านั้น ไม่ได้ส่งไปที่ไหน</div>
        {tab === "file" ? (
          <div role="tabpanel" aria-labelledby="imp-tab-file">
            <label class={"imp-drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); void pickFile(e.dataTransfer?.files?.[0]); }}>
              <Icon name="upload" size={24} />
              <b>{fileName || "แตะเลือกไฟล์ หรือลากมาวาง"}</b>
              <span class="page-sub">{fileName ? "แตะเพื่อเปลี่ยนไฟล์" : `.xlsx หรือ .csv · แถวแรกเป็นหัวตารางได้ · ไม่เกิน ${MAX_IMPORT} คน`}</span>
              <input type="file" aria-label="ไฟล์รายชื่อนักเรียน" accept=".xlsx,.csv,.txt,text/csv" onChange={(e) => { void pickFile((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ""; }} />
            </label>
            <button type="button" class="stu-tplbtn" onClick={() => void downloadTemplate()}><Icon name="download" size={16} /> ดาวน์โหลดไฟล์ตัวอย่าง</button>
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

        {offline && <div class="imp-warn" role="status"><Icon name="cloud-off" size={20} /> ต้องออนไลน์ — ตรวจกับระบบและนำเข้าได้เมื่อมีเน็ต</div>}
        {rows.length > 0 && (
          <div class="imp-sum">
            {previewState === "loading" && <span class="muted"><Icon name="loader-2" size={16} class="spin" /> กำลังตรวจกับข้อมูลในระบบ…</span>}
            {!offline && previewState === "error" && <span style="color:var(--text-warning)" role="status"><Icon name="cloud-off" size={16} /> ตรวจกับระบบไม่ได้{navigator.onLine ? "" : " (ออฟไลน์)"} <button onClick={() => setPreviewAttempt((n) => n + 1)}>ตรวจอีกครั้ง</button></span>}
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
