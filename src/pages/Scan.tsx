import { useEffect, useRef, useState } from "preact/hooks";
import { signal, computed } from "@preact/signals";
import "../styles/scan.css";
import { Icon } from "../components/Icon";
import { PageHeader, ProgressRing, TermPicker } from "../components/ui";
import {
  activeClasses,
  activeSubjects,
  assignments,
  deletedAssignmentIds,
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
  captureAssignmentContext,
  assignmentContextCurrent,
  loadBootstrap,
} from "../store";
import type { ScanMode, Student, SubmissionOpResult } from "@shared/types";
import { buildIndex, resolveScan } from "@shared/scan";
import { isHalfStep } from "@shared/grade";
import { bkkToday } from "@shared/time";
import { workState, countWorkStates } from "@shared/metrics";
import { ulid } from "@shared/ids";
import { api } from "../lib/api";
import { enqueueSubmission, onResult, pendingCount, syncing, online, pendingOps, failedPairKeys, pairKey, failedCount, listFailed, retryFailed, discardFailed } from "../lib/outbox";
import type { FailedItem } from "../lib/idb";
import { kvGet, kvSet } from "../lib/idb";
import { beep, vibrate } from "../lib/sound";
import { err, notify } from "../lib/notify";
import { FAIL_REASON } from "../lib/failReasons";
import { checkReceivedDate } from "@shared/received-date";
import { scanLayout } from "../lib/pageCards";
import { isHiddenCard } from "../lib/cardLayout";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { SCAN_CARD_META, SCAN_LOCKED } from "../components/cards/meta";
import { installHidScanner } from "../lib/hid";
import { fullName, shortName, initials } from "../lib/names";
import { dashboard, loadDashboard } from "../lib/dashboard";
import { actionTime } from "../lib/clock";
import { routeParams } from "../router";
import { serverReachable } from "../lib/session";

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
  /** the server's late flag (BR-04); unknown for a scan still waiting to be sent */
  late?: boolean;
}
interface Feedback {
  kind: "success" | "warning" | "danger" | "accent";
  icon: string;
  name: string;
  sub: string;
  score?: string;
  awaitScore?: string; // studentId whose score pad is open for this "received" card
  opId?: string; // the queued op this success card is about (a refused/already-held answer must clear it)
}

const session = signal<Session | null>(null);
/** The day the hand-ins of this round were really received. null = today (the normal case). Reset when a round starts or ends. */
const recvDate = signal<string | null>(null);
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
const recent = signal<{ studentId: string; at: number; score: number | null; opId?: string }[]>([]);
const feedback = signal<Feedback | null>(null);
const pending = signal<string | null>(null); // studentId awaiting typed score
const useCamera = signal(false);
// why the camera would not start (kept until the teacher dismisses it or tries again) — never a silent toggle-off
const cameraProblem = signal<{ title: string; hint: string } | null>(null);
const ended = signal<Session | null>(null); // show a summary after a round ends
const scannerReady = signal(typeof document !== "undefined" ? document.hasFocus() : true);
// a class number that several students share: the teacher picks, we never guess
// A child the teacher marked ยกเว้น for this work came to hand it in: ask before turning the exemption into a hand-in.
const excusedAsk = signal<{ student: Student; method: "camera" | "hid" | "manual" } | null>(null);
const choices = signal<{ raw: string; students: Student[]; method: "camera" | "hid" | "manual" } | null>(null);

const activeAssignment = computed(() =>
  session.value ? assignments.value.find((a) => a.id === session.value!.assignmentId) ?? null : null,
);

