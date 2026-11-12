import { signal, computed } from "@preact/signals";
import { activeClasses, assignments, students as allStudents, deletedAssignmentIds, settings, studentsById, revokedTokens, patchAssignment, dropAssignment, captureAssignmentContext, assignmentContextCurrent } from "../../store";
import type { ScanMode, Student, SubmissionOpResult } from "@shared/types";
import { buildIndex, resolveScan } from "@shared/scan";
import { bkkToday } from "@shared/time";
import { ulid } from "@shared/ids";
import { api } from "../../lib/api";
import { enqueueSubmission, onResult, pendingOps, failedPairKeys, pairKey } from "../../lib/outbox";
import { kvGet, kvSet } from "../../lib/idb";
import { beep, vibrate } from "../../lib/sound";
import { err, notify, toasts, dismiss } from "../../lib/notify";
import { FAIL_REASON } from "../../lib/failReasons";
import { isCoarse } from "../../lib/display";
import { fullName } from "../../lib/names";
import { scanHidingNow } from "./hide";
import { hideSignal } from "../../lib/hideNames";
import { actionTime } from "../../lib/clock";

export interface Session {
  id: string;
  assignmentId: string;
  classId: string;
  subjectId: string | null;
  fullScore: number;
  mode: ScanMode;
}
export interface SubState {
  status: "submitted" | "excused" | "void";
  score: number | null;
  at: number;
  /** the server's late flag (BR-04); unknown for a scan still waiting to be sent */
  late?: boolean;
  /** R-03: the Thai day this hand-in was received (from the stored `submitted_at`, or the op still waiting to be sent) —
   *  what "เลิกทำ" puts back, so a child who handed in on time does not become late. Unknown only for a row with no date. */
  recvDay?: string;
  /** BR-14: how this hand-in came in and in which round — what the end-of-round summary counts ("รอบนี้: เครื่องยิง 16 · กล้อง 6"). Unknown = not counted */
  method?: string;
  sid?: string;
}
export interface Feedback {
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

export const session = signal<Session | null>(null);
/** The day the hand-ins of this round were really received. null = today (the normal case). Reset when a round starts or ends. */
export const recvDate = signal<string | null>(null);
// What the server says about the round on screen. It BELONGS to one assignment: switching to another work
// must never show (or scan against) the previous work's hand-ins, whatever a slow or failed request does.
//   loading = asked, no answer yet · ready = we know · unknown = the answer never came (offline) — NOT "nobody has handed in"
export interface SubsBox { aid: string | null; map: Map<string, SubState>; status: "loading" | "ready" | "unknown"; serverTime: number }
export const subsBox = signal<SubsBox>({ aid: null, map: new Map(), status: "loading", serverTime: 0 });
export const NO_SUBS = new Map<string, SubState>();
export let loadSeq = 0; // the newest request wins; an older answer is dropped
export const roundAid = () => (session.value ?? ended.value)?.assignmentId ?? null;
/** The server copy for the round on screen — never another assignment's. */
export function getSubs(): Map<string, SubState> {
  const b = subsBox.value;
  return b.aid !== null && b.aid === roundAid() ? b.map : NO_SUBS;
}
export function setSubs(map: Map<string, SubState>) {
  const aid = roundAid();
  if (!aid) return;
  subsBox.value = { ...subsBox.value, aid, map };
}
export function resetSubs(aid: string) {
  loadSeq++; // whatever is still in flight for the previous round is now out of date
  subsBox.value = { aid, map: new Map(), status: "loading", serverTime: 0 };
}
/** How a hand-in came in (BR-14): the reader (`hid`), the camera, or typed / tapped (`manual`) */
export type RecvMethod = "camera" | "hid" | "manual";
export type RecentRow = { studentId: string; at: number; score: number | null; opId?: string; recv?: string; method?: RecvMethod };
export const recent = signal<RecentRow[]>([]);
/** The method each op of this page was made with, so a row of "สแกนล่าสุด" can show it (AC-65) without touching what an op carries */
const opMethods = new Map<string, RecvMethod>();
/** BR-14 (T-39, SA 72b): how each child was FIRST received in this round, as this device saw it (reader / typed / camera). Set once when the hand-in
 *  is taken in — typing the score or a server answer never changes it; taking it back or a refusal removes it. The summary reads this before
 *  the server's `method` (which the score op overwrites). Lives only in memory; after a reload the server's value is used. */
const roundHow = new Map<string, RecvMethod>();
export const roundHowOf = (studentId: string): string | undefined => roundHow.get(studentId);
export const feedback = signal<Feedback | null>(null);
export const pending = signal<string | null>(null); // studentId awaiting typed score
export const useCamera = signal(false);
// why the camera would not start (kept until the teacher dismisses it or tries again) — never a silent toggle-off
export const cameraProblem = signal<{ title: string; hint: string } | null>(null);
export const ended = signal<Session | null>(null); // show a summary after a round ends
export const scannerReady = signal(typeof document !== "undefined" ? document.hasFocus() : true);
// a class number that several students share: the teacher picks, we never guess
// A child the teacher marked ยกเว้น for this work came to hand it in: ask before turning the exemption into a hand-in.
export const excusedAsk = signal<{ student: Student; method: "camera" | "hid" | "manual" } | null>(null);
export const choices = signal<{ raw: string; students: Student[]; method: "camera" | "hid" | "manual" } | null>(null);

export const activeAssignment = computed(() =>
  session.value ? assignments.value.find((a) => a.id === session.value!.assignmentId) ?? null : null,
);

// Why this round can't take hand-ins any more (the work was closed or deleted since it started)
export const closedReason = computed<"closed" | "deleted" | null>(() => {
  if (!session.value) return null;
  const a = activeAssignment.value;
  if (!a) return deletedAssignmentIds.value.has(session.value.assignmentId) ? "deleted" : null;
  return a.status === "closed" ? "closed" : null;
});

/** Apply what the server says about the assignment to the shared list, so no screen keeps a stale copy. */
export function applyAssignmentInfo(aid: string, info: { status: string; full_score: number; deleted: boolean } | null | undefined) {
  if (info === undefined) return;
  if (info === null || info.deleted) { dropAssignment(aid); return; }
  // R-3802: what the server just said about the work is newer than the answer of an old op — the bar follows the store from here
  if (staleFull.value?.aid === aid) staleFull.value = null;
  const cur = assignments.value.find((a) => a.id === aid);
  if (cur && (cur.status !== info.status || cur.full_score !== info.full_score)) {
    patchAssignment(aid, { status: info.status as "open" | "closed", full_score: info.full_score });
  }
}


// restore a saved session across reloads
/** AC-54: true while the round on screen was found on this device at start-up (the "ต่อรอบเดิม" bar shows until the first scan or a tap) */
export const resumedRound = signal(false);
kvGet<Session>("scanSession").then((s) => {
  if (s && !session.value) { session.value = s; resumedRound.value = true; }
});

export function setFeedback(f: Feedback) { feedback.value = f; }
export function big(score: number, full: number) { return `${score}/${full}`; }

/** A server row (list or ack) as the screen keeps it — with the day it was received, for "เลิกทำ" (R-03). */
export function subFromRow(row: { status: SubState["status"]; score: number | null; updated_at?: number | null; late?: boolean | number; submitted_at?: number | null; method?: string | null; scan_session_id?: string | null }): SubState {
  return {
    status: row.status, score: row.score, at: row.updated_at ?? Date.now(), late: row.late === true || row.late === 1,
    ...(row.submitted_at != null ? { recvDay: bkkToday(row.submitted_at) } : {}),
    ...(row.method ? { method: row.method } : {}),
    ...(row.scan_session_id ? { sid: row.scan_session_id } : {}),
  };
}

/** A response may predate a scan/ACK that changed this map while its request was in flight. */
export function reconcileSubs(rows: any[], beforeRequest: Map<string, SubState>): Map<string, SubState> {
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
export const POLL_MS = 60_000;
/** Coming back to the page (or the network) asks again at once — unless something was read this recently. */
export const RESUME_GAP_MS = 10_000;
export let lastFetchAt = 0;

export async function loadSubs(assignmentId: string) {
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

export async function pollSubs() {
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
export function startPolling(): () => void {
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
export function effSub(studentId: string): SubState | undefined {
  return effSubOf(session.value?.assignmentId ?? null, studentId);
}
/** The same for any work of the round on screen — the summary of an ended round (no live session) and the "next room" numbers use it (T-39) */
export function effSubOf(assignmentId: string | null, studentId: string): SubState | undefined {
  const server = getSubs().get(studentId);
  if (!assignmentId) return server;
  const op = pendingOps.value.get(pairKey({ assignmentId, studentId }));
  if (!op) return server;
  if (op.status === "void") return undefined;
  // a hand-in already on the server keeps its submit time and lateness when re-scored (as the server does)
  const late = server?.status === "submitted" ? server.late : undefined;
  // ...and its received day too (R-03); a first hand-in still waiting to be sent has the day its op carries
  const recvDay = server?.status === "submitted" ? server.recvDay : op.receivedDate ?? undefined;
  // ...and the way and round it was received in (BR-14); a hand-in still waiting to be sent has the ones its op carries
  const held = server?.status === "submitted" && server.sid ? server : null;
  const method = held ? held.method : op.method;
  const sid = held ? held.sid : op.scanSessionId;
  return { status: op.status === "excused" ? "excused" : "submitted", score: op.score, at: op.clientTs, late, ...(recvDay ? { recvDay } : {}), ...(method ? { method } : {}), ...(sid ? { sid } : {}) };
}
/** "pend" = saved on this device, not on the server yet · "fail" = the server refused it */
export function markOf(studentId: string): "pend" | "fail" | null {
  const s = session.value;
  if (!s) return null;
  const k = pairKey({ assignmentId: s.assignmentId, studentId });
  return failedPairKeys.value.has(k) ? "fail" : pendingOps.value.has(k) ? "pend" : null;
}

export function updateSub(studentId: string, st: SubState) {
  const m = new Map(getSubs());
  // a score typed onto a hand-in already held keeps how and in which round it was received (BR-14)
  const was = m.get(studentId);
  if (st.status === "submitted" && was?.status === "submitted" && !st.sid && was.sid) st = { ...st, method: was.method, sid: was.sid };
  m.set(studentId, st);
  setSubs(m);
}

export function pushRecent(studentId: string, score: number | null, opId?: string, recv?: string | null, method?: RecvMethod) {
  // a hand-in taken in under a back-dated "received on" day says so in the list ("· รับ 30 ต.ค."), so nobody wonders later
  const day = recv === undefined ? recvDate.value : recv;
  // B-04: one child is one row (and one head in "รอบนี้ N คน") — scanning then typing the score, or scanning again after
  // taking it back, replaces the row instead of adding a second one
  // a score typed onto a hand-in just taken keeps the way that hand-in came (the typing is not how it was received)
  const before = recent.value.find((r) => r.studentId === studentId);
  const how = method ?? (before && before.score == null && score != null ? before.method : undefined) ?? (opId ? opMethods.get(opId) : undefined);
  if (how && session.value && !roundHow.has(studentId)) roundHow.set(studentId, how);
  recent.value = [{ studentId, at: Date.now(), score, opId, ...(day ? { recv: day } : {}), ...(how ? { method: how } : {}) }, ...recent.value.filter((r) => r.studentId !== studentId)].slice(0, 30);
}

/** the day to show on a list row — only a day other than today ("· รับ 30 ต.ค."); null = nothing to say */
export const backDay = (day: string | undefined): string | null => (day && day !== bkkToday(actionTime()) ? day : null);

/** `recv` = put a hand-in back under the day it was really received (R-03); omitted = the picked day, else the day of this tap */
export function makeOp(studentId: string, status: "submitted" | "void", score: number | null, method: "camera" | "hid" | "manual", recv?: string) {
  const s = session.value!;
  const opId = ulid();
  opMethods.set(opId, method);
  return {
    opId, scanSessionId: s.id, assignmentId: s.assignmentId, studentId,
    // when the teacher acted, on the server's clock: this is what orders it against everything else
    status, score, fullScoreAtScan: s.fullScore, method, clientTs: actionTime(),
    // the day the work was handed in: the picked day, else the day of this tap — so a scan queued offline and sent
    // the next day still counts for the day it was made (BR-07). Only for hand-ins, not for taking one back.
    ...(status === "submitted" ? { receivedDate: recv ?? recvDate.value ?? bkkToday(actionTime()) } : {}),
    // accepting a hand-in (refused once the work is closed) — not the teacher grading in the gradebook
    intent: "receive" as const,
  };
}

export function refuseIfClosed(): boolean {
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
export const recvTail = () => (recvDate.value ? ` · รับ ${thaiDayMonth(recvDate.value)}` : "");
/** Is a hand-in taken in on the picked day (else today) after the due date? Only a hint on the card: the server decides `late`. */
export function isLateDay(): boolean {
  const asg = activeAssignment.value;
  const day = recvDate.value ?? bkkToday(actionTime());
  return !!asg?.due_date && day > asg.due_date;
}
export const lateWord = (late: boolean) => (activeAssignment.value?.due_date ? (late ? " · ส่งช้า" : " · ทันกำหนด") : "");
/** The score typed last in this round, offered as a quick button on the pad ("ล่าสุด 7.5") */
export const lastScore = signal<number | null>(null);
/** AC-60: the server said the work's full score changed under this round (ack `full_score_changed`); the poll's copy of the work shows the same through `fullScoreNow` */
export const staleFull = signal<{ aid: string; full: number } | null>(null);
/** The full score now, when it is not the one the round started with (else null) */
export const fullScoreNow = computed<number | null>(() => {
  const s = session.value;
  if (!s) return null;
  const st = staleFull.value;
  if (st && st.aid === s.assignmentId && st.full !== s.fullScore) return st.full;
  const a = activeAssignment.value;
  return a && a.full_score !== s.fullScore ? a.full_score : null;
});
/** AC-60 / AC-75: start again on the same work, room and mode with the full score as it is now — no setup page in between */
export function restartRound() {
  const s = session.value;
  if (!s) return;
  const full = fullScoreNow.value;
  if (full != null && staleFull.value?.aid === s.assignmentId) patchAssignment(s.assignmentId, { full_score: full });
  staleFull.value = null;
  void startSession(s.assignmentId, s.classId, s.mode);
}

export function handleScan(raw: string, method: "camera" | "hid" | "manual") {
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

export function commitStudent(student: Student, method: "camera" | "hid" | "manual", acceptExcused = false) {
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

export async function enqueueRevertible(op: ReturnType<typeof makeOp>, studentId: string, prev: SubState | undefined) {
  try {
    await enqueueSubmission(op);
  } catch {
    if (prev) updateSub(studentId, prev);
    else { const m = new Map(getSubs()); m.delete(studentId); setSubs(m); }
    recent.value = recent.value.filter((r) => r.studentId !== studentId || r.at < Date.now() - 1000);
    roundHow.delete(studentId);
    beep.err();
    err("บันทึกลงเครื่องไม่ได้ ลองอีกครั้ง");
    setFeedback({ kind: "danger", icon: "alert-triangle", name: "บันทึกไม่สำเร็จ", sub: "อุปกรณ์บันทึกข้อมูลไม่ได้ ลองสแกนใหม่" });
  }
}

export function submitTypedScore(score: number) {
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

export function undo(studentId: string) {
  const s = session.value;
  if (!s) return;
  const prev = effSub(studentId);
  const was = recent.value.find((r) => r.studentId === studentId);
  const m = new Map(getSubs());
  m.delete(studentId);
  setSubs(m);
  recent.value = recent.value.filter((r) => r.studentId !== studentId);
  roundHow.delete(studentId);
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
    undoToast(`ยกเลิกการส่งของเลขที่ ${st?.number ?? "-"}${scanHidingNow() ? "" : ` ${st ? fullName(st) : "นักเรียน"}`} แล้ว`, () => {
      if (!session.value || session.value.assignmentId !== op.assignmentId) return;
      updateSub(studentId, prev);
      pushRecent(studentId, prev.score, op.opId, backDay(prev.recvDay), was?.method);
      void enqueueRevertible(op, studentId, undefined);
      focusScan();
    });
  }
}

/** How long a "เลิกทำ" toast stays: long enough to notice a slip, short enough not to pile up (D16) */
export const UNDO_SECONDS = 5;
/** A toast with an undo button that counts down in its own label: "เลิกทำ (5)" … "เลิกทำ (1)", then it goes. */
export function undoToast(message: string, run: () => void) {
  let left = UNDO_SECONDS;
  // R-3803: the words never change, so a screen reader hears "เลิกทำได้ 5 วินาที" once; the time left is the bar under the toast (aria-hidden)
  const id = notify("info", `${message} · เลิกทำได้ ${UNDO_SECONDS} วินาที`, { sticky: true, action: { label: "เลิกทำ", run } });
  toasts.value = toasts.value.map((t) => (t.id === id ? { ...t, ms: UNDO_SECONDS * 1000 } : t));
  const timer = setInterval(() => {
    if (!toasts.value.some((t) => t.id === id)) { clearInterval(timer); return; } // closed or used
    left -= 1;
    if (left <= 0) { clearInterval(timer); dismiss(id); }
  }, 1000);
}

/** P-2: the scan field takes the focus back after a sheet / dialog / menu / toast action — a keyboard device only (a tablet would pop its keyboard up) */
export function focusScan() {
  if (isCoarse()) return;
  setTimeout(() => document.querySelector<HTMLInputElement>(".scan-input input")?.focus({ preventScroll: true }), 0);
}

export const REJECTED = FAIL_REASON;
// The server said no. The grid must stop showing that student as submitted, and the
// teacher must be told why — a green square that the server refused is a lie.
export let scanViewLeft = true; // true while the scan page is not on screen: a late answer updates the cache, never a card/sound
export const alreadyShownAt = new Map<string, number>(); // studentId -> when the repeat card last showed (one card per batch)
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
    roundHow.delete(op.studentId);
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
    // AC-60: a bar that stays until the round is restarted or ended (the card below is replaced by the next scan)
    if (session.value?.assignmentId === op.assignmentId) staleFull.value = { aid: op.assignmentId, full: r.currentFullScore };
    setFeedback({ kind: "warning", icon: "alert-triangle", name: "คะแนนเต็มถูกแก้ไข", sub: `คะแนนเต็มปัจจุบันคือ ${r.currentFullScore} — เริ่มรอบใหม่เพื่อความถูกต้อง` });
  } else {
    roundHow.delete(op.studentId);
    const st = studentsById.value.get(op.studentId);
    setFeedback({ kind: "danger", icon: "alert-triangle", name: st ? fullName(st) : "บันทึกไม่สำเร็จ", sub: `${REJECTED[r.result] ?? r.result} — ยังไม่ได้บันทึกบนระบบ (ดูที่ "ส่งไม่สำเร็จ")` });
  }
  if (session.value?.assignmentId === op.assignmentId) loadSubs(op.assignmentId).catch(() => {});
});

export let startSeq = 0; // the newest call to startSession owns the round
export async function startSession(assignmentId: string, classId: string, mode: ScanMode) {
  const asg = assignments.value.find((a) => a.id === assignmentId);
  if (!asg || !classId) return;
  const mine = ++startSeq;
  const s: Session = { id: `scn_${ulid()}`, assignmentId: asg.id, classId, subjectId: asg.subject_id, fullScore: asg.full_score, mode };
  session.value = s;
  ended.value = null;
  resumedRound.value = false;
  staleFull.value = null;
  recvDate.value = null;
  resetSubs(s.assignmentId); // the previous work's hand-ins must not be on screen, or scanned against, even for an instant
  // reset NOW, not after the await below: a scan made while the round is being saved must not be wiped
  recent.value = [];
  roundHow.clear();
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

export const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function thaiDayMonth(iso: string) { const [, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]}`; }
export function thaiShort(iso: string) { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m - 1]} ${y + 543}`; }
export const timeOf = (ms: number) => new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
/** BR-15: the due label as words. `left` = whole Thai calendar days from today to the due date (negative = past); null = no due date → nothing */
export function dueWord(left: number | null): string {
  if (left == null) return "";
  if (left < 0) return `เลยกำหนด ${-left} วัน`;
  if (left === 0) return "ครบกำหนดวันนี้";
  if (left === 1) return "ครบกำหนดพรุ่งนี้";
  return `อีก ${left} วัน`;
}
export const MODE_LABEL: Record<ScanMode, string> = { full: "ให้คะแนนเต็ม", type: "กรอกทีละคน", later: "รับงานก่อน" };

export const hidTestOn = signal(false);
export const hidLog = signal<{ raw: string; who: string | null; ok: boolean; at: number }[]>([]);
/** The "ทดสอบ" panel: a code shot while it is open is only read back, never recorded as a hand-in. */
export function testHid(raw: string) {
  const idx = buildIndex(allStudents.value, revokedTokens.value, null);
  const r = resolveScan(raw, idx, { allowStudentCode: settings.value?.accept_student_code_scan ?? false });
  const st = r.studentId ? studentsById.value.get(r.studentId) : null;
  hidLog.value = [{ raw, who: st ? `เลขที่ ${st.number ?? "-"}${scanHidingNow() ? "" : ` ${fullName(st)}`}` : r.kind === "revoked" ? "บัตรถูกยกเลิก" : null, ok: r.kind === "student", at: Date.now() }, ...hidLog.value].slice(0, 4);
}

export function setScanViewLeft(v: boolean) { scanViewLeft = v; }


/**
 * AC-77 (R-4003): texts built once (the undo toast, the HID test log) must not keep a name when the switch is turned on later.
 * The names are taken out of them at that moment (" <full name>" after "เลขที่ N"); the data and ops are untouched.
 */
export function maskNames(text: string): string {
  let out = text;
  for (const st of allStudents.value) { const n = fullName(st); if (n && out.includes(n)) out = out.split(` ${n}`).join("").split(n).join(""); }
  return out;
}
hideSignal("scan").subscribe((on) => {
  if (!on) return;
  toasts.value = toasts.value.map((t) => (t.message.includes(" ") ? { ...t, message: maskNames(t.message) } : t));
  hidLog.value = hidLog.value.map((r) => (r.who ? { ...r, who: maskNames(r.who) } : r));
});
