import { useEffect, useState, useRef } from "preact/hooks";
import "../styles/grade.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented, WorkCell, EmptyState, LoadError, TermPicker, YearBanner, useIsPhone, NoClasses } from "../components/ui";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import {
  viewClasses, rosterCount, classById, activeSubjects, activeWorkTypes, studentsByClass, workTypeById, selectedTermId,
  viewingPastYear, upsertAssignment, dropAssignment, captureAssignmentContext, assignmentContextCurrent,
} from "../store";
import type { Assignment, Student } from "@shared/types";
import { api, ApiError } from "../lib/api";
import { enqueueSubmission, onResult, pendingOps, failedPairKeys, pairKey, flush } from "../lib/outbox";
import { actionTime } from "../lib/clock";
import { ulid } from "@shared/ids";
import { decideCellCommit } from "@shared/grade";
import { workState, studentSummary, groupScoreTotal, countWorkStates, assignmentRate, assignmentFraction, classSubmitRate, type WorkState } from "@shared/metrics";
import { bkkToday } from "@shared/time";
import { fullName } from "../lib/names";
import { formatThaiDate, monthOptions, currentMonthIso } from "../lib/dates";
import { notify, ok, err, withToast } from "../lib/notify";
import { AssignmentModal } from "../components/AssignmentModal";
import { Dialog } from "../components/Dialog";
import {
  buildGroups, defaultCollapsed, isCollapsed, loadGroupMode, saveGroupMode, type GroupMode, type Group,
} from "../lib/gbGroups";
import { routeParams, navigate, setNavGuard } from "../router";
import { useAction } from "../lib/useAction";

interface Sub { status: string; score: number | null; late: boolean }
type SubKey = string; // `${assignmentId}:${studentId}`
type RowFilter = "all" | "missing" | "awaiting";

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

const monthShort = (ym: string) => (ym ? formatThaiDate(`${ym}-01`).split(" ")[1] ?? ym : "ไม่ระบุวันที่");

