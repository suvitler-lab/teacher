import { useEffect, useMemo, useState, useRef } from "preact/hooks";
import "../styles/grade.css";
import "../styles/home.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented, WorkCell, EmptyState, LoadError, TermPicker, YearBanner, useIsPhone, NoClasses, DateField } from "../components/ui";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import {
  viewClasses, rosterCount, classById, activeSubjects, activeWorkTypes, studentsByClass, workTypeById, selectedTermId,
  viewingPastYear, upsertAssignment, dropAssignment, captureAssignmentContext, assignmentContextCurrent,
  startClass, startSubject, rememberClass, rememberSubject,
} from "../store";
import type { Assignment, Student } from "@shared/types";
import { api, ApiError } from "../lib/api";
import { enqueueSubmission, onResult, pendingOps, failedPairKeys, flush } from "../lib/outbox";
import { actionTime } from "../lib/clock";
import { ulid } from "@shared/ids";
import { decideCellCommit } from "@shared/grade";
import { groupScoreTotal, countWorkStates, assignmentRate, assignmentFraction, classSubmitRate, type WorkState } from "@shared/metrics";
import { bkkToday } from "@shared/time";
import { checkReceivedDate } from "@shared/received-date";
import { fullName } from "../lib/names";
import { formatThaiDate, monthOptions, currentMonthIso } from "../lib/dates";
import { notify, ok, err, withToast } from "../lib/notify";
import { AssignmentModal } from "../components/AssignmentModal";
import { Dialog } from "../components/Dialog";
import { CellEditor, receivedDayOf, dateLine, type CellChange } from "../components/CellEditor";
import { useConfirm } from "../components/ConfirmDialog";
import { GradebookStrip, GradebookBottom } from "../components/gradebook/GradebookCards";
import { GradebookCell, type CellHandlers } from "../components/gradebook/GradebookCell";
import { CellInput } from "../components/gradebook/CellInput";
import { buildMatrix, receivedNoon, type Sub } from "../components/gradebook/matrix";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { GRADEBOOK_CARD_META, GRADEBOOK_LOCKED } from "../components/cards/meta";
import { gradebookLayout } from "../lib/pageCards";
import {
  buildGroups, isCollapsed, loadGroupMode, saveGroupMode, type GroupMode, type Group,
} from "../lib/gbGroups";
import {
  loadColumnPrefs, saveColumnPrefs, effectiveHidden, makeIsShown, toggleType, columnCounts, displayGroups, jumpTargets,
  jumpScrollLeft, minimapSegments, typeKeyOf, type ColumnPrefs,
} from "../lib/gbColumns";
import { GradebookNav, ColumnsMenu, TypeShape, useScrollFlags, flagsFit, edgeClassOf, scrollFrameTo } from "../components/GradebookNav";
import { routeParams, navigate, setNavGuard } from "../router";
import { useAction } from "../lib/useAction";
import { menuKeys, focusFirstItem } from "../lib/menuKeys";

type SubKey = string; // `${assignmentId}:${studentId}`
type RowFilter = "all" | "missing" | "awaiting";

/** A work type's paints (tokens.css): the head's tint ground (--hb) and the dark ink of the shape / progress bar on it (--f). Never colour alone: a shape per type, and the type name rides in title / aria-label. */
const tintVars = (color: string) => `--hb:var(--tint-${color}-bg);--f:var(--tint-${color}-fg)`;
const TINT_FG: Record<string, string> = {
  aqua: "var(--tint-aqua-fg)", violet: "var(--tint-violet-fg)", orange: "var(--tint-orange-fg)",
  green: "var(--tint-green-fg)", blue: "var(--tint-blue-fg)", magenta: "var(--tint-magenta-fg)", red: "var(--tint-red-fg)",
};

/** How many cells "clear" will really change: handed-in ones only — never void (nothing there) or excused (BR-07). */
export function clearableCount(cells: ({ status: string } | undefined)[]): number {
  return cells.filter((s) => s && s.status !== "void" && s.status !== "excused").length;
}

type BulkAction = "all-submitted" | "full-score" | "clear";

/**
 * How many children a whole-class button will really change (the number the confirm box shows):
 * "submitted" = not handed in yet and not excused; "full score" = handed in and not already full; "clear" = clearableCount.
 * Excused children are never touched (BR-07). Mirrors the server's bulk rules.
 */
export function bulkAffectedCount(action: BulkAction, cells: ({ status: string; score: number | null } | undefined)[], full: number): number {
  if (action === "clear") return clearableCount(cells);
  if (action === "all-submitted") return cells.filter((s) => !s || (s.status !== "submitted" && s.status !== "excused")).length;
  return cells.filter((s) => s && s.status === "submitted" && s.score !== full).length;
}

/** The menu button that opened the confirm box was unmounted with its menu: give the keyboard its place back. */
function refocusBulkTrigger() {
  setTimeout(() => (document.querySelector("[data-bulk-trigger]") as HTMLElement | null)?.focus(), 0);
}

/** Give the keyboard a cell back (the input that held it was torn down). */
function focusCell(aid: string, sid: string) {
  setTimeout(() => (document.querySelector(`td[data-aid="${aid}"][data-sid="${sid}"]`) as HTMLElement | null)?.focus({ preventScroll: true }), 0);
}
/** The ⋮ / close button that opened a confirm box was unmounted with its menu: give the keyboard its place back. */
function refocusMore() {
  setTimeout(() => ((document.querySelector("[data-more-trigger]") ?? document.querySelector(".gb-work button")) as HTMLElement | null)?.focus(), 0);
}

/** The due day of a work as a small chip: how many days late, "due today", or when it is due; null for a closed work or none. */
export function dueChip(a: { due_date: string | null; status: string }, today: string): { text: string; icon: string; style: string } | null {
  if (a.status === "closed") return { text: "ปิดรับ", icon: "lock", style: "background:var(--surface-2);color:var(--text-secondary)" };
  if (!a.due_date) return { text: "ไม่มีกำหนดส่ง", icon: "calendar-event", style: "background:var(--surface-2);color:var(--text-secondary)" };
  const late = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(a.due_date + "T00:00:00Z")) / 86_400_000);
  if (late > 0) return { text: `เลยกำหนด ${late} วัน`, icon: "calendar-event", style: "background:var(--bg-danger);color:var(--text-danger)" };
  if (late === 0) return { text: "ครบกำหนดวันนี้", icon: "clock", style: "background:var(--bg-warning);color:var(--text-warning)" };
  return { text: `กำหนด ${formatThaiDate(a.due_date).replace(/ \d{4}$/, "")}`, icon: "calendar-event", style: "background:var(--surface-2);color:var(--text-secondary)" };
}

const monthShort = (ym: string) => (ym ? formatThaiDate(`${ym}-01`).split(" ")[1] ?? ym : "ไม่ระบุวันที่");

