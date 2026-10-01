import { useEffect, useRef, useState } from "preact/hooks";
import { signal, computed } from "@preact/signals";
import "../styles/scan.css";
import { Icon } from "../components/Icon";
import { PageHeader, ProgressRing, TermPicker } from "../components/ui";
import {
  activeClasses,
  activeSubjects,
  assignments,
  settings,
  students as allStudents,
  studentsById,
  studentsByClass,
  revokedTokens,
  subjectById,
  workTypeById,
  selectedTermId,
  setSelectedTerm,
  currentTermId,
  viewingPastYear,
  UNASSIGNED,
  patchAssignment,
  dropAssignment,
} from "../store";
import type { ScanMode, Student, SubmissionOpResult } from "@shared/types";
import { buildIndex, resolveScan } from "@shared/scan";
import { isHalfStep } from "@shared/grade";
import { workState } from "@shared/metrics";
import { ulid } from "@shared/ids";
import { api } from "../lib/api";
import { enqueueSubmission, onResult, pendingCount, syncing, online, pendingOps, failedPairKeys, pairKey } from "../lib/outbox";
import { kvGet, kvSet } from "../lib/idb";
import { beep, vibrate } from "../lib/sound";
import { err } from "../lib/notify";
import { installHidScanner } from "../lib/hid";
import { fullName, shortName, initials } from "../lib/names";
import { dashboard, loadDashboard } from "../lib/dashboard";
import { actionTime } from "../lib/clock";
import { routeParams } from "../router";

interface Session {
  id: string;
  assignmentId: string;
  classId: string;
  subjectId: string | null;
  fullScore: number;
  mode: ScanMode;
}
interface SubState {
  status: "submitted" | "excused" | "void";
  score: number | null;
  at: number;
}
interface Feedback {
  kind: "success" | "warning" | "danger" | "accent";
  icon: string;
  name: string;
  sub: string;
  score?: string;
}

const session = signal<Session | null>(null);
// What the server says about the round on screen. It BELONGS to one assignment: switching to another work
// must never show (or scan against) the previous work's hand-ins, whatever a slow or failed request does.
//   loading = asked, no answer yet · ready = we know · unknown = the answer never came (offline) — NOT "nobody has handed in"
interface SubsBox { aid: string | null; map: Map<string, SubState>; status: "loading" | "ready" | "unknown"; serverTime: number }
const subsBox = signal<SubsBox>({ aid: null, map: new Map(), status: "loading", serverTime: 0 });
const NO_SUBS = new Map<string, SubState>();
let loadSeq = 0; // the newest request wins; an older answer is dropped
const roundAid = () => (session.value ?? ended.value)?.assignmentId ?? null;
/** The server copy for the round on screen — never another assignment's. */
function getSubs(): Map<string, SubState> {
  const b = subsBox.value;
  return b.aid !== null && b.aid === roundAid() ? b.map : NO_SUBS;
}
function setSubs(map: Map<string, SubState>) {
  const aid = roundAid();
  if (!aid) return;
  subsBox.value = { ...subsBox.value, aid, map };
}
function resetSubs(aid: string) {
  loadSeq++; // whatever is still in flight for the previous round is now out of date
  subsBox.value = { aid, map: new Map(), status: "loading", serverTime: 0 };
}
const recent = signal<{ studentId: string; at: number; score: number | null }[]>([]);
const feedback = signal<Feedback | null>(null);
const pending = signal<string | null>(null); // studentId awaiting typed score
const useCamera = signal(false);
// why the camera would not start (kept until the teacher dismisses it or tries again) — never a silent toggle-off
const cameraProblem = signal<{ title: string; hint: string } | null>(null);
const ended = signal<Session | null>(null); // show a summary after a round ends
const scannerReady = signal(typeof document !== "undefined" ? document.hasFocus() : true);
// a class number that several students share: the teacher picks, we never guess
const choices = signal<{ raw: string; students: Student[]; method: "camera" | "hid" | "manual" } | null>(null);

const activeAssignment = computed(() =>
  session.value ? assignments.value.find((a) => a.id === session.value!.assignmentId) ?? null : null,
);

// Why this round can't take hand-ins any more (the work was closed or deleted since it started)
const closedReason = computed<"closed" | "deleted" | null>(() => {
  if (!session.value) return null;
  const a = activeAssignment.value;
  if (!a) return "deleted";
  return a.status === "closed" ? "closed" : null;
});

/** Apply what the server says about the assignment to the shared list, so no screen keeps a stale copy. */
function applyAssignmentInfo(aid: string, info: { status: string; full_score: number; deleted: boolean } | null | undefined) {
  if (info === undefined) return;
  if (info === null || info.deleted) { dropAssignment(aid); return; }
  const cur = assignments.value.find((a) => a.id === aid);
  if (cur && (cur.status !== info.status || cur.full_score !== info.full_score)) {
    patchAssignment(aid, { status: info.status as "open" | "closed", full_score: info.full_score });
  }
}

function bkkToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// restore a saved session across reloads
kvGet<Session>("scanSession").then((s) => {
  if (s && !session.value) session.value = s;
});

function setFeedback(f: Feedback) { feedback.value = f; }
function big(score: number, full: number) { return `${score}/${full}`; }

/** A response may predate a scan/ACK that changed this map while its request was in flight. */
function reconcileSubs(rows: any[], beforeRequest: Map<string, SubState>): Map<string, SubState> {
  const map = new Map<string, SubState>();
  for (const row of rows) map.set(row.student_id, { status: row.status, score: row.score, at: row.updated_at });
  const current = getSubs();
  for (const sid of new Set([...beforeRequest.keys(), ...current.keys()])) {
    const now = current.get(sid);
    if (now !== beforeRequest.get(sid)) {
      if (now) map.set(sid, now);
      else map.delete(sid);
    }
  }
  return map;
}