export function GradebookPage() {
  const params = routeParams();
  const phone = useIsPhone();
  const [classId, setClassId] = useState(params.class || viewClasses.value[0]?.id || "");
  // deep links (Home cards) name the class, subject and assignment they want to land on
  const [subjectId, setSubjectId] = useState(params.subject ?? activeSubjects.value[0]?.id ?? "");
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
  const [groupMode, setGroupModeState] = useState<GroupMode>(() => loadGroupMode());
  const [foldTaps, setFoldTaps] = useState<Map<string, boolean>>(new Map()); // the teacher's own fold/unfold taps (true = folded)
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

  // the rows come from the server's roster for this class in this term (an earlier year shows its own
  // children); until it arrives, this year's class is drawn from the copy the app already holds
  const [roster, setRoster] = useState<Student[] | null>(null);
  const students = roster ?? (viewingPastYear.value ? [] : studentsByClass.value.get(classId) ?? []);
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
      for (const s of res.submissions) m.set(`${s.assignment_id}:${s.student_id}`, { status: s.status, score: s.score, late: s.late });
      setSubs(m);
      if (res.assignments.length && !res.assignments.find((a) => a.id === selCol)) setSelCol(res.assignments[0].id);
      setStatus("ready");
    } catch {
      if (!fresh()) return;
      if (keep) err("โหลดข้อมูลใหม่ไม่สำเร็จ — ที่เห็นอาจไม่ล่าสุด");
      else setStatus("error");
    }
  }
  useEffect(() => { load(); }, [classId, subjectId, typeId, selectedTermId.value, period, month]);
  // "สร้างงาน" from Home arrives as #/gradebook?new=1: open the form once, then drop the flag so a reload doesn't reopen it
  useEffect(() => { if (params.new === "1") navigate("/gradebook", { class: params.class, subject: params.subject }); }, []);

  // When a queued edit lands, take the server's row as the cell's value. Otherwise, once the
  // "waiting to send" overlay disappears, the cell would fall back to the (older) snapshot this
  // page loaded earlier — e.g. show 14 again after 9 was saved.
  useEffect(() => onResult((r, op) => {
    // ok / duplicate / superseded all come with the row the SERVER now holds — adopt it
    if ((r.result !== "ok" && r.result !== "duplicate" && r.result !== "superseded") || !r.submission) return;
    const sub = r.submission;
    setSubs((prev) => new Map(prev).set(`${op.assignmentId}:${op.studentId}`, { status: sub.status, score: sub.score, late: sub.late }));
  }), []);

  const selAsg = assignments.find((a) => a.id === selCol) ?? null;

  // What a cell shows = the server's value, unless this device has a newer edit still
  // waiting to be sent — then that edit wins, so reloading or switching class never
  // shows 3 again while 9 is still in the queue.
  const pend = pendingOps.value;
  const failed = failedPairKeys.value;
  const subOf = (aid: string, sid: string): Sub | undefined => {
    const server = subs.get(`${aid}:${sid}`);
    const u = unsaved.get(`${aid}:${sid}`);
    if (u) return { status: "submitted", score: u.score, late: server?.late ?? false };
    const op = pend.get(pairKey({ assignmentId: aid, studentId: sid }));
    if (!op) return server;
    if (op.status === "void") return undefined;
    if (op.status === "excused") return { status: "excused", score: null, late: server?.late ?? false };
    return { status: "submitted", score: op.score, late: server?.late ?? false };
  };
  const markOf = (aid: string, sid: string): "pend" | "fail" | "unsaved" | null => {
    if (unsaved.has(`${aid}:${sid}`)) return "unsaved";
    const k = pairKey({ assignmentId: aid, studentId: sid });
    return failed.has(k) ? "fail" : pend.has(k) ? "pend" : null;
  };
  const stateOf = (aid: string, sid: string, a: Assignment): WorkState => {
    const s = subOf(aid, sid);
    return workState(s ? { status: s.status, score: s.score, late: s.late } : null, a, today);
  };
  const missingByStudent = (sid: string) => assignments.some((a) => stateOf(a.id, sid, a) === "missing");

  const shownStudents = students.filter((st) => {
    if (rowFilter === "all") return true;
    return assignments.some((a) => stateOf(a.id, st.id, a) === (rowFilter === "missing" ? "missing" : "awaiting"));
  });

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
    setNavGuard(() => confirm(`มีคะแนน ${unsaved.size} ช่องที่ยังบันทึกลงเครื่องไม่ได้ ออกจากหน้านี้แล้วจะหายไป — ออกเลยไหม?`));
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
  async function runBulk(action: BulkAction) {
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
      const res = await api.post<{ changed: number; batchId: string }>(`/api/assignments/${selAsg.id}/bulk`, { action, classId });
      await load(true);
      if (action === "clear" && res.changed > 0) {
        notify("info", `ล้างแล้ว ${res.changed} รายการ`, { sticky: true, action: { label: "ย้อนกลับ", run: async () => {
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
        const res = await api.post<{ assignment: Assignment }>("/api/assignments", {
          id: before.id, subject_id: before.subject_id, type_id: before.type_id, title: before.title,
          unit: before.unit, full_score: before.full_score, assigned_date: before.assigned_date,
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

  async function removeAssignment() {
    if (!selAsg) return;
    setMenuOpen(false);
    if (!confirm(`ลบงาน "${selAsg.title}"? คะแนนที่บันทึกไว้จะถูกซ่อน`)) return;
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
  const tot = countWorkStates(students.flatMap((st) => assignments.map((a) => stateOf(a.id, st.id, a))));
  const totAwaiting = tot.awaiting, totMissing = tot.missing;
  const submitRate = classSubmitRate([tot]); // Σ handed in ÷ Σ(handed in + overdue), not-yet-due left out

  // columns: grouped by type / month (or not at all). Old groups start folded; the teacher's own taps win.
  const groups: Group<Assignment>[] = buildGroups(assignments, groupMode,
    (id) => { const t = workTypeById(id); return { name: t?.name ?? "ไม่ระบุประเภท", color: t?.color ?? "violet" }; }, monthShort);
  const flat = groupMode === "none";
  const foldedByDefault = defaultCollapsed(groups, today);
  const folded = (g: Group<Assignment>) => !flat && isCollapsed(g.key, foldedByDefault, foldTaps);
  const allFolded = !flat && groups.length > 0 && groups.every(folded);
  function setGroupMode(m: GroupMode) { setGroupModeState(m); setFoldTaps(new Map()); saveGroupMode(m); }
  function toggleGroup(key: string) {
    const g = groups.find((x) => x.key === key);
    if (g) setFoldTaps((prev) => new Map(prev).set(key, !folded(g)));
  }
  function toggleFoldAll() { setFoldTaps(new Map(groups.map((g) => [g.key, !allFolded] as [string, boolean]))); }

  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));

  return (
    <div>
      <PageHeader icon="table" title="สมุดคะแนน"
        sub={<>{classById(classId)?.name} · {activeSubjects.value.find((s) => s.id === subjectId)?.name ?? "ทุกวิชา"}</>}
        actions={<><TermPicker /><button class="primary" onClick={() => setShowCreate(true)}><Icon name="plus" /> สร้างงาน</button></>}
      />

      <YearBanner />
      <div style="margin-bottom:8px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>

      <div class="gb-toolbar">
        <select aria-label="วิชา" value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)}>
          <option value="">ทุกวิชา</option>
          {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="ประเภทงาน" value={typeId} onInput={(e) => setTypeId((e.target as HTMLSelectElement).value)}>
          <option value="">ทุกประเภท</option>
          {activeWorkTypes.value.map((w) => <option value={w.id}>{w.name}</option>)}
        </select>
        <Segmented value={period} onChange={setPeriod} options={[{ value: "term", label: "ทั้งเทอม" }, { value: "month", label: "รายเดือน" }]} />
        {period === "month" && (
          <select aria-label="เดือนของคะแนน" value={month} onInput={(e) => setMonth((e.target as HTMLSelectElement).value)}>
            {monthOptions().map((m) => <option value={m.value}>{m.label}</option>)}
          </select>
        )}
        {!phone && <Segmented label="จัดกลุ่มคอลัมน์" value={groupMode} onChange={setGroupMode} options={[
          { value: "none", label: "ไม่จัดกลุ่ม" }, { value: "type", label: "ตามประเภท" }, { value: "month", label: "ตามเดือน" },
        ]} />}
        <span class="grow" />
        <Segmented value={rowFilter} onChange={setRowFilter} options={[
          { value: "all", label: "ทุกคน" },
          { value: "missing", label: `ค้างส่ง ${totMissing}` },
          { value: "awaiting", label: `รอตรวจ ${totAwaiting}` },
        ]} />
      </div>

      <div class="gb-summary">
        <span><span class="muted">งาน</span> <b>{assignments.length}</b></span>
        <span><span class="muted">อัตราส่ง</span> <b>{submitRate}%</b></span>
        <span><span class="muted">รอตรวจ</span> <b style="color:var(--text-accent)">{totAwaiting}</b></span>
        <span><span class="muted">ค้างส่ง</span> <b style="color:var(--text-danger)">{totMissing} ชิ้น</b></span>
      </div>

      {selAsg && !phone && (
        <div class="gb-actionbar">
          <Icon name="pointer" size={16} />
          <span style="font-weight:500">{selAsg.title}</span>
          <span>· เต็ม {selAsg.full_score}</span>
          {selAsg.status === "closed" && <span class="chip" style="background:var(--surface-2);color:var(--text-secondary)">ปิดรับ</span>}
          <span class="grow" />
          <div style="position:relative">
            <button data-bulk-trigger aria-haspopup="menu" aria-expanded={bulkMenu} disabled={act.isBusy("bulk")} onClick={() => setBulkMenu((v) => !v)}>
              {act.isBusy("bulk") ? <Icon name="loader-2" size={14} class="spin" /> : <Icon name="checks" size={14} />} ทำทั้งห้อง <Icon name="chevron-down" size={14} />
            </button>
            {bulkMenu && (
              <>
                <div style="position:fixed;inset:0;z-index:39" onClick={() => setBulkMenu(false)} />
                <div class="gb-menu gb-menu-left" role="menu">
                  <button role="menuitem" onClick={() => bulk("all-submitted")}><Icon name="checks" size={15} /> ทั้งห้องส่งแล้ว…</button>
                  <button role="menuitem" onClick={() => bulk("full-score")}><Icon name="star" size={15} /> ให้เต็มคนที่ส่ง…</button>
                  <div class="gb-menu-sep" role="separator" />
                  <button role="menuitem" onClick={() => bulk("clear")} style="color:var(--text-danger)"><Icon name="eraser" size={15} /> ล้างคะแนนทั้งงาน…</button>
                </div>
              </>
            )}
          </div>
          <button onClick={toggleAllScores}
            disabled={act.anyBusy}
            title={allHidden ? "แสดงคะแนนทุกงานในตารางตามตัวกรองปัจจุบัน" : "ซ่อนคะแนนทุกงานในตารางตามตัวกรองปัจจุบัน (ในหน้านี้ และไม่ให้ผู้ปกครองเห็น)"}>
            <Icon name={allHidden ? "eye-off" : "eye"} size={14} /> {allHidden ? "แสดงคะแนนทั้งหมด" : "ซ่อนคะแนนทั้งหมด"}
          </button>
          <div style="position:relative">
            <button aria-label="จัดการงาน" onClick={() => setMenuOpen((v) => !v)}><Icon name="dots-vertical" size={16} /></button>
            {menuOpen && (
              <>
                <div style="position:fixed;inset:0;z-index:39" onClick={() => setMenuOpen(false)} />
                <div class="gb-menu">
                  <button onClick={() => { setMenuOpen(false); setEditAsg(selAsg); }}><Icon name="edit" size={15} /> แก้ไข</button>
                  <button onClick={() => { setMenuOpen(false); setCopyAsg(selAsg); }}><Icon name="copy" size={15} /> คัดลอกงาน</button>
                  <button disabled={act.isBusy("publish-all")} onClick={() => saveAsgPatch({ status: selAsg.status === "open" ? "closed" : "open" }, selAsg.status === "open" ? "ปิดรับงานแล้ว" : "เปิดรับงานแล้ว")}>
                    <Icon name={selAsg.status === "open" ? "lock" : "lock-open"} size={15} /> {selAsg.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}
                  </button>
                  <button onClick={removeAssignment} style="color:var(--text-danger)"><Icon name="trash" size={15} /> ลบงาน</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {msg && <div style="color:var(--text-danger);font-size:var(--fs-sm);margin-bottom:6px">{msg}</div>}

      {!classId ? <NoClasses /> : status === "error" ? (
        <LoadError onRetry={() => load()} />
      ) : assignments.length === 0 ? (
        <div class="card">{status === "loading" ? <EmptyState icon="loader-2" text="กำลังโหลด…" /> : <EmptyState icon="clipboard-off" text="ยังไม่มีงานในเงื่อนไขนี้" action={<button class="primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={16} /> สร้างงาน</button>} />}</div>
      ) : phone ? (
        <GradebookMobile assignments={assignments} selAsg={selAsg} setSelCol={setSelCol} students={shownStudents}
          subOf={subOf} markOf={markOf} stateOf={stateOf} editing={editing} setEditing={setEditing} commitScore={commitScore} bulk={bulk}
          manage={{
            edit: () => setEditAsg(selAsg!),
            copy: () => setCopyAsg(selAsg!),
            toggleStatus: () => saveAsgPatch({ status: selAsg!.status === "open" ? "closed" : "open" }, selAsg!.status === "open" ? "ปิดรับงานแล้ว" : "เปิดรับงานแล้ว"),
            togglePublish: () => saveAsgPatch({ publish_scores: !selAsg!.publish_scores }, selAsg!.publish_scores ? "ซ่อนคะแนนแล้ว" : "แสดงคะแนนแล้ว"),
            remove: removeAssignment,
          }} />
      ) : (
        <div class="gb-scroll" role="region" aria-label="ตารางคะแนน">
          <table class={"gb" + (flat ? "" : " grouped")}>
            <thead>
              {!flat && (
                <tr role="presentation" class="gh">
                  <th class="name-col gh-corner">
                    <button type="button" class="gh-all" onClick={toggleFoldAll}>
                      <Icon name={allFolded ? "arrows-diagonal" : "arrows-diagonal-minimize-2"} size={14} /> {allFolded ? "กางทั้งหมด" : "พับทั้งหมด"}
                    </button>
                  </th>
                  {groups.map((g) => {
                    const closed = folded(g);
                    return (
                      <th colSpan={closed ? 1 : g.items.length} class="gh-cell" style={`background:var(--tint-${g.color}-bg);color:var(--tint-${g.color}-fg)`}>
                        <button type="button" class="gh-btn" aria-expanded={!closed} title={`${g.label} · ${g.items.length} งาน`} onClick={() => toggleGroup(g.key)}>
                          <Icon name={closed ? "chevron-right" : "chevron-down"} size={14} />
                          <span class="gh-label">{g.label} · {g.items.length} งาน</span>
                        </button>
                      </th>
                    );
                  })}
                  <th class="tot-col gh-tot" />
                </tr>
              )}
              <tr class="hd">
                <th scope="col" class="name-col">ชื่อ - สกุล</th>
                {groups.map((g) => folded(g) ? (
                  <th scope="col" tabIndex={0} class="col-w sumcol" style={`border-top-color:${TINT_FG[g.color]}`} title={`รวม${g.label} · ${g.items.length} งาน · แตะเพื่อกางกลุ่ม`}
                    onClick={() => toggleGroup(g.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGroup(g.key); } }}>
                    <div class="ht">รวม {g.label}</div>
                    <div class="hs">{g.items.length} งาน</div>
                  </th>
                ) : g.items.map((a) => {
                  const pct = assignmentRate(countWorkStates(students.map((st) => stateOf(a.id, st.id, a))));
                  return (
                    <th scope="col" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelCol(a.id); } }} class={"col-w" + (a.id === selCol ? " sel" : "")} style={`border-top-color:${TINT_FG[workTypeById(a.type_id)?.color ?? "violet"]}`} title={a.title} onClick={() => setSelCol(a.id)}>
                      <div class="ht" style={a.id === selCol ? "font-weight:500" : ""}>{a.title}</div>
                      <div class="hs" title={`คะแนนเต็ม ${a.full_score} · สั่ง ${formatThaiDate(a.assigned_date)} · กำหนดส่ง ${a.due_date ? formatThaiDate(a.due_date) : "ไม่มี"}`}>
                        <span>เต็ม {a.full_score} · {a.due_date ? "ส่ง " + formatThaiDate(a.due_date).replace(/ \d{4}$/, "") : "ไม่มีกำหนด"}</span>
                        <button type="button" class={"hs-eye" + (a.publish_scores ? "" : " off")} aria-busy={act.isBusy(`asg:${a.id}`)} aria-label={a.publish_scores ? "ซ่อนคะแนนของงานนี้" : "แสดงคะแนนของงานนี้"}
                          disabled={act.isBusy("publish-all") || act.isBusy(`asg:${a.id}`)}
                          title={a.publish_scores ? "คะแนนแสดงอยู่ — กดเพื่อซ่อน" : "ซ่อนคะแนนอยู่ — กดเพื่อแสดง"}
                          onClick={(e) => { e.stopPropagation(); saveAsgPatch({ publish_scores: !a.publish_scores }, a.publish_scores ? "ซ่อนคะแนนแล้ว" : "แสดงคะแนนแล้ว", a); }}>
                          <Icon name={a.publish_scores ? "eye" : "eye-off"} size={12} />
                        </button>
                      </div>
                      <div class="hbar" title={`ส่งแล้ว ${pct}%`}><div style={`width:${pct}%`} /></div>
                    </th>
                  );
                }))}
                <th scope="col" class="tot-col" title={hiddenCount > 0 ? `ไม่รวมงานที่ซ่อนคะแนน (${hiddenCount} งาน)` : undefined}>สะสม{hiddenCount > 0 ? "*" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {shownStudents.map((st, i) => {
                const subFor = (list: Assignment[]) => (idx: number) => { const s = subOf(list[idx].id, st.id); return s ? { status: s.status, score: s.score, late: s.late } : undefined; };
                const sum = studentSummary(visibleWork, subFor(visibleWork), today);
                return (
                  <tr>
                    <td class="name-col" title={fullName(st)}>
                      {missingByStudent(st.id) && <span class="gb-reddot" />}
                      <span class="muted" style="margin-right:6px">{st.number ?? i + 1}</span>{fullName(st)}
                    </td>
                    {groups.map((g) => {
                      if (folded(g)) {
                        // the group's own total: same rule as สะสม, only over this group's work whose scores are showing
                        const shown = g.items.filter((a) => a.publish_scores);
                        const tot = groupScoreTotal(shown, subFor(shown), today);
                        return (
                          <td class="sumc" title={shown.length === 0 ? "ซ่อนคะแนนทุกงานในกลุ่มนี้" : shown.length < g.items.length ? `ไม่รวมงานที่ซ่อนคะแนน (${g.items.length - shown.length} งาน)` : undefined}>
                            {shown.length === 0 ? "•••" : tot ? <>{tot.score}<span class="muted">/{tot.fullScore}</span></> : <span class="muted">–</span>}{shown.length > 0 && shown.length < g.items.length ? "*" : ""}
                          </td>
                        );
                      }
                      return g.items.map((a) => {
                        const sub = subOf(a.id, st.id);
                        const isEditing = editing?.aid === a.id && editing?.sid === st.id;
                        return (
                          <td tabIndex={isEditing ? -1 : 0} aria-label={`${fullName(st)} · ${a.title} · ${a.publish_scores ? sub?.score ?? "ยังไม่มีคะแนน" : "ซ่อนคะแนน"}`} onKeyDown={(e) => { if (e.target === e.currentTarget && !isEditing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setEditing({ aid: a.id, sid: st.id }); } }} class={"cell" + (a.id === selCol ? " sel" : "")} onClick={() => !isEditing && setEditing({ aid: a.id, sid: st.id })}>
                            {isEditing ? (
                              <CellInput initial={sub?.score != null ? String(sub.score) : ""}
                                onCommit={(initial, v, next) => { commitScore(a.id, st.id, initial, v); setEditing(next ? nextCell(shownStudents, i, a.id) : null); }}
                                onCancel={() => setEditing(null)} />
                            ) : (
                              <WorkCell state={stateOf(a.id, st.id, a)} score={sub?.score} mark={markOf(a.id, st.id)} hidden={!a.publish_scores} />
                            )}
                          </td>
                        );
                      });
                    })}
                    <td class="tot-col" style="font-size:var(--fs-xs)" title={allHidden ? "ซ่อนคะแนนทุกงานอยู่" : hiddenCount > 0 ? `ไม่รวมงานที่ซ่อนคะแนน (${hiddenCount} งาน)` : undefined}>{allHidden ? "•••" : <>{sum.score}<span class="muted">/{sum.fullScore}</span></>}</td>
                  </tr>
                );
              })}
              <tr class="avg">
                <td class="name-col">เฉลี่ย · ส่งแล้ว</td>
                {groups.map((g) => folded(g) ? <td /> : g.items.map((a) => {
                  const counts = countWorkStates(students.map((st) => stateOf(a.id, st.id, a)));
                  const scored = students.map((st) => subOf(a.id, st.id)).filter((s) => s && s.score != null) as Sub[];
                  const avg = scored.length ? Math.round((scored.reduce((n, s) => n + (s.score ?? 0), 0) / scored.length) * 10) / 10 : null;
                  return <td>{!a.publish_scores && avg != null ? "•••" : (avg ?? "–")}<br /><span class="muted">{assignmentFraction(counts)}</span></td>;
                }))}
                <td class="tot-col" />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div class="gb-legend">
        <span><WorkCell state="scored" score={9} /> มีคะแนน</span>
        <span><WorkCell state="late" score={7} /> ส่งช้า</span>
        <span><WorkCell state="awaiting" /> รอตรวจ</span>
        <span><WorkCell state="missing" /> ค้างส่ง</span>
        <span><WorkCell state="pending" /> ยังไม่ถึงกำหนด</span>
        <span><WorkCell state="excused" /> ไม่นับ</span>
        <span><WorkCell state="scored" score={8} mark="pend" /> รอส่งขึ้นระบบ</span>
        <span><WorkCell state="scored" score={8} mark="fail" /> ส่งไม่สำเร็จ</span>
        <span><WorkCell state="scored" score={8} mark="unsaved" /> ยังไม่ได้บันทึก</span>
      </div>
      {!phone && <div class="page-sub" style="margin-top:6px">คลิกหัวคอลัมน์เพื่อเลือกงาน · คลิกช่องเพื่อกรอกคะแนน · Enter ไปคนถัดไป · Esc ยกเลิก · สะสม = คะแนนที่ได้ ÷ เต็มของงานมีคะแนนและค้างส่ง</div>}

      {bulkAsk && selAsg && (
        <BulkConfirm ask={bulkAsk} asg={selAsg} className={classById(classId)?.name ?? ""}
          onCancel={() => { setBulkAsk(null); refocusBulkTrigger(); }}
          onConfirm={() => { const a = bulkAsk.action; setBulkAsk(null); refocusBulkTrigger(); runBulk(a); }} />
      )}

      {showCreate && <AssignmentModal defaultClassId={classId} defaultSubjectId={subjectId} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(true); }} />}
      {editAsg && <AssignmentModal existing={editAsg} onClose={() => setEditAsg(null)} onSaved={() => { setEditAsg(null); load(true); }} />}
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
  ask: { action: BulkAction; count: number }; asg: Assignment; className: string; onCancel: () => void; onConfirm: () => void;
}) {
  const t = BULK_TEXT[ask.action];
  return (
    <div class="modal-overlay" style="z-index:150" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <Dialog label={t.title(ask.count)} style="max-width:420px" onClose={onCancel}>
        <h2 style="font-size:1.2rem;margin-bottom:6px">{t.title(ask.count)}</h2>
        <div style="overflow-wrap:anywhere;font-weight:500">{asg.title}</div>
        <div class="page-sub" style="margin-bottom:8px">{className} · {t.body(asg.full_score)}</div>
        {ask.count === 0 && <div class="page-sub" style="margin-bottom:8px">ไม่มีรายการที่ต้องเปลี่ยน</div>}
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button type="button" onClick={onCancel}>ยกเลิก</button>
          <button type="button" class={t.danger ? "" : "primary"} style={t.danger ? "background:var(--fill-danger);color:var(--on-danger);border-color:var(--fill-danger)" : undefined} disabled={ask.count === 0} onClick={onConfirm}>{t.go(ask.count)}</button>
        </div>
      </Dialog>
    </div>
  );
}

function nextCell(students: any[], i: number, aid: string) {
  if (i + 1 < students.length) return { aid, sid: students[i + 1].id };
  return null;
}

function CellInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (initial: string, v: string, next: boolean) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  const done = useRef(false);
  // latest value + handler, for the unmount path below (a closure would hold the first render's)
  const latest = useRef({ v, onCommit });
  latest.current = { v, onCommit };
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  // Leaving the page (or the class/filter changing) tears the input down without a blur:
  // a typed-but-unconfirmed score must still be recorded, not silently dropped.
  useEffect(() => () => {
    if (done.current) return;
    done.current = true;
    latest.current.onCommit(initial, latest.current.v, false);
  }, []);
  function finish(next: boolean) { if (done.current) return; done.current = true; onCommit(initial, v, next); }
  return (
    <input ref={ref} class="cell-input" aria-label="คะแนน" inputMode="decimal" value={v}
      onInput={(e) => setV((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        // The editor owns these keys. They must not also activate the containing
        // grid cell after committing moves editing to a different row.
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done.current = true; onCancel(); }
      }}
      onBlur={() => finish(false)} />
  );
}

function GradebookMobile({ assignments, selAsg, setSelCol, students, subOf, markOf, stateOf, editing, setEditing, commitScore, bulk, manage }: {
  assignments: Assignment[]; selAsg: Assignment | null; setSelCol: (id: string) => void;
  students: any[]; subOf: (aid: string, sid: string) => Sub | undefined; markOf: (aid: string, sid: string) => "pend" | "fail" | "unsaved" | null; stateOf: (aid: string, sid: string, a: Assignment) => WorkState;
  editing: { aid: string; sid: string } | null; setEditing: (v: { aid: string; sid: string } | null) => void;
  commitScore: (aid: string, sid: string, initial: string, raw: string) => void;
  bulk: (a: "all-submitted" | "full-score" | "clear") => void;
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
          <button data-bulk-trigger style="height:1.87rem" onClick={() => setMenu((v) => !v)}><Icon name="dots-vertical" size={15} /> จัดการงาน</button>
          {menu && (<>
            <div style="position:fixed;inset:0;z-index:39" onClick={() => setMenu(false)} />
            <div class="gb-menu">
              <button onClick={() => { setMenu(false); bulk("all-submitted"); }}><Icon name="checks" size={15} /> ทั้งห้องส่งแล้ว…</button>
              <button onClick={() => { setMenu(false); bulk("full-score"); }}><Icon name="star" size={15} /> ให้เต็มคนที่ส่ง…</button>
              <button onClick={() => { setMenu(false); bulk("clear"); }} style="color:var(--text-danger)"><Icon name="eraser" size={15} /> ล้างคะแนนทั้งงาน…</button>
              <div class="gb-menu-sep" />
              <button onClick={() => { setMenu(false); manage.edit(); }}><Icon name="edit" size={15} /> แก้ไขงาน</button>
              <button onClick={() => { setMenu(false); manage.copy(); }}><Icon name="copy" size={15} /> คัดลอกงาน</button>
              <button onClick={() => { setMenu(false); manage.toggleStatus(); }}><Icon name={selAsg.status === "open" ? "lock" : "lock-open"} size={15} /> {selAsg.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}</button>
              {manage.togglePublish && <button onClick={() => { setMenu(false); manage.togglePublish!(); }}><Icon name={selAsg.publish_scores ? "eye" : "eye-off"} size={15} /> {selAsg.publish_scores ? "ซ่อนคะแนน" : "แสดงคะแนน (ซ่อนอยู่)"}</button>}
              <button onClick={() => { setMenu(false); manage.remove(); }} style="color:var(--text-danger)"><Icon name="trash" size={15} /> ลบงาน</button>
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
              <button aria-label={`กรอกคะแนน ${fullName(st)} · ${selAsg.publish_scores ? sub?.score ?? "ยังไม่มีคะแนน" : "ซ่อนคะแนน"}`} style="background:transparent;border:none;padding:0" onClick={() => setEditing({ aid: selAsg.id, sid: st.id })}>
                <WorkCell state={stateOf(selAsg.id, st.id, selAsg)} score={sub?.score} mark={markOf(selAsg.id, st.id)} hidden={!selAsg.publish_scores} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
