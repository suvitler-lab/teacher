import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/attend.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented, StackBar, NoClasses } from "../components/ui";
import { activeClasses, activeSubjects, studentsByClass, settings, studentsById, revokedTokens, schoolYearStart, students as allStudents } from "../store";
import type { AttendanceStatus, AttendanceDay, Student } from "@shared/types";
import { api } from "../lib/api";
import { swrPeek, swrFetch } from "../lib/swr";
import { buildIndex, resolveScan } from "@shared/scan";
import { attendanceProgress, attendancePercent } from "@shared/metrics";
import { bkkToday, bkkParts } from "@shared/time";
import { installHidScanner } from "../lib/hid";
import { fullName, shortName } from "../lib/names";
import { formatThaiDate, formatThaiTimeMs } from "../lib/dates";
import { draftGet, type AttDraft, type AttDraftRow, type AttConflict, type AttReviewRow } from "../lib/idb";
import {
  draftEdit, draftEditIfUnmarked, resolveConflict, retryDraft, flushDraft, requestFlush, onAttEvent, attSync, ctxKey,
  reviewResend, reviewDiscard, attDrafts, refreshAttDraftCount, withdrawRows, CLEARED,
  type AttCtx, type AttMethod, type AttWireStatus,
} from "../lib/attSync";
import { err, notify } from "../lib/notify";
import { failedCount } from "../lib/outbox";
import { useConfirm } from "../components/ConfirmDialog";
import { beep } from "../lib/sound";
import { routeParams, navigate } from "../router";
import { attendanceLayout } from "../lib/pageCards";
import { isHiddenCard } from "../lib/cardLayout";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { ATT_CARD_META, ATT_LOCKED } from "../components/cards/meta";
import { ProjectorButton, ProjectorShell } from "../components/Projector";
import { projectorOn, pjSize, pjHideNames } from "../lib/projector";

/** How long "มาทั้งห้อง" waits before it is sent: while it waits, "เลิกทำ" in the toast takes it back. */
const UNDO_HOLD_MS = 4500;
/** After this long without an answer from the system the children can be tapped anyway (the answer is checked when it arrives). */
const SLOW_MS = 2500;