/**
 * How often the screen re-reads the work's hand-ins (every one of them: a cursor by time can skip a write that commits
 * late). Each read costs about one row per child the work was given to, so it is slow and only while the page is seen.
 */
const POLL_MS = 60_000;
/** Coming back to the page (or the network) asks again at once — unless something was read this recently. */
const RESUME_GAP_MS = 10_000;
let lastFetchAt = 0;

async function loadSubs(assignmentId: string) {
  const seq = ++loadSeq;
  lastFetchAt = Date.now();
  const beforeRequest = subsBox.value.aid === assignmentId ? subsBox.value.map : NO_SUBS;
  let res: { submissions: any[]; assignment?: { status: string; full_score: number; deleted: boolean } | null; serverTime: number };
  try {
    res = await api.get(`/api/assignments/${assignmentId}/submissions`);
  } catch (e) {
    // no answer: say "we don't know" (only if we knew nothing yet) — never leave the last work's numbers up
    if (seq === loadSeq && roundAid() === assignmentId && subsBox.value.status !== "ready") {
      subsBox.value = { ...subsBox.value, aid: assignmentId, status: "unknown" };
    }
    throw e;
  }
  applyAssignmentInfo(assignmentId, res.assignment); // true of that assignment whichever round is on screen
  if (seq !== loadSeq || roundAid() !== assignmentId) return; // a newer request or another round owns the screen now
  const m = reconcileSubs(res.submissions, beforeRequest);
  subsBox.value = { aid: assignmentId, map: m, status: "ready", serverTime: res.serverTime };
}

async function pollSubs() {
  const s = session.value;
  if (!s || !navigator.onLine) return;
  const box = subsBox.value;
  // never loaded for THIS round (first answer failed): ask for everything, not "changes since" some other work's clock
  if (box.aid !== s.assignmentId || box.status !== "ready") { loadSubs(s.assignmentId).catch(() => {}); return; }
  const seq = ++loadSeq;
  lastFetchAt = Date.now();
  try {
    const res = await api.get<{ submissions: any[]; assignment?: { status: string; full_score: number; deleted: boolean } | null; serverTime: number }>(
      // Wall-clock cursors can miss writes that commit after a poll with an older updated_at.
      // Reconcile the whole assignment; effSub keeps this device's unsent operations on top.
      `/api/assignments/${s.assignmentId}/submissions`,
    );
    applyAssignmentInfo(s.assignmentId, res.assignment);
    // the round changed (or a full reload started) while this was in flight: this answer is about something else
    if (seq !== loadSeq || roundAid() !== s.assignmentId || subsBox.value.aid !== s.assignmentId) return;
    const m = reconcileSubs(res.submissions, box.map);
    subsBox.value = { ...subsBox.value, map: m, serverTime: res.serverTime };
  } catch { /* offline; ignore */ }
}

/**
 * Keep the screen's copy of the hand-ins fresh: every POLL_MS while the page is visible, and at once when the page
 * comes back to the front or the network returns (a locked tablet or a dropped wifi must not leave it stale for a
 * whole interval). Scans and sends never wait for this — they go through the queue as before. Returns the stop function.
 */
function startPolling(): () => void {
  const seen = () => document.visibilityState !== "hidden";
  const tick = () => { if (seen()) pollSubs().catch(() => {}); };
  const resume = () => { if (seen() && Date.now() - lastFetchAt >= RESUME_GAP_MS) pollSubs().catch(() => {}); };
  const timer = setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
  };
}

// A student's current state for the running round: what the server said, unless this
// device has a newer op still waiting to be sent (then that wins — reloading the
// server copy must never make a queued scan look "not submitted").
function effSub(studentId: string): SubState | undefined {
  const s = session.value;
  const server = getSubs().get(studentId);
  if (!s) return server;
  const op = pendingOps.value.get(pairKey({ assignmentId: s.assignmentId, studentId }));
  if (!op) return server;
  if (op.status === "void") return undefined;
  return { status: op.status === "excused" ? "excused" : "submitted", score: op.score, at: op.clientTs };
}
/** "pend" = saved on this device, not on the server yet · "fail" = the server refused it */
function markOf(studentId: string): "pend" | "fail" | null {
  const s = session.value;
  if (!s) return null;
  const k = pairKey({ assignmentId: s.assignmentId, studentId });
  return failedPairKeys.value.has(k) ? "fail" : pendingOps.value.has(k) ? "pend" : null;
}

function updateSub(studentId: string, st: SubState) {
  const m = new Map(getSubs());
  m.set(studentId, st);
  setSubs(m);
}

function pushRecent(studentId: string, score: number | null) {
  recent.value = [{ studentId, at: Date.now(), score }, ...recent.value].slice(0, 30);
}

function makeOp(studentId: string, status: "submitted" | "void", score: number | null, method: "camera" | "hid" | "manual") {
  const s = session.value!;
  return {
    opId: ulid(), scanSessionId: s.id, assignmentId: s.assignmentId, studentId,
    // when the teacher acted, on the server's clock: this is what orders it against everything else
    status, score, fullScoreAtScan: s.fullScore, method, clientTs: actionTime(),
    // accepting a hand-in (refused once the work is closed) — not the teacher grading in the gradebook
    intent: "receive" as const,
  };
}

