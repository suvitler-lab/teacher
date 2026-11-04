import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { signal, computed } from "@preact/signals";
import "../styles/scan.css";
import { Icon } from "../components/Icon";
import { PageHeader, TermPicker, DateField } from "../components/ui";
import { useConfirm } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
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
import { err, notify, toasts, dismiss } from "../lib/notify";
import { FAIL_REASON } from "../lib/failReasons";
import { checkReceivedDate } from "@shared/received-date";
import { scanLayout } from "../lib/pageCards";
import { isHiddenCard } from "../lib/cardLayout";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { ProjectorButton, ProjectorShell } from "../components/Projector";
import { projectorOn, pjHideNames, pjSize } from "../lib/projector";
import { isCoarse } from "../lib/display";
import { SCAN_CARD_META, SCAN_LOCKED } from "../components/cards/meta";
import { installHidScanner } from "../lib/hid";
import { fullName, shortName } from "../lib/names";
import { dashboard, loadDashboard } from "../lib/dashboard";
import { actionTime } from "../lib/clock";
import { routeParams, navigate } from "../router";
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
  /** R-03: the Thai day this hand-in was received (from the stored `submitted_at`, or the op still waiting to be sent) —
   *  what "เลิกทำ" puts back, so a child who handed in on time does not become late. Unknown only for a row with no date. */
  recvDay?: string;
}
interface Feedback {
  kind: "success" | "warning" | "danger" | "accent";
  icon: string;
  name: string;
  sub: string;
  score?: string;
  awaitScore?: string; // studentId whose score pad is open for this "received" card
  opId?: string; // the queued op this success card is about (a refused/already-held answer must clear it)
  /** "unknown" = no student has this code / number (the TV shows "ไม่รู้จักรหัสนี้" for this and nothing else that went wrong) */
  code?: "unknown";
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
const recent = signal<{ studentId: string; at: number; score: number | null; opId?: string; recv?: string }[]>([]);
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

/** A server row (list or ack) as the screen keeps it — with the day it was received, for "เลิกทำ" (R-03). */
function subFromRow(row: { status: SubState["status"]; score: number | null; updated_at?: number | null; late?: boolean | number; submitted_at?: number | null }): SubState {
  return {
    status: row.status, score: row.score, at: row.updated_at ?? Date.now(), late: row.late === true || row.late === 1,
    ...(row.submitted_at != null ? { recvDay: bkkToday(row.submitted_at) } : {}),
  };
}

/** A response may predate a scan/ACK that changed this map while its request was in flight. */
function reconcileSubs(rows: any[], beforeRequest: Map<string, SubState>): Map<string, SubState> {
  const map = new Map<string, SubState>();
  for (const row of rows) map.set(row.student_id, subFromRow(row));
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
  // ...and its received day too (R-03); a first hand-in still waiting to be sent has the day its op carries
  const recvDay = server?.status === "submitted" ? server.recvDay : op.receivedDate ?? undefined;
  return { status: op.status === "excused" ? "excused" : "submitted", score: op.score, at: op.clientTs, late, ...(recvDay ? { recvDay } : {}) };
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

function pushRecent(studentId: string, score: number | null, opId?: string, recv?: string | null) {
  // a hand-in taken in under a back-dated "received on" day says so in the list ("· รับ 30 ต.ค."), so nobody wonders later
  const day = recv === undefined ? recvDate.value : recv;
  // B-04: one child is one row (and one head in "รอบนี้ N คน") — scanning then typing the score, or scanning again after
  // taking it back, replaces the row instead of adding a second one
  recent.value = [{ studentId, at: Date.now(), score, opId, ...(day ? { recv: day } : {}) }, ...recent.value.filter((r) => r.studentId !== studentId)].slice(0, 30);
}

/** the day to show on a list row — only a day other than today ("· รับ 30 ต.ค."); null = nothing to say */
const backDay = (day: string | undefined): string | null => (day && day !== bkkToday(actionTime()) ? day : null);

/** `recv` = put a hand-in back under the day it was really received (R-03); omitted = the picked day, else the day of this tap */
function makeOp(studentId: string, status: "submitted" | "void", score: number | null, method: "camera" | "hid" | "manual", recv?: string) {
  const s = session.value!;
  return {
    opId: ulid(), scanSessionId: s.id, assignmentId: s.assignmentId, studentId,
    // when the teacher acted, on the server's clock: this is what orders it against everything else
    status, score, fullScoreAtScan: s.fullScore, method, clientTs: actionTime(),
    // the day the work was handed in: the picked day, else the day of this tap — so a scan queued offline and sent
    // the next day still counts for the day it was made (BR-07). Only for hand-ins, not for taking one back.
    ...(status === "submitted" ? { receivedDate: recv ?? recvDate.value ?? bkkToday(actionTime()) } : {}),
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

/** " · รับ 30 ต.ค." — said on a card only when the day the work is received is not today (C-03 AC-07) */
const recvTail = () => (recvDate.value ? ` · รับ ${thaiDayMonth(recvDate.value)}` : "");
/** Is a hand-in taken in on the picked day (else today) after the due date? Only a hint on the card: the server decides `late`. */
function isLateDay(): boolean {
  const asg = activeAssignment.value;
  const day = recvDate.value ?? bkkToday(actionTime());
  return !!asg?.due_date && day > asg.due_date;
}
const lateWord = (late: boolean) => (activeAssignment.value?.due_date ? (late ? " · ส่งช้า" : " · ทันกำหนด") : "");
/** The score typed last in this round, offered as a quick button on the pad ("ล่าสุด 7.5") */
const lastScore = signal<number | null>(null);

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
    setFeedback({ kind: "danger", icon: "alert-circle", code: "unknown", name: isNo ? `ไม่มีเลขที่ ${raw.trim()} ใน ${cn}` : `ไม่รู้จักรหัส ${raw.trim().slice(0, 20)}`, sub: isNo ? "ตรวจเลขที่ หรือเลือกห้องให้ตรงกับบัตร" : "ตรวจบัตรหรือพิมพ์เลขที่" });
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
  updateSub(student.id, { status: "submitted", score, at: Date.now(), recvDay: op.receivedDate });
  void enqueueRevertible(op, student.id, prev);

  const tail = recvTail();
  if (s.mode === "full") {
    pushRecent(student.id, s.fullScore, op.opId);
    beep.ok(); vibrate(40);
    const late = isLateDay();
    setFeedback({ kind: late ? "warning" : "success", icon: late ? "clock" : "check", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · ส่งแล้ว${lateWord(late)}${tail}`, score: big(s.fullScore, s.fullScore), opId: op.opId });
  } else if (s.mode === "later") {
    pushRecent(student.id, null, op.opId);
    beep.ok(); vibrate(40);
    setFeedback({ kind: "accent", icon: "inbox", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · รับงานแล้ว · รอคะแนน${tail}`, opId: op.opId });
  } else {
    pushRecent(student.id, null, op.opId);
    pending.value = student.id;
    beep.ok(); vibrate(40);
    setFeedback({ kind: "accent", icon: "pencil", name: fullName(student), sub: `เลขที่ ${student.number ?? "-"} · รับงานแล้ว ใส่คะแนนแล้วกด Enter${tail}`, awaitScore: student.id, opId: op.opId });
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
  // the score goes onto the hand-in just taken: it keeps the day that hand-in was received (R-03)
  const held = prev?.status === "submitted" ? prev : undefined;
  const op = makeOp(pid, "submitted", score, "manual", held?.recvDay);
  updateSub(pid, { status: "submitted", score, at: Date.now(), late: held?.late, recvDay: op.receivedDate });
  void enqueueRevertible(op, pid, prev);
  pushRecent(pid, score, op.opId, held?.recvDay ? backDay(held.recvDay) : undefined);
  lastScore.value = score;
  const st = studentsById.value.get(pid);
  const late = isLateDay();
  setFeedback({ kind: late ? "warning" : "success", icon: late ? "clock" : "check", name: st ? fullName(st) : "", sub: `เลขที่ ${st?.number ?? "-"} · บันทึกคะแนนแล้ว${lateWord(late)}${recvTail()}`, score: big(score, s.fullScore), opId: op.opId });
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
    // R-03: "เลิกทำ" puts the hand-in back on the day it was ORIGINALLY received (taken from the row being withdrawn),
    // never "today" or the round's back-dated day — else a child who handed in on time would turn up late (BR-04).
    // The server re-decides `late` from that day; only the time of day is lost (it stores noon for another day, BR-02).
    const op = makeOp(studentId, "submitted", prev.score, "manual", prev.recvDay);
    undoToast(`ยกเลิกการส่งของเลขที่ ${st?.number ?? "-"} ${st ? fullName(st) : "นักเรียน"} แล้ว`, () => {
      if (!session.value || session.value.assignmentId !== op.assignmentId) return;
      updateSub(studentId, prev);
      pushRecent(studentId, prev.score, op.opId, backDay(prev.recvDay));
      void enqueueRevertible(op, studentId, undefined);
      focusScan();
    });
  }
}

/** How long a "เลิกทำ" toast stays: long enough to notice a slip, short enough not to pile up (D16) */
const UNDO_SECONDS = 5;
/** A toast with an undo button that counts down in its own label: "เลิกทำ (5)" … "เลิกทำ (1)", then it goes. */
function undoToast(message: string, run: () => void) {
  let left = UNDO_SECONDS;
  const label = () => `เลิกทำ (${left})`;
  const id = notify("info", message, { sticky: true, action: { label: label(), run } });
  const timer = setInterval(() => {
    if (!toasts.value.some((t) => t.id === id)) { clearInterval(timer); return; } // closed or used
    left -= 1;
    if (left <= 0) { clearInterval(timer); dismiss(id); return; }
    toasts.value = toasts.value.map((t) => (t.id === id && t.action ? { ...t, action: { ...t.action, label: label() } } : t));
  }, 1000);
}

/** P-2: the scan field takes the focus back after a sheet / dialog / menu / toast action — a keyboard device only (a tablet would pop its keyboard up) */
function focusScan() {
  if (isCoarse()) return;
  setTimeout(() => document.querySelector<HTMLInputElement>(".scan-input input")?.focus({ preventScroll: true }), 0);
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
      m.set(op.studentId, subFromRow(sub));
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
      m.set(op.studentId, subFromRow(sub));
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
  lastScore.value = null; // R-07: "ล่าสุด 8" was typed for another work / room — not offered in this round
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

const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function thaiDayMonth(iso: string) { const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; }
function thaiShort(iso: string) { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y + 543}`; }
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
const MODE_LABEL: Record<ScanMode, string> = { full: "ให้คะแนนเต็ม", type: "กรอกทีละคน", later: "รับงานก่อน" };

/** True below the width where the page falls back to one column (iPad upright, phone). */
function useNarrow(bp = 999): boolean {
  const q = `(max-width: ${bp}px)`;
  const get = () => (typeof matchMedia === "function" ? matchMedia(q).matches : typeof window !== "undefined" && window.innerWidth <= bp);
  const [n, setN] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q);
    const on = () => setN(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [q]);
  return n;
}

/** A progress ring with the count inside. `size` 56 in the seat-grid head, 120 on the summary. */
function Ring({ value, total, size, label, big }: { value: number; total: number; size: number; label?: string; big?: boolean }) {
  const stroke = size < 80 ? 6 : 8;
  const r = size / 2 - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div class="pring" style={`width:${size}px;height:${size}px`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-success)" stroke-width={stroke}
          stroke-linecap="round" stroke-dasharray={`${circ * pct} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div class="cap">
        <span style={`font-size:${big ? "1.6rem" : "var(--fs-xs)"};font-weight:600;font-variant-numeric:tabular-nums`}>{value}/{total}</span>
        {label && <span style="font-size:var(--fs-xs);color:var(--text-secondary)">{label}</span>}
      </div>
    </div>
  );
}

/**
 * A button that opens a small menu under it. Esc or a tap outside closes it and gives the focus back to the button;
 * choosing something calls `done()`, which closes it and sends the focus to the scan field (P-2).
 */
function PopMenu({ button, role = "menu", label, children, right }: {
  button: (p: { open: boolean; toggle: () => void; ref: { current: HTMLButtonElement | null } }) => ComponentChildren;
  role?: "menu" | "dialog"; label?: string; right?: boolean;
  children: (done: () => void) => ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  const done = () => { setOpen(false); if (isCoarse()) btn.current?.focus(); else focusScan(); };
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", key, true);
    box.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => document.removeEventListener("keydown", key, true);
  }, [open]);
  return (
    <span class="sc-menu">
      {button({ open, toggle: () => setOpen((v) => !v), ref: btn })}
      {open && (
        <>
          <div class="sc-menu-back" onClick={close} />
          <div class={"sc-pop" + (right ? " right" : "")} role={role} aria-label={label} ref={box}>{children(done)}</div>
        </>
      )}
    </span>
  );
}

// ---- card / chip pieces shared by the screens below ----------------------
const hidTestOn = signal(false);
const hidLog = signal<{ raw: string; who: string | null; ok: boolean; at: number }[]>([]);
/** The "ทดสอบ" panel: a code shot while it is open is only read back, never recorded as a hand-in. */
function testHid(raw: string) {
  const idx = buildIndex(allStudents.value, revokedTokens.value, null);
  const r = resolveScan(raw, idx, { allowStudentCode: settings.value?.accept_student_code_scan ?? false });
  const st = r.studentId ? studentsById.value.get(r.studentId) : null;
  hidLog.value = [{ raw, who: st ? `เลขที่ ${st.number ?? "-"} ${fullName(st)}` : r.kind === "revoked" ? "บัตรถูกยกเลิก" : null, ok: r.kind === "student", at: Date.now() }, ...hidLog.value].slice(0, 4);
}

function HidBadge() {
  const ready = scannerReady.value;
  return (
    <>
      <span class={"sc-chip " + (ready ? "success" : "warning")}>
        <Icon name={ready ? "circle-check" : "hand-click"} size={16} />
        {ready ? "เครื่องยิงพร้อม" : "คลิกหน้านี้ก่อนยิง"}
      </span>
      <button class="sc-chip muted btn" aria-pressed={hidTestOn.value} onClick={() => { hidTestOn.value = !hidTestOn.value; hidLog.value = []; if (!hidTestOn.value) focusScan(); }}>ทดสอบ</button>
    </>
  );
}

function HidTestPanel() {
  return (
    <section class="card sc-hidtest" aria-labelledby="sc-hidtest-h">
      <div class="row" style="justify-content:space-between;gap:8px">
        <h2 id="sc-hidtest-h" class="sc-h2"><Icon name="barcode" size={20} /> ทดสอบเครื่องยิง</h2>
        <button class="ghost" onClick={() => { hidTestOn.value = false; hidLog.value = []; focusScan(); }}>เสร็จ</button>
      </div>
      <div class="page-sub" role="status">ยิงบัตรใบไหนก็ได้ ระบบจะบอกว่าอ่านได้ไหม — <b>ไม่บันทึกการส่งงาน</b></div>
      {hidLog.value.length === 0
        ? <div class="sc-hidwait">รอการยิง…</div>
        : hidLog.value.map((r) => (
          <div class={"sc-hidrow " + (r.ok ? "ok" : "bad")}>
            <Icon name={r.ok ? "circle-check" : "x"} size={16} />
            <span class="grow"><span class="mono">{r.raw.slice(0, 16)}</span>{r.who ? ` → ${r.who}` : " — ไม่พบ"}</span>
          </div>
        ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The picker: choose the work, the room, how to score — then start the round.
// ---------------------------------------------------------------------------
function SessionSetup() {
  const params = routeParams();
  // an earlier academic year's classes are closed: scanning is for this year's work only
  const past = viewingPastYear.value;
  const open = past ? [] : assignments.value.filter((a) => a.status === "open" && (
    !selectedTermId.value ? true
      : selectedTermId.value === UNASSIGNED ? a.term_id == null
      : a.term_id === selectedTermId.value));
  const [subjectFilter, setSubjectFilter] = useState("");
  // the work due soonest is offered first (and picked at the start): it is the one the teacher is most likely collecting
  const byDue = (a: { due_date: string | null }, b: { due_date: string | null }) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  const [assignmentId, setAssignmentId] = useState(params.asg || open.slice().sort(byDue)[0]?.id || "");
  const asg = open.find((a) => a.id === assignmentId) ?? null;
  const classesForAsg = asg ? activeClasses.value.filter((c) => asg.class_ids.includes(c.id)) : [];
  const [classId, setClassId] = useState(params.class || classesForAsg[0]?.id || "");
  // a link opened before the lists were loaded starts empty: pick the usual defaults as soon as they arrive
  useEffect(() => {
    if (assignmentId || open.length === 0) return;
    const first = open.slice().sort(byDue)[0];
    if (first) { setAssignmentId(first.id); if (!classId) setClassId(first.class_ids[0] ?? ""); }
  }, [open.length]);
  const [mode, setMode] = useState<ScanMode>("full");
  const [showAll, setShowAll] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const layout = scanLayout.value;
  const today = bkkToday();

  // Home just read it (and nothing was written since): do not read ~10,000 rows again to show the same numbers
  useEffect(() => { loadDashboard(selectedTermId.value, { maxAgeMs: 60_000 }); }, [selectedTermId.value]);
  useEffect(() => startSetupRefresh(() => loadBootstrap()) /* NOT the dashboard: it reads ~10,000 rows per call at school size */, []);
  useEffect(() => {
    if (asg && !asg.class_ids.includes(classId)) setClassId(asg.class_ids[0] ?? "");
  }, [assignmentId]);

  const filtered = (subjectFilter ? open.filter((a) => a.subject_id === subjectFilter) : open).slice().sort(byDue);
  // the picked work always stays in the list, even when it is not among the first five
  const first = filtered.slice(0, 5);
  const shown = showAll || filtered.length <= 5 ? filtered : (asg && !first.some((a) => a.id === asg.id) && filtered.some((a) => a.id === asg.id) ? [...first, asg] : first);
  // The picked work's "ส่งแล้ว x/y" is read fresh from the server (the dashboard is loaded once and goes stale while
  // the teacher scans). y = the class without the children marked ยกเว้น. Other works keep the dashboard's numbers.
  const [live, setLive] = useState<{ aid: string; rows: { student_id: string; status: string }[] } | null>(null);
  const fetchLive = () => {
    const aid = assignmentId;
    if (!aid) return Promise.resolve();
    return api.get<{ submissions: { student_id: string; status: string }[] }>(`/api/assignments/${aid}/submissions`)
      .then((r) => setLive((cur) => (aid === assignmentIdRef.current ? { aid, rows: r.submissions } : cur)))
      .catch(() => { /* offline: keep the dashboard's numbers */ });
  };
  const assignmentIdRef = useRef(assignmentId);
  assignmentIdRef.current = assignmentId;
  useEffect(() => { setLive(null); void fetchLive(); }, [assignmentId]);
  useEffect(() => startSetupRefresh(fetchLive), [assignmentId]);
  const progressFor = (aid: string, cid: string) => {
    if (live && live.aid === aid) {
      const kids = studentsByClass.value.get(cid) ?? [];
      const by = new Map(live.rows.map((r) => [r.student_id, r.status]));
      const excused = kids.filter((k) => by.get(k.id) === "excused").length;
      const submitted = kids.filter((k) => by.get(k.id) === "submitted").length;
      return { submitted, total: kids.length - excused, excused };
    }
    const da = dashboard.value?.openAssignments.find((x) => x.assignment.id === aid);
    const p = da?.perClass.find((x) => x.classId === cid);
    return p ? { submitted: p.submitted, total: p.total, excused: 0 } : null;
  };
  /** whole days from today to the due date (negative = already past) */
  const daysTo = (due: string) => Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
  const room = classesForAsg.find((c) => c.id === classId);
  const why = !asg ? "เลือกงานก่อน" : !classId ? "เลือกห้องก่อน" : "";

  return (
    <div class="sc-page sc-setup">
      <PageHeader icon="scan" title="สแกนส่งงาน" sub="เลือกงาน ห้อง และวิธีให้คะแนน" actions={<>
        <TermPicker />
        <button class="ghost" aria-label="ปรับการ์ด" onClick={() => setPrefsOpen(true)}><Icon name="layout-grid" size={18} /> <span class="att-hide-sm">ปรับการ์ด</span></button>
        <ProjectorButton />
      </>} />
      {prefsOpen && <PageCardSettings page="scan" title="หน้าสแกน" layout={layout} meta={SCAN_CARD_META} locked={SCAN_LOCKED} onClose={() => setPrefsOpen(false)} />}
      {projectorOn.value && <ScanProjectorIdle />}
      {open.length === 0 ? (
        <div class="card empty">
          {past ? (<>
            สแกนใช้ได้กับงานของปีการศึกษาปัจจุบันเท่านั้น (ตอนนี้เลือกดูปีที่ผ่านมา) — ตรวจ/แก้คะแนนของปีนั้นได้ที่หน้าสมุดคะแนน
            <div style="margin-top:8px"><button class="primary" onClick={() => setSelectedTerm(currentTermId.value)}>กลับไปภาคเรียนปัจจุบัน</button></div>
          </>) : (<>
            <Icon name="inbox" size={32} />
            <div style="margin-top:6px">ยังไม่มีงานที่เปิดรับในเทอมนี้ — สร้างงานในหน้าสมุดคะแนนก่อน</div>
            <div style="margin-top:10px"><button class="primary" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus" size={18} /> สร้างงาน</button></div>
          </>)}
        </div>
      ) : (
        <>
          <div class="sc-step"><span class="sn">1</span>เลือกงาน
            <span class="grow" />
            <span class="tip"><Icon name="refresh" size={14} /> ตัวเลขอัปเดตสดจากงานที่เลือก</span>
          </div>
          {activeSubjects.value.length > 1 && (
            <div class="chips-row" style="margin-bottom:8px">
              <button class={"pill" + (subjectFilter === "" ? " on" : "")} aria-pressed={subjectFilter === ""} onClick={() => setSubjectFilter("")}>ทุกวิชา</button>
              {activeSubjects.value.map((s) => <button class={"pill" + (subjectFilter === s.id ? " on" : "")} aria-pressed={subjectFilter === s.id} onClick={() => setSubjectFilter(s.id)}>{s.name}</button>)}
            </div>
          )}
          <div class="sc-asg-grid" role="group" aria-label="เลือกงาน">
            {shown.map((a) => {
              const wt = workTypeById(a.type_id);
              const left = a.due_date ? daysTo(a.due_date) : null;
              const dueTone = left == null ? "" : left < 0 ? " over" : left <= 2 ? " soon" : "";
              return (
                <button class={"sc-asg" + (a.id === assignmentId ? " on" : "")} aria-pressed={a.id === assignmentId} onClick={() => setAssignmentId(a.id)}>
                  {a.id === assignmentId && <span class="tick"><Icon name="circle-check" size={20} /></span>}
                  <div class="row wrap" style="gap:6px">
                    {wt && <span class={"chip " + wt.color}><Icon name={wt.icon} size={13} /> {wt.name}</span>}
                    <span class="tip">{subjectById(a.subject_id)?.name} · เต็ม {a.full_score}</span>
                  </div>
                  <div class="ttl">{a.title}</div>
                  <div class="pc">
                    {a.class_ids.map((cid) => {
                      const p = progressFor(a.id, cid);
                      const c = activeClasses.value.find((x) => x.id === cid);
                      return <span class="xy">{c?.name} <b>{p ? `${p.submitted}/${p.total}` : "…"}</b></span>;
                    })}
                    {a.due_date && <span class={"xy" + dueTone}><Icon name="calendar-event" size={14} /> ส่งภายใน {thaiDayMonth(a.due_date)}{left != null && left >= 0 && left <= 2 ? (left === 0 ? " · วันนี้" : ` · อีก ${left} วัน`) : left != null && left < 0 ? " · เลยกำหนด" : ""}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {filtered.length > 5 && !showAll && (
            <button class="ghost sc-showall" onClick={() => setShowAll(true)}>ดูทั้งหมด ({filtered.length}) <Icon name="chevron-down" size={16} /></button>
          )}

          <div class="sc-step"><span class="sn">2</span>เลือกห้อง</div>
          <div class="chips-row" role="group" aria-label="เลือกห้อง">
            {classesForAsg.map((c) => {
              const p = progressFor(assignmentId, c.id);
              return (
                <button class={"pill sc-room" + (c.id === classId ? " on" : "")} aria-pressed={c.id === classId} onClick={() => setClassId(c.id)}>
                  {c.id === classId && <Icon name="check" size={13} />}{c.name}
                  <span class="n">{p ? `ส่งแล้ว ${p.submitted}/${p.total}${p.excused > 0 ? ` · ยกเว้น ${p.excused}` : ""}` : "กำลังนับ…"}</span>
                </button>
              );
            })}
          </div>

          <div class="sc-step"><span class="sn">3</span>วิธีให้คะแนน</div>
          <div class="sc-modes" role="group" aria-label="วิธีให้คะแนน">
            {([
              { m: "full", icon: "circle-check", t: "ให้คะแนนเต็ม", s: "ยิงแล้วได้เต็มทันที" },
              { m: "type", icon: "pencil", t: "กรอกทีละคน", s: "ยิงแล้วพิมพ์คะแนน" },
              { m: "later", icon: "inbox", t: "รับงานก่อน", s: "ตรวจแล้วค่อยให้คะแนน" },
            ] as const).map((o) => (
              <button class={"sc-mode" + (mode === o.m ? " on" : "")} aria-pressed={mode === o.m} onClick={() => setMode(o.m)}>
                <Icon name={o.icon} size={24} />
                <span><div class="mt">{o.t}</div><div class="page-sub">{o.s}</div></span>
              </button>
            ))}
          </div>

          <div class="sc-startbar">
            <div class="grow sb-info">
              {asg
                ? (<><div class="sb-t">รอบนี้: <b>{asg.title}</b></div>
                    <div class="page-sub">{room?.name ? `${room.name} · ` : ""}{subjectById(asg.subject_id)?.name} · เต็ม {asg.full_score} · {MODE_LABEL[mode]}</div></>)
                : <div class="page-sub">เลือกงานเพื่อเริ่ม</div>}
            </div>
            <span class="page-sub sb-src"><Icon name="barcode" size={16} /> เครื่องยิง · <Icon name="camera" size={16} /> กล้อง</span>
            <div class="sb-go">
              {why && <span class="page-sub" role="status">{why}</span>}
              <button class="primary" disabled={!classId || !asg} onClick={() => startSession(assignmentId, classId, mode)}>
                <Icon name="scan" size={24} /> เริ่มสแกน {room?.name ?? ""}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The round on screen
// ---------------------------------------------------------------------------
function ScanView() {
  const s = session.value!;
  const asg = activeAssignment.value;
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camCtl = useRef<any>(null);
  const [torch, setTorch] = useState(false);
  const [seatSheet, setSeatSheet] = useState<string | null>(null); // a tap on a seat that is already in, or a recent row's ⋮: ask what to do, never undo at once
  const [recentAll, setRecentAll] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const narrow = useNarrow();
  // on the TV the score pad would show a child's score: a round in "type a score" mode takes hand-ins first instead
  useEffect(() => {
    if (!projectorOn.value || s.mode !== "type") return;
    pending.value = null;
    const next = { ...s, mode: "later" as ScanMode };
    session.value = next; void kvSet("scanSession", next);
    notify("info", "โหมดกรอกคะแนนถูกสลับเป็น “รับงานก่อน” ระหว่างฉายจอ");
  }, [projectorOn.value, s.mode]);
  // P-2: on a computer or an iPad with a keyboard the scan field gets focus back after a dialog closes or a click on
  // empty space, so the next scan (or typed number) lands in it. A touch-only device is left alone.
  useEffect(() => {
    if (isCoarse()) return;
    const input = inputRef.current;
    if (!input) return;
    const back = () => {
      if (document.visibilityState !== "visible" || pending.value || document.querySelector('[role="dialog"]')) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && a !== input && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; // typing elsewhere
      input.focus({ preventScroll: true });
    };
    const out = (e: FocusEvent) => { if (!e.relatedTarget) setTimeout(back, 0); };
    input.addEventListener("focusout", out);
    document.addEventListener("visibilitychange", back);
    back();
    return () => { input.removeEventListener("focusout", out); document.removeEventListener("visibilitychange", back); };
  }, []);
  const layout = scanLayout.value;
  // the cards in the order the teacher chose ("ปรับการ์ด"); the badge row rides in the title line while it is the first one
  const cards = layout.order.filter((k) => !isHiddenCard(layout, k));
  const hidInTitle = cards[0] === "hid";

  // a session restored from storage (e.g. after a reload) has no submissions
  // loaded yet — fetch them so the grid and ring are correct
  useEffect(() => {
    if (subsBox.value.aid !== s.assignmentId) resetSubs(s.assignmentId);
    if (subsBox.value.status !== "ready") loadSubs(s.assignmentId).catch(() => {});
  }, [s.assignmentId]);

  useEffect(() => {
    const off = installHidScanner((raw) => { if (hidTestOn.value) testHid(raw); else handleScan(raw, "hid"); });
    return () => { off(); hidTestOn.value = false; hidLog.value = []; };
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
  function switchMode(m: ScanMode) {
    if (m === s.mode) return;
    const hadScore = pending.value != null;
    pending.value = null; // a score being typed for the last child is left for the gradebook; the next scan follows the new mode
    const next = { ...s, mode: m };
    // R-09: the mode is kept on this device only; `scan_sessions.mode` on the server stays the mode the round STARTED in
    // (no update route exists, and nothing reads it for a number or a report) — see dev-notes
    session.value = next; void kvSet("scanSession", next);
    notify("info", `เปลี่ยนเป็น “${MODE_LABEL[m]}” — มีผลกับสแกนครั้งถัดไป` + (hadScore ? " · คะแนนที่ยังไม่ได้ใส่ ไปใส่ต่อได้ที่สมุดคะแนน" : ""));
  }
  const today = bkkToday();
  // the legend counts every seat by the same work state that colours it, so the groups add up to the
  // whole class; the ring is hand-ins ÷ (class − excused), the same rate as Home / Gradebook / Reports
  const seat = countWorkStates(classStudents.map((st) => {
    const sub = effSub(st.id);
    return asg ? workState(sub ? { status: sub.status, score: sub.score, late: sub.late === true } : null, asg, today) : "pending";
  }));
  const overdue = !!asg?.due_date && today > asg.due_date;
  const LEGEND: { n: number; label: string; swatch: string; icon?: string }[] = [
    { n: seat.scored, label: "ส่งแล้ว", icon: "check", swatch: "background:var(--bg-success);border:0.5px solid var(--border-success);color:var(--text-success)" },
    { n: seat.late, label: "ส่งช้า", icon: "clock", swatch: "background:var(--bg-warning);border:0.5px solid var(--border-warning);color:var(--text-warning)" },
    { n: seat.awaiting, label: "รอตรวจ", icon: "pencil", swatch: "background:var(--bg-accent);border:0.5px solid var(--border-accent);color:var(--text-accent)" },
    { n: seat.missing + seat.pending, label: "ยังไม่ส่ง", swatch: overdue ? "border:0.5px dashed var(--border-danger)" : "border:0.5px dashed var(--text-secondary)" },
    { n: seat.excused, label: "ยกเว้น", icon: "ban", swatch: "background:var(--surface-1);border:0.5px solid var(--border);color:var(--text-secondary)" },
  ];
  const known = subsBox.value.aid === s.assignmentId && subsBox.value.status === "ready";
  const up = online.value && serverReachable.value;
  const back = !!recvDate.value;

  const titleRow = (
    <div class="sc-title">
      <h1 class="t" title={asg?.title}>{asg?.title}</h1>
      {hidInTitle && <HidBadge />}
      <span class="grow" />
      <span class={"sc-chip " + (up ? "success" : "warning")} role="status">
        <Icon name={up ? "cloud-check" : "cloud-off"} size={16} />
        {syncing.value ? "กำลังบันทึก" : up ? "ออนไลน์" : "ออฟไลน์"}{pendingCount.value > 0 ? ` · รอส่ง ${pendingCount.value}` : ""}
      </span>
    </div>
  );

  return (
    <div class="sc-page sc-live">
      {!known && (
        <div class="imp-warn" role="status" style="margin:0 0 8px;font-size:var(--fs-sm)">
          <Icon name={subsBox.value.status === "unknown" ? "cloud-off" : "loader-2"} size={15} class={subsBox.value.status === "unknown" ? "" : "spin"} />
          <span class="grow">{subsBox.value.status === "unknown"
            ? "ยังไม่ทราบว่าใครส่งงานนี้แล้วบ้าง (โหลดจากระบบไม่ได้) — สแกนต่อได้ ทุกรายการเข้าคิวและระบบจะตรวจซ้ำตอนส่ง"
            : "กำลังโหลดข้อมูลของงานนี้…"}</span>
          {subsBox.value.status === "unknown" && <button class="ghost" style="height:1.73rem;font-size:var(--fs-xs)" onClick={() => loadSubs(s.assignmentId).catch(() => {})}>ลองอีกครั้ง</button>}
        </div>
      )}
      {closedReason.value && (
        <div class="sc-closed" role="alert">
          <Icon name="lock" size={20} />
          <div class="grow"><b style="font-weight:500">{closedReason.value === "closed" ? "งานนี้ปิดรับแล้ว" : "งานนี้ถูกลบแล้ว"}</b> — สแกนแล้วจะไม่บันทึก ให้คะแนนย้อนหลังได้ที่ <a href={`#/gradebook?class=${s.classId}&asg=${s.assignmentId}`}>สมุดคะแนน</a></div>
          <button style="height:2rem;font-size:var(--fs-xs)" onClick={endSession}>จบรอบ</button>
        </div>
      )}
      <div class={"ctxbar" + (back ? " back" : "")} role="group" aria-label={back ? `กำลังรับงานย้อนหลัง · ${thaiShort(recvDate.value!)}` : "รอบสแกน"}>
        <div class="ctx-r">
          <PopMenu label="เปลี่ยนห้อง"
            button={({ open, toggle, ref }) => (
              <button class="sc-cb" ref={ref} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                <Icon name="users" size={16} /> {cls?.name} <Icon name="chevron-down" size={16} />
              </button>
            )}>
            {(done) => (
              <>
                <div class="hd">เปลี่ยนห้อง (งานเดียวกัน)</div>
                {(asg?.class_ids ?? [s.classId]).map((cid) => {
                  const c = activeClasses.value.find((x) => x.id === cid);
                  return <button role="menuitem" class={cid === s.classId ? "on" : ""} onClick={() => { done(); if (cid !== s.classId) startSession(s.assignmentId, cid, s.mode); }}>{c?.name ?? cid}</button>;
                })}
              </>
            )}
          </PopMenu>
          <div class="chips">
            {subj && <span class={"chip " + subj.color}>{subj.name}</span>}
            {wt && <span class={"chip " + wt.color}>{wt.name}</span>}
          </div>
          <span class="grow" style="min-width:8px" />
          <button class="icon sc-cb" aria-label="ปรับการ์ด" onClick={() => setPrefsOpen(true)}><Icon name="layout-grid" size={20} /></button>
          <ProjectorButton />
          <button class="sc-cb strong" onClick={endSession}><Icon name="player-stop" size={20} /> จบรอบ</button>
        </div>
        <div class="ctx-r">
          <PopMenu label="วิธีให้คะแนน"
            button={({ open, toggle, ref }) => (
              <button class="sc-cb" ref={ref} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                {back ? MODE_LABEL[s.mode] : `เต็ม ${s.fullScore} · ${MODE_LABEL[s.mode]}`} <Icon name="chevron-down" size={16} />
              </button>
            )}>
            {(done) => (
              <>
                <div class="hd">ใช้กับการสแกนครั้งถัดไป</div>
                {(["full", "type", "later"] as ScanMode[]).map((m) => (
                  <button role="menuitemradio" aria-checked={s.mode === m} class={s.mode === m ? "on" : ""} disabled={m === "type" && projectorOn.value}
                    onClick={() => { done(); switchMode(m); }}>{MODE_LABEL[m]}{m === "type" && projectorOn.value ? " (ปิดระหว่างฉายจอ)" : ""}</button>
                ))}
              </>
            )}
          </PopMenu>
          <ReceivedDateChip assignedDate={asg?.assigned_date ?? null} />
        </div>
      </div>
      {titleRow}
      {projectorOn.value && <ScanProjector s={s} classStudents={classStudents} known={known} />}
      {seatSheet && <OptionsSheet id={seatSheet} onClose={() => { setSeatSheet(null); focusScan(); }} />}
      {recentAll && <RecentAllSheet onClose={() => { setRecentAll(false); focusScan(); }} onOpen={(id) => { setRecentAll(false); setSeatSheet(id); }} />}
      {prefsOpen && <PageCardSettings page="scan" title="หน้าสแกน" layout={layout} meta={SCAN_CARD_META} locked={SCAN_LOCKED} onClose={() => setPrefsOpen(false)} />}

      <div class="sc-layout">
      <div class="scan-input-row">
        <label class="scan-input">
          <Icon name="qrcode" size={24} class="muted" />
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
        <button class="icon sc-cam" aria-label="สแกนด้วยกล้อง" aria-pressed={useCamera.value} onClick={() => (useCamera.value = !useCamera.value)}>
          <Icon name={useCamera.value ? "camera-off" : "camera"} size={28} />
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

      {hidTestOn.value && <HidTestPanel />}
      {/* while the score pad is open its header already names the child, so the "รับงานแล้ว" card would repeat it */}
      {pending.value
        ? <ScorePad />
        : <FeedbackCard />}
      {feedback.value && pending.value && <FeedbackCard hidden />}
      {excusedAsk.value && (
        <div class="card sc-choose" role="group" aria-label="เด็กที่ได้รับการยกเว้น">
          <div style="font-weight:500;margin-bottom:8px"><Icon name="ban" size={18} /> เลขที่ {excusedAsk.value.student.number ?? "-"} {fullName(excusedAsk.value.student)} ถูกตั้งเป็น “ยกเว้น” ในงานนี้ — รับงานจริงไหม?</div>
          <div class="page-sub" style="margin-bottom:8px">รับงานแล้วจะเปลี่ยนจาก “ยกเว้น” เป็น “ส่งแล้ว”</div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="sc-pick primary" onClick={() => { const q = excusedAsk.value!; excusedAsk.value = null; commitStudent(q.student, q.method, true); }}>
              <span style="font-weight:500">รับงานนี้</span>
              <span class="page-sub">เปลี่ยนจากยกเว้นเป็นส่งแล้ว</span>
            </button>
            <button class="sc-pick" onClick={() => { excusedAsk.value = null; feedback.value = null; focusScan(); }}>
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
            <button class="ghost" style="height:1.87rem;font-size:var(--fs-xs)" onClick={() => { choices.value = null; focusScan(); }}>ยกเลิก</button>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            {choices.value.students.map((st) => (
              <button class="sc-pick" onClick={() => { const m = choices.value!.method; choices.value = null; commitStudent(st, m); focusScan(); }}>
                <span style="font-weight:500">{fullName(st)}</span>
                <span class="page-sub">รหัส {st.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <FailedPanel assignmentId={s.assignmentId} classId={s.classId} />
      </div>

        <div class="sc-zone">
          {cards.map((k) => {
            if (k === "hid") return hidInTitle ? null : <div class="sc-hidbar" key="hid"><HidBadge /></div>;
            if (k === "hint") return pending.value ? null : (
              <div class="page-sub sc-hint" key="hint">{s.mode === "full" ? "โหมดให้คะแนนเต็ม: ยิงแล้วได้คะแนนเต็มทันที · แตะช่องที่ส่งแล้วเพื่อแก้หรือยกเลิก" : s.mode === "later" ? "โหมดรับงานก่อน: ยิงแล้วบันทึกว่าส่ง ให้คะแนนทีหลังในสมุดคะแนน" : "โหมดกรอกทีละคน: ยิงแล้วพิมพ์คะแนน กด “บันทึก” หรือ Enter"}</div>
            );
            return <RecentCard key="recent" s={s} strip={narrow && s.mode === "type"} onOpen={setSeatSheet} onAll={() => setRecentAll(true)} />;
          })}
        </div>

        <section class="card sc-gridcard" aria-labelledby="sc-grid-h">
          <div class="ghead">
            <Ring value={known ? seat.submitted : 0} total={known ? seat.counted : classStudents.length} size={56} label={known ? undefined : "ไม่ทราบ"} />
            <div class="gh-main">
              <h2 id="sc-grid-h" class="sc-h2">ผังเลขที่ {cls?.name}</h2>
              <div class="sc-legend">
                {known
                  ? LEGEND.filter((g) => g.n > 0).map((g) => <div class="row" style="gap:6px"><span class="sw" style={g.swatch}>{g.icon && <Icon name={g.icon} size={12} />}</span>{g.label} {g.n}</div>)
                  : <div class="row" style="gap:6px"><span class="sw" style="border:0.5px dashed var(--text-secondary)" />ยังไม่ทราบ ?</div>}
                {waiting > 0 && <div class="row wait" style="gap:6px"><span class="sw" style="background:var(--bg-warning);color:var(--text-warning);border:0.5px solid var(--border-warning)"><Icon name="cloud-upload" size={12} /></span>รอส่งขึ้นระบบ {waiting}</div>}
              </div>
              <div class="page-sub">{known && seat.submitted === 0 && classStudents.length > 0 ? "ยังไม่มีใครส่ง — ยิงได้เลย · " : ""}แตะช่องว่าง = รับงานให้คนนั้น · แตะช่องที่ส่งแล้ว = แก้/ยกเลิก</div>
            </div>
          </div>
          <div class="sc-grid">
            {classStudents.map((st) => {
              const sub = effSub(st.id);
              const mark = markOf(st.id);
              const state = asg ? workState(sub ? { status: sub.status, score: sub.score, late: sub.late === true } : null, asg, today) : "pending";
              const hit = recent.value[0]?.studentId === st.id;
              return (
                <button class={`sc-cell ${state}${hit ? " hit" : ""}${mark ? " " + mark : ""}`} title={fullName(st) + (mark === "pend" ? " · รอส่งขึ้นระบบ" : mark === "fail" ? " · ส่งไม่สำเร็จ" : "")}
                  aria-label={`เลขที่ ${st.number ?? "-"} ${fullName(st)} · ${SEAT_WORD[state]}${mark === "pend" ? " · รอส่งขึ้นระบบ" : mark === "fail" ? " · ส่งไม่สำเร็จ" : ""}`}
                  onClick={() => (sub && sub.status === "submitted") ? setSeatSheet(st.id) : commitStudent(st, "manual")}>
                  <span class="t"><span>{st.number ?? "-"}</span>{SEAT_ICON[state] && <Icon name={SEAT_ICON[state]} size={14} class="sc-ic" />}</span>
                  <span class="nm">{shortName(st)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---- the recent scans: a list (4 rows) or, on a narrow screen while typing scores, one strip -------------------------
function RecentCard({ s, strip, onOpen, onAll }: { s: Session; strip: boolean; onOpen: (id: string) => void; onAll: () => void }) {
  const list = recent.value.filter((r) => studentsById.value.has(r.studentId));
  const head = (
    <div class="row sc-rhead">
      <h2 id="sc-recent-h" class="sc-h2"><Icon name="history" size={20} /> สแกนล่าสุด</h2>
      <span class="page-sub">รอบนี้ {list.length} คน</span>
    </div>
  );
  if (strip) {
    return (
      <section class="card sc-recent sc-strip" aria-labelledby="sc-recent-h">
        {head}
        {list.length > 0 && (
          <div class="sc-rstrip">
            {list.slice(0, 2).map((r) => {
              const st = studentsById.value.get(r.studentId)!;
              return (
                <button class="rchip" aria-label={`ตัวเลือก เลขที่ ${st.number ?? "-"} ${fullName(st)}`} onClick={() => onOpen(r.studentId)}>
                  <span class="avatar" aria-hidden="true">{st.number ?? "-"}</span>
                  <span class="nm">{shortName(st)}</span>
                  <span class={"sc-chip " + (r.score != null ? "success" : "accent")}>{r.score != null ? `${r.score}/${s.fullScore}` : "รอคะแนน"}</span>
                </button>
              );
            })}
            {list.length > 2 && <button class="ghost" onClick={onAll}>ทั้งหมด ({list.length})</button>}
          </div>
        )}
      </section>
    );
  }
  return (
    <section class="card sc-recent" aria-labelledby="sc-recent-h">
      {head}
      {list.length === 0
        ? <div class="sc-rempty">ยังไม่มีใครสแกนในรอบนี้</div>
        : list.slice(0, 4).map((r) => <RecentRow r={r} s={s} onOpen={onOpen} />)}
      {list.length > 4 && <button class="ghost sc-rall" onClick={onAll}>ดูทั้งหมด ({list.length}) <Icon name="chevron-right" size={16} /></button>}
    </section>
  );
}

function RecentRow({ r, s, onOpen }: { r: { studentId: string; at: number; score: number | null; opId?: string; recv?: string }; s: Session; onOpen: (id: string) => void }) {
  const st = studentsById.value.get(r.studentId)!;
  return (
    <div class="recent-row">
      <div class="avatar" aria-hidden="true">{st.number ?? "-"}</div>
      <div class="grow rr-main">
        <div class="rr-nm">{fullName(st)}</div>
        <div class="page-sub">{timeOf(r.at)} · {r.score != null ? `${r.score}/${s.fullScore}` : "รอคะแนน"}{r.recv ? ` · รับ ${thaiDayMonth(r.recv)}` : ""}</div>
      </div>
      {r.score != null
        ? <span class="sc-chip success"><Icon name="check" size={14} /> ส่งแล้ว</span>
        : <span class="sc-chip accent"><Icon name="pencil" size={14} /> รอคะแนน</span>}
      <button class="icon ghost" aria-label={`ตัวเลือก เลขที่ ${st.number ?? "-"} ${fullName(st)}`} onClick={() => onOpen(r.studentId)}><Icon name="dots-vertical" size={20} /></button>
    </div>
  );
}

/** Every scan of the round (the card shows four): a tap on ⋮ goes to that child's options. */
function RecentAllSheet({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const s = session.value!;
  const list = recent.value.filter((r) => studentsById.value.has(r.studentId));
  return (
    <div class="modal-overlay sc-sheetov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog label="สแกนล่าสุดทั้งหมด" onClose={onClose} class="modal sc-sheet">
        <h2 class="sc-sheet-h">สแกนล่าสุด · รอบนี้ {list.length} คน</h2>
        <div class="sc-sheet-list">{list.map((r) => <RecentRow r={r} s={s} onOpen={onOpen} />)}</div>
        <div class="sc-sheet-btns"><button class="ghost" onClick={onClose}><Icon name="x" size={24} /> ปิด</button></div>
      </Dialog>
    </div>
  );
}

/** What can be done with a child who has handed in (D16): never "undo" in one tap. */
function OptionsSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const s = session.value!;
  const st = studentsById.value.get(id);
  if (!st) return null;
  const sub = effSub(id);
  const rec = recent.value.find((r) => r.studentId === id);
  const submitted = sub?.status === "submitted";
  // the server takes a first score for a hand-in received in THIS round; any other change of a score is the gradebook's
  const scoreHere = submitted && sub!.score == null && !!rec;
  const line = !sub ? "ยังไม่ส่ง"
    : sub.status === "excused" ? "ยกเว้น"
    : sub.score == null ? "รับงานแล้ว · รอคะแนน"
    : `ส่งแล้ว · ${sub.score}/${s.fullScore} · ${sub.late === true ? "ส่งช้า" : "ตรงเวลา"}`;
  return (
    <div class="modal-overlay sc-sheetov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog label={`ตัวเลือก เลขที่ ${st.number ?? "-"} ${fullName(st)}`} onClose={onClose} class="modal sc-sheet">
        <h2 class="sc-sheet-h">เลขที่ {st.number ?? "-"} {fullName(st)}</h2>
        <div class="page-sub" style="margin-bottom:10px">{line}{rec?.recv ? ` · รับ ${thaiDayMonth(rec.recv)}` : ""}</div>
        <div class="sc-sheet-btns">
          {scoreHere
            ? <button onClick={() => { pending.value = id; onClose(); }}><Icon name="pencil" size={24} /> ให้คะแนน</button>
            : submitted && <button onClick={() => { onClose(); navigate("/gradebook", { class: s.classId, asg: s.assignmentId }); }}><Icon name="pencil" size={24} /> แก้คะแนนในสมุดคะแนน</button>}
          {submitted && <button class="sc-dan" onClick={() => { onClose(); undo(id); }}><Icon name="arrow-back-up" size={24} /> ยกเลิกการส่ง</button>}
          <button class="ghost" onClick={onClose}><Icon name="x" size={24} /> ปิด</button>
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The TV view of a round: the last child, how many are in, numbers only. No scores.
// ---------------------------------------------------------------------------
function ScanProjector({ s, classStudents, known }: { s: Session; classStudents: Student[]; known: boolean }) {
  const asg = activeAssignment.value;
  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const last = recent.value[0] ? studentsById.value.get(recent.value[0].studentId) : null;
  const states = classStudents.map((st) => ({ st, sub: effSub(st.id) }));
  const done = states.filter((x) => x.sub?.status === "submitted").length;
  const excused = states.filter((x) => x.sub?.status === "excused").length;
  const total = classStudents.length - excused;
  // only "no student has this code" is said on the TV; a closed work, another room or a refused send is for the teacher's screen
  const unknown = feedback.value?.code === "unknown";
  const failed = failedCount.value;
  // 33+ children at the largest text: the second line of the card gives way so the whole class still fits one screen
  const compact = pjSize.value === 3 && total > 32;
  const nameOn = !pjHideNames.value;
  return (
    <ProjectorShell page="scan">
      <div class="pj-top">
        <div class={"pj-last" + (unknown ? " bad" : last ? " ok" : "")}>
          {unknown ? <><Icon name="alert-circle" size={72} /><div class="pj-lname">ไม่รู้จักรหัสนี้</div></>
            : last ? (
              <>
                <Icon name="check" size={72} />
                <div style="min-width:0">
                  <div class="pj-lname">{nameOn ? `น้อง${shortName(last)}` : `เลขที่ ${last.number ?? "-"}`}</div>
                  {!compact && <div class="s2">{nameOn ? `เลขที่ ${last.number ?? "-"} · ส่งแล้ว` : "ส่งแล้ว"}</div>}
                </div>
              </>
            )
            : <><Icon name="scan" size={72} /><div class="pj-lname dim">รอสแกน…</div></>}
        </div>
        <div class="pj-side">
          <div class="s2">{cls?.name} · {asg?.title}</div>
          <div class="stat">{known ? `ส่งแล้ว ${done} จาก ${total} คน` : "กำลังโหลด…"}</div>
          <div class="pbar"><div style={`width:${total ? Math.min(100, (done * 100) / total) : 0}%`} /></div>
          {failed > 0 && <div class="pj-fail"><Icon name="cloud-x" size={40} /><span>{failed}</span></div>}
        </div>
      </div>
      <div class="seatp" role="group" aria-label="ผังเลขที่">
        {states.map(({ st, sub }) => {
          const d = sub?.status === "submitted";
          return <div class={d ? "d" : ""}>{d && <Icon name="check" size={40} />}{st.number ?? "-"}</div>;
        })}
      </div>
    </ProjectorShell>
  );
}

/** Projector mode switched on from the picker, before a round exists: a calm waiting screen. */
function ScanProjectorIdle() {
  return (
    <ProjectorShell page="scan">
      <div class="empty"><Icon name="scan" size={72} /><div>ยังไม่เริ่มรอบสแกน</div></div>
    </ProjectorShell>
  );
}

// ---------------------------------------------------------------------------
// The summary after "จบรอบ"
// ---------------------------------------------------------------------------
function ScanSummary({ s }: { s: Session }) {
  const asg = assignments.value.find((a) => a.id === s.assignmentId);
  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const classStudents = studentsByClass.value.get(s.classId) ?? [];
  const submitted = classStudents.filter((st) => effSub(st.id)?.status === "submitted");
  // handed in but no score yet (the "รับงานก่อน" mode): the teacher still has to grade these
  const ungraded = submitted.filter((st) => effSub(st.id)?.score == null);
  // excused children are not counted (BR-05): not in the ring's total, not on the "not handed in" list
  const excused = classStudents.filter((st) => effSub(st.id)?.status === "excused");
  const missing = classStudents.filter((st) => { const st2 = effSub(st.id)?.status; return st2 !== "submitted" && st2 !== "excused"; });
  const counted = submitted.length + missing.length;
  const waiting = classStudents.filter((st) => markOf2(s.assignmentId, st.id) === "pend").length;
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const confirm = useConfirm();
  const up = online.value && serverReachable.value;
  const isOpen = asg?.status === "open";
  const CAP = 18;
  const toBook = (extra?: Record<string, string>) => navigate("/gradebook", { class: s.classId, asg: s.assignmentId, ...extra });

  function copyMissing() {
    const text = `รายชื่อยังไม่ส่ง "${asg?.title}" ${cls?.name}\n` + missing.map((st) => `${st.number ?? "-"}. ${fullName(st)}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  async function closeWork() {
    if (!asg) return;
    setClosing(true);
    try {
      const res = await api.post<{ assignment: typeof asg }>("/api/assignments", {
        id: asg.id, subject_id: asg.subject_id, type_id: asg.type_id, title: asg.title, unit: asg.unit, assigned_date: asg.assigned_date,
        due_date: asg.due_date, note: asg.note, publish_scores: asg.publish_scores, status: "closed", class_ids: asg.class_ids, term_id: asg.term_id,
      });
      patchAssignment(asg.id, { status: res.assignment.status });
      notify("success", "ปิดรับงานแล้ว · ทุกห้อง");
    } catch (e) { err((e as Error).message || "ปิดรับงานไม่สำเร็จ"); } finally { setClosing(false); }
  }
  async function askClose() {
    const yes = await confirm.ask({
      title: `ปิดรับ “${asg?.title}” ทุกห้อง?`,
      body: <>{missing.length > 0 ? <>ห้อง {cls?.name} ยังไม่ส่ง <b>{missing.length} คน</b> จะนับเป็นค้างส่ง</> : "ทุกคนในห้องนี้ส่งแล้ว"} · ให้คะแนนย้อนหลังได้ · เปิดรับอีกครั้งได้ในสมุดคะแนน</>,
      yes: "ปิดรับงาน", no: "ยังไม่ปิด", danger: true,
    });
    if (yes) await closeWork();
  }
  const names = (list: Student[], tone: string) => (
    <div class="sc-names">
      {list.slice(0, CAP).map((st) => <span class={"sc-chip " + tone}>{st.number ?? "-"} {shortName(st)}</span>)}
      {list.length > CAP && <span class="sc-chip muted">และอีก {list.length - CAP} คน</span>}
    </div>
  );

  return (
    <div class="sc-page sc-sumpage">
      <PageHeader icon="flag-check" title="จบรอบสแกน" sub={asg?.title} />
      <div class="sc-summary">
        <section class="card sc-sumtop">
          <Ring value={submitted.length} total={counted} size={120} label="ส่งแล้ว" big />
          <div style="min-width:0">
            <div class="sc-sum-t">{asg?.title}</div>
            <div class="page-sub">{cls?.name} · เต็ม {s.fullScore}{excused.length > 0 ? ` · ไม่นับยกเว้น ${excused.length} คน` : ""}</div>
            <div class="row wrap" style="gap:12px;margin-top:6px;font-size:var(--fs-sm)">
              <span style="color:var(--text-success)"><Icon name="check" size={14} /> ส่งแล้ว {submitted.length}</span>
              <span style="color:var(--text-danger)"><Icon name="alert-circle" size={14} /> ยังไม่ส่ง {missing.length}</span>
            </div>
          </div>
        </section>
        {waiting > 0 && (
          <div class="imp-warn" role="status" style="margin:0;font-size:var(--fs-sm)"><Icon name="cloud-upload" size={15} />
            <span class="grow">รอส่งขึ้นระบบ {waiting} คน — จะส่งเองเมื่อมีเน็ต อย่าเพิ่งปิดงาน</span></div>
        )}
        {submitted.length > 0 && (
          <section class="card sc-grp ok">
            <h2 class="sc-h2 tone"><Icon name="check" size={20} /> ส่งแล้ว {submitted.length} คน</h2>
            {names(submitted, "success")}
          </section>
        )}
        {ungraded.length > 0 && (
          <section class="card sc-grp warn">
            <div class="row sc-grp-h"><h2 class="sc-h2 tone"><Icon name="pencil" size={20} /> ยังไม่มีคะแนน {ungraded.length} คน</h2>
              <button onClick={() => toBook({ rows: "awaiting" })}>ให้คะแนนตอนนี้</button></div>
            {names(ungraded, "accent")}
          </section>
        )}
        {missing.length > 0 && (
          <section class="card sc-grp bad">
            <div class="row sc-grp-h"><h2 class="sc-h2 tone"><Icon name="circle-dashed" size={20} /> ยังไม่ส่ง {missing.length} คน</h2>
              <button onClick={copyMissing}><Icon name={copied ? "check" : "list-numbers"} size={18} /> {copied ? "คัดลอกแล้ว" : "คัดลอกรายชื่อ"}</button></div>
            {names(missing, "danger dashed")}
          </section>
        )}
        {(waiting > 0 || excused.length > 0) && (
          <section class="card sc-grp">
            {waiting > 0 && <div class="row" style="gap:6px;color:var(--text-accent)"><Icon name="cloud-upload" size={20} /> รอส่งขึ้นระบบ {waiting} คน</div>}
            {excused.length > 0 && <div class="row" style="gap:6px"><span class="sc-chip muted"><Icon name="ban" size={14} /> ยกเว้น {excused.length} คน</span></div>}
          </section>
        )}
        <div class="sc-sumbar">
          {isOpen && (
            <div class="sb-close">
              <button disabled={!up || waiting > 0 || closing} onClick={askClose}><Icon name="lock" size={20} /> ปิดรับงาน</button>
              <span class="page-sub">{!up ? "ต้องออนไลน์ถึงปิดรับงานได้" : waiting > 0 ? "รอรายการค้างส่งขึ้นระบบก่อน" : "ปิดทุกห้องของงานนี้ ไม่รับเพิ่มอีก"}</span>
            </div>
          )}
          <span class="grow" />
          <button onClick={() => { ended.value = null; }}><Icon name="list-check" size={20} /> เลือกงานอื่น</button>
          <button onClick={() => { ended.value = null; startSession(s.assignmentId, s.classId, s.mode); }}><Icon name="player-play" size={20} /> กลับไปสแกนต่อ</button>
          <button class="primary" onClick={() => toBook()}><Icon name="notebook" size={20} /> ไปสมุดคะแนน</button>
        </div>
      </div>
      {confirm.node}
    </div>
  );
}

function markOf2(assignmentId: string, studentId: string): "pend" | "fail" | null {
  const k = pairKey({ assignmentId, studentId });
  return failedPairKeys.value.has(k) ? "fail" : pendingOps.value.has(k) ? "pend" : null;
}

/** "วันที่รับ: วันนี้ ▾" — pick the day the work was really handed in (between the day it was given and today). */
function ReceivedDateChip({ assignedDate }: { assignedDate: string | null }) {
  const today = bkkToday();
  const cur = recvDate.value ?? today;
  const back = !!recvDate.value;
  const min = assignedDate && assignedDate <= today ? assignedDate : "2020-01-01";
  const dayBefore = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") - n * 864e5).toISOString().slice(0, 10);
  // the last twelve days that are allowed (the day the work was given is the earliest); an older day comes from the date field
  const days: string[] = [];
  for (let i = 11; i >= 0; i--) { const d = dayBefore(today, i); if (d >= min) days.push(d); }
  const yest = dayBefore(today, 1) >= min ? dayBefore(today, 1) : null;
  function pick(v: string | null, done?: () => void) {
    if (v && v !== today) {
      const problem = checkReceivedDate(v, { today, assignedDate });
      if (problem) { err(FAIL_REASON[problem]); return; }
    }
    recvDate.value = v && v !== today ? v : null;
    done?.();
    if (recvDate.value) notify("info", `กำลังรับงานย้อนหลัง · ${thaiShort(recvDate.value)} — งานที่สแกนต่อจากนี้จะนับเป็นวันนั้น`);
  }
  return (
    <span class="sc-date">
      <PopMenu role="dialog" label="วันที่รับงาน"
        button={({ open, toggle, ref }) => (
          <button class="sc-cb sc-datebtn" ref={ref} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
            <Icon name="calendar-event" size={20} /> {back ? `ย้อนหลัง · ${thaiShort(recvDate.value!)}` : "วันที่รับ: วันนี้"} <Icon name="chevron-down" size={16} />
          </button>
        )}>
        {(done) => (
          <>
            <div class="hd">รับงานเมื่อวันที่ ({assignedDate && assignedDate <= today ? thaiDayMonth(assignedDate) : "ย้อนหลัง"} – วันนี้)</div>
            <div class="sc-seg">
              <button class={cur === today ? "on" : ""} onClick={() => pick(null, done)}>วันนี้</button>
              {yest && <button class={cur === yest ? "on" : ""} onClick={() => pick(yest, done)}>เมื่อวาน</button>}
            </div>
            {days.length > 2 && (
              <div class="sc-dgrid">
                {days.map((d) => <button class={d === cur ? "on" : ""} aria-label={thaiShort(d)} onClick={() => pick(d === today ? null : d, done)}>{thaiDayMonth(d)}</button>)}
              </div>
            )}
            <div class="sc-other"><span class="page-sub">เลือกวันอื่น</span><DateField value={cur} label="วันที่รับงาน" onChange={(v) => { if (v) pick(v, done); }} /></div>
            <div class="page-sub" style="padding:4px 10px">เลือกวันอนาคตหรือก่อนวันมอบหมายไม่ได้ · เปลี่ยนได้ระหว่างรอบ มีผลกับงานที่สแกนหลังจากนั้น · จบรอบแล้วกลับเป็นวันนี้</div>
          </>
        )}
      </PopMenu>
      {back && <>
        <span class="sc-backtxt"><Icon name="alert-triangle" size={20} /> กำลังรับงานย้อนหลัง</span>
        <button class="sc-cb" onClick={() => pick(null, focusScan)}><Icon name="history" size={20} /> กลับเป็นวันนี้</button>
      </>}
    </span>
  );
}

/** Hand-ins of this work the server refused: shown by themselves when there are any (never hidden — a refused scan is a lost hand-in). */
function FailedPanel({ assignmentId, classId }: { assignmentId: string; classId: string }) {
  const [items, setItems] = useState<FailedItem[]>([]);
  const confirm = useConfirm();
  const n = failedCount.value;
  useEffect(() => { listFailed().then((l) => setItems(l.filter((f) => f.payload.assignmentId === assignmentId))); }, [n, assignmentId]);
  if (!items.length) return null;
  const refresh = () => listFailed().then((l) => setItems(l.filter((f) => f.payload.assignmentId === assignmentId)));
  const title = assignments.value.find((a) => a.id === assignmentId)?.title;
  async function drop(it: FailedItem, label: string) {
    const yes = await confirm.ask({
      title: `ทิ้งรายการส่งของ ${label}?`,
      body: <>ทิ้งรายการนี้? ข้อมูลส่งงานของ {label}{title ? ` (${title})` : ""} จะหายไป</>,
      yes: "ทิ้ง", no: "เก็บไว้", danger: true,
    });
    if (yes) { await discardFailed(it.opId); refresh(); }
  }
  return (
    <section class="card sc-failed" aria-labelledby="sc-failed-h">
      <div role="alert"><h2 id="sc-failed-h" class="sc-h2" style="color:var(--text-danger)"><Icon name="cloud-x" size={20} /> ส่งไม่สำเร็จ {items.length} รายการ</h2></div>
      {items.map((it) => {
        const st = studentsById.value.get(it.payload.studentId);
        const who = st ? `เลขที่ ${st.number ?? "-"} ${fullName(st)}` : it.payload.studentId;
        return (
          <div class="failrow" key={it.opId}>
            <div class="grow" style="min-width:0">
              <div><b style="font-weight:500">{who}</b></div>
              <div class="page-sub">{title ? `${title} · ` : ""}{new Date(it.failedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
              <div class="page-sub" style="color:var(--text-danger)">{FAIL_REASON[it.reason] ?? it.reason}</div>
            </div>
            {it.reason === "assignment_closed" && <button onClick={() => navigate("/gradebook", { class: classId, asg: assignmentId })}><Icon name="notebook" size={18} /> ไปสมุดคะแนน</button>}
            <button onClick={async () => { try { await retryFailed(it.opId); refresh(); } catch { err("ลองใหม่ไม่ได้ — เครื่องนี้บันทึกไม่ได้"); } }}><Icon name="refresh" size={18} /> ลองใหม่</button>
            <button class="ghost" style="color:var(--text-danger)" onClick={() => drop(it, who)}>ทิ้ง</button>
          </div>
        );
      })}
      {confirm.node}
    </section>
  );
}

function FeedbackCard({ hidden }: { hidden?: boolean }) {
  const f = feedback.value;
  const idle = !f;
  const shown: Feedback = f ?? { kind: "accent", icon: "scan", name: "พร้อมสแกน", sub: "ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter" };
  if (idle && hidden) return null;
  return (
    <div class={"fb " + (idle ? "idle" : shown.kind) + (hidden ? " sr-only" : "")} role="status">
      <div class="ic"><Icon name={shown.icon} size={28} /></div>
      <div class="grow">
        <div class="name">{shown.name}</div>
        <div class="sub">{shown.sub}</div>
      </div>
      {shown.score && <div class="score">{shown.score}</div>}
      {!idle && shown.kind !== "danger" && shown.opId && recent.value[0]?.opId === shown.opId && !hidden && (
        <button class="fb-undo" aria-label="เลิกทำการสแกนล่าสุด" onClick={() => { undo(recent.value[0].studentId); focusScan(); }}><Icon name="arrow-back-up" size={20} /> เลิกทำ</button>
      )}
    </div>
  );
}

const SEAT_WORD: Record<string, string> = { scored: "ส่งแล้ว มีคะแนน", late: "ส่งช้า", awaiting: "ส่งแล้ว รอตรวจ", missing: "ค้างส่ง", pending: "ยังไม่ส่ง", excused: "ยกเว้น" };
const SEAT_ICON: Record<string, string> = { scored: "check", late: "clock", awaiting: "pencil", missing: "alert-circle", excused: "ban" };

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
    focusScan();
  }
  if (!st) return null;
  const quick = [s.fullScore, s.fullScore - 1, s.fullScore - 2, Math.round(s.fullScore * 0.5)].filter((n, i, a) => n >= 0 && a.indexOf(n) === i);
  const late = isLateDay();
  const hasDue = !!activeAssignment.value?.due_date;

  return (
    <section class="card sc-pad" aria-label={`ให้คะแนน เลขที่ ${st.number ?? "-"}`}>
      <div class="sc-pad-head">
        <span class="sc-pad-name" id="sc-pad-name">{fullName(st)}</span>
        <span class="sc-pad-no">เลขที่ {st.number ?? "-"}</span>
        {hasDue && (late ? <span class="sc-chip warning"><Icon name="clock" size={16} /> ส่งช้า</span> : <span class="sc-chip success"><Icon name="circle-check" size={16} /> ทันกำหนด</span>)}
        {recvDate.value && <span class="sc-chip muted"><Icon name="calendar-event" size={16} /> รับ {thaiDayMonth(recvDate.value)}</span>}
        <span class="grow" />
        <button class="ghost" onClick={() => { pending.value = null; focusScan(); }}>ให้คะแนนทีหลัง</button>
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
            {lastScore.value != null && lastScore.value <= s.fullScore && !quick.includes(lastScore.value) && (
              <button class="last" onClick={() => commitVal(String(lastScore.value))}><Icon name="history" size={18} /> ล่าสุด {lastScore.value}</button>
            )}
          </div>
        </div>
        <div class="scorepad">
          {[1,2,3,4,5,6,7,8,9].map((n) => <button onClick={() => setVal((v) => v + n)}>{n}</button>)}
          <button onClick={() => setVal((v) => (v.includes(".") ? v : (v || "0") + ".5"))}>.5</button>
          <button onClick={() => setVal((v) => v + "0")}>0</button>
          <button aria-label="ลบตัวเลขท้ายสุด" onClick={() => setVal((v) => v.slice(0, -1))}><Icon name="backspace" size={30} /></button>
          <button class="primary sc-save" aria-label="บันทึก" disabled={!!validation} onClick={() => commitVal(val)}><Icon name="check" size={30} /> บันทึก{val.trim() !== "" ? ` ${val}/${s.fullScore}` : ""}</button>
        </div>
      </div>
    </section>
  );
}

// Test seam: the round controller is plain functions over signals, so a test can drive it without rendering.
export const __scan = { ended, recvDate, handleScan, undo, excusedAsk, startSession, loadSubs, pollSubs, startPolling, POLL_MS, RESUME_GAP_MS, commitStudent, submitTypedScore, lastScore, effSub, session, subsBox, feedback, recent, pending, hidTestOn, hidLog, testHid };