// Why this round can't take hand-ins any more (the work was closed or deleted since it started)
const closedReason = computed<"closed" | "deleted" | null>(() => {
  if (!session.value) return null;
  const a = activeAssignment.value;
  if (!a) return deletedAssignmentIds.value.has(session.value.assignmentId) ? "deleted" : null;
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


// restore a saved session across reloads
kvGet<Session>("scanSession").then((s) => {
  if (s && !session.value) session.value = s;
});

function setFeedback(f: Feedback) { feedback.value = f; }
function big(score: number, full: number) { return `${score}/${full}`; }

/** A response may predate a scan/ACK that changed this map while its request was in flight. */
function reconcileSubs(rows: any[], beforeRequest: Map<string, SubState>): Map<string, SubState> {
  const map = new Map<string, SubState>();
  for (const row of rows) map.set(row.student_id, { status: row.status, score: row.score, at: row.updated_at, late: row.late === true || row.late === 1 });
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
  const ctx = captureAssignmentContext();
  const seq = ++loadSeq;
  lastFetchAt = Date.now();
  const beforeRequest = subsBox.value.aid === assignmentId ? subsBox.value.map : NO_SUBS;
  let res: { submissions: any[]; assignment?: { status: string; full_score: number; deleted: boolean } | null; serverTime: number };
  try {
    res = await api.get(`/api/assignments/${assignmentId}/submissions`);
  } catch (e) {
    // no answer: say "we don't know" (only if we knew nothing yet) — never leave the last work's numbers up
    if (assignmentContextCurrent(ctx) && seq === loadSeq && roundAid() === assignmentId && subsBox.value.status !== "ready") {
      subsBox.value = { ...subsBox.value, aid: assignmentId, status: "unknown" };
    }
    throw e;
  }
  if (!assignmentContextCurrent(ctx)) return;
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
  const ctx = captureAssignmentContext();
  lastFetchAt = Date.now();
  try {
    const res = await api.get<{ submissions: any[]; assignment?: { status: string; full_score: number; deleted: boolean } | null; serverTime: number }>(
      // Wall-clock cursors can miss writes that commit after a poll with an older updated_at.
      // Reconcile the whole assignment; effSub keeps this device's unsent operations on top.
      `/api/assignments/${s.assignmentId}/submissions`,
    );
    if (!assignmentContextCurrent(ctx)) return;
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
  resume(); // returning from another menu mounts a new poller while keeping the previous snapshot
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
  // a hand-in already on the server keeps its submit time and lateness when re-scored (as the server does)
  const late = server?.status === "submitted" ? server.late : undefined;
  return { status: op.status === "excused" ? "excused" : "submitted", score: op.score, at: op.clientTs, late };
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

function pushRecent(studentId: string, score: number | null, opId?: string) {
  recent.value = [{ studentId, at: Date.now(), score, opId }, ...recent.value].slice(0, 30);
}

function makeOp(studentId: string, status: "submitted" | "void", score: number | null, method: "camera" | "hid" | "manual") {
  const s = session.value!;
  return {
    opId: ulid(), scanSessionId: s.id, assignmentId: s.assignmentId, studentId,
    // when the teacher acted, on the server's clock: this is what orders it against everything else
    status, score, fullScoreAtScan: s.fullScore, method, clientTs: actionTime(),
    // the day the work was handed in: the picked day, else the day of this tap — so a scan queued offline and sent
    // the next day still counts for the day it was made (BR-07). Only for hand-ins, not for taking one back.
    ...(status === "submitted" ? { receivedDate: recvDate.value ?? bkkToday(actionTime()) } : {}),
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
  excusedAsk.value = null; // a new scan replaces an unanswered question

  if (r.kind === "not_found") {
    beep.err(); vibrate(120);
    const cn = activeClasses.value.find((c) => c.id === s.classId)?.name ?? "ห้องนี้";
    const isNo = /^\d{1,3}$/.test(raw.trim());
    setFeedback({ kind: "danger", icon: "x", name: isNo ? `ไม่มีเลขที่ ${raw.trim()} ใน ${cn}` : `ไม่พบรหัส ${raw.slice(0, 20)}`, sub: isNo ? "ตรวจเลขที่ หรือเลือกห้องให้ตรงกับบัตร" : "ตรวจสอบบัตรหรือพิมพ์รหัสใหม่" });
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

function commitStudent(student: Student, method: "camera" | "hid" | "manual", acceptExcused = false) {
  const s = session.value;
  if (!s) return;
  if (refuseIfClosed()) return;
  if (student.class_id !== s.classId) {
    beep.err();
    setFeedback({ kind: "danger", icon: "user-x", name: fullName(student), sub: "ไม่ได้อยู่ในห้องที่เลือก" });
    return;
  }
  // moved / inactive / finished: the server refuses the hand-in (student_inactive) — say so now, not after a
  // success beep that an offline teacher would believe until the queue drains
  if (student.status !== "active") {
    beep.err(); vibrate(120);
    setFeedback({ kind: "danger", icon: "user-x", name: fullName(student), sub: REJECTED.student_inactive });
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

  if (existing && existing.status === "excused" && !acceptExcused) {
    beep.dup(); vibrate(60);
    excusedAsk.value = { student, method };
    setFeedback({ kind: "warning", icon: "alert-triangle", name: fullName(student), sub: "งานนี้ถูกตั้งเป็น “ยกเว้น” ไว้ — จะรับงานจริงไหม?" });
    return;
  }
  excusedAsk.value = null;

  const score = s.mode === "full" ? s.fullScore : null;
  const prev = effSub(student.id);
  const op = makeOp(student.id, "submitted", score, method);
  updateSub(student.id, { status: "submitted", score, at: Date.now() });
  void enqueueRevertible(op, student.id, prev);

  if (s.mode === "full") {
    pushRecent(student.id, s.fullScore, op.opId);
    beep.ok(); vibrate(40);
    setFeedback({ kind: "success", icon: "check", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · ส่งแล้ว`, score: big(s.fullScore, s.fullScore), opId: op.opId });
  } else if (s.mode === "later") {
    pushRecent(student.id, null, op.opId);
    beep.ok(); vibrate(40);
    setFeedback({ kind: "success", icon: "check", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · รับงานแล้ว`, opId: op.opId });
  } else {
    pushRecent(student.id, null, op.opId);
    pending.value = student.id;
    beep.ok(); vibrate(40);
    setFeedback({ kind: "accent", icon: "pencil", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · รับงานแล้ว ใส่คะแนนแล้วกด Enter`, awaitScore: student.id, opId: op.opId });
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
  updateSub(pid, { status: "submitted", score, at: Date.now(), late: prev?.status === "submitted" ? prev.late : undefined });
  const op = makeOp(pid, "submitted", score, "manual");
  void enqueueRevertible(op, pid, prev);
  pushRecent(pid, score, op.opId);
  const st = studentsById.value.get(pid);
  setFeedback({ kind: "success", icon: "check", name: st ? fullName(st) : "", sub: "บันทึกคะแนนแล้ว", score: big(score, s.fullScore), opId: op.opId });
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
  // taking a hand-in back is one tap away from a slip: say so, and give a few seconds to change one's mind (D16)
  if (prev && prev.status === "submitted") {
    const op = makeOp(studentId, "submitted", prev.score, "manual");
    notify("info", `ยกเลิกการส่งของ ${st ? fullName(st) : "นักเรียน"} แล้ว`, { action: { label: "เลิกทำ", run: () => {
      if (!session.value || session.value.assignmentId !== op.assignmentId) return;
      updateSub(studentId, prev);
      pushRecent(studentId, prev.score, op.opId);
      void enqueueRevertible(op, studentId, undefined);
    } } });
  }
}

const REJECTED = FAIL_REASON;
// The server said no. The grid must stop showing that student as submitted, and the
// teacher must be told why — a green square that the server refused is a lie.
let scanViewLeft = true; // true while the scan page is not on screen: a late answer updates the cache, never a card/sound
const alreadyShownAt = new Map<string, number>(); // studentId -> when the repeat card last showed (one card per batch)
onResult((r: SubmissionOpResult, op) => {
  if (r.result === "already_submitted") {
    // the server already holds this cell: its value is the truth (BR-07). Show it like a local repeat scan.
    const box = subsBox.value;
    const sub = r.submission;
    if (sub && box.aid === op.assignmentId) {
      const m = new Map(box.map);
      m.set(op.studentId, { status: sub.status, score: sub.score, at: sub.updated_at ?? Date.now(), late: sub.late === true });
      subsBox.value = { ...box, map: m };
    }
    const s = session.value;
    if (!s || s.assignmentId !== op.assignmentId) return;
    // state that would be wrong when the teacher comes back: dropped whether or not the page is on screen
    recent.value = recent.value.filter((x) => x.opId !== op.opId);
    if (pending.value === op.studentId) pending.value = null;
    if (feedback.value?.opId === op.opId || feedback.value?.awaitScore === op.studentId) feedback.value = null;
    if (scanViewLeft) return; // no card / sound / vibration off the scan page
    const now = Date.now();
    const last = alreadyShownAt.get(op.studentId);
    if (last !== undefined && now - last < 3000) return;
    alreadyShownAt.set(op.studentId, now);
    const st = studentsById.value.get(op.studentId);
    beep.dup(); vibrate(60);
    setFeedback({
      kind: "warning", icon: "alert-triangle", name: st ? fullName(st) : "",
      sub: `ส่งไปแล้ว — ไม่บันทึกซ้ำ`, score: sub?.score != null ? big(sub.score, s.fullScore) : undefined,
    });
    return;
  }
  if (r.result === "ok" || r.result === "duplicate") {
    // R-08: what the server stored (its late flag included) shows at once, not at the next poll — only on the copy of
    // the same work; a newer scan still waiting in the queue stays on top (effSub)
    const sub = r.result === "ok" ? r.submission : undefined;
    const box = subsBox.value;
    if (sub && box.aid === op.assignmentId) {
      const m = new Map(box.map);
      m.set(op.studentId, { status: sub.status, score: sub.score, at: sub.updated_at ?? Date.now(), late: sub.late === true });
      subsBox.value = { ...box, map: m };
    }
    return;
  }
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
  recvDate.value = null;
  resetSubs(s.assignmentId); // the previous work's hand-ins must not be on screen, or scanned against, even for an instant
  // reset NOW, not after the await below: a scan made while the round is being saved must not be wiped
  recent.value = [];
  feedback.value = null;
  excusedAsk.value = null;
  pending.value = null;
  alreadyShownAt.clear();
  scanViewLeft = false; // a round is started from the scan page (a restored round stays "not on screen" until it mounts)
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

/**
 * The work picker re-reads the work list (full score, open/closed, rooms) while it is on screen — every POLL_MS when seen,
 * and at once when the page or the network comes back — so a score changed on another device is not offered stale.
 * Returns the stop function.
 */
export function startSetupRefresh(reload: () => Promise<unknown>): () => void {
  let busy = false;
  let last = 0;
  const run = (minGap: number) => {
    if (document.visibilityState === "hidden" || !navigator.onLine || busy || Date.now() - last < minGap) return;
    busy = true;
    last = Date.now();
    reload().catch(() => { /* offline or signed out: keep what is shown */ }).finally(() => { busy = false; });
  };
  const timer = setInterval(() => run(0), POLL_MS);
  const resume = () => run(RESUME_GAP_MS);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
  };
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
  useEffect(() => startSetupRefresh(() => loadBootstrap()) /* NOT the dashboard: it reads ~10,000 rows per call at school size */, []);
  useEffect(() => {
    if (asg && !asg.class_ids.includes(classId)) setClassId(asg.class_ids[0] ?? "");
  }, [assignmentId]);

  const shown = subjectFilter ? open.filter((a) => a.subject_id === subjectFilter) : open;
  const progressFor = (aid: string, cid: string) => {
    const da = dashboard.value?.openAssignments.find((x) => x.assignment.id === aid);
    return da?.perClass.find((p) => p.classId === cid) ?? null;
  };

  return (
    <div class="sc-page">
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
              <button class={"pill" + (subjectFilter === "" ? " on" : "")} style="height:1.73rem" onClick={() => setSubjectFilter("")}>ทุกวิชา</button>
              {activeSubjects.value.map((s) => <button class={"pill" + (subjectFilter === s.id ? " on" : "")} style="height:1.73rem" onClick={() => setSubjectFilter(s.id)}>{s.name}</button>)}
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
                  <div class="row wrap" style="gap:10px;margin-top:4px;font-size:var(--fs-xs);font-variant-numeric:tabular-nums">
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
            <button class="primary" style="height:2.8rem;padding:0 20px" disabled={!classId || !asg} onClick={() => startSession(assignmentId, classId, mode)}>
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
  const [prefsOpen, setPrefsOpen] = useState(false);
  const layout = scanLayout.value;
  const showRecent = !isHiddenCard(layout, "recent"), showHid = !isHiddenCard(layout, "hid"), showHint = !isHiddenCard(layout, "hint");

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
  useEffect(() => { scanViewLeft = false; return () => { scanViewLeft = true; }; }, []);
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
    recvDate.value = null;
    kvSet("scanSession", null);
    useCamera.value = false;
  }

  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const subj = subjectById(s.subjectId);
  const wt = workTypeById(asg?.type_id ?? null);
  const classStudents = studentsByClass.value.get(s.classId) ?? [];
  const waiting = classStudents.filter((st) => markOf(st.id) === "pend").length;
  const modeLabel = s.mode === "full" ? "ให้คะแนนเต็ม" : s.mode === "type" ? "กรอกทีละคน" : "รับงานก่อน";
  const today = bkkToday();
  // the legend counts every seat by the same work state that colours it, so the groups add up to the
  // whole class; the ring is hand-ins ÷ (class − excused), the same rate as Home / Gradebook / Reports
  const seat = countWorkStates(classStudents.map((st) => {
    const sub = effSub(st.id);
    return asg ? workState(sub ? { status: sub.status, score: sub.score, late: sub.late === true } : null, asg, today) : "pending";
  }));
  const overdue = !!asg?.due_date && today > asg.due_date;
  const LEGEND: { n: number; label: string; swatch: string }[] = [
    { n: seat.scored, label: "ส่งแล้ว", swatch: "background:var(--bg-success);border:0.5px solid var(--border-success)" },
    { n: seat.late, label: "ส่งช้า", swatch: "background:var(--bg-warning);border:0.5px solid var(--border-warning)" },
    { n: seat.awaiting, label: "รอตรวจ", swatch: "background:var(--bg-accent);border:0.5px solid var(--border-accent)" },
    { n: seat.missing + seat.pending, label: "ยังไม่ส่ง", swatch: overdue ? "border:0.5px dashed var(--border-danger)" : "border:0.5px dashed var(--text-secondary)" },
    { n: seat.excused, label: "ยกเว้น", swatch: "background:var(--surface-1);border:0.5px solid var(--border)" },
  ];
  const otherClasses = (asg?.class_ids ?? []).filter((c) => c !== s.classId);
  const known = subsBox.value.aid === s.assignmentId && subsBox.value.status === "ready";
  const up = online.value && serverReachable.value;

  return (
    <div class="sc-page">
      {!known && (
        <div class="imp-warn" role="status" style="margin:0 0 8px;font-size:var(--fs-sm)">
          <Icon name={subsBox.value.status === "unknown" ? "cloud-off" : "loader-2"} size={15} class={subsBox.value.status === "unknown" ? "" : "spin"} />
          <span class="grow">{subsBox.value.status === "unknown"
            ? "ยังไม่ทราบว่าใครส่งงานนี้แล้วบ้าง (โหลดจากระบบไม่ได้) — สแกนต่อได้ ทุกรายการเข้าคิวและระบบจะตรวจซ้ำตอนส่ง"
            : "กำลังโหลดข้อมูลของงานนี้…"}</span>
          {subsBox.value.status === "unknown" && <button class="ghost" style="height:1.73rem;font-size:var(--fs-xs)" onClick={() => loadSubs(s.assignmentId).catch(() => {})}>ลองอีกครั้ง</button>}
        </div>
      )}
      <div class={"ctxbar" + (recvDate.value ? " back" : "")} role="group" aria-label="รอบสแกน">
        <div style="position:relative">
          <button class="ghost" style="color:inherit;height:1.87rem;background:var(--surface-2)" onClick={() => otherClasses.length && setRoomMenu((v) => !v)}>
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
        <button class="icon ghost" style="color:inherit;background:var(--surface-2)" aria-label="ปรับการ์ด" onClick={() => setPrefsOpen(true)}><Icon name="layout-grid" size={18} /></button>
        <button class="ghost" style="color:inherit;background:var(--surface-2)" onClick={endSession}><Icon name="player-stop" size={16} /> จบรอบ</button>
      </div>
      <div class={"ctxbar ctx2" + (recvDate.value ? " back" : "")}>
        <span style="font-size:var(--fs-sm)">เต็ม {s.fullScore} · {modeLabel}</span>
        <ReceivedDateChip assignedDate={asg?.assigned_date ?? null} />
      </div>
      {prefsOpen && <PageCardSettings page="scan" title="หน้าสแกน" layout={layout} meta={SCAN_CARD_META} locked={SCAN_LOCKED} onClose={() => setPrefsOpen(false)} />}

      <div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <div class="page-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">{asg?.title}</div>
        <div class="row" style="gap:6px">
          {showHid && <span class="chip" style={scannerReady.value ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-warning);color:var(--text-warning)"}>
            <Icon name={scannerReady.value ? "circle-check" : "hand-click"} size={13} />
            {scannerReady.value ? "เครื่องยิงพร้อม" : "คลิกหน้านี้ก่อนยิง"}
          </span>}
          <span class="chip" style={up ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--bg-warning);color:var(--text-warning)"}>
            <Icon name={up ? "cloud-check" : "cloud-off"} size={14} />
            {syncing.value ? "กำลังบันทึก" : up ? "ออนไลน์" : "ออฟไลน์"}{pendingCount.value > 0 ? ` · ค้าง ${pendingCount.value}` : ""}
          </span>
        </div>
      </div>

      {closedReason.value && (
        <div class="sc-closed" role="alert">
          <Icon name="lock" size={18} />
          <div class="grow"><b style="font-weight:500">{closedReason.value === "closed" ? "งานนี้ปิดรับแล้ว" : "งานนี้ถูกลบแล้ว"}</b> — สแกนแล้วจะไม่บันทึก ให้คะแนนย้อนหลังได้ที่ <a href="#/gradebook">สมุดคะแนน</a></div>
          <button style="height:2rem;font-size:var(--fs-xs)" onClick={endSession}>จบรอบ</button>
        </div>
      )}

      <div class="sc-layout">
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
        <button class="icon" style="width:3.73rem;height:3.73rem;border-radius:var(--radius)" aria-label="สแกนด้วยกล้อง" onClick={() => (useCamera.value = !useCamera.value)}>
          <Icon name={useCamera.value ? "camera-off" : "camera"} size={22} />
        </button>
      </div>

      <div class="sc-mid">
      {cameraProblem.value && (
        <div class="imp-warn danger" role="alert" style="margin:0 0 12px;font-size:var(--fs-sm)">
          <Icon name="camera-off" size={16} />
          <span class="grow"><b style="font-weight:500">{cameraProblem.value.title}</b><br />{cameraProblem.value.hint}</span>
          <button class="ghost" style="height:1.73rem;font-size:var(--fs-xs)" onClick={() => (cameraProblem.value = null)}>ปิด</button>
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

      {/* while the score pad is open its header already names the child, so the "รับงานแล้ว" card would repeat it */}
      {feedback.value && <FeedbackCard hidden={s.mode === "type" && !!pending.value && feedback.value.awaitScore === pending.value} />}
      {excusedAsk.value && (
        <div class="card sc-choose" role="group" aria-label="เด็กที่ได้รับการยกเว้น">
          <div style="font-weight:500;margin-bottom:8px">{fullName(excusedAsk.value.student)} ถูกตั้งเป็น “ยกเว้น” ในงานนี้ — รับงานจริงไหม?</div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="sc-pick" onClick={() => { const q = excusedAsk.value!; excusedAsk.value = null; commitStudent(q.student, q.method, true); }}>
              <span style="font-weight:500">รับงานนี้</span>
              <span class="page-sub">เปลี่ยนจากยกเว้นเป็นส่งแล้ว</span>
            </button>
            <button class="sc-pick" onClick={() => { excusedAsk.value = null; feedback.value = null; }}>
              <span style="font-weight:500">ไม่รับ คงยกเว้น</span>
              <span class="page-sub">ไม่เปลี่ยนอะไร</span>
            </button>
          </div>
        </div>
      )}
      {choices.value && (
        <div class="card sc-choose" role="group" aria-label="เลือกนักเรียน">
          <div class="row" style="justify-content:space-between;gap:8px;margin-bottom:8px">
            <span style="font-weight:500">เลขที่ {choices.value.raw} มี {choices.value.students.length} คน — เลือกคนที่ถูกต้อง</span>
            <button class="ghost" style="height:1.87rem;font-size:var(--fs-xs)" onClick={() => (choices.value = null)}>ยกเลิก</button>
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
      {showHint && !pending.value && <div class="page-sub sc-hint">{s.mode === "full" ? "โหมดให้คะแนนเต็ม: ยิงแล้วได้คะแนนเต็มทันที · แตะช่องที่ส่งแล้วเพื่อยกเลิก" : s.mode === "later" ? "โหมดรับงานก่อน: ยิงแล้วบันทึกว่าส่ง ให้คะแนนทีหลังในสมุดคะแนน" : "โหมดกรอกทีละคน: ยิงแล้วพิมพ์คะแนน กด Enter"}</div>}
      {s.mode === "type" && pending.value && <ScorePad />}
      <FailedPanel assignmentId={s.assignmentId} />
      </div>

        {showRecent && <div class="card sc-recent" style="padding:0;overflow:hidden">
          <div class="row" style="justify-content:space-between;padding:10px 12px;background:var(--surface-1)">
            <span style="font-size:var(--fs-sm)" class="muted">สแกนล่าสุด</span>
            <span style="font-size:var(--fs-sm)" class="muted">รอบนี้ {recent.value.length} คน</span>
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
        </div>}

        <div class="card sc-gridcard">
          <div class="row" style="gap:12px;margin-bottom:8px">
            <ProgressRing value={known ? seat.submitted : 0} total={known ? seat.counted : classStudents.length} size={72} label={known ? "ส่งแล้ว" : "ไม่ทราบ"} />
            <div style="font-size:var(--fs-sm)">
              {known
                ? LEGEND.filter((g) => g.n > 0).map((g) => <div class="row" style="gap:6px"><span style={"width:9px;height:9px;border-radius:2px;" + g.swatch} />{g.label} {g.n}</div>)
                : <div class="row" style="gap:6px"><span style="width:9px;height:9px;border-radius:2px;border:0.5px dashed var(--text-secondary)" />ยังไม่ทราบ ?</div>}
              {waiting > 0 && <div class="row" style="gap:6px;color:var(--text-warning)"><span style="width:9px;height:9px;border-radius:50%;background:var(--fill-warning)" />รอส่งขึ้นระบบ {waiting}</div>}
            </div>
          </div>
          <div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:500;font-size:var(--fs-sm)">ผังเลขที่ {cls?.name}</span><span class="page-sub">แตะช่องว่าง = รับแทน</span></div>
          <div class="sc-grid">
            {classStudents.map((st) => {
              const sub = effSub(st.id);
              const mark = markOf(st.id);
              const state = asg ? workState(sub ? { status: sub.status, score: sub.score, late: sub.late === true } : null, asg, today) : "pending";
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
  // excused children are not counted (BR-05): not in the ring's total, not on the "not handed in" list
  const missing = classStudents.filter((st) => { const st2 = effSub(st.id)?.status; return st2 !== "submitted" && st2 !== "excused"; });
  const counted = submitted.length + missing.length;
  const [copied, setCopied] = useState(false);

  function copyMissing() {
    const text = `รายชื่อยังไม่ส่ง "${asg?.title}" ${cls?.name}\n` + missing.map((st) => `${st.number ?? "-"}. ${fullName(st)}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div class="sc-page">
      <div class="page-head"><div class="page-title">จบรอบสแกน</div></div>
      <div class="card sc-summary">
        <div class="row" style="gap:10px;margin-bottom:12px">
          <ProgressRing value={submitted.length} total={counted} label="ส่งแล้ว" />
          <div>
            <div style="font-weight:500">{asg?.title}</div>
            <div class="page-sub">{cls?.name} · เต็ม {s.fullScore}</div>
            <div class="row" style="gap:12px;margin-top:6px;font-size:var(--fs-sm)">
              <span style="color:var(--text-success)"><Icon name="check" size={14} /> ส่งแล้ว {submitted.length}</span>
              <span style="color:var(--text-danger)"><Icon name="alert-circle" size={14} /> ยังไม่ส่ง {missing.length}</span>
            </div>
          </div>
        </div>
        {missing.length > 0 && (
          <div style="border-top:0.5px solid var(--border);padding-top:10px">
            <div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:500">ยังไม่ส่ง {missing.length} คน</span>
              <button class="ghost" style="height:1.87rem;font-size:var(--fs-xs)" onClick={copyMissing}><Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไป LINE"}</button>
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

/** "วันที่รับ: วันนี้ ▾" — pick the day the work was really handed in (between the day it was given and today). */
function ReceivedDateChip({ assignedDate }: { assignedDate: string | null }) {
  const [open, setOpen] = useState(false);
  const today = bkkToday();
  const cur = recvDate.value ?? today;
  const label = cur === today ? "วันนี้" : thaiShort(cur);
  const min = assignedDate && assignedDate <= today ? assignedDate : "2020-01-01";
  function pick(v: string | null) {
    if (v && v !== today) {
      const problem = checkReceivedDate(v, { today, assignedDate });
      if (problem) { err(FAIL_REASON[problem]); return; }
    }
    recvDate.value = v && v !== today ? v : null;
    setOpen(false);
    if (recvDate.value) notify("info", `กำลังรับงานย้อนหลัง · ${thaiShort(recvDate.value)} — งานที่สแกนต่อจากนี้จะนับเป็นวันนั้น`);
  }
  const yest = (() => { const d = new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10); return d >= min ? d : null; })();
  return (
    <span class="sc-date">
      <button class="ghost sc-datebtn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="calendar-event" size={16} /> วันที่รับ: {label} <Icon name="chevron-down" size={14} />
      </button>
      {recvDate.value && <>
        <span class="sc-backtxt"><Icon name="alert-triangle" size={16} /> รับงานย้อนหลัง</span>
        <button class="ghost" onClick={() => pick(null)}>กลับเป็นวันนี้</button>
      </>}
      {open && (
        <>
          <div style="position:fixed;inset:0;z-index:29" onClick={() => setOpen(false)} />
          <div class="gb-menu sc-datemenu" role="dialog" aria-label="วันที่รับงาน" style="left:0;right:auto">
            <button onClick={() => pick(null)}>วันนี้</button>
            {yest && <button onClick={() => pick(yest)}>เมื่อวาน · {thaiShort(yest)}</button>}
            <label class="page-sub" style="display:flex;flex-direction:column;gap:2px;padding:6px 10px">เลือกวันอื่น
              <input type="date" min={min} max={today} value={cur} onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) pick(v); }} />
            </label>
            <div class="page-sub" style="padding:4px 10px">เลือกวันอนาคตหรือก่อนวันมอบหมายไม่ได้ · มีผลกับงานที่สแกนหลังจากนั้น · จบรอบแล้วกลับเป็นวันนี้</div>
          </div>
        </>
      )}
    </span>
  );
}
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function thaiShort(iso: string) { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y + 543}`; }

/** Hand-ins of this work the server refused: shown by themselves when there are any (never hidden — a refused scan is a lost hand-in). */
function FailedPanel({ assignmentId }: { assignmentId: string }) {
  const [items, setItems] = useState<FailedItem[]>([]);
  const [ask, setAsk] = useState("");
  const n = failedCount.value;
  useEffect(() => { listFailed().then((l) => setItems(l.filter((f) => f.payload.assignmentId === assignmentId))); }, [n, assignmentId]);
  if (!items.length) return null;
  const refresh = () => listFailed().then((l) => setItems(l.filter((f) => f.payload.assignmentId === assignmentId)));
  return (
    <section class="card sc-failed" aria-labelledby="sc-failed-h">
      <h2 id="sc-failed-h" style="font-size:1rem;color:var(--text-danger)"><Icon name="cloud-x" size={18} /> ส่งไม่สำเร็จ {items.length} รายการ</h2>
      {items.map((it) => {
        const st = studentsById.value.get(it.payload.studentId);
        return (
          <div class="row" style="gap:8px;padding:6px 0;border-top:0.5px solid var(--border)" key={it.opId}>
            <div class="grow" style="min-width:0">
              <div><b style="font-weight:500">{st ? `เลขที่ ${st.number ?? "-"} ${fullName(st)}` : it.payload.studentId}</b> · {new Date(it.failedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
              <div class="page-sub" style="color:var(--text-danger)">{FAIL_REASON[it.reason] ?? it.reason}</div>
              {ask === it.opId && <div class="page-sub">ทิ้งรายการนี้? ข้อมูลส่งงานของเด็กคนนี้จะหายไป</div>}
            </div>
            {ask === it.opId
              ? <><button class="ghost" onClick={() => setAsk("")}>ไม่ทิ้ง</button><button style="color:var(--text-danger)" onClick={async () => { setAsk(""); await discardFailed(it.opId); refresh(); }}>ทิ้ง</button></>
              : <><button onClick={async () => { try { await retryFailed(it.opId); refresh(); } catch { err("ลองใหม่ไม่ได้ — เครื่องนี้บันทึกไม่ได้"); } }}>ลองใหม่</button><button class="ghost" onClick={() => setAsk(it.opId)}>ทิ้ง</button></>}
          </div>
        );
      })}
    </section>
  );
}

function FeedbackCard({ hidden }: { hidden?: boolean }) {
  const f = feedback.value!;
  return (
    <div class={"fb " + f.kind + (hidden ? " sr-only" : "")} role="status">
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
  const [attempted, setAttempted] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setVal(""); setAttempted(false); ref.current?.focus(); }, [pending.value]);

  function validate(v: string) {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n) && n > s.fullScore) return `คะแนนต้องไม่เกิน ${s.fullScore} คะแนน`;
    if (v.trim() === "" || !isHalfStep(n) || n < 0) return `ใส่คะแนน 0–${s.fullScore} (ทีละ 0.5)`;
    return "";
  }
  const validation = validate(val);
  const errMsg = val !== "" || attempted ? validation : "";

  function commitVal(v: string) {
    if (validate(v)) { setAttempted(true); return; }
    submitTypedScore(Number(v));
    setVal("");
  }
  if (!st) return null;
  const quick = [s.fullScore, s.fullScore - 1, s.fullScore - 2, Math.round(s.fullScore * 0.5)].filter((n, i, a) => n >= 0 && a.indexOf(n) === i);

  return (
    <section class="card sc-pad" aria-label="ให้คะแนน">
      <div class="sc-pad-head">
        <span class="sc-pad-name" id="sc-pad-name">{fullName(st)}</span>
        <span class="sc-pad-no">เลขที่ {st.number ?? "-"}</span>
        <span class="grow" />
        <button class="ghost" onClick={() => { pending.value = null; }}>ให้คะแนนทีหลัง</button>
      </div>
      <div class="sc-pad-body">
        <div class="sc-pad-left">
          <div class="sc-score-entry">
            <div class="sc-score-row">
              <input ref={ref} class="sc-score-input" inputMode="decimal" value={val} aria-label="คะแนน" aria-describedby={errMsg ? "scan-score-error" : "sc-pad-name"}
                aria-invalid={!!errMsg}
                onInput={(e) => setVal((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitVal(val); } }} />
              <span class="sc-score-full">/ {s.fullScore}</span>
            </div>
            {errMsg && <div id="scan-score-error" class="sc-score-error" role="alert">{errMsg}</div>}
          </div>
          <div class="sc-quick">
            {quick.map((n) => <button onClick={() => commitVal(String(n))}>{n}/{s.fullScore}</button>)}
          </div>
        </div>
        <div class="scorepad">
          {[1,2,3,4,5,6,7,8,9].map((n) => <button onClick={() => setVal((v) => v + n)}>{n}</button>)}
          <button onClick={() => setVal((v) => (v.includes(".") ? v : (v || "0") + ".5"))}>.5</button>
          <button onClick={() => setVal((v) => v + "0")}>0</button>
          <button aria-label="ลบตัวเลขท้ายสุด" onClick={() => setVal((v) => v.slice(0, -1))}><Icon name="backspace" size={28} /></button>
          <button class="primary sc-save" aria-label="บันทึก" disabled={!!validation} onClick={() => commitVal(val)}><Icon name="check" size={28} /> บันทึก{val.trim() !== "" ? ` ${val}/${s.fullScore}` : ""}</button>
        </div>
      </div>
    </section>
  );
}

// Test seam: the round controller is plain functions over signals, so a test can drive it without rendering.
export const __scan = { recvDate, handleScan, undo, excusedAsk, startSession, loadSubs, pollSubs, startPolling, POLL_MS, RESUME_GAP_MS, commitStudent, effSub, session, subsBox, feedback };