function refuseIfClosed(): boolean {
  const why = closedReason.value;
  if (!why) return false;
  beep.err(); vibrate(120);
  setFeedback({
    kind: "danger", icon: "lock",
    name: why === "closed" ? "งานนี้ปิดรับแล้ว" : "งานนี้ถูกลบแล้ว",
    sub: "ไม่รับงานเพิ่ม — ให้คะแนนย้อนหลังได้ที่สมุดคะแนน",
  });
  return true;
}

function handleScan(raw: string, method: "camera" | "hid" | "manual") {
  const s = session.value;
  if (!s) return;
  if (refuseIfClosed()) return;
  const idx = buildIndex(allStudents.value, revokedTokens.value, s.classId);
  const r = resolveScan(raw, idx, { allowStudentCode: settings.value?.accept_student_code_scan ?? false });

  if (r.kind === "ambiguous") {
    // two students share this class number: never pick one for the teacher
    const list = (r.candidateIds ?? []).map((id) => studentsById.value.get(id)).filter((x): x is Student => !!x);
    beep.err(); vibrate(120);
    choices.value = { raw, students: list, method };
    setFeedback({ kind: "warning", icon: "users", name: `เลขที่ ${r.raw} มี ${list.length} คน`, sub: "เลือกคนที่ถูกต้องด้านล่าง — ยังไม่ได้บันทึกใคร" });
    return;
  }
  choices.value = null;

  if (r.kind === "not_found") {
    beep.err(); vibrate(120);
    setFeedback({ kind: "danger", icon: "x", name: `ไม่พบรหัส ${raw.slice(0, 20)}`, sub: "ตรวจสอบบัตรหรือพิมพ์รหัสใหม่" });
    return;
  }
  if (r.kind === "revoked") {
    beep.err();
    const st = studentsById.value.get(r.studentId!);
    setFeedback({ kind: "danger", icon: "alert-triangle", name: st ? fullName(st) : "บัตรถูกยกเลิก", sub: "บัตรนี้ถูกยกเลิกแล้ว — ออกบัตรใหม่ให้นักเรียน" });
    return;
  }
  const student = studentsById.value.get(r.studentId!);
  if (!student) return;
  commitStudent(student, method);
}

