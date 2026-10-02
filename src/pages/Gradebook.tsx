import { useEffect, useState, useRef } from "preact/hooks";
import "../styles/grade.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented, WorkCell, EmptyState, LoadError, NoClassState, TermPicker, YearBanner, useIsPhone } from "../components/ui";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import {
  viewClasses, rosterCount, classById, activeSubjects, activeWorkTypes, studentsByClass, workTypeById, selectedTermId,
  viewingPastYear, upsertAssignment, dropAssignment, patchAssignments,
} from "../store";
import type { Assignment, Student } from "@shared/types";
import { api, ApiError } from "../lib/api";
import { enqueueSubmission, onResult, pendingOps, failedPairKeys, pairKey, flush } from "../lib/outbox";
import { actionTime } from "../lib/clock";
import { ulid } from "@shared/ids";
import { decideCellCommit } from "@shared/grade";
import { workState, studentSummary, type WorkState } from "@shared/metrics";
import { fullName } from "../lib/names";
import { formatThaiDate, monthOptions, currentMonthIso } from "../lib/dates";
import { notify, ok, err, withToast } from "../lib/notify";
import { AssignmentModal } from "../components/AssignmentModal";
import { routeParams, navigate, setNavGuard } from "../router";
import { useAction } from "../lib/useAction";

interface Sub { status: string; score: number | null; late: boolean }
type SubKey = string; // `${assignmentId}:${studentId}`
type RowFilter = "all" | "missing" | "awaiting";

function bkkToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
const TINT_FG: Record<string, string> = {
  aqua: "var(--tint-aqua-fg)", violet: "var(--tint-violet-fg)", orange: "var(--tint-orange-fg)",
  green: "var(--tint-green-fg)", blue: "var(--tint-blue-fg)", magenta: "var(--tint-magenta-fg)", red: "var(--tint-red-fg)",
};

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
    if (!classId) { setStatus("ready"); return; } // no class: nothing to load (the page says so)
    const fresh = begin();
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

  async function bulk(action: "all-submitted" | "full-score" | "clear") {
    if (!selAsg) return;
    setMenuOpen(false);
    const className = classById(classId)?.name ?? "";
    if (action === "clear") {
      const count = students.filter((st) => { const s = subOf(selAsg.id, st.id); return s && s.status !== "void"; }).length;
      if (!confirm(`ล้างการส่ง "${selAsg.title}" ของ ${className} (${count} รายการ)?`)) return;
    }
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
    if (!target || act.isBusy("pub-all")) return;
    await act.run(`asg:${target.id}`, async () => {
      const before = target;
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
        setAssignments((list) => list.map((x) => (x.id === before.id ? before : x))); // the server said no: back to what it holds
        err((e as Error).message || "บันทึกไม่สำเร็จ");
        return;
      }
      // the scan screen (and Home) read the shared list: closing/reopening must show up there NOW
      if (saved) { upsertAssignment(saved); setAssignments((list) => list.map((x) => (x.id === saved!.id ? { ...x, ...saved! } : x))); }
      if (okMsg) ok(okMsg);
    });
  }

  /**
   * Hide or show the scores of EVERY piece of work on screen (the blue bar's button; it follows the filters above the
   * grid). Like saveAsgPatch the screen changes at once and goes back, with a message, if the server refuses; the
   * server takes the list in one call (in chunks of 500, far more than a class ever has).
   */
  async function setAllPublish(publish: boolean) {
    const targets = assignments.filter((a) => a.publish_scores !== publish);
    if (targets.length === 0 || act.anyBusy) return;
    await act.run("pub-all", async () => {
      const ids = targets.map((a) => a.id);
      const flip = (list: string[], to: boolean) => { const set = new Set(list); setAssignments((cur) => cur.map((x) => (set.has(x.id) ? { ...x, publish_scores: to } : x))); };
      flip(ids, publish);
      const done: string[] = [];
      try {
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          await api.post("/api/assignments/publish", { ids: chunk, publish });
          done.push(...chunk);
        }
      } catch (e) {
        flip(ids.filter((id) => !done.includes(id)), !publish); // what the server did not take goes back
        if (done.length) patchAssignments(done, { publish_scores: publish });
        err((e as Error).message || "บันทึกไม่สำเร็จ");
        return;
      }
      patchAssignments(ids, { publish_scores: publish }); // Home and the scan screen read the shared list
      ok(`${publish ? "แสดง" : "ซ่อน"}คะแนนทุกงานแล้ว (${ids.length} งาน)`);
    });
  }

  async function removeAssignment() {
    if (!selAsg) return;
    setMenuOpen(false);
    if (!confirm(`ลบงาน "${selAsg.title}"? คะแนนที่บันทึกไว้จะถูกซ่อน`)) return;
    const done = await withToast(() => api.post(`/api/assignments/${selAsg.id}/delete`), "ลบงานไม่สำเร็จ");
    if (done) { dropAssignment(selAsg.id); setSelCol(null); await load(true); ok("ลบงานแล้ว"); }
  }

  // The running total counts only the work whose scores are showing, so it never gives a hidden score away
  // (and stays useful while one is hidden). All work hidden: nothing to total, shown as •••.
  const visibleWork = assignments.filter((a) => a.publish_scores);
  const hiddenCount = assignments.length - visibleWork.length;
  const allHidden = assignments.length > 0 && visibleWork.length === 0;

  // summary metrics for the toolbar
  let totSubmitted = 0, totApplic = 0, totAwaiting = 0, totMissing = 0;
  for (const st of students) for (const a of assignments) {
    const s = stateOf(a.id, st.id, a);
    if (s === "scored" || s === "late" || s === "awaiting") { totSubmitted++; totApplic++; }
    else if (s === "missing") { totApplic++; totMissing++; }
    if (s === "awaiting") totAwaiting++;
  }
  const submitRate = totApplic ? Math.round((totSubmitted / totApplic) * 100) : 0;

  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));

  if (viewClasses.value.length === 0) return <div><PageHeader icon="table" title="สมุดคะแนน" actions={<TermPicker />} /><NoClassState /></div>;

  return (
    <div>
      <PageHeader icon="table" title="สมุดคะแนน"
        sub={<>{classById(classId)?.name} · {activeSubjects.value.find((s) => s.id === subjectId)?.name ?? "ทุกวิชา"}</>}
        actions={<><TermPicker /><button class="primary" onClick={() => setShowCreate(true)}><Icon name="plus" /> สร้างงาน</button></>}
      />

      <YearBanner />
      <div style="margin-bottom:8px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>

      <div class="gb-toolbar">
        <select value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)}>
          <option value="">ทุกวิชา</option>
          {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
        </select>
        <select value={typeId} onInput={(e) => setTypeId((e.target as HTMLSelectElement).value)}>
          <option value="">ทุกประเภท</option>
          {activeWorkTypes.value.map((w) => <option value={w.id}>{w.name}</option>)}
        </select>
        <Segmented value={period} onChange={setPeriod} options={[{ value: "term", label: "ทั้งเทอม" }, { value: "month", label: "รายเดือน" }]} />
        {period === "month" && (
          <select value={month} onInput={(e) => setMonth((e.target as HTMLSelectElement).value)}>
            {monthOptions().map((m) => <option value={m.value}>{m.label}</option>)}
          </select>
        )}
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
          <button onClick={() => bulk("all-submitted")} disabled={act.isBusy("bulk")}>{act.isBusy("bulk") ? <Icon name="loader-2" size={14} class="spin" /> : <Icon name="checks" size={14} />} ทั้งห้องส่งแล้ว</button>
          <button onClick={() => bulk("full-score")} disabled={act.isBusy("bulk")}>ให้เต็มคนที่ส่ง</button>
          <button onClick={() => bulk("clear")} disabled={act.isBusy("bulk")}>ล้าง</button>
          <span class="gb-sep" aria-hidden="true" />
          <button onClick={() => setAllPublish(allHidden)} disabled={act.anyBusy} aria-pressed={allHidden}
            title={allHidden ? "ตอนนี้ซ่อนคะแนนอยู่ทุกงาน — กดเพื่อแสดงทุกงาน" : hiddenCount > 0 ? `ตอนนี้ซ่อนอยู่ ${hiddenCount} จาก ${assignments.length} งาน — กดเพื่อซ่อนทุกงาน` : "ซ่อนคะแนนของทุกงานในหน้านี้ (ผู้ปกครองก็ไม่เห็น)"}>
            <Icon name={allHidden ? "eye" : "eye-off"} size={14} /> {allHidden ? "แสดงคะแนนทุกงาน" : "ซ่อนคะแนนทุกงาน"}{!allHidden && hiddenCount > 0 ? ` (ซ่อนอยู่ ${hiddenCount})` : ""}
          </button>
          <div style="position:relative">
            <button aria-label="จัดการงาน" onClick={() => setMenuOpen((v) => !v)}><Icon name="dots-vertical" size={16} /></button>
            {menuOpen && (
              <>
                <div style="position:fixed;inset:0;z-index:39" onClick={() => setMenuOpen(false)} />
                <div class="gb-menu">
                  <button onClick={() => { setMenuOpen(false); setEditAsg(selAsg); }}><Icon name="edit" size={15} /> แก้ไข</button>
                  <button onClick={() => { setMenuOpen(false); setCopyAsg(selAsg); }}><Icon name="copy" size={15} /> คัดลอกงาน</button>
                  <button onClick={() => saveAsgPatch({ status: selAsg.status === "open" ? "closed" : "open" }, selAsg.status === "open" ? "ปิดรับงานแล้ว" : "เปิดรับงานแล้ว")}>
                    <Icon name={selAsg.status === "open" ? "lock" : "lock-open"} size={15} /> {selAsg.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}
                  </button>
                  <button onClick={removeAssignment} style="color:var(--text-danger)"><Icon name="trash" size={15} /> ลบงาน</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {msg && <div style="color:var(--text-danger);font-size:13px;margin-bottom:6px">{msg}</div>}

      {status === "error" ? (
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
            publishAll: () => setAllPublish(allHidden),
            allHidden, busy: act.anyBusy,
            remove: removeAssignment,
          }} />
      ) : (
        <div class="gb-scroll">
          <table class="gb">
            <thead>
              <tr>
                <th class="name-col">ชื่อ - สกุล</th>
                {assignments.map((a) => {
                  const submitted = students.filter((st) => ["scored", "late", "awaiting"].includes(stateOf(a.id, st.id, a))).length;
                  const pct = students.length ? Math.round((submitted / students.length) * 100) : 0;
                  return (
                    <th class={a.id === selCol ? "sel" : ""} style={`border-top-color:${TINT_FG[workTypeById(a.type_id)?.color ?? "violet"]}`} title={a.title} onClick={() => setSelCol(a.id)}>
                      <div class="ht" style={a.id === selCol ? "font-weight:500" : ""}>{a.title}</div>
                      <div class="hs" title={`คะแนนเต็ม ${a.full_score} · สั่ง ${formatThaiDate(a.assigned_date)} · กำหนดส่ง ${a.due_date ? formatThaiDate(a.due_date) : "ไม่มี"}`}>เต็ม {a.full_score} · {a.due_date ? "ส่ง " + formatThaiDate(a.due_date).replace(/ \d{4}$/, "") : "ไม่มีกำหนด"}<button type="button" class={"hs-eye" + (a.publish_scores ? "" : " off")} aria-busy={act.isBusy(`asg:${a.id}`)} aria-label={a.publish_scores ? "ซ่อนคะแนนของงานนี้" : "แสดงคะแนนของงานนี้"}
                          title={a.publish_scores ? "คะแนนแสดงอยู่ — กดเพื่อซ่อน" : "ซ่อนคะแนนอยู่ — กดเพื่อแสดง"}
                          onClick={(e) => { e.stopPropagation(); saveAsgPatch({ publish_scores: !a.publish_scores }, a.publish_scores ? "ซ่อนคะแนนแล้ว" : "แสดงคะแนนแล้ว", a); }}>
                          <Icon name={a.publish_scores ? "eye" : "eye-off"} size={12} />
                        </button></div>
                      <div class="hbar"><div style={`width:${pct}%`} /></div>
                    </th>
                  );
                })}
                <th title={hiddenCount > 0 ? `ไม่รวมงานที่ซ่อนคะแนน (${hiddenCount} งาน)` : undefined}>สะสม{hiddenCount > 0 ? "*" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {shownStudents.map((st, i) => {
                const sum = studentSummary(visibleWork, (idx) => { const s = subOf(visibleWork[idx].id, st.id); return s ? { status: s.status, score: s.score, late: s.late } : undefined; }, today);
                return (
                  <tr>
                    <td class="name-col">
                      {missingByStudent(st.id) && <span class="gb-reddot" />}
                      <span class="muted" style="margin-right:6px">{st.number ?? i + 1}</span>{fullName(st)}
                    </td>
                    {assignments.map((a) => {
                      const sub = subOf(a.id, st.id);
                      const isEditing = editing?.aid === a.id && editing?.sid === st.id;
                      return (
                        <td class={"cell" + (a.id === selCol ? " sel" : "")} onClick={() => !isEditing && setEditing({ aid: a.id, sid: st.id })}>
                          {isEditing ? (
                            <CellInput initial={sub?.score != null ? String(sub.score) : ""}
                              onCommit={(initial, v, next) => { commitScore(a.id, st.id, initial, v); setEditing(next ? nextCell(shownStudents, i, a.id) : null); }}
                              onCancel={() => setEditing(null)} />
                          ) : (
                            <WorkCell state={stateOf(a.id, st.id, a)} score={sub?.score} mark={markOf(a.id, st.id)} hidden={!a.publish_scores} />
                          )}
                        </td>
                      );
                    })}
                    <td style="font-size:12px" title={allHidden ? "ซ่อนคะแนนทุกงานอยู่" : hiddenCount > 0 ? `ไม่รวมงานที่ซ่อนคะแนน (${hiddenCount} งาน)` : undefined}>{allHidden ? "•••" : <>{sum.score}<span class="muted">/{sum.fullScore}</span></>}</td>
                  </tr>
                );
              })}
              <tr class="avg">
                <td class="name-col">เฉลี่ย · ส่งแล้ว</td>
                {assignments.map((a) => {
                  const submitted = students.filter((st) => ["scored", "late", "awaiting"].includes(stateOf(a.id, st.id, a))).length;
                  const scored = students.map((st) => subOf(a.id, st.id)).filter((s) => s && s.score != null) as Sub[];
                  const avg = scored.length ? Math.round((scored.reduce((n, s) => n + (s.score ?? 0), 0) / scored.length) * 10) / 10 : null;
                  return <td>{!a.publish_scores && avg != null ? "•••" : (avg ?? "–")}<br /><span class="muted">{submitted}/{students.length}</span></td>;
                })}
                <td />
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

      {showCreate && <AssignmentModal defaultClassId={classId} defaultSubjectId={subjectId} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(true); }} />}
      {editAsg && <AssignmentModal existing={editAsg} onClose={() => setEditAsg(null)} onSaved={() => { setEditAsg(null); load(true); }} />}
      {copyAsg && <AssignmentModal copyFrom={copyAsg} defaultClassId={classId} onClose={() => setCopyAsg(null)} onSaved={() => { setCopyAsg(null); load(true); }} />}
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
    <input ref={ref} class="cell-input" inputMode="decimal" aria-label="คะแนน" value={v}
      onInput={(e) => setV((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { done.current = true; onCancel(); }
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
  manage: { edit: () => void; copy: () => void; toggleStatus: () => void; togglePublish: () => void; publishAll: () => void; allHidden: boolean; busy: boolean; remove: () => void };
}) {
  const [menu, setMenu] = useState(false);
  if (!selAsg) return null;
  const submitted = students.filter((st) => ["scored", "late", "awaiting"].includes(stateOf(selAsg.id, st.id, selAsg))).length;
  return (
    <div class="card">
      <div class="gb-mchips">
        {assignments.map((a) => (
          <button class={"pill" + (a.id === selAsg.id ? " on" : "")} onClick={() => setSelCol(a.id)}>{a.title.length > 12 ? a.title.slice(0, 12) + "…" : a.title}</button>
        ))}
      </div>
      {/* the tabs above cut long titles short: the work picked is always named in full here */}
      <div class="row" style="align-items:flex-start;gap:6px;margin-bottom:2px">
        <div class="grow" style="font-weight:500;overflow-wrap:anywhere;min-width:0">{selAsg.title}</div>
        <button type="button" class={"gb-meye" + (selAsg.publish_scores ? "" : " off")} disabled={manage.busy} aria-pressed={!selAsg.publish_scores}
          aria-label={selAsg.publish_scores ? "ซ่อนคะแนนของงานนี้" : "แสดงคะแนนของงานนี้"}
          title={selAsg.publish_scores ? "คะแนนแสดงอยู่ — กดเพื่อซ่อนงานนี้" : "ซ่อนคะแนนอยู่ — กดเพื่อแสดงงานนี้"}
          onClick={manage.togglePublish}>
          <Icon name={selAsg.publish_scores ? "eye" : "eye-off"} size={16} />
        </button>
      </div>
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <span class="page-sub">เต็ม {selAsg.full_score} · ส่งแล้ว {submitted}/{students.length}</span>
        <div style="position:relative">
          <button style="height:28px" onClick={() => setMenu((v) => !v)}><Icon name="dots-vertical" size={15} /> จัดการงาน</button>
          {menu && (
            <div class="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setMenu(false); }}>
              <div class="menu-sheet" role="dialog" aria-label="จัดการงาน">
                <div class="sheet-grab" />
                <div class="sheet-title">{selAsg.title}</div>
                <button class="sheet-item" onClick={() => { setMenu(false); bulk("all-submitted"); }}><Icon name="checks" size={20} /> ทั้งห้องส่งแล้ว</button>
                <button class="sheet-item" onClick={() => { setMenu(false); bulk("full-score"); }}><Icon name="star" size={20} /> ให้เต็มคนที่ส่ง</button>
                <button class="sheet-item" onClick={() => { setMenu(false); bulk("clear"); }} style="color:var(--text-danger)"><Icon name="eraser" size={20} /> ล้าง</button>
                <button class="sheet-item" onClick={() => { setMenu(false); manage.edit(); }}><Icon name="edit" size={20} /> แก้ไขงาน</button>
                <button class="sheet-item" onClick={() => { setMenu(false); manage.copy(); }}><Icon name="copy" size={20} /> คัดลอกงาน</button>
                <button class="sheet-item" onClick={() => { setMenu(false); manage.toggleStatus(); }}><Icon name={selAsg.status === "open" ? "lock" : "lock-open"} size={20} /> {selAsg.status === "open" ? "ปิดรับงาน" : "เปิดรับงาน"}</button>
                <button class="sheet-item" onClick={() => { setMenu(false); manage.publishAll(); }}><Icon name={manage.allHidden ? "eye" : "eye-off"} size={20} /> {manage.allHidden ? "แสดงคะแนนทุกงาน" : "ซ่อนคะแนนทุกงาน"}</button>
                <button class="sheet-item" onClick={() => { setMenu(false); manage.remove(); }} style="color:var(--text-danger)"><Icon name="trash" size={20} /> ลบงาน</button>
              </div>
            </div>
          )}
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
              <button style="background:transparent;border:none;padding:0" onClick={() => setEditing({ aid: selAsg.id, sid: st.id })}>
                <WorkCell state={stateOf(selAsg.id, st.id, selAsg)} score={sub?.score} mark={markOf(selAsg.id, st.id)} hidden={!selAsg.publish_scores} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