export function GradebookPage() {
  const params = routeParams();
  const phone = useIsPhone();
  const [classId, setClassId] = useState(startClass(params.class, viewClasses.value));
  // deep links (Home cards) name the class, subject and assignment they want to land on
  const [subjectId, setSubjectId] = useState(startSubject(params.subject, activeSubjects.value));
  const [typeId, setTypeId] = useState("");
  const [period, setPeriod] = useState<"term" | "month">("term");
  const [month, setMonth] = useState(currentMonthIso());
  const [rowFilter, setRowFilter] = useState<RowFilter>((params.rows as RowFilter) || "all");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [subs, setSubs] = useState<Map<SubKey, Sub>>(new Map());
  const [selCol, setSelCol] = useState<string | null>(params.asg ?? null);
  const [editing, setEditing] = useState<{ aid: string; sid: string } | null>(null);
  const [showCreate, setShowCreate] = useState(params.new === "1");
  const [editAsg, setEditAsg] = useState<Assignment | null>(null);
  const [copyAsg, setCopyAsg] = useState<Assignment | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bulkMenu, setBulkMenu] = useState(false);
  const [bulkAsk, setBulkAsk] = useState<{ action: BulkAction; count: number } | null>(null);
  const longPress = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false }); // a held cell opens the editor
  const startHold = (aid: string, sid: string) => { clearTimeout(longPress.current.timer); longPress.current.fired = false; longPress.current.timer = window.setTimeout(() => { longPress.current.fired = true; setEditing(null); setCellPanel({ aid, sid }); }, 450); };
  const endHold = () => clearTimeout(longPress.current.timer);
  const [cellPanel, setCellPanelState] = useState<{ aid: string; sid: string } | null>(null); // the cell editor (status · score · received day)
  const [focCell, setFocCell] = useState<{ aid: string; sid: string } | null>(null); // roving tabindex: the one cell Tab stops on
  const [editSeed, setEditSeed] = useState<string | null>(null); // the digit typed on a focused cell opens the quick input with it
  const setCellPanel = (v: { aid: string; sid: string } | null) => { if (v) setEditSeed(null); else if (cellPanelRef.current) focusCell(cellPanelRef.current.aid, cellPanelRef.current.sid); setCellPanelState(v); };
  const cellPanelRef = useRef<{ aid: string; sid: string } | null>(null);
  cellPanelRef.current = cellPanel;
  const { ask: askYesNo, node: askNode } = useConfirm();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false); // type · period · grouping · columns live in one "ตัวกรอง" panel
  const [groupMode, setGroupModeState] = useState<GroupMode>(() => loadGroupMode());
  const [foldTaps, setFoldTaps] = useState<Map<string, boolean>>(new Map()); // the teacher's own fold/unfold taps (true = folded)
  const [colPrefs, setColPrefsState] = useState<ColumnPrefs>(() => loadColumnPrefs()); // which columns are DRAWN (display only)
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingJump = useRef<string | null>(null);
  const pendingEdit = useRef<{ aid: string; sid: string } | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const begin = useLoadGuard();
  const act = useAction();
  const [msg, setMsg] = useState("");
  // Scores the device could not even store. They stay on screen (red-outlined) and are NOT treated as
  // saved; the teacher can retry, and leaving the page asks first.
  const [unsaved, setUnsaved] = useState<Map<string, { aid: string; sid: string; score: number | null; full: number; ts: number }>>(new Map());
  const unsavedRef = useRef(unsaved); // the toast's "retry" outlives the render that made it
  unsavedRef.current = unsaved;
  const today = bkkToday();
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 5000); return () => clearTimeout(t); }, [msg]); // a wrong score is said once, beside the screen, and never pushes the table around

  // the rows come from the server's roster for this class in this term (an earlier year shows its own
  // children); until it arrives, this year's class is drawn from the copy the app already holds
  const [roster, setRoster] = useState<Student[] | null>(null);
  const students = roster ?? (viewingPastYear.value ? [] : studentsByClass.value.get(classId) ?? []);
  useEffect(() => { rememberClass(classId); }, [classId]);
  useEffect(() => { rememberSubject(subjectId); }, [subjectId]);
  // the term changed: the class we were on may not exist in that year
  useEffect(() => {
    if (!viewClasses.value.some((c) => c.id === classId)) setClassId(viewClasses.value[0]?.id ?? "");
  }, [selectedTermId.value]);

  // `keep` = a refresh after an action (keep what's on screen); otherwise the filters changed,
  // so the previous class/subject/term must not stay on screen while the new one loads (or fails)
  async function load(keep = false) {
    const fresh = begin();
    if (!classId) { setStatus("ready"); setAssignments([]); setSubs(new Map()); setRoster([]); return; }
    if (!keep) { setStatus("loading"); setAssignments([]); setSubs(new Map()); setRoster(null); }
    try {
      const q = new URLSearchParams({ class: classId });
      if (subjectId) q.set("subject", subjectId);
      if (typeId) q.set("type", typeId);
      if (selectedTermId.value) q.set("term", selectedTermId.value);
      if (period === "month") { q.set("from", `${month}-01`); q.set("to", `${month}-31`); }
      const res = await api.get<{ students?: Student[]; assignments: Assignment[]; submissions: any[] }>(`/api/gradebook?${q}`);
      if (!fresh()) return; // a newer load (another filter) is on its way
      if (res.students) setRoster(res.students);
      setAssignments(res.assignments);
      const m = new Map<SubKey, Sub>();
      for (const s of res.submissions) m.set(`${s.assignment_id}:${s.student_id}`, { status: s.status, score: s.score, late: s.late, submittedAt: s.submitted_at ?? null });
      setSubs(m);
      if (res.assignments.length && !res.assignments.find((a) => a.id === selCol)) setSelCol(res.assignments[0].id);
      setStatus("ready");
    } catch {
      if (!fresh()) return;
      if (keep) err("โหลดข้อมูลใหม่ไม่สำเร็จ — ที่เห็นอาจไม่ล่าสุด");
      else setStatus("error");
    }
  }
  const loadRef = useRef(load); // "undo" toasts outlive the render that made them: always reload the CURRENT class/filters
  loadRef.current = load;
  useEffect(() => { load(); }, [classId, subjectId, typeId, selectedTermId.value, period, month]);
  // "สร้างงาน" from Home arrives as #/gradebook?new=1: open the form once, then drop the flag so a reload doesn't reopen it
  useEffect(() => { if (params.new === "1") navigate("/gradebook", { class: params.class, subject: params.subject }); }, []);

  // When a queued edit lands, take the server's row as the cell's value. Otherwise, once the
  // "waiting to send" overlay disappears, the cell would fall back to the (older) snapshot this
  // page loaded earlier — e.g. show 14 again after 9 was saved.
  useEffect(() => onResult((r, op) => {
    // ok / duplicate / superseded all come with the row the SERVER now holds — adopt it
    if ((r.result !== "ok" && r.result !== "duplicate" && r.result !== "superseded" && r.result !== "already_submitted") || !r.submission) return;
    const sub = r.submission;
    setSubs((prev) => new Map(prev).set(`${op.assignmentId}:${op.studentId}`, { status: sub.status, score: sub.score, late: sub.late, submittedAt: sub.submitted_at ?? null }));
  }), []);

  const selAsg = assignments.find((a) => a.id === selCol) ?? null;

  // What a cell shows = the server's value, unless this device has a newer edit still
  // waiting to be sent — then that edit wins, so reloading or switching class never
  // shows 3 again while 9 is still in the queue.
  const pend = pendingOps.value;
  const failed = failedPairKeys.value;
  // The state of every (work x child) pair is worked out ONCE per change of its inputs; cells, column heads, totals,
  // the average row and the cards all read it from here (it used to be re-derived ~10,000 times per render).
  const matrix = useMemo(() => buildMatrix({ assignments, students, subs, unsaved, pend, failed, today }), [assignments, students, subs, unsaved, pend, failed, today]);
  const subOf = matrix.sub;
  const markOf = matrix.mark;
  const stateOf = matrix.state;

  const shownStudents = useMemo(() => {
    if (rowFilter === "all") return students;
    const want = rowFilter === "missing" ? "missing" : "awaiting";
    return students.filter((st) => assignments.some((a) => matrix.state(a.id, st.id, a) === want));
  }, [students, assignments, matrix, rowFilter]);

  function setLocal(aid: string, sid: string, sub: Sub | null) {
    setSubs((prev) => { const m = new Map(prev); if (sub) m.set(`${aid}:${sid}`, sub); else m.delete(`${aid}:${sid}`); return m; });
  }
  async function saveScore(aid: string, sid: string, score: number | null, full: number, ts: number): Promise<boolean> {
    try {
      await enqueueSubmission({
        opId: ulid(), scanSessionId: "grid", assignmentId: aid, studentId: sid,
        status: "submitted", score, fullScoreAtScan: full, method: "grid",
        clientTs: ts,          // when the teacher acted, on the server's clock — a retry keeps it
        intent: "grade",       // the teacher scoring: allowed even after the work is closed
      });
      return true;
    } catch {
      return false;           // storage refused: it is NOT saved anywhere
    }
  }
  function clearUnsaved(k: string) { setUnsaved((prev) => { if (!prev.has(k)) return prev; const m = new Map(prev); m.delete(k); return m; }); }

  async function commitScore(aid: string, sid: string, initial: string, raw: string) {
    const a = assignments.find((x) => x.id === aid);
    if (!a) return;
    const cur = subOf(aid, sid);
    const decision = decideCellCommit(initial, raw, cur as any, a.full_score);
    if (decision.kind === "noop") return;
    if (decision.kind === "error") { setMsg(decision.message); return; }
    setMsg("");
    const score = decision.kind === "clear" ? null : decision.score;
    const k = `${aid}:${sid}`;
    const ts = actionTime();
    setLocal(aid, sid, { status: "submitted", score, late: cur?.late ?? false });
    if (await saveScore(aid, sid, score, a.full_score, ts)) { clearUnsaved(k); return; }
    // The value stays on screen so the teacher sees what they typed — but it is flagged, not shown as saved.
    setUnsaved((prev) => new Map(prev).set(k, { aid, sid, score, full: a.full_score, ts }));
    notify("error", "บันทึกลงเครื่องไม่ได้ — ช่องที่ขอบแดงยังไม่ถูกบันทึก", { sticky: true, action: { label: "ลองใหม่", run: retryUnsaved } });
  }
  /**
   * Apply what the cell editor chose. A change of status or day offers "เลิกทำ" (a score alone does not: it is one
   * keystroke to retype). Late is never sent: the server derives it from the received day (BR-04).
   */
  async function applyCell(aid: string, sid: string, ch: CellChange, withUndo = true) {
    const a = assignments.find((x) => x.id === aid);
    if (!a) return;
    const cur = subOf(aid, sid);
    const before: CellChange = {
      status: (cur?.status as CellChange["status"]) ?? "void", score: cur?.score ?? null, receivedDate: receivedDayOf(cur as never),
    };
    const base = { scanSessionId: "grid", assignmentId: aid, studentId: sid, fullScoreAtScan: a.full_score, method: "grid" as const, intent: "grade" as const };
    const ts = actionTime();
    try {
      if (ch.status !== "submitted") {
        if (before.status === ch.status) return;
        setLocal(aid, sid, ch.status === "excused" ? { status: "excused", score: null, late: false } : null);
        await enqueueSubmission({ ...base, opId: ulid(), status: ch.status, score: null, clientTs: ts });
      } else if (before.status !== "submitted") {
        setLocal(aid, sid, { status: "submitted", score: ch.score, late: false, submittedAt: receivedNoon(ch.receivedDate) });
        await enqueueSubmission({ ...base, opId: ulid(), status: "submitted", score: ch.score, clientTs: ts, receivedDate: ch.receivedDate });
      } else {
        if (ch.score !== before.score) {
          setLocal(aid, sid, { ...(cur as Sub), score: ch.score });
          await enqueueSubmission({ ...base, opId: ulid(), status: "submitted", score: ch.score, clientTs: ts });
        }
        if (ch.receivedDate && ch.receivedDate !== before.receivedDate) {
          // the server keeps the stored status and score for a date-only change
          await enqueueSubmission({ ...base, opId: ulid(), status: "submitted", score: ch.score, clientTs: ts + 1, receivedDate: ch.receivedDate, dateOnly: true });
          setLocal(aid, sid, { ...((subOf(aid, sid) ?? cur) as Sub), submittedAt: receivedNoon(ch.receivedDate) });
        }
      }
    } catch {
      err("บันทึกลงเครื่องไม่ได้ ลองอีกครั้ง");
      return;
    }
    const statusOrDayChanged = ch.status !== before.status || (ch.status === "submitted" && ch.receivedDate !== before.receivedDate);
    if (withUndo && statusOrDayChanged) {
      notify("info", ch.status === "excused" ? "ตั้งเป็นยกเว้นแล้ว" : ch.status === "void" ? "ตั้งเป็นยังไม่ส่งแล้ว" : before.status === "submitted" ? `แก้วันที่รับเป็น ${formatThaiDate(ch.receivedDate!)} แล้ว · ${dateLine(ch.receivedDate!, a.due_date, today).split(" · ")[0]}` : "ตั้งเป็นส่งแล้ว",
        { action: { label: "เลิกทำ", run: () => { void applyCellRef.current(aid, sid, before, false); } } });
    }
  }

  const applyCellRef = useRef(applyCell); // the toast outlives this render: "undo" must read the cell as it is NOW
  applyCellRef.current = applyCell;

  async function retryUnsaved() {
    let still = 0;
    for (const [k, u] of [...unsavedRef.current.entries()]) {
      if (await saveScore(u.aid, u.sid, u.score, u.full, u.ts)) clearUnsaved(k); else still++;
    }
    if (still === 0) ok("บันทึกลงเครื่องแล้ว");
    else err(`ยังบันทึกลงเครื่องไม่ได้ ${still} ช่อง — พื้นที่เก็บข้อมูลในเครื่องอาจเต็ม`);
  }

  // leaving with scores that were never saved would lose them silently: ask first
  useEffect(() => {
    if (unsaved.size === 0) return;
    setNavGuard(() => askYesNo({ title: "ออกจากหน้านี้?", body: `มีคะแนน ${unsaved.size} ช่องที่ยังบันทึกลงเครื่องไม่ได้ ออกจากหน้านี้แล้วจะหายไป`, yes: "ออกโดยไม่เก็บ", no: "อยู่ต่อ", danger: true }));
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setNavGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [unsaved.size]);

  /** A whole-class button was pressed: ask first, saying how many children it will really change. */
  function bulk(action: BulkAction) {
    if (!selAsg) return;
    setBulkMenu(false);
    setBulkAsk({ action, count: bulkAffectedCount(action, students.map((st) => subOf(selAsg.id, st.id)), selAsg.full_score) });
  }
  async function runBulk(action: BulkAction, receivedDate: string | null = null) {
    if (!selAsg) return;
    setMsg("");
    // Scores still waiting in this device's queue were made BEFORE this button press: they must reach the server
    // first (they would otherwise arrive after it and be pushed aside as older, or worse, fight it). If they
    // can't be sent now (offline), don't run a whole-class action on top of them.
    await flush();
    const waiting = [...pendingOps.value.values()].filter((o) => o.assignmentId === selAsg.id).length
      + [...unsaved.values()].filter((u) => u.aid === selAsg.id).length;
    if (waiting > 0) {
      err(`ยังมีคะแนน ${waiting} รายการของงานนี้ที่ยังไม่ได้ส่งขึ้นระบบ — รอให้ส่งเสร็จก่อนแล้วค่อยทำทั้งห้อง`);
      return;
    }
    await act.run("bulk", async () => { try {
      const res = await api.post<{ changed: number; batchId: string }>(`/api/assignments/${selAsg.id}/bulk`, { action, classId, ...(action === "all-submitted" && receivedDate && receivedDate !== bkkToday() ? { receivedDate } : {}) });
      await load(true);
      if (res.changed > 0 && res.batchId) {
        const label = action === "clear" ? `ล้างแล้ว ${res.changed} รายการ`
          : action === "full-score" ? `ให้เต็ม ${res.changed} คน`
          : `ทั้งห้องส่งแล้ว ${res.changed} คน${receivedDate ? ` · รับ ${receivedDate === bkkToday() ? "วันนี้" : formatThaiDate(receivedDate)}` : ""}`;
        notify("info", label, { sticky: true, action: { label: "ย้อนกลับ", run: async () => {
          const r = await withToast(() => api.post(`/api/assignments/${selAsg.id}/bulk-undo`, { batchId: res.batchId }), "ย้อนกลับไม่สำเร็จ");
          if (r) { await load(true); ok("ย้อนกลับแล้ว"); }
        } } });
      }
    } catch (e) {
      err(e instanceof ApiError && e.code === "assignment_closed" ? e.message : "ทำรายการทั้งห้องไม่สำเร็จ");
    } });
  }

  /**
   * Save a change to ONE piece of work (hide/show its scores, open/close it). The screen changes at once and the
   * server is told in the background; if the server refuses, the screen goes back and says so. A second tap on the
   * same work while the first is still on its way is ignored. Nothing else on the page depends on these fields, so
   * there is no reload afterwards.
   */
  async function saveAsgPatch(patch: Record<string, unknown>, okMsg?: string, target: Assignment | null = selAsg) {
    if (!target) return false;
    let succeeded = false;
    await act.run(`asg:${target.id}`, async () => {
      const before = target;
      const ctx = captureAssignmentContext();
      setAssignments((list) => list.map((x) => (x.id === before.id ? ({ ...x, ...patch } as Assignment) : x)));
      let saved: Assignment | null = null;
      try {
        // no full_score: the list may hold a stale one (another device lowered it), which the server would read as a raise
        // and refuse — EP-05 keeps the stored full score when it is absent (correctness-lows AC-04)
        const res = await api.post<{ assignment: Assignment }>("/api/assignments", {
          id: before.id, subject_id: before.subject_id, type_id: before.type_id, title: before.title,
          unit: before.unit, assigned_date: before.assigned_date,
          due_date: before.due_date, note: before.note, publish_scores: before.publish_scores, status: before.status,
          class_ids: before.class_ids, term_id: before.term_id, ...patch,
        });
        saved = res.assignment;
      } catch (e) {
        if (assignmentContextCurrent(ctx)) setAssignments((list) => list.map((x) => (x.id === before.id ? before : x))); // the server said no: back to what it holds
        err((e as Error).message || "บันทึกไม่สำเร็จ");
        return;
      }
      // the scan screen (and Home) read the shared list: closing/reopening must show up there NOW
      if (saved) {
        if (!await upsertAssignment(saved, ctx)) { err("ข้อมูลในเครื่องเปลี่ยนระหว่างบันทึก — โหลดข้อมูลใหม่เพื่อตรวจผล"); return; }
        setAssignments((list) => list.map((x) => (x.id === saved!.id ? { ...x, ...saved! } : x)));
      }
      succeeded = true;
      if (okMsg) ok(okMsg);
    });
    return succeeded;
  }

  async function toggleAllScores() {
    if (act.anyBusy || assignments.length === 0) return;
    // A mixed table hides the remaining visible columns; a fully hidden table shows them all.
    const publish = assignments.every((a) => !a.publish_scores);
    const targets = assignments.filter((a) => a.publish_scores !== publish);
    await act.run("publish-all", async () => {
      const results = await Promise.all(targets.map((a) => saveAsgPatch({ publish_scores: publish }, undefined, a)));
      if (results.every(Boolean)) ok(publish ? "แสดงคะแนนทั้งหมดแล้ว" : "ซ่อนคะแนนทั้งหมดแล้ว");
    });
  }

  /** Ask before closing a work: how many children have not handed in, and what closing does. Resolves true to go ahead. */
  async function confirmClose(a: Assignment): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) { err("ต้องออนไลน์จึงปิดรับงานได้"); return false; }
    const left = students.filter((st) => { const x = subOf(a.id, st.id)?.status; return x !== "submitted" && x !== "excused"; }).length;
    return askYesNo({
      title: `ปิดรับ "${a.title}" ทุกห้อง?`,
      body: <>{left > 0 ? `ยังไม่ส่ง ${left} คน จะนับเป็นค้างส่ง` : "ทุกคนส่งแล้ว"}<div class="page-sub">เปิดรับอีกครั้งได้ที่ปุ่มเดิม · สแกนรับงานเพิ่มไม่ได้เมื่อปิดรับ แต่ให้คะแนนในสมุดคะแนนได้</div></>,
      yes: "ปิดรับงาน", no: "ยังไม่ปิด",
    });
  }
  /** Open or close the picked work. */
  async function toggleOpen() {
    if (!selAsg) return;
    setMenuOpen(false);
    if (selAsg.status === "open") {
      const yes = await confirmClose(selAsg);
      refocusMore();
      if (!yes) return;
    }
    await saveAsgPatch({ status: selAsg.status === "open" ? "closed" : "open" }, selAsg.status === "open" ? "ปิดรับงานแล้ว" : "เปิดรับงานแล้ว");
  }

  async function removeAssignment() {
    if (!selAsg) return;
    setMenuOpen(false);
    const yes = await askYesNo({ title: `ลบงาน "${selAsg.title}"?`, body: "คะแนนที่บันทึกไว้จะถูกซ่อน · ลบแล้วกู้คืนในหน้านี้ไม่ได้", yes: "ลบงาน", danger: true });
    refocusMore();
    if (!yes) return;
    const ctx = captureAssignmentContext();
    const aid = selAsg.id;
    const done = await withToast(() => api.post(`/api/assignments/${aid}/delete`), "ลบงานไม่สำเร็จ");
    if (done && assignmentContextCurrent(ctx)) { await dropAssignment(aid, ctx); setSelCol(null); await load(true); ok("ลบงานแล้ว"); }
  }

  // The running total counts only the work whose scores are showing, so it never gives a hidden score away
  // (and stays useful while one is hidden). All work hidden: nothing to total, shown as •••.
  const visibleWork = assignments.filter((a) => a.publish_scores);
  const hiddenCount = assignments.length - visibleWork.length;
  const allHidden = assignments.length > 0 && visibleWork.length === 0;

  // summary metrics for the toolbar
  const tot = matrix.total;
  const totAwaiting = tot.awaiting, totMissing = tot.missing;
  const submitRate = classSubmitRate([tot]); // Σ handed in ÷ Σ(handed in + overdue), not-yet-due left out

  // columns: grouped by type / month (or not at all). Every group starts open; only the teacher folds one.
  const groups: Group<Assignment>[] = buildGroups(assignments, groupMode,
    (id) => { const t = workTypeById(id); return { name: t?.name ?? "ไม่ระบุประเภท", color: t?.color ?? "violet" }; }, monthShort);
  const flat = groupMode === "none";
  const folded = (g: Group<Assignment>) => !flat && isCollapsed(g.key, foldTaps);
  const allFolded = !flat && groups.length > 0 && groups.every(folded);
  function setGroupMode(m: GroupMode) { setGroupModeState(m); setFoldTaps(new Map()); saveGroupMode(m); }
  function toggleGroup(key: string) {
    const g = groups.find((x) => x.key === key);
    if (g) setFoldTaps((prev) => new Map(prev).set(key, !folded(g)));
  }
  function toggleFoldAll() { setFoldTaps(new Map(groups.map((g) => [g.key, !allFolded] as [string, boolean]))); }

  // Which columns are drawn. This only decides what to DRAW: สะสม, the group totals and every count above keep
  // working from the full `assignments` list, so hiding a column never changes a number.
  const presentTypes = [...new Set(assignments.map(typeKeyOf))];
  const hiddenTypes = effectiveHidden(colPrefs, presentTypes);
  const isShown = makeIsShown<Assignment>(hiddenTypes);
  const dgroups = displayGroups(groups, isShown);
  const colCount = columnCounts(assignments, isShown);
  const typeLabel = (key: string) => { const t = workTypeById(key || null); return { name: t?.name ?? "ไม่ระบุประเภท", color: t?.color ?? "violet" }; };
  function setColPrefs(p: ColumnPrefs) { setColPrefsState(p); saveColumnPrefs(p); }

  const hasTable = !phone && !!classId && status !== "error" && assignments.length > 0;
  const scrollSig = dgroups.map((x) => `${x.group.key}:${folded(x.group) ? "f" : x.shown.length}`).join("|") + `|${colPrefs.showTotal}|${colPrefs.showBars}|${shownStudents.length}`;
  const scrollFlags = useScrollFlags(scrollRef, hasTable, scrollSig);
  // Desktop (mouse): size the table to the room left on screen, so the TABLE is the one thing that scrolls up/down
  // and the page itself does not (two stacked vertical scrollbars were confusing). Touch screens keep the CSS height.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !hasTable) return;
    const mq = typeof matchMedia === "function" ? matchMedia("(hover: hover) and (pointer: fine)") : null;
    const fit = () => {
      if (!mq?.matches) { sc.style.maxHeight = ""; return; }
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const frame = sc.parentElement as HTMLElement;
      let below = 0;
      for (let e = frame.nextElementSibling as HTMLElement | null; e; e = e.nextElementSibling as HTMLElement | null) {
        if (e.classList.contains("gb-bcards")) continue; // the two cards under the legend sit below the fold on purpose: they must not squeeze the table
        const cs = getComputedStyle(e);
        if (cs.position !== "fixed" && cs.position !== "absolute") below += e.offsetHeight + parseFloat(cs.marginTop || "0") + parseFloat(cs.marginBottom || "0");
      }
      const top = frame.getBoundingClientRect().top + window.scrollY;
      const pad = parseFloat(getComputedStyle(document.querySelector(".main") ?? document.body).paddingBottom || "0")
        + (parseFloat(getComputedStyle(frame.parentElement as HTMLElement).marginBottom || "0") || 0);
      sc.style.maxHeight = `${Math.max(12 * rem, window.innerHeight - top - below - pad - 4)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    // the room above/below the table can change without a window resize (banner wraps, action bar appears)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    const frame = sc.parentElement as HTMLElement;
    for (let e: Element | null = frame.parentElement?.firstElementChild ?? null; e; e = e.nextElementSibling) if (e !== frame) ro?.observe(e);
    return () => { window.removeEventListener("resize", fit); ro?.disconnect(); };
  }, [hasTable, scrollSig, groupMode, flagsFit(scrollFlags), msg, hiddenCount]);
  const segments = minimapSegments(dgroups, folded, (a) => workTypeById(a.type_id)?.color ?? "violet");
  const jumps = jumpTargets(assignments, isShown).map((j) => ({ typeKey: j.typeKey, ...typeLabel(j.typeKey) }));

  function scrollToAsg(id: string) {
    const sc = scrollRef.current;
    const th = sc?.querySelector(`th[data-aid="${id}"]`) as HTMLElement | null;
    if (!sc || !th) return;
    const colLeft = th.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft;
    scrollFrameTo(sc, jumpScrollLeft(colLeft, (sc.querySelector("th.name-col") as HTMLElement | null)?.offsetWidth ?? 0, sc.scrollWidth, sc.clientWidth), true);
  }
  /** Jump button: go to the first column of that type; a folded group is opened first (the column must exist to be reached). */
  function jumpToType(typeKey: string) {
    const a = assignments.find((x) => typeKeyOf(x) === typeKey && isShown(x));
    if (!a) return;
    const g = groups.find((x) => x.items.includes(a));
    if (g && folded(g)) { pendingJump.current = a.id; setFoldTaps((prev) => new Map(prev).set(g.key, false)); }
    else scrollToAsg(a.id);
  }
  /** Tap on a folded "รวม {group}" cell: open the group and edit that student's score in its first column. */
  function openAndEdit(g: Group<Assignment>, sid: string, firstId: string | undefined) {
    if (!firstId) { toggleGroup(g.key); return; }
    pendingEdit.current = { aid: firstId, sid };
    setFoldTaps((prev) => new Map(prev).set(g.key, false));
  }
  useEffect(() => { // after the opened group has been drawn
    if (pendingEdit.current) {
      const { aid, sid } = pendingEdit.current; pendingEdit.current = null;
      pendingJump.current = null;
      scrollToAsg(aid);
      setEditing({ aid, sid });
      requestAnimationFrame(() => (scrollRef.current?.querySelector(`td[data-aid="${aid}"][data-sid="${sid}"]`) as HTMLElement | null)?.scrollIntoView?.({ block: "nearest", inline: "nearest" }));
      return;
    }
    if (!pendingJump.current) return;
    const id = pendingJump.current; pendingJump.current = null;
    scrollToAsg(id);
  }, [foldTaps]);

  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));

  // what this device still holds for the works on screen (sent later, refused, or not even stored)
  const onScreen = new Set(assignments.map((a) => a.id));
  const keyIn = (k: string) => onScreen.has(k.split("\u0000")[0]);
  const pendHere = [...pend.keys()].filter(keyIn).length, failHere = [...failed].filter(keyIn).length;
  const unsavedHere = [...unsaved.values()].filter((u) => onScreen.has(u.aid)).length;
  const waitingHere = pendHere + failHere + unsavedHere;
  const nFilters = (typeId ? 1 : 0) + (period !== "term" ? 1 : 0) + (groupMode !== "none" ? 1 : 0) + hiddenTypes.size + (colPrefs.showTotal ? 0 : 1) + (colPrefs.showBars ? 0 : 1);
  const selCounts = (selAsg && matrix.counts(selAsg.id)) || countWorkStates([]);
  const scoresOf = useMemo(() => (aid: string) => students.map((st) => matrix.sub(aid, st.id)).filter((x): x is Sub => !!x && x.status === "submitted" && x.score != null).map((x) => x.score as number), [students, matrix]);
  const pickWork = (aid: string) => { setSelCol(aid); scrollToAsg(aid); };
  async function closeWork(aid: string) {
    const a = assignments.find((x) => x.id === aid);
    if (!a) return;
    if (!(await confirmClose(a))) return;
    await saveAsgPatch({ status: "closed" }, "ปิดรับงานแล้ว", a);
  }
  // the cards over/under the table are memoised: hand them callbacks whose identity never changes but that always run the newest code
  const liveFns = useRef({ pickWork, closeWork });
  liveFns.current = { pickWork, closeWork };
  const cardFns = useRef({ onPick: (aid: string) => liveFns.current.pickWork(aid), onCloseWork: (aid: string) => liveFns.current.closeWork(aid), onRows: (k: "missing" | "awaiting") => setRowFilter(k) }).current;

  // roving tabindex: Tab stops on ONE cell of the table (the last one used, else the first); the arrows move between cells
  const colIds = dgroups.flatMap(({ group: g, shown: cols }) => (folded(g) ? [] : cols.map((c) => c.id)));
  const firstCell = colIds.length && shownStudents.length ? { aid: colIds[0], sid: shownStudents[0].id } : null;
  const [focusIn, setFocusIn] = useState<{ aid: string; sid: string } | null>(null);
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const on = () => {
      const el = document.activeElement as HTMLElement | null;
      const next = el && sc.contains(el) && el.matches("td.cell") ? { aid: el.dataset.aid!, sid: el.dataset.sid! } : null;
      setFocusIn((prev) => (prev?.aid === next?.aid && prev?.sid === next?.sid ? prev : next)); // unchanged = no redraw
    };
    sc.addEventListener("focusin", on); sc.addEventListener("focusout", on);
    return () => { sc.removeEventListener("focusin", on); sc.removeEventListener("focusout", on); };
  }, [hasTable, scrollSig]);
  function onCellKey(e: KeyboardEvent, a: Assignment, sid: string, row: number, sub: Sub | undefined, isEditing: boolean) {
    if (e.target !== e.currentTarget || isEditing) return;
    const open = () => setCellPanel({ aid: a.id, sid });
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.altKey || sub?.status === "excused") open(); else { setEditSeed(null); setEditing({ aid: a.id, sid }); }
      return;
    }
    // a digit (or the point) on a focused cell starts the quick input with it — the first key is never lost; an excused child opens the editor instead
    if (/^[0-9.]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (sub?.status === "excused") { open(); return; }
      setEditSeed(e.key); setEditing({ aid: a.id, sid });
      return;
    }
    const ci = colIds.indexOf(a.id);
    const to = (c: number, r: number) => {
      const na = colIds[Math.max(0, Math.min(colIds.length - 1, c))], ns = shownStudents[Math.max(0, Math.min(shownStudents.length - 1, r))]?.id;
      if (!na || !ns) return;
      e.preventDefault();
      setFocCell({ aid: na, sid: ns });
      const el = scrollRef.current?.querySelector(`td[data-aid="${na}"][data-sid="${ns}"]`) as HTMLElement | null;
      el?.focus({ preventScroll: true });
      el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };
    if (e.key === "ArrowRight") to(ci + 1, row); else if (e.key === "ArrowLeft") to(ci - 1, row);
    else if (e.key === "ArrowDown") to(ci, row + 1); else if (e.key === "ArrowUp") to(ci, row - 1);
    else if (e.key === "Home") to(0, row); else if (e.key === "End") to(colIds.length - 1, row);
    else if (e.key === "PageDown") to(ci, row + 10); else if (e.key === "PageUp") to(ci, row - 10);
  }

  // what a memoised cell may ask of the page; refreshed on every render so a cell that was not redrawn still calls the newest code
  const cellH = useRef<CellHandlers>(null as unknown as CellHandlers);
  cellH.current = {
    focus: (aid, sid) => setFocCell((prev) => (prev && prev.aid === aid && prev.sid === sid ? prev : { aid, sid })),
    key: (e, a, sid, row, isEditing) => onCellKey(e, a, sid, row, matrix.sub(a.id, sid), isEditing),
    pointerDown: (e, aid, sid) => { const t = (e.target as HTMLElement).tagName; if (t !== "INPUT" && t !== "BUTTON" && e.pointerType !== "mouse") startHold(aid, sid); },
    endHold,
    click: (e, aid, sid, isEditing) => {
      if (longPress.current.fired) { longPress.current.fired = false; return; }
      if (isEditing) { if (e.target === e.currentTarget) { setEditing(null); setCellPanel({ aid, sid }); } return; }
      if (matrix.sub(aid, sid)?.status === "excused") setCellPanel({ aid, sid }); else { setEditSeed(null); setEditing({ aid, sid }); }
    },
    commit: (aid, sid, row, initial, v, next) => { commitScore(aid, sid, initial, v); const nx = next ? nextCell(shownStudents, row, aid) : null; setEditSeed(null); setEditing(nx); if (nx) setFocCell(nx); else focusCell(aid, sid); },
    cancel: (aid, sid) => { setEditing(null); setEditSeed(null); focusCell(aid, sid); },
    more: (aid, sid) => { setEditing(null); setCellPanel({ aid, sid }); },
  };

  const filterSheet = phone || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches); // touch: the filter is a sheet from the bottom, with a mouse a popover
  function resetFilters() {
    setTypeId(""); setPeriod("term"); setMonth(currentMonthIso()); setGroupMode("none"); setColPrefs({ hiddenTypes: [], showTotal: true, showBars: true });
  }

  return (
    <div class="gb-page">
      <PageHeader icon="table" title="สมุดคะแนน"
        sub={<>{classById(classId)?.name} · {activeSubjects.value.find((s) => s.id === subjectId)?.name ?? "ทุกวิชา"}</>}
        actions={<><TermPicker /><button class="ghost" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={18} /> <span class="att-hide-sm">ปรับการ์ด</span></button><button class="primary" onClick={() => setShowCreate(true)}><Icon name="plus" /> สร้างงาน</button></>}
      />

      <div class="gb-chips" style="margin-bottom:8px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>
      <YearBanner />

      <div class="gb-toolbar">
        <select aria-label="วิชา" value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)}>
          <option value="">ทุกวิชา</option>
          {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
        </select>
        <span style="position:relative">
          <button aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
            <Icon name="adjustments" size={20} /> ตัวกรอง{nFilters > 0 ? ` (${nFilters})` : ""}
          </button>
          {filterOpen && (
            <>
              <div class={filterSheet ? "gb-scrim" : ""} style={filterSheet ? undefined : "position:fixed;inset:0;z-index:39"} onClick={() => setFilterOpen(false)} />
              <div class={"gb-menu gb-menu-left gb-filter" + (filterSheet ? " sheet" : "")} role={filterSheet ? "dialog" : "group"} aria-label="ตัวกรองสมุดคะแนน" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setFilterOpen(false); } }}>
                <label class="field"><span>ประเภทงาน</span>
                  <select aria-label="ประเภทงาน" value={typeId} onInput={(e) => setTypeId((e.target as HTMLSelectElement).value)}>
                    <option value="">ทุกประเภท</option>
                    {activeWorkTypes.value.map((w) => <option value={w.id}>{w.name}</option>)}
                  </select>
                </label>
                <div class="field"><span>ช่วงเวลา</span>
                  <Segmented label="ช่วงเวลา" value={period} onChange={setPeriod} options={[{ value: "term", label: "ทั้งเทอม" }, { value: "month", label: "รายเดือน" }]} />
                </div>
                {period === "month" && (
                  <select aria-label="เดือนของคะแนน" value={month} onInput={(e) => setMonth((e.target as HTMLSelectElement).value)}>
                    {monthOptions().map((m) => <option value={m.value}>{m.label}</option>)}
                  </select>
                )}
                {!phone && <div class="field"><span>จัดกลุ่มคอลัมน์</span><Segmented label="จัดกลุ่มคอลัมน์" value={groupMode} onChange={setGroupMode} options={[
                  { value: "none", label: "ไม่จัดกลุ่ม" }, { value: "type", label: "ตามประเภท" }, { value: "month", label: "ตามเดือน" },
                ]} /></div>}
                {!phone && assignments.length > 0 && (
                  <div class="field"><span>คอลัมน์ที่แสดง</span>
                    {filterSheet ? (
                      <div class="gb-checks" role="group" aria-label={`คอลัมน์ (${colCount.shown}/${colCount.total})`}>
                        {presentTypes.map((k) => {
                          const on = !hiddenTypes.has(k), lastShown = presentTypes.filter((x) => !hiddenTypes.has(x)).length <= 1, t = typeLabel(k);
                          return <button type="button" role="checkbox" aria-checked={on} aria-disabled={on && lastShown} class={on ? "on" : ""}
                            onClick={() => { if (!(on && lastShown)) setColPrefs(toggleType(colPrefs, k, presentTypes)); }}><Icon name={on ? "check" : "plus"} size={16} /> {t.name}</button>;
                        })}
                        <button type="button" role="checkbox" aria-checked={colPrefs.showTotal} class={colPrefs.showTotal ? "on" : ""} onClick={() => setColPrefs({ ...colPrefs, showTotal: !colPrefs.showTotal })}><Icon name={colPrefs.showTotal ? "check" : "plus"} size={16} /> สะสม</button>
                        <button type="button" role="checkbox" aria-checked={colPrefs.showBars} class={colPrefs.showBars ? "on" : ""} onClick={() => setColPrefs({ ...colPrefs, showBars: !colPrefs.showBars })}><Icon name={colPrefs.showBars ? "check" : "plus"} size={16} /> แถบความคืบหน้า</button>
                      </div>
                    ) : (
                      <ColumnsMenu prefs={colPrefs} hidden={hiddenTypes} shown={colCount.shown} total={colCount.total}
                        types={presentTypes.map((k) => ({ key: k, ...typeLabel(k), count: assignments.filter((a) => typeKeyOf(a) === k).length }))}
                        onToggleType={(k) => setColPrefs(toggleType(colPrefs, k, presentTypes))}
                        onTotal={() => setColPrefs({ ...colPrefs, showTotal: !colPrefs.showTotal })}
                        onBars={() => setColPrefs({ ...colPrefs, showBars: !colPrefs.showBars })} />
                    )}
                    <div class="page-sub">ซ่อนคอลัมน์เป็นแค่การแสดงผล · คะแนนสะสมยังคิดรวมทุกงาน</div>
                  </div>
                )}
                <div class="row" style="justify-content:space-between">
                  <button type="button" class="ghost" disabled={nFilters === 0} onClick={resetFilters}><Icon name="history" size={18} /> คืนค่า</button>
                  <button class="primary" onClick={() => setFilterOpen(false)}>เสร็จ</button>
                </div>
              </div>
            </>
          )}
        </span>
        <Segmented value={rowFilter} onChange={setRowFilter} options={[
          { value: "all", label: "ทุกคน" },
          { value: "missing", label: `ค้างส่ง ${totMissing}` },
          { value: "awaiting", label: `รอตรวจ ${totAwaiting}` },
        ]} />
        {hasTable && <GradebookNav sig={scrollSig} segments={segments} jumps={jumps} onJump={jumpToType} scrollRef={scrollRef} />}
      </div>

      {status === "ready" && waitingHere > 0 && (
        <div class="imp-warn" role="status" style="margin:0 0 8px">
          <Icon name="cloud-upload" size={20} />
          <span class="grow"><b style="font-weight:500">ค้างในเครื่องนี้</b> · รอส่งขึ้นระบบ {pendHere} · ส่งไม่สำเร็จ {failHere} · ยังไม่ได้บันทึก {unsavedHere}</span>
          <button onClick={() => { void flush(); void retryUnsaved(); }}>ลองใหม่</button>
        </div>
      )}
      {assignments.length > 0 && (
        <GradebookStrip assignments={assignments} selAsg={selAsg} students={students} counts={tot} stateOf={stateOf} today={today} submitRate={submitRate}
          scoresOf={scoresOf} onPick={cardFns.onPick} onRows={cardFns.onRows} onCloseWork={cardFns.onCloseWork} />
      )}

      {!phone && assignments.length > 0 && (selAsg ? (() => {
        const tt = workTypeById(selAsg.type_id), due = dueChip(selAsg, today), busy = act.isBusy(`asg:${selAsg.id}`);
        const rate = assignmentRate(selCounts);
        return (
          <section class="gb-work" aria-label="งานที่เลือก" style={tintVars(tt?.color ?? "violet")}>
            <div class="gb-w1">
              <div class="gb-wl">
                {tt && <span class={"chip " + tt.color}><Icon name={tt.icon} size={14} /> {tt.name}</span>}
                <b class="gb-wt" title={selAsg.title}>{selAsg.title}</b>
                <span class="gb-wfull">เต็ม {selAsg.full_score}</span>
                {due && <span class="chip" style={due.style}><Icon name={due.icon} size={14} /> {due.text}</span>}
                {!selAsg.publish_scores && <span class="chip" style="background:var(--bg-warning);color:var(--text-warning)"><Icon name="eye-off" size={14} /> ซ่อนคะแนนบนจอ</span>}
              </div>
              <div class="gb-wn">
                <span>ส่งแล้ว <b>{selCounts.submitted}/{selCounts.counted}</b> ({rate}%)</span>
                <span class="chip" style="background:var(--bg-accent);color:var(--text-accent)"><Icon name="hourglass-empty" size={14} /> รอตรวจ {selCounts.awaiting}</span>
                <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)"><Icon name="alert-circle" size={14} /> ค้าง {selCounts.missing}</span>
                {selCounts.excused > 0 && <span class="page-sub">ยกเว้น {selCounts.excused}</span>}
              </div>
            </div>
            <div class="gb-wb">
              <div style="position:relative">
                <button data-bulk-trigger aria-haspopup="menu" aria-expanded={bulkMenu} aria-disabled={act.isBusy("bulk")} onClick={() => { if (!act.isBusy("bulk")) setBulkMenu((v) => !v); }}>
                  {act.isBusy("bulk") ? <Icon name="loader-2" size={18} class="spin" /> : <Icon name="list-check" size={20} />} ทำทั้งห้อง <Icon name="chevron-down" size={16} />
                </button>
                {bulkMenu && (
                  <>
                    <div style="position:fixed;inset:0;z-index:39" onClick={() => setBulkMenu(false)} />
                    <div class="gb-menu gb-menu-left" role="menu" aria-label="ทำทั้งห้อง" ref={focusFirstItem} onKeyDown={menuKeys(() => setBulkMenu(false))}>
                      <button role="menuitem" disabled={selAsg.status === "closed"} title={selAsg.status === "closed" ? "งานนี้ปิดรับแล้ว — เปิดรับงานก่อน" : undefined} onClick={() => bulk("all-submitted")}><Icon name="checks" size={18} /> ทั้งห้องส่งแล้ว…</button>
                      <button role="menuitem" onClick={() => bulk("full-score")}><Icon name="star" size={18} /> ให้เต็มคนที่ส่ง…</button>
                      <div class="gb-menu-sep" role="separator" />
                      <button role="menuitem" onClick={() => bulk("clear")} style="color:var(--text-danger)"><Icon name="eraser" size={18} /> ล้างคะแนนทั้งงาน…</button>
                    </div>
                  </>
                )}
              </div>
              <button class="gb-closebtn" disabled={busy} onClick={toggleOpen}>
                <Icon name={selAsg.status === "open" ? "lock" : "lock-open"} size={18} /> {selAsg.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}
              </button>
              <button class={"icon" + (selAsg.publish_scores ? " ghost" : " on")} aria-pressed={!selAsg.publish_scores} disabled={busy}
                aria-label={selAsg.publish_scores ? "ซ่อนคะแนนบนจอ" : "แสดงคะแนนบนจอ"} title={selAsg.publish_scores ? "ซ่อนคะแนนบนจอ" : "แสดงคะแนนบนจอ"}
                onClick={() => saveAsgPatch({ publish_scores: !selAsg.publish_scores }, selAsg.publish_scores ? "ซ่อนคะแนนบนจอแล้ว" : "แสดงคะแนนบนจอแล้ว")}>
                <Icon name={selAsg.publish_scores ? "eye" : "eye-off"} size={20} />
              </button>
              <div style="position:relative">
                <button class="icon" data-more-trigger aria-label="จัดการงาน" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><Icon name="dots-vertical" size={20} /></button>
                {menuOpen && (
                  <>
                    <div style="position:fixed;inset:0;z-index:39" onClick={() => setMenuOpen(false)} />
                    <div class="gb-menu" role="menu" aria-label="จัดการงาน" ref={focusFirstItem} onKeyDown={menuKeys(() => { setMenuOpen(false); refocusMore(); })}>
                      <button role="menuitem" onClick={() => { setMenuOpen(false); setEditAsg(selAsg); }}><Icon name="edit" size={18} /> แก้ไข</button>
                      <button role="menuitem" onClick={() => { setMenuOpen(false); setCopyAsg(selAsg); }}><Icon name="copy" size={18} /> คัดลอกงาน</button>
                      <button role="menuitem" class="gb-only-narrow" disabled={busy} onClick={toggleOpen}>
                        <Icon name={selAsg.status === "open" ? "lock" : "lock-open"} size={18} /> {selAsg.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}
                      </button>
                      <button role="menuitem" disabled={act.anyBusy}
                        title={allHidden ? "แสดงคะแนนทุกงานในตารางตามตัวกรองปัจจุบัน" : "ซ่อนคะแนนทุกงานในตารางตามตัวกรองปัจจุบัน (ซ่อนบนจอเท่านั้น)"}
                        onClick={toggleAllScores}>
                        <Icon name={allHidden ? "eye-off" : "eye"} size={18} /> {allHidden ? "แสดงคะแนนทั้งหมด" : "ซ่อนคะแนนทั้งหมด"}
                      </button>
                      <button role="menuitem" onClick={removeAssignment} style="color:var(--text-danger)"><Icon name="trash" size={18} /> ลบงาน…</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        );
      })() : <div class="gb-work empty page-sub">แตะหัวคอลัมน์เพื่อเลือกงาน</div>)}

      {msg && <div class="gb-msg" role="alert">{msg}</div>}

      {!classId ? <NoClasses /> : status === "error" ? (
        <LoadError onRetry={() => load()} />
      ) : assignments.length === 0 ? (
        <div class="card">{status === "loading" ? <EmptyState icon="loader-2" text="กำลังโหลด…" /> : <EmptyState icon="clipboard-off" text="ยังไม่มีงานในเงื่อนไขนี้" action={<button class="primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={16} /> สร้างงาน</button>} />}</div>
      ) : phone ? (
        <GradebookMobile assignments={assignments} selAsg={selAsg} setSelCol={setSelCol} students={shownStudents}
          subOf={subOf} markOf={markOf} stateOf={stateOf} editing={editing} setEditing={setEditing} commitScore={commitScore} bulk={bulk} openPanel={(aid, sid) => setCellPanel({ aid, sid })}
          manage={{
            edit: () => setEditAsg(selAsg!),
            copy: () => setCopyAsg(selAsg!),
            toggleStatus: toggleOpen,
            togglePublish: () => saveAsgPatch({ publish_scores: !selAsg!.publish_scores }, selAsg!.publish_scores ? "ซ่อนคะแนนบนจอแล้ว" : "แสดงคะแนนบนจอแล้ว"),
            remove: removeAssignment,
          }} />
      ) : (
        <>
        <div class={"gb-frame" + edgeClassOf(scrollFlags) + (colPrefs.showTotal ? "" : " no-tot")}>
        <div class="gb-scroll" ref={scrollRef} role="region" aria-label="ตารางคะแนน">
          <table class={"gb" + (flat ? "" : " grouped")} style={`--gb-n:${dgroups.reduce((n, x) => n + (folded(x.group) ? 1 : x.shown.length), 0)}`}>
            <caption class="sr-only">สมุดคะแนน {classById(classId)?.name} · ลูกศรเลื่อนช่อง · พิมพ์ตัวเลขเพื่อกรอกคะแนน · Alt+Enter เปิดตัวแก้ไขช่อง</caption>
            <thead>
              {!flat && (
                <tr class="gh">
                  <th class="name-col gh-corner">
                    <button type="button" class="gh-all" onClick={toggleFoldAll}>
                      <Icon name={allFolded ? "arrows-diagonal" : "arrows-diagonal-minimize-2"} size={14} /> {allFolded ? "กางทั้งหมด" : "พับทั้งหมด"}
                    </button>
                  </th>
                  {dgroups.map(({ group: g, shown: cols }) => {
                    const closed = folded(g);
                    return (
                      <th colSpan={closed ? 1 : cols.length} class={"gh-cell" + (closed || cols.length === 1 ? " nar" : "")} style={`background:var(--tint-${g.color}-bg);color:var(--tint-${g.color}-fg)`}>
                        <button type="button" class="gh-btn" aria-expanded={!closed} title={`${g.label} · ${g.items.length} งาน`} onClick={() => toggleGroup(g.key)}>
                          <Icon name={closed ? "chevron-right" : "chevron-down"} size={14} />
                          {groupMode === "type" && <TypeShape color={g.color} />}
                          <span class="gh-label">{g.label}</span><span class="gh-cnt"> · {g.items.length} งาน</span>
                        </button>
                      </th>
                    );
                  })}
                  {colPrefs.showTotal && <th scope="col" rowSpan={2} class="tot-col gh-tot" title={hiddenCount > 0 ? `ไม่รวมงานที่ซ่อนคะแนน (${hiddenCount} งาน)` : undefined}>สะสม{hiddenCount > 0 ? "*" : ""}</th>}
                </tr>
              )}
              <tr class="hd">
                <th scope="col" class="name-col">ชื่อ - สกุล</th>
                {dgroups.map(({ group: g, shown: cols }) => folded(g) ? (
                  <th scope="col" tabIndex={0} data-gkey={g.key} class="col-w sumcol" style={`border-top-color:${TINT_FG[g.color]}`} title={`รวม${g.label} · ${g.items.length} งาน · แตะเพื่อกางกลุ่ม`}
                    onClick={() => toggleGroup(g.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGroup(g.key); } }}>
                    <div class="ht">รวม {g.label}</div>
                    <div class="hs">{g.items.length} งาน</div>
                  </th>
                ) : cols.map((a) => {
                  const cnt = matrix.counts(a.id) ?? countWorkStates([]);
                  const pct = assignmentRate(cnt);
                  const overdue = a.status !== "closed" && !!a.due_date && a.due_date < today;
                  const tl = typeLabel(typeKeyOf(a));
                  const closedWork = a.status === "closed";
                  const sel = a.id === selCol;
                  const eyeShown = sel || !a.publish_scores;   // the eye of a column that shows its scores appears only on the picked column
                  return (
                    <th scope="col" tabIndex={0} data-aid={a.id} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelCol(a.id); } }}
                      class={"col-w" + (sel ? " sel" : "") + (closedWork ? " closed" : "") + (closedWork || eyeShown ? " x" : "")} style={tintVars(tl.color)} aria-label={`${tl.name}: ${a.title} · เต็ม ${a.full_score}${closedWork ? " · ปิดรับ" : ""}${a.publish_scores ? "" : " · ซ่อนคะแนน"} · ส่งแล้ว ${pct}%`}
                      title={`${tl.name}: ${a.title} · เต็ม ${a.full_score}${closedWork ? " · ปิดรับ" : ""}${a.publish_scores ? "" : " · ซ่อนคะแนน"} · ส่งแล้ว ${pct}%`} onClick={() => setSelCol(a.id)}>
                      <div class="ttl">
                        <span class="tshape-w"><TypeShape color={tl.color} /></span>
                        <div class="ht" style={sel ? "font-weight:500" : ""}>{a.title}</div>
                      </div>
                      <div class="hs" title={`คะแนนเต็ม ${a.full_score} · สั่ง ${formatThaiDate(a.assigned_date)} · กำหนดส่ง ${a.due_date ? formatThaiDate(a.due_date) : "ไม่มี"}`}>
                        <span class={overdue ? "over" : ""}>เต็ม {a.full_score}<Icon name={overdue ? "calendar-event" : "calendar"} size={12} title={overdue ? "เลยกำหนดส่ง" : "กำหนดส่ง"} class="hs-cal" />{a.due_date ? formatThaiDate(a.due_date).replace(/ \d{4}$/, "") : "—"}</span>
                      </div>
                      <div class="hs2">ส่งแล้ว {cnt.submitted}/{cnt.counted}</div>
                      <div class="hd-corner">
                        {closedWork && <Icon name="lock" size={14} title="ปิดรับงานแล้ว" class="hd-lock" />}
                        <button type="button" class={"hs-eye" + (a.publish_scores ? "" : " off")} aria-busy={act.isBusy(`asg:${a.id}`)} aria-label={a.publish_scores ? "ซ่อนคะแนนของงานนี้" : "แสดงคะแนนของงานนี้"}
                          disabled={act.isBusy("publish-all") || act.isBusy(`asg:${a.id}`)}
                          title={a.publish_scores ? "คะแนนแสดงอยู่ — กดเพื่อซ่อน" : "ซ่อนคะแนนอยู่ — กดเพื่อแสดง"}
                          onClick={(e) => { e.stopPropagation(); saveAsgPatch({ publish_scores: !a.publish_scores }, a.publish_scores ? "ซ่อนคะแนนบนจอแล้ว" : "แสดงคะแนนบนจอแล้ว", a); }}>
                          <Icon name={a.publish_scores ? "eye" : "eye-off"} size={14} />
                        </button>
                      </div>
                      {colPrefs.showBars && <div class="hbar" title={`ส่งแล้ว ${pct}%`}><div style={`width:${pct}%`} /></div>}
                    </th>
                  );
                }))}
                {colPrefs.showTotal && flat && <th scope="col" class="tot-col" title={hiddenCount > 0 ? `ไม่รวมงานที่ซ่อนคะแนน (${hiddenCount} งาน)` : undefined}>สะสม{hiddenCount > 0 ? "*" : ""}</th>}
              </tr>
            </thead>
            <tbody>
              {shownStudents.map((st, i) => {
                const subFor = (list: Assignment[]) => (idx: number) => { const s = matrix.sub(list[idx].id, st.id); return s ? { status: s.status, score: s.score, late: s.late } : undefined; };
                const sum = matrix.summary(st.id)!;
                return (
                  <tr>
                    <td class="name-col" title={fullName(st)}>
                      {matrix.missing(st.id) && <span class="gb-reddot" />}
                      <span class="muted" style="margin-right:6px">{st.number ?? i + 1}</span>{fullName(st)}
                    </td>
                    {dgroups.map(({ group: g, shown: cols }) => {
                      if (folded(g)) {
                        // the group's own total: same rule as สะสม, only over this group's work whose scores are showing
                        const shown = g.items.filter((a) => a.publish_scores);
                        const tot = groupScoreTotal(shown, subFor(shown), today);
                        const goEdit = () => {
                          // an excused child is never changed by a quick tap: the editor opens on its own
                          const first = cols[0]?.id;
                          if (first && subOf(first, st.id)?.status === "excused") { toggleGroup(g.key); setCellPanel({ aid: first, sid: st.id }); return; }
                          openAndEdit(g, st.id, first);
                        };
                        return (
                          <td class="sumc" tabIndex={0} data-gkey={g.key} aria-label={`รวม ${g.label} · ${fullName(st)} · ${shown.length === 0 ? "ซ่อนคะแนน" : tot ? `${tot.score}/${tot.fullScore}` : "ยังไม่มีคะแนน"} · แตะเพื่อกางและแก้คะแนน`}
                            title={"แตะเพื่อกางและแก้คะแนน" + (shown.length === 0 ? " · ซ่อนคะแนนทุกงานในกลุ่มนี้" : shown.length < g.items.length ? ` · ไม่รวมงานที่ซ่อนคะแนน (${g.items.length - shown.length} งาน)` : "")}
                            onClick={goEdit} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); goEdit(); } }}>
                            {shown.length === 0 ? "•••" : tot ? <>{tot.score}<span class="muted">/{tot.fullScore}</span></> : <span class="muted">–</span>}{shown.length > 0 && shown.length < g.items.length ? "*" : ""}
                          </td>
                        );
                      }
                      return cols.map((a) => {
                        const c = matrix.cell(a.id, st.id);
                        const isEditing = editing?.aid === a.id && editing?.sid === st.id;
                        const isFoc = focCell ? focCell.aid === a.id && focCell.sid === st.id : firstCell?.aid === a.id && firstCell?.sid === st.id;
                        return (
                          <GradebookCell key={a.id} h={cellH} a={a} st={st} row={i} state={c ? c.state : matrix.state(a.id, st.id, a)} score={c?.sub?.score} mark={c ? c.mark : matrix.mark(a.id, st.id)}
                            isEditing={isEditing} isFoc={isFoc} showMore={isEditing || (isFoc && focusIn?.aid === a.id && focusIn?.sid === st.id)} isSel={a.id === selCol} seed={isEditing ? editSeed : null} />
                        );
                      });
                    })}
                    {colPrefs.showTotal && <td class="tot-col" style="font-size:var(--fs-xs)" title={allHidden ? "ซ่อนคะแนนทุกงานอยู่" : hiddenCount > 0 ? `ไม่รวมงานที่ซ่อนคะแนน (${hiddenCount} งาน)` : undefined}>{allHidden ? "•••" : <>{sum.score}<span class="muted">/{sum.fullScore}</span></>}</td>}
                  </tr>
                );
              })}
              <tr class="avg">
                <td class="name-col">เฉลี่ย · ส่งแล้ว</td>
                {dgroups.map(({ group: g, shown: cols }) => folded(g) ? <td /> : cols.map((a) => {
                  const counts = matrix.counts(a.id) ?? countWorkStates([]);
                  const avg = matrix.average(a.id) ?? null;
                  return <td>{!a.publish_scores && avg != null ? "•••" : (avg ?? "–")}<br /><span class="muted">{assignmentFraction(counts)}</span></td>;
                }))}
                {colPrefs.showTotal && <td class="tot-col" />}
              </tr>
            </tbody>
          </table>
        </div>
        </div>
        </>
      )}

      {status === "ready" && !!classId && (
        <GradebookBottom assignments={assignments} selAsg={selAsg} students={students} counts={tot} stateOf={stateOf} today={today} submitRate={submitRate}
          scoresOf={scoresOf} onPick={cardFns.onPick} onRows={cardFns.onRows} onCloseWork={cardFns.onCloseWork} />
      )}

      {bulkAsk && selAsg && (
        <BulkConfirm ask={bulkAsk} asg={selAsg} className={classById(classId)?.name ?? ""}
          onCancel={() => { setBulkAsk(null); refocusBulkTrigger(); }}
          onConfirm={(d) => { const a = bulkAsk.action; setBulkAsk(null); refocusBulkTrigger(); runBulk(a, d); }} />
      )}

      {askNode}
      {prefsOpen && <PageCardSettings page="gradebook" title="หน้าคะแนน" layout={gradebookLayout.value} meta={GRADEBOOK_CARD_META} locked={GRADEBOOK_LOCKED} onClose={() => setPrefsOpen(false)} />}
      {cellPanel && (() => {
        const a = assignments.find((x) => x.id === cellPanel.aid), st = students.find((x) => x.id === cellPanel.sid);
        if (!a || !st) return null;
        const cur = subOf(a.id, st.id);
        return <CellEditor key={a.id + st.id} studentName={fullName(st)} title={a.title} fullScore={a.full_score} assignedDate={a.assigned_date} dueDate={a.due_date}
          now={cur ? { status: cur.status as "submitted" | "excused" | "void", score: cur.score, late: cur.late, submittedAt: cur.submittedAt ?? null } : undefined}
          onClose={() => setCellPanel(null)} onSave={(ch) => { setCellPanel(null); void applyCell(a.id, st.id, ch); }} />;
      })()}
      {showCreate && <AssignmentModal defaultClassId={classId} defaultSubjectId={subjectId} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(true); }} />}
      {editAsg && <AssignmentModal existing={editAsg} onReload={() => loadRef.current(true)} onClose={() => setEditAsg(null)} onSaved={() => { setEditAsg(null); load(true); }} />}
      {copyAsg && <AssignmentModal copyFrom={copyAsg} defaultClassId={classId} onClose={() => setCopyAsg(null)} onSaved={() => { setCopyAsg(null); load(true); }} />}
    </div>
  );
}

const BULK_TEXT: Record<BulkAction, { title: (n: number) => string; body: (full: number) => string; go: (n: number) => string; danger?: boolean }> = {
  "all-submitted": { title: (n) => `ทั้งห้องส่งแล้ว ${n} คน?`, body: () => "ทำเครื่องหมายว่าส่งแล้วให้คนที่ยังไม่ส่ง · คนที่ยกเว้นไม่ถูกแตะ", go: (n) => `ส่งแล้ว ${n} คน` },
  "full-score": { title: (n) => `ให้เต็ม ${n} คน?`, body: (full) => `ให้คะแนนเต็ม ${full} กับคนที่ส่งแล้ว · คนที่ยกเว้นไม่ถูกแตะ`, go: (n) => `ให้เต็ม ${n} คน` },
  clear: { title: (n) => `ล้างคะแนนทั้งงาน ${n} คน?`, body: () => "ล้างการส่งและคะแนนของคนที่ส่งแล้ว · คนที่ยกเว้นไม่ถูกแตะ · ย้อนกลับได้หลังล้าง", go: (n) => `ล้าง ${n} คน`, danger: true },
};

/** Confirm a whole-class action. Cancel comes first in the DOM so the dialog opens focused on it. */
function BulkConfirm({ ask, asg, className, onCancel, onConfirm }: {
  ask: { action: BulkAction; count: number }; asg: Assignment; className: string; onCancel: () => void; onConfirm: (receivedDate: string | null) => void;
}) {
  const t = BULK_TEXT[ask.action];
  // only "everyone handed in" carries a received day (the others have none): default today
  const [day, setDay] = useState(bkkToday());
  const dayProblem = ask.action === "all-submitted" ? checkReceivedDate(day, { today: bkkToday(), assignedDate: asg.assigned_date }) : null;
  return (
    <div class="modal-overlay" style="z-index:150" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <Dialog label={t.title(ask.count)} style="max-width:420px" onClose={onCancel}>
        <h2 style="font-size:1.2rem;margin-bottom:6px">{t.title(ask.count)}</h2>
        <div style="overflow-wrap:anywhere;font-weight:500">{asg.title}</div>
        <div class="page-sub" style="margin-bottom:8px">{className} · {t.body(asg.full_score)}</div>
        {ask.count === 0 && <div class="page-sub" style="margin-bottom:8px">ไม่มีรายการที่ต้องเปลี่ยน</div>}
        {ask.action === "all-submitted" && asg.status === "closed" && <div class="page-sub" style="color:var(--text-danger);margin-bottom:8px" role="alert">งานนี้ปิดรับแล้ว — เปิดรับงานก่อนจึงจะทำทั้งห้องส่งแล้วได้</div>}
        {ask.action === "all-submitted" && ask.count > 0 && (
          <div style="margin:6px 0">
            <div class="page-sub" style="margin-bottom:4px">วันที่รับงาน</div>
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">
              <button type="button" aria-pressed={day === bkkToday()} class={day === bkkToday() ? "primary" : ""} onClick={() => setDay(bkkToday())}>วันนี้</button>
              <button type="button" aria-pressed={day === bkkToday(Date.now() - 86_400_000)} class={day === bkkToday(Date.now() - 86_400_000) ? "primary" : ""} onClick={() => setDay(bkkToday(Date.now() - 86_400_000))}>เมื่อวาน</button>
            </div>
            <DateField value={day} onChange={setDay} label="วันที่รับงานทั้งห้อง" />
            {dayProblem
              ? <div class="page-sub" style="color:var(--text-danger);margin-top:4px" role="alert">{dayProblem === "received_date_future" ? "เลือกวันอนาคตไม่ได้" : dayProblem === "received_date_before_assigned" ? "วันที่รับอยู่ก่อนวันมอบหมายงาน" : "วันที่ไม่ถูกต้อง"}</div>
              : <div class="page-sub" style="margin-top:4px">→ {dateLine(day, asg.due_date, bkkToday()).split(" · ")[0]}</div>}
          </div>
        )}
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button type="button" onClick={onCancel}>ยกเลิก</button>
          <button type="button" class={t.danger ? "" : "primary"} style={t.danger ? "background:var(--fill-danger);color:var(--on-danger);border-color:var(--fill-danger)" : undefined} disabled={ask.count === 0 || !!dayProblem || (ask.action === "all-submitted" && asg.status === "closed")} onClick={() => onConfirm(ask.action === "all-submitted" ? day : null)}>{t.go(ask.count)}</button>
        </div>
      </Dialog>
    </div>
  );
}

function nextCell(students: any[], i: number, aid: string) {
  if (i + 1 < students.length) return { aid, sid: students[i + 1].id };
  return null;
}

function GradebookMobile({ assignments, selAsg, setSelCol, students, subOf, markOf, stateOf, editing, setEditing, commitScore, bulk, manage, openPanel }: {
  assignments: Assignment[]; selAsg: Assignment | null; setSelCol: (id: string) => void;
  students: any[]; subOf: (aid: string, sid: string) => Sub | undefined; markOf: (aid: string, sid: string) => "pend" | "fail" | "unsaved" | null; stateOf: (aid: string, sid: string, a: Assignment) => WorkState;
  editing: { aid: string; sid: string } | null; setEditing: (v: { aid: string; sid: string } | null) => void;
  commitScore: (aid: string, sid: string, initial: string, raw: string) => void;
  bulk: (a: "all-submitted" | "full-score" | "clear") => void;
  /** a tap on a child opens the cell editor (a sheet on a phone): status, score and received day in one place */
  openPanel: (aid: string, sid: string) => void;
  // the same per-assignment actions the desktop bar has: edit / copy / close / publish / delete
  manage: { edit: () => void; copy: () => void; toggleStatus: () => void; togglePublish: (() => void) | null; remove: () => void };
}) {
  const [menu, setMenu] = useState(false);
  if (!selAsg) return null;
  const counts = countWorkStates(students.map((st) => stateOf(selAsg.id, st.id, selAsg)));
  return (
    <div class="card">
      <div class="gb-mchips">
        {assignments.map((a) => (
          <button aria-label={a.title} aria-pressed={a.id === selAsg.id} class={"pill" + (a.id === selAsg.id ? " on" : "")} onClick={() => setSelCol(a.id)}>{a.title.length > 12 ? a.title.slice(0, 12) + "…" : a.title}</button>
        ))}
      </div>
      {/* the tabs above cut long titles short: the work picked is always named in full here */}
      <div style="font-weight:500;overflow-wrap:anywhere;margin-bottom:2px">{selAsg.title}</div>
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <span class="page-sub">เต็ม {selAsg.full_score} · ส่งแล้ว {assignmentFraction(counts)}</span>
        <div style="position:relative">
          <button data-bulk-trigger data-more-trigger aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><Icon name="dots-vertical" size={20} /> จัดการงาน</button>
          {menu && (<>
            <div style="position:fixed;inset:0;z-index:39" onClick={() => setMenu(false)} />
            <div class="gb-menu" role="menu" aria-label="จัดการงาน" ref={focusFirstItem} onKeyDown={menuKeys(() => setMenu(false))}>
              <button role="menuitem" onClick={() => { setMenu(false); bulk("all-submitted"); }}><Icon name="checks" size={15} /> ทั้งห้องส่งแล้ว…</button>
              <button role="menuitem" onClick={() => { setMenu(false); bulk("full-score"); }}><Icon name="star" size={15} /> ให้เต็มคนที่ส่ง…</button>
              <button role="menuitem" onClick={() => { setMenu(false); bulk("clear"); }} style="color:var(--text-danger)"><Icon name="eraser" size={15} /> ล้างคะแนนทั้งงาน…</button>
              <div class="gb-menu-sep" role="separator" />
              <button role="menuitem" onClick={() => { setMenu(false); manage.edit(); }}><Icon name="edit" size={15} /> แก้ไขงาน</button>
              <button role="menuitem" onClick={() => { setMenu(false); manage.copy(); }}><Icon name="copy" size={15} /> คัดลอกงาน</button>
              <button role="menuitem" onClick={() => { setMenu(false); manage.toggleStatus(); }}><Icon name={selAsg.status === "open" ? "lock" : "lock-open"} size={15} /> {selAsg.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}</button>
              {manage.togglePublish && <button role="menuitem" onClick={() => { setMenu(false); manage.togglePublish!(); }}><Icon name={selAsg.publish_scores ? "eye" : "eye-off"} size={15} /> {selAsg.publish_scores ? "ซ่อนคะแนนบนจอ" : "แสดงคะแนนบนจอ"}</button>}
              <button role="menuitem" onClick={() => { setMenu(false); manage.remove(); }} style="color:var(--text-danger)"><Icon name="trash" size={15} /> ลบงาน</button>
            </div>
          </>)}
        </div>
      </div>
      {students.map((st, i) => {
        const sub = subOf(selAsg.id, st.id);
        const isEditing = editing?.aid === selAsg.id && editing?.sid === st.id;
        return (
          <div class="gb-mrow">
            <span class="no">{st.number ?? i + 1}</span>
            <span class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{fullName(st)}</span>
            {isEditing ? (
              <CellInput initial={sub?.score != null ? String(sub.score) : ""}
                onCommit={(initial, v) => { commitScore(selAsg.id, st.id, initial, v); setEditing(null); }} onCancel={() => setEditing(null)} />
            ) : (
              <button aria-label={`กรอกคะแนน ${fullName(st)} · ${selAsg.publish_scores ? sub?.score ?? "ยังไม่มีคะแนน" : "ซ่อนคะแนน"}`} style="background:transparent;border:none;padding:0" onClick={() => openPanel(selAsg.id, st.id)}>
                <WorkCell state={stateOf(selAsg.id, st.id, selAsg)} score={sub?.score} mark={markOf(selAsg.id, st.id)} hidden={!selAsg.publish_scores} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