const STATUSES: AttendanceStatus[] = ["present", "late", "leave", "sick", "absent"];
const LABELS: Record<AttendanceStatus, string> = { present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" };
// a tap that takes a mark back ("none") is worded for the teacher wherever it is shown next to a status
const statusLabel = (s: string) => LABELS[s as AttendanceStatus] ?? (s === CLEARED ? "ยกเลิกการเช็ค" : s);
const REVIEW_REASON: Record<string, string> = {
  not_in_class: "นักเรียนคนนี้ไม่ได้อยู่ห้องนี้แล้ว (ย้ายห้องหรือออก)",
  epoch_changed: "แตะไว้ก่อนที่ข้อมูลจะถูกกู้คืนจากไฟล์สำรอง",
  before_school_year: "วันที่นี้อยู่ก่อนวันเปิดปีการศึกษาปัจจุบัน — เช็คชื่อก่อนวันนั้นแก้ไม่ได้",
};
const ST_ICON: Record<AttendanceStatus, string> = { present: "check", late: "clock", leave: "file-text", sick: "thermometer", absent: "x" };
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const TH_DOW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const STACK_COLOR: Record<AttendanceStatus, string> = {
  present: "var(--fill-success)", late: "var(--fill-warning)", leave: "var(--fill-accent)", sick: "var(--fill-purple)", absent: "var(--fill-danger)",
};
const BADGE_TONE: Record<AttendanceStatus, string> = { present: "present", late: "late", leave: "leave", sick: "sick", absent: "absent" };

// the class last looked at is kept on this device, so a reload (or a bare #/attendance link) opens the same room
const CLASS_KEY = "ngankrob-att-class";
const rememberedClass = (): string => { try { return localStorage.getItem(CLASS_KEY) ?? ""; } catch { return ""; } };
const rememberClass = (id: string) => { try { localStorage.setItem(CLASS_KEY, id); } catch { /* private window: lasts until reload */ } };

const todayBkk = () => bkkToday();
const nowMinutesBkk = () => bkkParts(Date.now()).minutes;
function hmToMin(hm: string, fallback = 510): number { const m = /^(\d{1,2}):(\d{2})$/.exec(hm); return m ? Number(m[1]) * 60 + Number(m[2]) : fallback; }
function periodTimes(): Record<string, string> { try { return JSON.parse(settings.value?.period_times || "{}"); } catch { return {}; } }
function lateThreshold(scoped: boolean, period: number): number | null {
  if (scoped) { const t = periodTimes()[String(period)]; return t ? hmToMin(t) : null; }
  return hmToMin(settings.value?.late_after ?? "08:30");
}
function addDays(iso: string, n: number): string { return new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10); }
// Monday..Friday of the ISO week containing `date`
function weekDays(date: string): string[] {
  const d = new Date(date + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0=Mon
  const mon = addDays(date, -dow);
  return [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
}
const dowOf = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
const dayMonth = (iso: string) => formatThaiDate(iso).replace(/ \d{4}$/, "");

type Tone = "ok" | "bad" | "warn";
type ServerRow = { status: AttendanceStatus; updatedAt: number; time?: number | null };

export function AttendancePage() {
  const linked = routeParams().class; // e.g. from a class row on Home
  const isClass = (id: string | undefined): id is string => !!id && activeClasses.value.some((c) => c.id === id);
  // an explicit ?class= wins; else the room this device looked at last; else the first one
  const [classId, setClassId] = useState(() => { const mem = rememberedClass(); return isClass(linked) ? linked : isClass(mem) ? mem : activeClasses.value[0]?.id ?? ""; });
  const linkedDate = routeParams().date; // e.g. "?date=2026-11-03": only a real day between the start of the year and today
  const [date, setDate] = useState(linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate) && linkedDate <= todayBkk() && (!schoolYearStart.value || linkedDate >= schoolYearStart.value) ? linkedDate : todayBkk());
  // last year's attendance can be read (reports, Excel) but not written once a new school year has started
  const yearStart = schoolYearStart.value;
  const beforeYear = !!yearStart && date < yearStart;
  const linkedPeriod = Number(routeParams().period);
  const linkedSubject = routeParams().subject;
  const periodLinked = Number.isInteger(linkedPeriod) && linkedPeriod >= 1 && linkedPeriod <= 8 && !!linkedSubject && activeSubjects.value.some((x) => x.id === linkedSubject);
  const [scoped, setScoped] = useState(periodLinked);
  const [subjectId, setSubjectId] = useState(periodLinked ? linkedSubject : activeSubjects.value[0]?.id ?? "");
  const [period, setPeriod] = useState(periodLinked ? linkedPeriod : 1);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [method, setMethod] = useState<"tap" | "scan">("tap");
  const [brush, setBrush] = useState<AttendanceStatus>("present");
  // what the server holds for THIS context, and what's still waiting on this device (the draft)
  const [server, setServer] = useState<Map<string, ServerRow>>(new Map());
  const [draft, setDraft] = useState<AttDraft | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false); // the system has not answered yet but the children can be tapped
  const [offline, setOffline] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ text: string; tone: Tone } | null>(null);
  const [scanLog, setScanLog] = useState<{ id: string; late: boolean; at: number }[]>([]);
  const [week, setWeek] = useState<AttendanceDay[]>([]);
  const [savedTick, setSavedTick] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hit, setHit] = useState<string | null>(null);
  const { ask, node: askNode } = useConfirm();
  const [pickFrom, setPickFrom] = useState<Student[] | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const brushRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hitTimer = useRef(0);

  // the TV view marks by scan; when it ends the page goes back to the way the teacher had (it used to stay on "scan QR")
  const wasTv = useRef(false), beforeTv = useRef<"tap" | "scan">("tap");
  useEffect(() => {
    if (projectorOn.value) { if (!wasTv.current) beforeTv.current = method; wasTv.current = true; setMethod("scan"); }
    else if (wasTv.current) { wasTv.current = false; setMethod(beforeTv.current); }
  }, [projectorOn.value]);
  const layout = attendanceLayout.value;
  const showCard = (k: "sum" | "week" | "scans" | "todo" | "away") => !isHiddenCard(layout, k);
  // the order the teacher chose in "ปรับการ์ด": the cards above the children (week, summary) and the cards beside them (last scans, to do, away)
  const rank = (k: string) => layout.order.indexOf(k as never);
  const byRank = <T extends string>(ks: T[]) => ks.slice().sort((a, b) => rank(a) - rank(b));
  const students = studentsByClass.value.get(classId) ?? [];
  const ctx: AttCtx = { date, classId, subjectId: scoped ? subjectId : null, period: scoped ? period : null };
  const key = ctxKey(ctx);

  // Handlers run long after the render that made them (HID listener, timers), so
  // they read the current context and server view through refs, never a closure.
  const keyRef = useRef(key);
  keyRef.current = key;
  const serverRef = useRef(server);
  serverRef.current = server;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const classRef = useRef(classId);
  classRef.current = classId;
  // while a read of the server is in flight: the students whose mark was taken back (acknowledged "none") since it started.
  // An older answer still lists them and must not bring the mark back.
  const clearedDuringLoad = useRef<Set<string> | null>(null);

  // the teacher picks another room: the address and this device remember it (a link to a room, or back/forward, does the same the other way)
  function changeClass(id: string) {
    setClassId(id);
    rememberClass(id);
    if (routeParams().class !== id) navigate("/attendance", { ...routeParams(), class: id });
  }
  const urlClass = routeParams().class;
  useEffect(() => {
    if (urlClass && urlClass !== classRef.current && isClass(urlClass)) { setClassId(urlClass); rememberClass(urlClass); }
  }, [urlClass]);
  useEffect(() => { if (classId) rememberClass(classId); }, [classId]);
  const loadSeq = useRef(0);
  const tapTimes = useRef(new Map<string, number>()); // when this device last marked a child (for "สาย 08:41" after the draft is sent)

  // ---- reading the draft back without ever overwriting a tap that is newer ----------------------------------
  // The sender announces "saved" and the page re-reads the draft. If that read was started before the teacher's next
  // tap was stored, its answer is OLDER than the screen and would put the just-tapped child back to "not checked".
  // So: a read is dropped when a local write began after it started, and not made at all while a write is running
  // (it is repeated when the write ends).
  const writes = useRef(0);
  const readSeq = useRef(0);
  const rereadKey = useRef<string | null>(null);
  const reading = useRef(0);
  function refreshDraft(k: string) {
    if (writes.current > 0) { rereadKey.current = k; return; }
    const mine = ++readSeq.current;
    reading.current++;
    void draftGet(k).then((d) => {
      reading.current--;
      if (k !== keyRef.current) return;
      if (mine !== readSeq.current) return; // another read or a write came after this one: its answer is newer
      if (writes.current > 0) { rereadKey.current = k; return; }
      setDraft(d);
    });
  }

  // A child whose tap clashed with another device is neither "saved as the tap" nor "as the system holds it" until the
  // teacher picks a side: it has NO status here (the tile says "รอเลือก", the summary counts it as "ต้องตรวจสอบ").
  const heldIds = new Set((draft?.conflicts ?? []).map((c) => c.studentId));
  // a draft row beats the server's; a draft row that CLEARS a mark means "not checked" whatever the server still holds
  const statusOf = (sid: string): AttendanceStatus | undefined => {
    if (heldIds.has(sid)) return undefined;
    const d = draft?.rows[sid];
    if (d) return d.status === CLEARED ? undefined : (d.status as AttendanceStatus);
    return server.get(sid)?.status;
  };
  const timeOf = (sid: string): number | undefined =>
    draft?.rows[sid]?.clientTs ?? server.get(sid)?.time ?? tapTimes.current.get(sid) ?? undefined;

  async function load() {
    const seq = ++loadSeq.current;
    if (!classId) { clearedDuringLoad.current = null; setLoaded(true); setServer(new Map()); setDraft(undefined); return; }
    const myKey = key;
    setLoaded(false); setSlow(false); setOffline(false); setServer(new Map()); setScanLog([]); tapTimes.current = new Map(); clearedDuringLoad.current = new Set();
    const local = await draftGet(myKey); // instant and works offline
    if (seq !== loadSeq.current) return;
    setDraft(local);

    const q = new URLSearchParams({ date, class: classId });
    if (scoped) { q.set("subject", subjectId); q.set("period", String(period)); }
    // a slow network must not freeze the room: after a moment the children can be tapped while the answer is still coming
    const slowTimer = window.setTimeout(() => { if (seq === loadSeq.current) { setSlow(true); setLoaded(true); } }, SLOW_MS);
    try {
      const res = await api.get<{ rows: any[] }>(`/api/attendance?${q}`);
      if (seq !== loadSeq.current) return; // the teacher already moved on: this answer belongs to another context
      // The children may have been tapped while this answer was on its way (slow network), and the sender may have confirmed
      // them already. The answer was read before those writes: merge it per student by updatedAt instead of replacing the map,
      // so a saved mark stays on screen and the next tap builds on its version (no clash with this device's own data).
      const gone = clearedDuringLoad.current;
      const got = res.rows.filter((r) => !gone?.has(r.student_id)).map((r): [string, ServerRow] => [r.student_id, { status: r.status as AttendanceStatus, updatedAt: r.updated_at, time: r.time ?? null }]);
      setServer((prev) => {
        const m = new Map<string, ServerRow>(got);
        for (const [sid, cur] of prev) { const g = m.get(sid); if (!g || cur.updatedAt >= g.updatedAt) m.set(sid, { ...cur, time: cur.time ?? g?.time ?? null }); }
        return m;
      });
    } catch {
      if (seq !== loadSeq.current) return;
      setOffline(true); // show the draft from this device; new taps are checked against the server when they send
    } finally {
      clearTimeout(slowTimer);
      if (seq === loadSeq.current) clearedDuringLoad.current = null;
    }
    setSlow(false);
    setLoaded(true);
    if (local && Object.keys(local.rows).length) requestFlush(myKey, 0);
  }
  useEffect(() => {
    load();
    void refreshAttDraftCount();
    // leaving this context (class/day/period change, or the page): send what's waiting for it now
    return () => { void flushDraft(key); };
  }, [key]);

  // the sender reports back by key — only the context on screen updates the screen
  useEffect(() => onAttEvent((e) => {
    if (e.key !== keyRef.current) return;
    if (e.type === "saved") {
      setSavedTick((n) => n + 1);
      setSavedAt(Date.now());
      setServer((prev) => {
        const m = new Map(prev);
        for (const [sid, status] of Object.entries(e.acked)) {
          if (status === CLEARED) { m.delete(sid); clearedDuringLoad.current?.add(sid); continue; } // the server holds no mark any more
          clearedDuringLoad.current?.delete(sid);
          m.set(sid, { status, updatedAt: e.versions[sid] ?? e.updatedAt, time: prev.get(sid)?.time ?? tapTimes.current.get(sid) ?? null });
        }
        return m;
      });
      // another device edited these students AFTER this one's tap: the screen now shows the system's value — say so
      if (e.changedByOthers.length > 0) {
        const names = e.changedByOthers.map((sid) => studentsById.value.get(sid)).filter((x): x is NonNullable<typeof x> => !!x).map((st) => fullName(st));
        notify("info", `อีกเครื่องแก้ ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` และอีก ${names.length - 3} คน` : ""} ไว้ใหม่กว่า — แสดงตามที่ระบบเก็บ`);
      }
    }
    refreshDraft(e.key);
  }), []);

  async function loadWeek() {
    const days = weekDays(date);
    // all classes, so the class chips can show today's "checked?" mark
    const url = `/api/attendance/days?from=${days[0]}&to=${days[4]}`;
    // the last answer for this exact week paints at once; an old one is renewed quietly (any write drops it: see lib/swr.ts)
    const hit = swrPeek<{ days: AttendanceDay[] }>(url);
    if (hit) { setWeek(hit.data.days); if (hit.fresh) return; }
    try {
      const res = await swrFetch(url, () => api.get<{ days: AttendanceDay[] }>(url));
      setWeek(res.days);
    } catch { if (!hit) setWeek([]); }
  }
  useEffect(() => { loadWeek(); }, [date, savedTick]);

  useEffect(() => { if (method === "scan" && !projectorOn.value) scanRef.current?.focus(); }, [method, projectorOn.value]);

  function flash(sid: string) {
    setHit(sid);
    clearTimeout(hitTimer.current);
    hitTimer.current = window.setTimeout(() => setHit(null), 1200);
  }

  // Record taps in the draft (durable, keyed by their own context), then let the sender pick them up.
  // `only`: write a child only if nobody has marked it yet (decided at the moment of writing); `only.previous` gets what the draft held before
  async function applyEdits(edits: { sid: string; status: AttWireStatus; clientTs?: number }[], how: AttMethod, holdMs = 600, only?: { previous: Record<string, AttDraftRow> }): Promise<Record<string, string> | false> {
    if (beforeYear) { beep.err(); err("วันที่นี้อยู่ก่อนวันเปิดปีการศึกษาปัจจุบัน — เช็คชื่อไม่ได้"); return false; }
    const at = ctx;
    // a read that started before this tap must not overwrite its result: drop it, and read again once the tap is stored
    if (reading.current > 0) rereadKey.current = keyRef.current;
    writes.current++; readSeq.current++;
    try {
      const wire = edits.map((e) => ({
        studentId: e.sid, status: e.status, method: how, clientTs: e.clientTs,
        baseUpdatedAt: serverRef.current.get(e.sid)?.updatedAt ?? null,
      }));
      let d: AttDraft | undefined, done: Set<string>;
      if (only) {
        const r = await draftEditIfUnmarked(at, wire);
        d = r.draft; done = new Set(r.applied); Object.assign(only.previous, r.previous);
      } else { d = await draftEdit(at, wire); done = new Set(edits.map((e) => e.sid)); }
      if (ctxKey(at) === keyRef.current) { setDraft(d); for (const e of edits) if (done.has(e.sid)) tapTimes.current.set(e.sid, Date.now()); }
      if (done.size === 0) return {};
      requestFlush(ctxKey(at), holdMs);
      return Object.fromEntries(edits.flatMap((e) => (done.has(e.sid) && d?.rows[e.sid]?.opId ? [[e.sid, d.rows[e.sid].opId as string]] : [])));
    } catch {
      // the device couldn't store it — say so instead of pretending it's saved
      beep.err();
      err("บันทึกลงเครื่องไม่ได้ ลองอีกครั้ง");
      return false;
    } finally {
      writes.current--;
      if (writes.current === 0 && rereadKey.current) { const k = rereadKey.current; rereadKey.current = null; refreshDraft(k); }
    }
  }
  function tap(studentId: string) {
    // the room is still opening: say so, a silent tap looks like a broken button
    if (!loaded) { notify("info", "กำลังโหลดรายชื่อ — รอสักครู่แล้วแตะอีกครั้ง"); return; }
    // the child already has the status that is selected: a second tap takes the mark back ("not checked yet")
    const cur = statusOf(studentId);
    if (cur === brush) { void clearMark(studentId, cur); return; }
    flash(studentId);
    void applyEdits([{ sid: studentId, status: brush }], "grid");
  }
  // Take a mark back. The toast's "เลิกทำ" puts the previous status (and its time) back as an ordinary tap.
  async function clearMark(studentId: string, prev: AttendanceStatus) {
    const st = studentsById.value.get(studentId);
    const at = ctx, prevTime = timeOf(studentId);
    flash(studentId);
    const ops = await applyEdits([{ sid: studentId, status: CLEARED }], "grid");
    if (!ops) return;
    notify("info", `ยกเลิกการเช็คของ ${st ? fullName(st) : "นักเรียน"} แล้ว`, { action: { label: "เลิกทำ", run: async () => {
      // the room, day or period on screen changed since: the undo would build on another screen's data, so the teacher taps again
      if (ctxKey(at) !== keyRef.current) { err("เลิกทำไม่ได้แล้ว — กลับไปที่ห้อง/วันนั้นแล้วแตะเช็คใหม่"); return; }
      const back = await applyEdits([{ sid: studentId, status: prev, clientTs: prevTime }], "grid");
      if (back) notify("info", `คืนค่า “${LABELS[prev]}” ให้ ${st ? fullName(st) : "นักเรียน"} แล้ว`);
    } } });
  }
  // Runs AFTER the teacher said yes, so it judges who is still unchecked now (a child who got "สาย" by QR while the question
  // was open keeps it): from the live refs, and again inside the draft write itself.
  function markAllPresent() {
    if (!loaded || slow) return;
    // the room, day or period on screen changed while the question was open: this answer belonged to another screen
    if (key !== keyRef.current) { notify("info", "เปลี่ยนห้องหรือวันแล้ว — ยังไม่ได้เช็คให้ กด “มาทั้งห้อง” ใหม่อีกครั้ง"); return; }
    const d = draftRef.current, sv = serverRef.current;
    const markOf = (sid: string): string | undefined => { const r = d?.rows[sid]; return r ? (r.status === CLEARED ? undefined : r.status) : sv.get(sid)?.status; };
    // only the children not checked yet: a child already marked late / sick / absent keeps that
    const todo = students.filter((st) => !markOf(st.id)).map((st) => ({ sid: st.id, status: "present" as AttendanceStatus }));
    if (!todo.length) { notify("info", "เช็คครบทุกคนแล้ว"); return; }
    // the send is held back a few seconds so "เลิกทำ" can still take it back (once it is sent, only a new tap changes a child)
    const at = ctx;
    // a child whose draft row is a not-yet-sent clear is "not checked" too: if the bulk is taken back, that row must come back with it
    const previous: Record<string, AttDraftRow> = {};
    void applyEdits(todo, "bulk", UNDO_HOLD_MS, { previous }).then((ops) => {
      if (!ops) return;
      const n = Object.keys(ops).length;
      if (!n) { notify("info", "เช็คครบทุกคนแล้ว"); return; }
      notify("success", `ให้ “มา” ${n} คนแล้ว`, { action: { label: "เลิกทำ", run: async () => {
        try {
          const r = await withdrawRows(at, ops, previous);
          if (ctxKey(at) === keyRef.current) { readSeq.current++; setDraft(r.draft); }
          if (r.taken === 0) err("เลิกทำไม่ได้แล้ว — บันทึกขึ้นระบบไปแล้ว แก้เป็นรายคนได้ในหน้านี้");
          else { notify("info", `เลิกทำแล้ว · ${r.taken} คนกลับเป็นยังไม่เช็ค`); }
        } catch { err("เลิกทำไม่สำเร็จ ลองอีกครั้ง"); }
      } } });
    });
  }
  async function askMarkAll() {
    if (!loaded || slow) return;
    if (unmarked <= 0) { notify("info", "เช็คครบทุกคนแล้ว"); return; }
    const n = unmarked;
    const yes = await ask({
      title: `มาทั้งห้อง ${n} คน?`,
      body: `ให้ “มา” ${n} คนที่ยังไม่เช็ค (คนที่เช็คไว้แล้วไม่เปลี่ยน) · เลิกทำได้ในไม่กี่วินาทีหลังกด`,
      yes: `มาทั้งห้อง ${n} คน`,
    });
    if (yes) markAllPresent();
  }
  function brushKey(e: KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const j = (i + step + STATUSES.length) % STATUSES.length;
    setBrush(STATUSES[j]);
    brushRefs.current[j]?.focus();
  }

  async function pick(c: AttConflict, side: "server" | "draft") {
    if (side === "server") setServer((prev) => new Map(prev).set(c.studentId, { status: c.server.status as AttendanceStatus, updatedAt: c.server.updatedAt, time: null }));
    const d = await resolveConflict(key, c.studentId, side);
    if (key === keyRef.current) { readSeq.current++; setDraft(d); }
  }

  const say = (text: string, tone: Tone) => setScanMsg({ text, tone });
  function handleScan(raw: string) {
    const idx = buildIndex(allStudents.value, revokedTokens.value, classId);
    const r = resolveScan(raw, idx, { allowStudentCode: settings.value?.accept_student_code_scan ?? false });
    if (r.kind === "ambiguous") {
      // two students share this number — never pick one for the teacher
      const list = (r.candidateIds ?? []).map((id) => studentsById.value.get(id)).filter((x): x is Student => !!x);
      beep.err();
      setPickFrom(list);
      say(`เลขที่ ${r.raw} มี ${list.length} คน — เลือกคนที่ถูกต้อง (ยังไม่ได้บันทึกใคร)`, "warn");
      return;
    }
    setPickFrom(null);
    if (r.kind !== "student" && r.kind !== "number") {
      beep.err();
      const v = raw.trim();
      if (r.kind === "revoked") say("บัตรใบนี้ถูกยกเลิกแล้ว — ใช้บัตรใบใหม่ หรือพิมพ์เลขที่", "bad");
      else if (/^\d{1,3}$/.test(v)) say(`ไม่มีเลขที่ ${v} ใน ${activeClasses.value.find((c) => c.id === classId)?.name ?? "ห้องนี้"}`, "bad");
      else say(`ไม่รู้จักรหัส ${v.slice(0, 16)} — ตรวจบัตรหรือพิมพ์เลขที่`, "bad");
      return;
    }
    const st = studentsById.value.get(r.studentId!);
    if (!st) { beep.err(); say("ไม่พบนักเรียน", "bad"); return; }
    markScanned(st);
  }

  function markScanned(st: Student) {
    if (st.class_id !== classId) { beep.err(); say("ไม่ได้อยู่ในห้องนี้", "bad"); return; }
    const threshold = lateThreshold(scoped, period);
    if (scoped && threshold === null) { beep.err(); say("คาบนี้ยังไม่ได้ตั้งเวลา — กด “ตั้งเวลาคาบ” ด้านบน หรือแตะเลือกแทน", "bad"); return; }
    const late = date === todayBkk() && threshold !== null && nowMinutesBkk() > threshold;
    void applyEdits([{ sid: st.id, status: late ? "late" : "present" }], "hid").then((saved) => {
      if (!saved) return;
      beep.ok();
      flash(st.id);
      const at = Date.now();
      setScanLog((l) => [{ id: st.id, late, at }, ...l].slice(0, 20));
      say(`${shortName(st)} · ${late ? "สาย" : "มา"} ${formatThaiTimeMs(at)}`, late ? "warn" : "ok");
    });
  }

  useEffect(() => { if (method !== "scan") return; return installHidScanner(handleScan); }, [method, classId, date, scoped, subjectId, period]);

  // taps set aside for the teacher, and unsent taps sitting in OTHER days/rooms
  const review: AttReviewRow[] = draft?.review ?? [];
  const elsewhere = attDrafts.value.filter((d) => d.key !== key);
  async function resend(r: AttReviewRow) { const d = await reviewResend(key, r.studentId); if (key === keyRef.current) { readSeq.current++; setDraft(d); } }
  async function discard(r: AttReviewRow) {
    // a set-aside tap is the teacher's own mark that was never sent: dropping it needs a yes
    const st = studentsById.value.get(r.studentId);
    if (!(await ask({ title: "ทิ้งรายการนี้?", body: `${st ? fullName(st) : "นักเรียน"} — ข้อมูลที่เช็คไว้ในเครื่องนี้จะหายไป`, yes: "ทิ้ง", danger: true }))) return;
    const d = await reviewDiscard(key, r.studentId); if (key === keyRef.current) { readSeq.current++; setDraft(d); }
  }
  function openDraft(c: AttCtx) {
    changeClass(c.classId); setDate(c.date);
    setScoped(!!c.subjectId);
    if (c.subjectId) { setSubjectId(c.subjectId); setPeriod(c.period ?? 1); }
  }

  const conflicts = draft?.conflicts ?? [];
  const pending = Object.keys(draft?.rows ?? {}).length;
  const sync = attSync.value[key];

  const counts = STATUSES.map((s) => students.filter((st) => statusOf(st.id) === s).length);
  const marked = counts.reduce((a, b) => a + b, 0);
  const presentPct = attendancePercent({ present: counts[0], late: counts[1], leave: counts[2], sick: counts[3], absent: counts[4] });
  const heldN = students.filter((st) => heldIds.has(st.id)).length; // waiting for the teacher to pick: "ต้องตรวจสอบ", not in any status
  const unmarked = students.length - marked - heldN;
  const days = weekDays(date);
  const className = activeClasses.value.find((c) => c.id === classId)?.name ?? "";
  const classItems = activeClasses.value.map((c) => {
    // this class uses live edits; others fall back to the week tally for the day on screen
    const total = (studentsByClass.value.get(c.id) ?? []).length;
    const wc = week.find((x) => x.classId === c.id && x.date === date);
    const mk = c.id === classId ? marked : (wc ? wc.marked : 0);
    // one student ticked out of 32 is "in progress", not "done"
    const p = attendanceProgress(mk, total);
    const mark = total === 0 ? null : p === "complete" ? "ok" : p === "partial" ? "part" : "todo";
    return { id: c.id, name: c.name, count: total, mark } as const;
  });

  if (!classId) return <><PageHeader icon="user-check" title="เช็คชื่อ" /><NoClasses /></>;

  // ---- the TV view: only the TV is on the screen (the page behind it has scores and names of absent children in it) ----
  if (projectorOn.value) {
    const here = students.filter((st) => { const x = statusOf(st.id); return x === "present" || x === "late"; });
    const lastId = scanLog[0]?.id ?? here[here.length - 1]?.id;
    const last = lastId ? studentsById.value.get(lastId) : null;
    const sz = pjSize.value;
    const cols = sz === 1 && students.length <= 36 ? 6 : 8; // standard size: number + nickname, 6 columns up to 36 children; bigger: numbers only, 8 columns
    const showNick = sz === 1 && !pjHideNames.value;
    const pct = students.length ? Math.min(100, Math.round((here.length * 100) / students.length)) : 0;
    return (
      <>
        {askNode}
        <ProjectorShell page="attendance">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:end">
            <div class="stat">มาแล้ว {here.length} จาก {students.length} คน</div>
            <div style="min-width:0;text-align:right">
              {last
                ? <div class="big" style="font-size:calc(var(--pj-u)*36)"><span class="okmark"><Icon name="check" size={40} />{pjHideNames.value ? `เลขที่ ${last.number ?? "-"}` : `น้อง${shortName(last)}`} มาแล้ว</span></div>
                : <div class="big" style="font-size:calc(var(--pj-u)*36);color:var(--pj-t2)">รอสแกน…</div>}
            </div>
          </div>
          <div class="pbar" aria-hidden="true"><div style={`width:${pct}%`} /></div>
          <div class="seatp" role="group" aria-label="ผังเลขที่" style={`grid-template-columns:repeat(${cols},minmax(0,1fr))`}>
            {students.map((st) => { const x = statusOf(st.id); const d = x === "present" || x === "late"; return <div class={d ? "d" : ""}>{d ? <>{st.number ?? "-"}{showNick && <small>{shortName(st)}</small>}</> : (st.number ?? "-")}</div>; })}
          </div>
        </ProjectorShell>
      </>
    );
  }

  // ---- cards: above the children (week, summary) and beside them (last scans, to do, away), in the teacher's order ----
  const periodTime = scoped ? periodTimes()[String(period)] : undefined;
  const topCards = byRank((["week", "sum"] as const).filter((k) => showCard(k) && !(k === "week" && scoped)));
  const sideCards = byRank((["scans", "todo", "away"] as const).filter((k) => showCard(k)));

  const weekCard = (
    <div class="att-week" role="group" aria-label="สัปดาห์นี้">
      {days.map((d) => {
        // the day on screen uses live counts; the others use the saved tally
        const wc = week.find((x) => x.classId === classId && x.date === d);
        const dm = d === date ? { marked, present: counts[0] + counts[1], absent: counts[4] } : { marked: wc?.marked ?? 0, present: (wc?.present ?? 0) + (wc?.late ?? 0), absent: wc?.absent ?? 0 };
        const p = attendanceProgress(dm.marked, students.length);
        const isToday = d === todayBkk();
        const future = d > todayBkk();
        const outside = !!yearStart && d < yearStart;
        const text = outside ? "ก่อนเปิดปี" : future ? "ยังไม่ถึง" : p === "complete" ? `มา ${dm.present} · ขาด ${dm.absent}` : p === "partial" ? `เช็ค ${dm.marked}/${students.length}` : "ยังไม่เช็ค";
        return (
          <button class={d === date ? "on" : ""} aria-pressed={d === date} onClick={() => setDate(d)} disabled={outside || future} aria-label={`${TH_DOW_FULL[dowOf(d)]} ${dayMonth(d)} ${text}`}>
            <div class={"wd" + (isToday ? " today" : "")}>
              <span>{TH_DOW[dowOf(d)]} {Number(d.slice(8))}</span>
              {p === "complete" ? <Icon name="circle-check" size={16} style="color:var(--text-success)" />
                : p === "partial" ? <Icon name="circle-half-2" size={16} style="color:var(--text-warning)" />
                : future || outside ? null : <Icon name="clock" size={16} style="color:var(--text-secondary)" />}
            </div>
            <div class="ws">{text}</div>
          </button>
        );
      })}
    </div>
  );

  const sumCard = (
    <section class="card att-card att-sum" aria-labelledby="att-sum-h">
      <div class="att-sum-top">
        <h2 class="att-h" id="att-sum-h">
          {marked === 0 ? `ยังไม่ได้เช็คชื่อ · ${students.length} คน` : <>มาเรียน {counts[0] + counts[1]} จาก {students.length} คน {presentPct != null ? <span class="att-pct" title="คิดจากคนที่เช็คแล้ว ตามนิยามเปอร์เซ็นต์มาเรียนของระบบ">({presentPct}% ของที่เช็คแล้ว)</span> : null}</>}
        </h2>
        <span class="att-tip">{[unmarked > 0 && `ยังไม่เช็ค ${unmarked} คน`, heldN > 0 && `ต้องตรวจสอบ ${heldN} คน`].filter(Boolean).join(" · ") || "ครบทุกคนแล้ว"}</span>
      </div>
      <StackBar segments={STATUSES.map((s, i) => ({ value: counts[i], color: STACK_COLOR[s] }))} />
      {offline && <div class="att-offnote"><Icon name="cloud-off" size={14} /> ออฟไลน์ — แสดงเฉพาะที่แตะไว้ในเครื่องนี้ ระบบจะส่งและตรวจกับข้อมูลในระบบให้เมื่อต่อเน็ตได้</div>}
      <div class="att-legend">
        {STATUSES.map((s, i) => <span class={s}><Icon name={ST_ICON[s]} size={14} /> {LABELS[s]} {counts[i]}</span>)}
        {heldN > 0 && <span class="held"><Icon name="alert-triangle" size={14} /> ต้องตรวจสอบ {heldN}</span>}
        {unmarked > 0 && <span class="none"><Icon name="circle-dashed" size={14} /> ยังไม่เช็ค {unmarked}</span>}
      </div>
    </section>
  );

  const sideNode = (k: "scans" | "todo" | "away") => {
    if (k === "scans") {
      if (method !== "scan" || scanLog.length === 0) return null;
      return (
        <section class="card att-card" aria-labelledby="att-scans-h">
          <h2 class="att-h" id="att-scans-h"><Icon name="qrcode" size={20} /> สแกนล่าสุด</h2>
          {scanLog.slice(0, 5).map((r) => { const st = studentsById.value.get(r.id); return (
            <div class="att-rrow att-scanrow">
              <span class="att-no">{st?.number ?? "-"}</span>
              <span class="nm">{st ? shortName(st) : r.id}</span>
              <span class={"att-badge " + (r.late ? "late" : "present")}><Icon name={r.late ? "clock" : "check"} size={14} /> {r.late ? "สาย" : "มา"}</span>
              <span class="att-tip">{formatThaiTimeMs(r.at)}</span>
            </div>
          ); })}
        </section>
      );
    }
    if (k === "todo") {
      const todo = students.filter((st) => !statusOf(st.id) && !heldIds.has(st.id));
      return (
        <section class="card att-card" aria-labelledby="att-todo-h">
          <h2 class="att-h" id="att-todo-h"><Icon name="user-off" size={20} /> ใครยังไม่เช็ค {todo.length} คน</h2>
          {todo.length === 0 ? <div class="att-tip" style="color:var(--text-success);margin-top:4px">เช็คครบทุกคนแล้ว</div> : (
            <div class="att-numchips">
              {todo.map((st) => (
                <button class="att-numchip" aria-label={`ไปที่เลขที่ ${st.number ?? "-"} ${shortName(st)}`} title={shortName(st)}
                  onClick={() => { document.getElementById("att-t-" + st.id)?.scrollIntoView?.({ block: "center" }); flash(st.id); }}>{st.number ?? "-"}</button>
              ))}
            </div>
          )}
        </section>
      );
    }
    const away = students.filter((st) => { const x = statusOf(st.id); return x === "absent" || x === "leave" || x === "sick"; });
    return (
      <section class="card att-card" aria-labelledby="att-away-h">
        <h2 class="att-h" id="att-away-h"><Icon name="user-x" size={20} /> ขาดวันนี้</h2>
        {away.length === 0 ? <div class="att-tip" style="margin-top:4px">ไม่มีใครขาด ลา หรือป่วย</div>
          : away.map((st) => { const x = statusOf(st.id)!; return (
            <div class="att-rrow">
              <span class="att-no">{st.number ?? "-"}</span>
              <a class="nm" href={`#/students?class=${encodeURIComponent(classId)}&student=${encodeURIComponent(st.id)}`} style="color:inherit;text-decoration:none">{fullName(st)}</a>
              <span class={"att-badge " + BADGE_TONE[x]}><Icon name={ST_ICON[x]} size={14} /> {LABELS[x]}</span>
            </div>
          ); })}
      </section>
    );
  };
  const sideNodes = sideCards.map((k) => sideNode(k)).filter(Boolean);
  const hasAside = method === "scan" || sideNodes.length > 0;

  return (
    <div>
      <PageHeader icon="user-check" title="เช็คชื่อ"
        sub={<span>{className} · {TH_DOW_FULL[dowOf(date)]} {dayMonth(date)}</span>}
        actions={<><button class="ghost" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={18} /> <span class="att-hide-sm">ปรับการ์ด</span></button><ProjectorButton /></>}
      />
      {askNode}
      {prefsOpen && <PageCardSettings page="attendance" title="หน้าเช็คชื่อ" layout={layout} meta={ATT_CARD_META} locked={ATT_LOCKED} onClose={() => setPrefsOpen(false)} />}

      <div class="att-toolbar">
        <ClassChips items={classItems} value={classId} onPick={changeClass} />
        <div class="att-datenav">
          <button class="icon" aria-label="วันก่อนหน้า" onClick={() => setDate(addDays(date, -1))} disabled={!!yearStart && date <= yearStart}><Icon name="chevron-left" size={20} /></button>
          <button class="att-today" onClick={() => setDate(todayBkk())}><Icon name="calendar" size={20} /> {date === todayBkk() ? "วันนี้ · " : ""}{TH_DOW[dowOf(date)]} {dayMonth(date)}</button>
          <button class="icon" aria-label="วันถัดไป" onClick={() => setDate(addDays(date, 1))} disabled={date >= todayBkk()}><Icon name="chevron-right" size={20} /></button>
        </div>
        <Segmented value={method} onChange={setMethod} label="วิธีเช็คชื่อ" options={[
          { value: "tap", label: <><Icon name="hand-finger" size={18} /> แตะเลือก</> },
          { value: "scan", label: <><Icon name="qrcode" size={18} /> สแกน QR</> },
        ]} />
        <Segmented value={scoped ? "scoped" : "daily"} onChange={(v) => setScoped(v === "scoped")} label="รายวันหรือรายคาบ" options={[{ value: "daily", label: "รายวัน" }, { value: "scoped", label: "รายคาบ" }]} />
      </div>

      {scoped && (
        <div class="att-periods" role="group" aria-label="เลือกคาบ">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => <button class={"pill" + (p === period ? " on" : "")} aria-pressed={p === period} onClick={() => setPeriod(p)}>คาบ {p}</button>)}
          <select aria-label="วิชาเช็คชื่อ" value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)}>
            {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
          </select>
          {periodTime && <span class="att-tip">คาบ {period} เริ่ม {periodTime}</span>}
        </div>
      )}
      {scoped && !periodTime && (
        <div class="att-warn" role="status">
          <Icon name="alert-triangle" size={20} />
          <div class="grow"><b>คาบ {period} ยังไม่ได้ตั้งเวลาเริ่ม</b> — สแกนแล้วจะแยก “มา / สาย” ไม่ได้ (แตะเลือกยังใช้ได้)</div>
          <button onClick={() => navigate("/settings", { section: "time" })}><Icon name="clock" size={18} /> ตั้งเวลาคาบ</button>
        </div>
      )}

      {beforeYear && (
        <div class="att-warn" style="background:var(--bg-danger);color:var(--text-danger);border-color:var(--border-danger)" role="alert"><Icon name="alert-triangle" size={20} /> <div class="grow">วันที่ {formatThaiDate(date)} อยู่ก่อนวันเปิดปีการศึกษาปัจจุบัน ({formatThaiDate(yearStart)}) — เช็คชื่อก่อนวันนั้นไม่ได้ (ข้อมูลปีก่อนดูได้ที่หน้ารายงาน)</div></div>
      )}

      {conflicts.length > 0 && (
        <section class="card att-card att-alert" role="region" aria-labelledby="att-cf-h">
          <h2 class="att-h" id="att-cf-h"><Icon name="alert-triangle" size={20} /> ข้อมูลชนกับอีกเครื่อง {conflicts.length} รายการ</h2>
          {conflicts.map((c) => { const st = studentsById.value.get(c.studentId); return (
            <div class="att-rrow">
              <div class="nm">{st ? fullName(st) : c.studentId}
                <small>เครื่องนี้: {statusLabel(draft?.rows[c.studentId]?.status ?? c.draft.status)} · ในระบบ: {statusLabel(c.server.status)}{c.server.deviceName ? ` (${c.server.deviceName})` : ""}</small>
              </div>
              <button onClick={() => pick(c, "server")}>ใช้ของระบบ</button>
              <button class="primary" onClick={() => pick(c, "draft")}>ใช้ของเครื่องนี้</button>
            </div>
          ); })}
        </section>
      )}

      {review.length > 0 && (
        <section class="card att-card att-alert" role="region" aria-labelledby="att-rv-h">
          <h2 class="att-h" id="att-rv-h"><Icon name="alert-triangle" size={20} /> ต้องตรวจสอบ {review.length} รายการ — ยังไม่ได้ส่ง ไม่ถูกลบ</h2>
          {review.map((r) => { const st = studentsById.value.get(r.studentId); return (
            <div class="att-rrow">
              <div class="nm">{st ? fullName(st) : r.studentId} · <b style="font-weight:500">{statusLabel(r.status)}</b>
                <small>{REVIEW_REASON[r.reason] ?? r.reason}</small>
              </div>
              <button onClick={() => resend(r)}>ส่งใหม่</button>
              <button class="ghost" onClick={() => discard(r)}>ทิ้ง</button>
            </div>
          ); })}
        </section>
      )}

      {elsewhere.length > 0 && (
        <section class="card att-card att-alert" role="region" aria-labelledby="att-el-h">
          <h2 class="att-h" id="att-el-h"><Icon name="clock" size={20} /> มีเช็คชื่อที่ยังไม่ได้ส่งในที่อื่น</h2>
          {elsewhere.map((d) => (
            <div class="att-rrow">
              <div class="nm">
                {activeClasses.value.find((c) => c.id === d.ctx.classId)?.name ?? d.ctx.classId} · {dayMonth(d.ctx.date)}{d.ctx.subjectId ? ` · คาบ ${d.ctx.period ?? "-"}` : ""}
                <small>{[d.rows - d.held > 0 && `รอส่ง ${d.rows - d.held}`, d.held > 0 && `ชนกัน ${d.held}`, d.review > 0 && `ต้องตรวจสอบ ${d.review}`].filter(Boolean).join(" · ")}</small>
              </div>
              <button onClick={() => openDraft(d.ctx)}>ไปดู</button>
            </div>
          ))}
        </section>
      )}

      {topCards.map((k) => (k === "week" ? weekCard : sumCard))}

      <div class={"att-body" + (hasAside ? " two" : "")}>
        {method === "scan" && (
          <section class="card att-card att-scancard att-scan" aria-labelledby="att-qr-h">
            <h2 class="att-h" id="att-qr-h"><Icon name="qrcode" size={20} /> ยิง QR เพื่อเช็คชื่อ</h2>
            <label class="att-scanin">
              <Icon name="scan" size={24} />
              <input ref={scanRef} placeholder={`ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter${scoped ? "" : ` (หลัง ${settings.value?.late_after ?? "08:30"} = สาย)`}`} aria-label="รหัสนักเรียน"
                onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value; (e.target as HTMLInputElement).value = ""; if (v.trim()) handleScan(v); } }} />
            </label>
            <div class={"att-fb " + (scanMsg ? (scanMsg.tone === "ok" ? "" : scanMsg.tone) : "")} role="status" aria-live="polite" style={scanMsg ? "" : "background:none;color:var(--text-secondary);font-size:var(--fs-sm);font-weight:400"}>
              {scanMsg && <Icon name={scanMsg.tone === "ok" ? "check" : "alert-triangle"} size={22} />}
              <span>{scanMsg ? scanMsg.text : "ยังไม่มีใครสแกนในรอบนี้"}</span>
            </div>
            {pickFrom && (
              <div class="att-pick">
                {pickFrom.map((st) => (
                  <button onClick={() => { setPickFrom(null); markScanned(st); }}><b style="font-weight:500">{fullName(st)}</b> <span class="muted">รหัส {st.code}</span></button>
                ))}
                <button class="ghost" onClick={() => setPickFrom(null)}>ยกเลิก</button>
              </div>
            )}
          </section>
        )}

        <div class="att-main">
          <div class="att-brush">
            <span class="lbl" id="att-brush-l">เลือกสถานะ แล้วแตะชื่อเด็ก · แตะซ้ำเพื่อยกเลิกการเช็ค</span>
            <div class="att-brushrow">
              <div class="att-stbtns" role="radiogroup" aria-labelledby="att-brush-l">
                {STATUSES.map((st, i) => (
                  <button class={"stbtn " + st + (brush === st ? " on" : "")} role="radio" aria-checked={brush === st} tabIndex={brush === st ? 0 : -1}
                    ref={(el) => { brushRefs.current[i] = el; }} onClick={() => setBrush(st)} onKeyDown={(e) => brushKey(e, i)}>
                    <Icon name={ST_ICON[st]} size={24} />{LABELS[st]}
                  </button>
                ))}
              </div>
              <button class="att-allp" onClick={askMarkAll} disabled={!loaded || slow} title={!loaded ? "กำลังโหลดรายชื่อ…" : slow ? "รอโหลดข้อมูลจากระบบให้เสร็จก่อน" : undefined}><Icon name="checks" size={20} /> มาทั้งห้อง</button>
            </div>
          </div>

          {!loaded && <div class="att-note" role="status"><Icon name="loader-2" size={16} class="spin" /> กำลังโหลดรายชื่อ… (แตะตอนนี้ยังไม่ได้ รอสักครู่)</div>}
          {loaded && slow && <div class="att-note" role="status"><Icon name="cloud-off" size={16} /> เน็ตช้า — ยังโหลดข้อมูลจากระบบไม่เสร็จ แตะเช็คได้เลย ระบบจะตรวจซ้ำตอนส่ง</div>}

          <div class={"att-tiles" + (loaded ? "" : " loading")} role="group" aria-label={`รายชื่อ ${className}`} aria-busy={!loaded}>
            {students.map((st) => {
              const s = statusOf(st.id);
              const held = heldIds.has(st.id);
              const t = s === "late" ? timeOf(st.id) : undefined;
              return (
                <button id={"att-t-" + st.id} class={"att-tile " + (held ? "held " : "") + (s ?? "") + (hit === st.id ? " hit" : "")} onClick={() => tap(st.id)} title={fullName(st)} aria-label={`เลขที่ ${st.number} ${fullName(st)} ${held ? "รอเลือกข้อมูล" : s ? LABELS[s] : "ยังไม่เช็ค"}`}>
                  <span class="no">{st.number ?? "-"}</span>
                  <span class="tx"><span class="nm">{shortName(st)}</span>
                    <span class="stt">{held ? <><Icon name="alert-triangle" size={16} /> รอเลือก</> : s ? <><Icon name={ST_ICON[s]} size={16} /> {LABELS[s]}{t ? ` ${formatThaiTimeMs(t)}` : ""}</> : "แตะเพื่อเช็ค"}</span></span>
                </button>
              );
            })}
          </div>
        </div>

        <div class="att-cards">{sideNodes}</div>
      </div>

      <div class={"att-savebar" + (failedCount.value > 0 ? " has-fab" : "")}>
        <span role="status" aria-live="polite"><SaveBadge busy={!!sync?.busy} pending={pending} review={review.length} conflicts={conflicts.length} error={draft?.error} retrying={(sync?.tries ?? 0) > 0} offline={offline} loaded={loaded} savedAt={savedAt} onRetry={() => retryDraft(key)} /></span>
        <span class="att-hint">แตะแล้วบันทึกเอง ไม่ต้องกดบันทึก</span>
        <span class="att-count">เช็คแล้ว {marked}/{students.length}</span>
      </div>
    </div>
  );
}