function commitStudent(student: Student, method: "camera" | "hid" | "manual") {
  const s = session.value;
  if (!s) return;
  if (refuseIfClosed()) return;
  if (student.class_id !== s.classId) {
    beep.err();
    setFeedback({ kind: "danger", icon: "user-x", name: fullName(student), sub: "ไม่ได้อยู่ในห้องที่เลือก" });
    return;
  }
  const existing = effSub(student.id);
  if (existing && existing.status === "submitted") {
    beep.dup(); vibrate(60);
    setFeedback({
      kind: "warning", icon: "alert-triangle", name: fullName(student),
      sub: `ส่งไปแล้ว — ไม่บันทึกซ้ำ`, score: existing.score != null ? big(existing.score, s.fullScore) : undefined,
    });
    return;
  }

  const score = s.mode === "full" ? s.fullScore : null;
  const prev = effSub(student.id);
  updateSub(student.id, { status: "submitted", score, at: Date.now() });
  void enqueueRevertible(makeOp(student.id, "submitted", score, method), student.id, prev);

  if (s.mode === "full") {
    pushRecent(student.id, s.fullScore);
    beep.ok(); vibrate(40);
    setFeedback({ kind: "success", icon: "check", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · ส่งแล้ว`, score: big(s.fullScore, s.fullScore) });
  } else if (s.mode === "later") {
    pushRecent(student.id, null);
    beep.ok(); vibrate(40);
    setFeedback({ kind: "success", icon: "check", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · รับงานแล้ว` });
  } else {
    pushRecent(student.id, null);
    pending.value = student.id;
    beep.ok(); vibrate(40);
    setFeedback({ kind: "accent", icon: "pencil", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · รับงานแล้ว ใส่คะแนนแล้วกด Enter` });
  }
}

async function enqueueRevertible(op: ReturnType<typeof makeOp>, studentId: string, prev: SubState | undefined) {
  try {
    await enqueueSubmission(op);
  } catch {
    if (prev) updateSub(studentId, prev);
    else { const m = new Map(getSubs()); m.delete(studentId); setSubs(m); }
    recent.value = recent.value.filter((r) => r.studentId !== studentId || r.at < Date.now() - 1000);
    beep.err();
    err("บันทึกลงเครื่องไม่ได้ ลองอีกครั้ง");
    setFeedback({ kind: "danger", icon: "alert-triangle", name: "บันทึกไม่สำเร็จ", sub: "อุปกรณ์บันทึกข้อมูลไม่ได้ ลองสแกนใหม่" });
  }
}

function submitTypedScore(score: number) {
  const pid = pending.value;
  const s = session.value;
  if (!pid || !s) return;
  const prev = effSub(pid);
  updateSub(pid, { status: "submitted", score, at: Date.now() });
  void enqueueRevertible(makeOp(pid, "submitted", score, "manual"), pid, prev);
  pushRecent(pid, score);
  const st = studentsById.value.get(pid);
  setFeedback({ kind: "success", icon: "check", name: st ? fullName(st) : "", sub: "บันทึกคะแนนแล้ว", score: big(score, s.fullScore) });
  pending.value = null;
}

function undo(studentId: string) {
  const s = session.value;
  if (!s) return;
  const prev = effSub(studentId);
  const m = new Map(getSubs());
  m.delete(studentId);
  setSubs(m);
  recent.value = recent.value.filter((r) => r.studentId !== studentId);
  void enqueueRevertible(makeOp(studentId, "void", null, "manual"), studentId, prev);
  const st = studentsById.value.get(studentId);
  beep.undo();
  setFeedback({ kind: "accent", icon: "arrow-back-up", name: st ? fullName(st) : "", sub: "ยกเลิกการส่งแล้ว" });
}

const REJECTED: Record<string, string> = {
  not_in_class: "ไม่ได้อยู่ในห้อง/งานนี้",
  assignment_closed: "งานนี้ปิดรับแล้ว",
  invalid: "ข้อมูลไม่ถูกต้อง",
  superseded: "มีการแก้ไขที่ใหม่กว่าอยู่แล้ว จึงไม่ใช้ค่านี้",
  epoch_changed: "ข้อมูลถูกกู้คืนจากไฟล์สำรองไปแล้ว",
};
// The server said no. The grid must stop showing that student as submitted, and the
// teacher must be told why — a green square that the server refused is a lie.
onResult((r: SubmissionOpResult, op) => {
  if (r.result === "ok" || r.result === "duplicate") return;
  beep.err(); vibrate(120);
  if (r.result === "full_score_changed") {
    setFeedback({ kind: "warning", icon: "alert-triangle", name: "คะแนนเต็มถูกแก้ไข", sub: `คะแนนเต็มปัจจุบันคือ ${r.currentFullScore} — เริ่มรอบใหม่เพื่อความถูกต้อง` });
  } else {
    const st = studentsById.value.get(op.studentId);
    setFeedback({ kind: "danger", icon: "alert-triangle", name: st ? fullName(st) : "บันทึกไม่สำเร็จ", sub: `${REJECTED[r.result] ?? r.result} — ยังไม่ได้บันทึกบนระบบ (ดูที่ "ส่งไม่สำเร็จ")` });
  }
  if (session.value?.assignmentId === op.assignmentId) loadSubs(op.assignmentId).catch(() => {});
});

let startSeq = 0; // the newest call to startSession owns the round
async function startSession(assignmentId: string, classId: string, mode: ScanMode) {
  const asg = assignments.value.find((a) => a.id === assignmentId);
  if (!asg || !classId) return;
  const mine = ++startSeq;
  const s: Session = { id: `scn_${ulid()}`, assignmentId: asg.id, classId, subjectId: asg.subject_id, fullScore: asg.full_score, mode };
  session.value = s;
  ended.value = null;
  resetSubs(s.assignmentId); // the previous work's hand-ins must not be on screen, or scanned against, even for an instant
  // reset NOW, not after the await below: a scan made while the round is being saved must not be wiped
  recent.value = [];
  feedback.value = null;
  pending.value = null;
  await kvSet("scanSession", s);
  api.post("/api/scan-sessions", { id: s.id, assignmentId: s.assignmentId, classId: s.classId, subjectId: s.subjectId, mode: s.mode, fullScore: s.fullScore }).catch(() => {});
  // switched again while saving: that newer call is loading its own work — this one must not (its answer would
  // take the place of the newer one's, leaving the round on screen stuck at "loading")
  if (mine !== startSeq) return;
  await loadSubs(s.assignmentId).catch(() => {});
}

export function ScanPage() {
  if (ended.value) return <ScanSummary s={ended.value} />;
  if (!session.value) return <SessionSetup />;
  return <ScanView />;
}

function SessionSetup() {
  const params = routeParams();
  // an earlier academic year's classes are closed: scanning is for this year's work only
  const past = viewingPastYear.value;
  const open = past ? [] : assignments.value.filter((a) => a.status === "open" && (
    !selectedTermId.value ? true
      : selectedTermId.value === UNASSIGNED ? a.term_id == null
      : a.term_id === selectedTermId.value));
  const [subjectFilter, setSubjectFilter] = useState("");
  const [assignmentId, setAssignmentId] = useState(params.asg || open[0]?.id || "");
  const asg = open.find((a) => a.id === assignmentId) ?? null;
  const classesForAsg = asg ? activeClasses.value.filter((c) => asg.class_ids.includes(c.id)) : [];
  const [classId, setClassId] = useState(params.class || classesForAsg[0]?.id || "");
  const [mode, setMode] = useState<ScanMode>("full");

  useEffect(() => { loadDashboard(selectedTermId.value); }, [selectedTermId.value]);
  useEffect(() => {
    if (asg && !asg.class_ids.includes(classId)) setClassId(asg.class_ids[0] ?? "");
  }, [assignmentId]);

  const shown = subjectFilter ? open.filter((a) => a.subject_id === subjectFilter) : open;
  const progressFor = (aid: string, cid: string) => {
    const da = dashboard.value?.openAssignments.find((x) => x.assignment.id === aid);
    return da?.perClass.find((p) => p.classId === cid) ?? null;
  };

  return (
    <div>
      <PageHeader icon="scan" title="สแกนส่งงาน" sub="เลือกงาน ห้อง และวิธีให้คะแนน" actions={<TermPicker />} />
      {open.length === 0 ? (
        <div class="card empty">
          {past ? (<>
            สแกนใช้ได้กับงานของปีการศึกษาปัจจุบันเท่านั้น (ตอนนี้เลือกดูปีที่ผ่านมา) — ตรวจ/แก้คะแนนของปีนั้นได้ที่หน้าสมุดคะแนน
            <div style="margin-top:8px"><button class="primary" onClick={() => setSelectedTerm(currentTermId.value)}>กลับไปภาคเรียนปัจจุบัน</button></div>
          </>) : "ยังไม่มีงานที่เปิดรับในเทอมนี้ — สร้างงานในหน้าสมุดคะแนนก่อน"}
        </div>
      ) : (
        <div class="card">
          <div class="sc-step"><span class="sn">1</span>เลือกงาน
            <span class="grow" />
            <div class="chips-row">
              <button class={"pill" + (subjectFilter === "" ? " on" : "")} style="height:26px" onClick={() => setSubjectFilter("")}>ทุกวิชา</button>
              {activeSubjects.value.map((s) => <button class={"pill" + (subjectFilter === s.id ? " on" : "")} style="height:26px" onClick={() => setSubjectFilter(s.id)}>{s.name}</button>)}
            </div>
          </div>
          <div class="sc-asg-grid">
            {shown.map((a) => {
              const wt = workTypeById(a.type_id);
              return (
                <button class={"sc-asg" + (a.id === assignmentId ? " on" : "")} onClick={() => setAssignmentId(a.id)}>
                  <div class="row" style="justify-content:space-between">
                    {wt && <span class={"chip " + wt.color}><Icon name={wt.icon} size={13} /> {wt.name}</span>}
                    {a.id === assignmentId && <Icon name="circle-check" size={18} style="color:var(--text-accent)" />}
                  </div>
                  <div class="ttl">{a.title}</div>
                  <div class="page-sub">{subjectById(a.subject_id)?.name} · เต็ม {a.full_score}</div>
                  <div class="row wrap" style="gap:10px;margin-top:4px;font-size:12px;font-variant-numeric:tabular-nums">
                    {a.class_ids.map((cid) => {
                      const p = progressFor(a.id, cid);
                      const c = activeClasses.value.find((x) => x.id === cid);
                      return <span>{c?.name} <b style="font-weight:500">{p ? `${p.submitted}/${p.total}` : ""}</b></span>;
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          <div class="sc-step"><span class="sn">2</span>ห้อง</div>
          <div class="chips-row">
            {classesForAsg.map((c) => {
              const p = progressFor(assignmentId, c.id);
              return <button class={"pill" + (c.id === classId ? " on" : "")} onClick={() => setClassId(c.id)}>{c.id === classId && <Icon name="check" size={13} />}{c.name}{p && <span class="n">ส่งแล้ว {p.submitted}/{p.total}</span>}</button>;
            })}
          </div>

          <div class="sc-step"><span class="sn">3</span>วิธีให้คะแนน</div>
          <div class="sc-modes">
            {([
              { m: "full", icon: "circle-check", t: "ให้คะแนนเต็ม", s: "ยิงแล้วได้เต็มทันที" },
              { m: "type", icon: "pencil", t: "กรอกทีละคน", s: "ยิงแล้วพิมพ์คะแนน" },
              { m: "later", icon: "inbox", t: "รับงานก่อน", s: "ตรวจแล้วค่อยให้คะแนน" },
            ] as const).map((o) => (
              <button class={"sc-mode" + (mode === o.m ? " on" : "")} onClick={() => setMode(o.m)}>
                <div class="mt"><Icon name={o.icon} size={16} style={mode === o.m ? "color:var(--text-accent)" : ""} /> {o.t}</div>
                <div class="page-sub">{o.s}</div>
              </button>
            ))}
          </div>

          {asg && (
            <div class="sc-picked page-sub">
              รอบนี้: <b>{asg.title}</b> · {subjectById(asg.subject_id)?.name} · เต็ม {asg.full_score}
              {classesForAsg.find((c) => c.id === classId) && <> · ห้อง <b>{classesForAsg.find((c) => c.id === classId)!.name}</b></>}
            </div>
          )}
          <div class="row" style="justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:8px">
            <div class="row page-sub" style="gap:6px">รับได้จาก
              <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="barcode" size={13} /> เครื่องยิง QR</span>
              <span class="chip" style="background:var(--bg-accent);color:var(--text-accent)"><Icon name="camera" size={13} /> กล้อง</span>
            </div>
            <button class="primary" style="height:42px;padding:0 20px" disabled={!classId || !asg} onClick={() => startSession(assignmentId, classId, mode)}>
              <Icon name="scan" /> เริ่มสแกน {classesForAsg.find((c) => c.id === classId)?.name ?? ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScanView() {
  const s = session.value!;
  const asg = activeAssignment.value;
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camCtl = useRef<any>(null);
  const [torch, setTorch] = useState(false);
  const [roomMenu, setRoomMenu] = useState(false);

  // a session restored from storage (e.g. after a reload) has no submissions
  // loaded yet — fetch them so the grid and ring are correct
  useEffect(() => {
    if (subsBox.value.aid !== s.assignmentId) resetSubs(s.assignmentId);
    if (subsBox.value.status !== "ready") loadSubs(s.assignmentId).catch(() => {});
  }, [s.assignmentId]);

  useEffect(() => {
    const off = installHidScanner((raw) => handleScan(raw, "hid"));
    return off;
  }, []);
  useEffect(() => {
    const on = () => (scannerReady.value = true);
    const offf = () => (scannerReady.value = false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", offf);
    return () => { window.removeEventListener("focus", on); window.removeEventListener("blur", offf); };
  }, []);
  useEffect(() => startPolling(), []);
  useEffect(() => {
    let ctl: any = null;
    if (useCamera.value && videoRef.current) {
      cameraProblem.value = null;
      const fail = (e: unknown, explain: (e: unknown) => { title: string; hint: string }) => { useCamera.value = false; cameraProblem.value = explain(e); };
      import("../lib/camera").then(({ startCamera, explainCamera }) =>
        startCamera(videoRef.current!, (raw) => handleScan(raw, "camera"), {
          onError: (e) => fail(e, explainCamera),
        }).then((c) => { ctl = c; camCtl.current = c; }).catch((e) => fail(e, explainCamera)),
      ).catch(() => {
        // the camera code itself could not be fetched (offline on a page that was never opened online)
        useCamera.value = false;
        cameraProblem.value = { title: "โหลดตัวอ่านกล้องไม่สำเร็จ", hint: "ต่อเน็ตแล้วลองอีกครั้ง — ระหว่างนี้ใช้เครื่องยิงหรือพิมพ์เลขที่ได้" };
      });
    }
    return () => { ctl?.stop?.(); camCtl.current = null; };
  }, [useCamera.value]);

  function endSession() {
    if (s) api.post(`/api/scan-sessions/${s.id}/end`).catch(() => {});
    ended.value = s;
    session.value = null;
    kvSet("scanSession", null);
    useCamera.value = false;
  }

  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const subj = subjectById(s.subjectId);
  const wt = workTypeById(asg?.type_id ?? null);
  const classStudents = studentsByClass.value.get(s.classId) ?? [];
  const submittedCount = classStudents.filter((st) => effSub(st.id)?.status === "submitted").length;
  const missing = classStudents.filter((st) => effSub(st.id)?.status !== "submitted");
  const waiting = classStudents.filter((st) => markOf(st.id) === "pend").length;
  const modeLabel = s.mode === "full" ? "ให้คะแนนเต็ม" : s.mode === "type" ? "กรอกทีละคน" : "รับงานก่อน";
  const today = bkkToday();
  const otherClasses = (asg?.class_ids ?? []).filter((c) => c !== s.classId);
  const known = subsBox.value.aid === s.assignmentId && subsBox.value.status === "ready";

  return (
    <div>
      {!known && (
        <div class="imp-warn" role="status" style="margin:0 0 8px;font-size:13px">
          <Icon name={subsBox.value.status === "unknown" ? "cloud-off" : "loader-2"} size={15} class={subsBox.value.status === "unknown" ? "" : "spin"} />
          <span class="grow">{subsBox.value.status === "unknown"
            ? "ยังไม่ทราบว่าใครส่งงานนี้แล้วบ้าง (โหลดจากระบบไม่ได้) — สแกนต่อได้ ทุกรายการเข้าคิวและระบบจะตรวจซ้ำตอนส่ง"
            : "กำลังโหลดข้อมูลของงานนี้…"}</span>
          {subsBox.value.status === "unknown" && <button class="ghost" style="height:26px;font-size:12px" onClick={() => loadSubs(s.assignmentId).catch(() => {})}>ลองอีกครั้ง</button>}
        </div>
      )}
      <div class="ctxbar">
        <div style="position:relative">
          <button class="ghost" style="color:inherit;height:28px;background:var(--surface-2)" onClick={() => otherClasses.length && setRoomMenu((v) => !v)}>
            <Icon name="users" size={15} /> {cls?.name} {otherClasses.length > 0 && <Icon name="chevron-down" size={14} />}
          </button>
          {roomMenu && (
            <>
              <div style="position:fixed;inset:0;z-index:29" onClick={() => setRoomMenu(false)} />
              <div class="gb-menu" style="left:0;right:auto">
                {otherClasses.map((cid) => {
                  const c = activeClasses.value.find((x) => x.id === cid);
                  return <button onClick={() => { setRoomMenu(false); startSession(s.assignmentId, cid, s.mode); }}><Icon name="arrow-right" size={14} /> เปลี่ยนไป {c?.name}</button>;
                })}
              </div>
            </>
          )}
        </div>
        <div class="chips">
          {subj && <span class={"chip " + subj.color}>{subj.name}</span>}
          {wt && <span class={"chip " + wt.color}>{wt.name}</span>}
        </div>
        <span class="grow" style="min-width:8px" />
        <span style="font-size:13px">เต็ม {s.fullScore} · {modeLabel}</span>
        <button class="ghost" style="color:inherit;background:var(--surface-2)" onClick={endSession}><Icon name="player-stop" size={16} /> จบรอบ</button>
      </div>

      <div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div class="page-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">{asg?.title}</div>
        <div class="row" style="gap:6px">
          <span class="chip" style={scannerReady.value ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-warning);color:var(--text-warning)"}>
            <Icon name={scannerReady.value ? "circle-check" : "hand-click"} size={13} />
            {scannerReady.value ? "เครื่องยิงพร้อม" : "คลิกหน้านี้ก่อนยิง"}
          </span>
          <span class="chip" style={online.value ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-warning);color:var(--text-warning)"}>
            <Icon name={online.value ? "cloud-check" : "cloud-off"} size={14} />
            {syncing.value ? "กำลังบันทึก" : online.value ? "ออนไลน์" : "ออฟไลน์"}{pendingCount.value > 0 ? ` · ค้าง ${pendingCount.value}` : ""}
          </span>
        </div>
      </div>

      {closedReason.value && (
        <div class="sc-closed" role="alert">
          <Icon name="lock" size={18} />
          <div class="grow"><b style="font-weight:500">{closedReason.value === "closed" ? "งานนี้ปิดรับแล้ว" : "งานนี้ถูกลบแล้ว"}</b> — สแกนแล้วจะไม่บันทึก ให้คะแนนย้อนหลังได้ที่ <a href="#/gradebook">สมุดคะแนน</a></div>
          <button style="height:30px;font-size:12px" onClick={endSession}>จบรอบ</button>
        </div>
      )}

      <div class="scan-input-row">
        <label class="scan-input">
          <Icon name="qrcode" size={22} class="muted" />
          <input
            ref={inputRef} autocomplete="off" placeholder="ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter" aria-label="รหัสนักเรียน"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value;
                (e.target as HTMLInputElement).value = "";
                if (v.trim()) handleScan(v, "manual");
              }
            }}
          />
        </label>
        <button class="icon" style="width:56px;height:56px;border-radius:var(--radius)" aria-label="สแกนด้วยกล้อง" onClick={() => (useCamera.value = !useCamera.value)}>
          <Icon name={useCamera.value ? "camera-off" : "camera"} size={22} />
        </button>
      </div>

      {cameraProblem.value && (
        <div class="imp-warn danger" role="alert" style="margin:0 0 12px;font-size:13px">
          <Icon name="camera-off" size={16} />
          <span class="grow"><b style="font-weight:500">{cameraProblem.value.title}</b><br />{cameraProblem.value.hint}</span>
          <button class="ghost" style="height:26px;font-size:12px" onClick={() => (cameraProblem.value = null)}>ปิด</button>
        </div>
      )}

      {useCamera.value && (
        <div class="cam-wrap" style="margin-bottom:12px">
          <video ref={videoRef} muted playsinline />
          <div class="cam-frame" />
          <div class="cam-tools">
            {camCtl.current?.hasTorch?.() && (
              <button class="icon" aria-label="ไฟฉาย" onClick={async () => setTorch(await camCtl.current.toggleTorch())}><Icon name={torch ? "bulb-off" : "bulb"} size={18} /></button>
            )}
            <button class="icon" aria-label="สลับกล้อง" onClick={() => camCtl.current?.switchCamera?.()}><Icon name="camera-rotate" size={18} /></button>
          </div>
        </div>
      )}

      {feedback.value && <FeedbackCard />}
      {choices.value && (
        <div class="card sc-choose" role="group" aria-label="เลือกนักเรียน">
          <div class="row" style="justify-content:space-between;gap:8px;margin-bottom:8px">
            <span style="font-weight:500">เลขที่ {choices.value.raw} มี {choices.value.students.length} คน — เลือกคนที่ถูกต้อง</span>
            <button class="ghost" style="height:28px;font-size:12px" onClick={() => (choices.value = null)}>ยกเลิก</button>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            {choices.value.students.map((st) => (
              <button class="sc-pick" onClick={() => { const m = choices.value!.method; choices.value = null; commitStudent(st, m); }}>
                <span style="font-weight:500">{fullName(st)}</span>
                <span class="page-sub">รหัส {st.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {s.mode === "type" && pending.value && <ScorePad />}

      <div class="scan-cols">
        <div class="card" style="padding:0;overflow:hidden">
          <div class="row" style="justify-content:space-between;padding:10px 12px;background:var(--surface-1)">
            <span style="font-size:13px" class="muted">สแกนล่าสุด</span>
            <span style="font-size:13px" class="muted">รอบนี้ {recent.value.length} คน</span>
          </div>
          {recent.value.length === 0 ? (
            <div class="empty" style="padding:24px">ยังไม่มีการสแกน</div>
          ) : (
            recent.value.slice(0, 8).map((r) => {
              const st = studentsById.value.get(r.studentId);
              if (!st) return null;
              return (
                <div class="recent-row">
                  <div class="avatar">{initials(st)}</div>
                  <div class="grow">
                    <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{fullName(st)}</div>
                    <div class="page-sub">เลขที่ {st.number ?? "-"}</div>
                  </div>
                  {r.score != null ? <span class="chip" style="background:var(--bg-success);color:var(--text-success)">{r.score}/{s.fullScore}</span>
                    : <span class="chip" style="background:var(--surface-1)">รอคะแนน</span>}
                  <button class="icon ghost" aria-label="ยกเลิก" onClick={() => undo(r.studentId)}><Icon name="arrow-back-up" size={16} /></button>
                </div>
              );
            })
          )}
        </div>

        <div class="card">
          <div class="row" style="gap:12px;margin-bottom:8px">
            <ProgressRing value={known ? submittedCount : 0} total={classStudents.length} size={72} label={known ? "ส่งแล้ว" : "ไม่ทราบ"} />
            <div style="font-size:13px">
              <div class="row" style="gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:var(--fill-success)" />ส่งแล้ว {known ? submittedCount : "?"}</div>
              <div class="row" style="gap:6px"><span style="width:9px;height:9px;border-radius:2px;border:0.5px dashed var(--text-secondary)" />ยังไม่ส่ง {known ? missing.length : "?"}</div>
              {waiting > 0 && <div class="row" style="gap:6px;color:var(--text-warning)"><span style="width:9px;height:9px;border-radius:50%;background:var(--fill-warning)" />รอส่งขึ้นระบบ {waiting}</div>}
            </div>
          </div>
          <div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:500;font-size:13px">ผังเลขที่ {cls?.name}</span><span class="page-sub">แตะช่องว่าง = รับแทน</span></div>
          <div class="sc-grid">
            {classStudents.map((st) => {
              const sub = effSub(st.id);
              const mark = markOf(st.id);
              const state = asg ? workState(sub ? { status: sub.status, score: sub.score, late: false } : null, asg, today) : "pending";
              const hit = recent.value[0]?.studentId === st.id;
              return (
                <button class={`sc-cell ${state}${hit ? " hit" : ""}${mark ? " " + mark : ""}`} title={fullName(st) + (mark === "pend" ? " · รอส่งขึ้นระบบ" : mark === "fail" ? " · ส่งไม่สำเร็จ" : "")}
                  onClick={() => (sub && sub.status === "submitted") ? undo(st.id) : commitStudent(st, "manual")}>
                  <span>{st.number ?? "-"}</span>
                  <span class="nm">{shortName(st)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScanSummary({ s }: { s: Session }) {
  const asg = assignments.value.find((a) => a.id === s.assignmentId);
  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const classStudents = studentsByClass.value.get(s.classId) ?? [];
  const submitted = classStudents.filter((st) => effSub(st.id)?.status === "submitted");
  const missing = classStudents.filter((st) => effSub(st.id)?.status !== "submitted");
  const [copied, setCopied] = useState(false);

  function copyMissing() {
    const text = `รายชื่อยังไม่ส่ง "${asg?.title}" ${cls?.name}\n` + missing.map((st) => `${st.number ?? "-"}. ${fullName(st)}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div>
      <div class="page-head"><div class="page-title">จบรอบสแกน</div></div>
      <div class="card sc-summary">
        <div class="row" style="gap:10px;margin-bottom:12px">
          <ProgressRing value={submitted.length} total={classStudents.length} label="ส่งแล้ว" />
          <div>
            <div style="font-weight:500">{asg?.title}</div>
            <div class="page-sub">{cls?.name} · เต็ม {s.fullScore}</div>
            <div class="row" style="gap:12px;margin-top:6px;font-size:13px">
              <span style="color:var(--text-success)"><Icon name="check" size={14} /> ส่งแล้ว {submitted.length}</span>
              <span style="color:var(--text-danger)"><Icon name="alert-circle" size={14} /> ยังไม่ส่ง {missing.length}</span>
            </div>
          </div>
        </div>
        {missing.length > 0 && (
          <div style="border-top:0.5px solid var(--border);padding-top:10px">
            <div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:500">ยังไม่ส่ง {missing.length} คน</span>
              <button class="ghost" style="height:28px;font-size:12px" onClick={copyMissing}><Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไป LINE"}</button>
            </div>
            <div class="row wrap" style="gap:4px">
              {missing.map((st) => <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)">{st.number ?? "-"} {shortName(st)}</span>)}
            </div>
          </div>
        )}
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="primary grow" style="justify-content:center" onClick={() => { ended.value = null; startSession(s.assignmentId, s.classId, s.mode); }}><Icon name="scan" size={16} /> สแกนต่อ</button>
          <button class="grow" style="justify-content:center" onClick={() => { ended.value = null; }}><Icon name="list-check" size={16} /> เลือกงานอื่น</button>
        </div>
      </div>
    </div>
  );
}

function FeedbackCard() {
  const f = feedback.value!;
  return (
    <div class={"fb " + f.kind} role="status">
      <div class="ic"><Icon name={f.icon} size={24} /></div>
      <div class="grow">
        <div class="name">{f.name}</div>
        <div class="sub">{f.sub}</div>
      </div>
      {f.score && <div class="score">{f.score}</div>}
    </div>
  );
}

function ScorePad() {
  const s = session.value!;
  const st = pending.value ? studentsById.value.get(pending.value) : null;
  const [val, setVal] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setVal(""); setErrMsg(""); ref.current?.focus(); }, [pending.value]);

  function commitVal(v: string) {
    const n = Number(v);
    if (v.trim() === "" || !isHalfStep(n) || n < 0 || n > s.fullScore) { setErrMsg(`ใส่คะแนน 0–${s.fullScore} (ทีละ 0.5)`); return; }
    submitTypedScore(n);
    setVal("");
  }
  if (!st) return null;
  const quick = [s.fullScore, s.fullScore - 1, s.fullScore - 2, Math.round(s.fullScore * 0.5)].filter((n, i, a) => n >= 0 && a.indexOf(n) === i);

  return (
    <div class="card" style="margin-bottom:12px">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div><span style="font-weight:500">{fullName(st)}</span> <span class="muted">เลขที่ {st.number ?? "-"}</span></div>
        <button class="ghost" onClick={() => { pending.value = null; }}>ให้คะแนนทีหลัง</button>
      </div>
      <div class="sc-quick">
        {quick.map((n) => <button onClick={() => commitVal(String(n))}>{n}/{s.fullScore}</button>)}
      </div>
      <div class="row" style="gap:8px;align-items:flex-start">
        <input ref={ref} inputMode="numeric" value={val} style="width:90px;height:52px;font-size:22px;text-align:center" aria-label="คะแนน"
          onInput={(e) => { setVal((e.target as HTMLInputElement).value); setErrMsg(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") commitVal(val); }} />
        <span style="font-size:22px;align-self:center">/ {s.fullScore}</span>
        <div class="scorepad">
          {[1,2,3,4,5,6,7,8,9].map((n) => <button onClick={() => setVal((v) => v + n)}>{n}</button>)}
          <button onClick={() => setVal((v) => (v.includes(".") ? v : (v || "0") + ".5"))} style="font-size:16px">.5</button>
          <button onClick={() => setVal((v) => v + "0")}>0</button>
          <button onClick={() => setVal((v) => v.slice(0, -1))}><Icon name="backspace" size={18} /></button>
          <button class="primary" onClick={() => commitVal(val)} style="grid-column:span 3"><Icon name="check" size={18} /> บันทึก</button>
        </div>
      </div>
      {errMsg && <div style="color:var(--text-danger);font-size:13px;margin-top:6px">{errMsg}</div>}
    </div>
  );
}

// Test seam: the round controller is plain functions over signals, so a test can drive it without rendering.
export const __scan = { startSession, loadSubs, pollSubs, startPolling, POLL_MS, RESUME_GAP_MS, commitStudent, effSub, session, subsBox, feedback };