const CHIP_OK = "background:var(--bg-success);color:var(--text-success)";
const CHIP_WARN = "background:var(--bg-warning);color:var(--text-warning)";
const CHIP_BAD = "background:var(--bg-danger);color:var(--text-danger)";
const CHIP_NEUTRAL = "background:var(--surface-1);color:var(--text-secondary)";
const CHIP_BTN = ";border:none;cursor:pointer;font:inherit";

// Says what is really true about THIS context: on the server, waiting on this device, or stuck.
function SaveBadge(p: {
  busy: boolean; pending: number; review: number; conflicts: number; error?: string;
  retrying: boolean; offline: boolean; loaded: boolean; savedAt: number | null; onRetry: () => void;
}) {
  if (p.review > 0) return <span class="chip" style={CHIP_WARN}><Icon name="alert-triangle" size={13} /> ต้องตรวจสอบ {p.review}</span>;
  if (p.conflicts > 0) return <span class="chip" style={CHIP_WARN}><Icon name="alert-triangle" size={13} /> ข้อมูลชนกัน {p.conflicts}</span>;
  if (p.error) return <button class="chip" style={CHIP_BAD + CHIP_BTN} onClick={p.onRetry}><Icon name="cloud-off" size={13} /> บันทึกไม่สำเร็จ · ลองอีกครั้ง</button>;
  if (p.busy) return <span class="chip" style={CHIP_NEUTRAL}><Icon name="loader-2" size={13} class="spin" /> กำลังบันทึก</span>;
  if (p.pending > 0) {
    return p.retrying || p.offline
      ? <button class="chip" style={CHIP_BAD + CHIP_BTN} onClick={p.onRetry}><Icon name="cloud-off" size={13} /> ยังไม่ได้ส่ง {p.pending} · ลองใหม่</button>
      : <span class="chip" style={CHIP_NEUTRAL}><Icon name="cloud-upload" size={13} /> รอส่ง {p.pending}</span>;
  }
  if (!p.loaded) return null;
  if (p.offline) return <span class="chip" style={CHIP_WARN}><Icon name="cloud-off" size={13} /> ออฟไลน์ · เก็บในเครื่อง</span>;
  return <span class="chip" style={CHIP_OK}><Icon name="cloud-check" size={13} /> บันทึกแล้ว{p.savedAt ? ` ${formatThaiTimeMs(p.savedAt)}` : ""}</span>;
}
