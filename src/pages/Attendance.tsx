import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/attend.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented, StackBar } from "../components/ui";
import { activeClasses, activeSubjects, studentsByClass, settings, studentsById, revokedTokens, schoolYearStart, students as allStudents } from "../store";
import type { AttendanceStatus, AttendanceDay, Student } from "@shared/types";
import { api } from "../lib/api";
import { buildIndex, resolveScan } from "@shared/scan";
import { nextStatus } from "@shared/attendance";
import { attendanceProgress } from "@shared/metrics";
import { installHidScanner } from "../lib/hid";
import { fullName, shortName } from "../lib/names";
import { formatThaiDate } from "../lib/dates";
import { draftGet, type AttDraft, type AttConflict, type AttReviewRow } from "../lib/idb";
import {
  draftEdit, resolveConflict, retryDraft, flushDraft, requestFlush, onAttEvent, attSync, ctxKey,
  reviewResend, reviewDiscard, attDrafts, refreshAttDraftCount,
  type AttCtx, type AttMethod,
} from "../lib/attSync";
import { err, notify } from "../lib/notify";
import { beep } from "../lib/sound";

const STATUSES: AttendanceStatus[] = ["present", "late", "leave", "sick", "absent"];
const LABELS: Record<AttendanceStatus, string> = { present: "มา", late: "สาย", leave: "ลา", sick: "ป่วย", absent: "ขาด" };
const DOT: Record<AttendanceStatus, string> = {
  present: "var(--fill-success)", late: "var(--fill-warning)", leave: "var(--fill-accent)", sick: "var(--fill-purple)", absent: "var(--fill-danger)",
};
const REVIEW_REASON: Record<string, string> = {
  not_in_class: "นักเรียนคนนี้ไม่ได้อยู่ห้องนี้แล้ว (ย้ายห้องหรือออก)",
  epoch_changed: "แตะไว้ก่อนที่ข้อมูลจะถูกกู้คืนจากไฟล์สำรอง",
  before_school_year: "วันที่นี้อยู่ก่อนวันเปิดปีการศึกษาปัจจุบัน — เช็กชื่อก่อนวันนั้นแก้ไม่ได้",
};
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function todayBkk(): string { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function nowMinutesBkk(): number { const d = new Date(Date.now() + 7 * 3600 * 1000); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
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

export function AttendancePage() {
  const [classId, setClassId] = useState(activeClasses.value[0]?.id ?? "");
  const [date, setDate] = useState(todayBkk());
  // last year's attendance can be read (reports, Excel) but not written once a new school year has started
  const yearStart = schoolYearStart.value;
  const beforeYear = !!yearStart && date < yearStart;
  const [scoped, setScoped] = useState(false);
  const [subjectId, setSubjectId] = useState(activeSubjects.value[0]?.id ?? "");
  const [period, setPeriod] = useState(1);
  const [method, setMethod] = useState<"tap" | "scan">("tap");
  const [brush, setBrush] = useState<AttendanceStatus | "cycle">("cycle");
  // what the server holds for THIS context, and what's still waiting on this device (the draft)
  const [server, setServer] = useState<Map<string, { status: AttendanceStatus; updatedAt: number }>>(new Map());
  const [draft, setDraft] = useState<AttDraft | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [scanLog, setScanLog] = useState<{ id: string; late: boolean; at: number }[]>([]);
  const [week, setWeek] = useState<AttendanceDay[]>([]);
  const [savedTick, setSavedTick] = useState(0);
  const [hit, setHit] = useState<string | null>(null);
  const [pickFrom, setPickFrom] = useState<Student[] | null>(null);

  const students = studentsByClass.value.get(classId) ?? [];
  const ctx: AttCtx = { date, classId, subjectId: scoped ? subjectId : null, period: scoped ? period : null };
  const key = ctxKey(ctx);

  // Handlers run long after the render that made them (HID listener, timers), so
  // they read the current context and server view through refs, never a closure.
  const keyRef = useRef(key);
  keyRef.current = key;
  const serverRef = useRef(server);
  serverRef.current = server;
  const loadSeq = useRef(0);

  const statusOf = (sid: string): AttendanceStatus | undefined =>
    (draft?.rows[sid]?.status as AttendanceStatus | undefined) ?? server.get(sid)?.status;

  async function load() {
    if (!classId) return;
    const seq = ++loadSeq.current;
    const myKey = key;
    setLoaded(false); setOffline(false); setServer(new Map()); setScanLog([]);
    const local = await draftGet(myKey); // instant and works offline
    if (seq !== loadSeq.current) return;
    setDraft(local);

    const q = new URLSearchParams({ date, class: classId });
    if (scoped) { q.set("subject", subjectId); q.set("period", String(period)); }
    try {
      const res = await api.get<{ rows: any[] }>(`/api/attendance?${q}`);
      if (seq !== loadSeq.current) return; // the teacher already moved on: this answer belongs to another context
      setServer(new Map(res.rows.map((r) => [r.student_id, { status: r.status as AttendanceStatus, updatedAt: r.updated_at }])));
    } catch {
      if (seq !== loadSeq.current) return;
      setOffline(true); // show the draft from this device; new taps are checked against the server when they send
    }
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
      setServer((prev) => {
        const m = new Map(prev);
        for (const [sid, status] of Object.entries(e.acked)) m.set(sid, { status, updatedAt: e.versions[sid] ?? e.updatedAt });
        return m;
      });
      // another device edited these students AFTER this one's tap: the screen now shows the system's value — say so
      if (e.changedByOthers.length > 0) {
        const names = e.changedByOthers.map((sid) => studentsById.value.get(sid)).filter((x): x is NonNullable<typeof x> => !!x).map((st) => fullName(st));
        notify("info", `อีกเครื่องแก้ ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` และอีก ${names.length - 3} คน` : ""} ไว้ใหม่กว่า — แสดงตามที่ระบบเก็บ`);
      }
    }
    draftGet(e.key).then((d) => { if (e.key === keyRef.current) setDraft(d); });
  }), []);

  async function loadWeek() {
    const days = weekDays(date);
    try {
      // all classes, so the class chips can show today's "checked?" mark
      const res = await api.get<{ days: AttendanceDay[] }>(`/api/attendance/days?from=${days[0]}&to=${days[4]}`);
      setWeek(res.days);
    } catch { setWeek([]); }
  }
  useEffect(() => { loadWeek(); }, [date, savedTick]);

  // Record taps in the draft (durable, keyed by their own context), then let the sender pick them up.
  async function applyEdits(edits: { sid: string; status: AttendanceStatus }[], how: AttMethod): Promise<boolean> {
    if (beforeYear) { beep.err(); err("วันที่นี้อยู่ก่อนวันเปิดปีการศึกษาปัจจุบัน — เช็กชื่อไม่ได้"); return false; }
    const at = ctx;
    try {
      const d = await draftEdit(at, edits.map((e) => ({
        studentId: e.sid, status: e.status, method: how,
        baseUpdatedAt: serverRef.current.get(e.sid)?.updatedAt ?? null,
      })));
      if (ctxKey(at) === keyRef.current) setDraft(d);
      requestFlush(ctxKey(at));
      return true;
    } catch {
      // the device couldn't store it — say so instead of pretending it's saved
      beep.err();
      err("บันทึกลงเครื่องไม่ได้ ลองอีกครั้ง");
      return false;
    }
  }
  function tap(studentId: string) {
    if (!loaded) return; // wait until we know what the server already holds
    void applyEdits([{ sid: studentId, status: brush === "cycle" ? nextStatus(statusOf(studentId)) : brush }], "grid");
  }
  function markAllPresent() {
    if (!loaded) return;
    const todo = students.filter((st) => statusOf(st.id) !== "present").map((st) => ({ sid: st.id, status: "present" as AttendanceStatus }));
    if (todo.length) void applyEdits(todo, "bulk");
  }

  async function pick(c: AttConflict, side: "server" | "draft") {
    if (side === "server") setServer((prev) => new Map(prev).set(c.studentId, { status: c.server.status as AttendanceStatus, updatedAt: c.server.updatedAt }));
    const d = await resolveConflict(key, c.studentId, side);
    if (key === keyRef.current) setDraft(d);
  }

  function handleScan(raw: string) {
    const idx = buildIndex(allStudents.value, revokedTokens.value, classId);
    const r = resolveScan(raw, idx, { allowStudentCode: settings.value?.accept_student_code_scan ?? false });
    if (r.kind === "ambiguous") {
      // two students share this number — never pick one for the teacher
      const list = (r.candidateIds ?? []).map((id) => studentsById.value.get(id)).filter((x): x is Student => !!x);
      beep.err();
      setPickFrom(list);
      setScanMsg(`เลขที่ ${r.raw} มี ${list.length} คน — เลือกคนที่ถูกต้อง (ยังไม่ได้บันทึกใคร)`);
      return;
    }
    setPickFrom(null);
    if (r.kind !== "student" && r.kind !== "number") { beep.err(); setScanMsg(`ไม่พบ ${raw.slice(0, 16)}`); return; }
    const st = studentsById.value.get(r.studentId!);
    if (!st) { beep.err(); setScanMsg("ไม่พบนักเรียน"); return; }
    markScanned(st);
  }

  function markScanned(st: Student) {
    if (st.class_id !== classId) { beep.err(); setScanMsg("ไม่ได้อยู่ในห้องนี้"); return; }
    const threshold = lateThreshold(scoped, period);
    if (scoped && threshold === null) { beep.err(); setScanMsg("คาบนี้ยังไม่ได้ตั้งเวลา — ตั้งในหน้าตั้งค่าก่อน หรือแตะเลือกแทน"); return; }
    const late = date === todayBkk() && threshold !== null && nowMinutesBkk() > threshold;
    void applyEdits([{ sid: st.id, status: late ? "late" : "present" }], "hid").then((saved) => {
      if (!saved) return;
      beep.ok();
      setHit(st.id); setTimeout(() => setHit(null), 1200);
      setScanLog((l) => [{ id: st.id, late, at: Date.now() }, ...l].slice(0, 20));
      setScanMsg(`${fullName(st)} · ${late ? "สาย" : "มา"}`);
    });
  }

  useEffect(() => { if (method !== "scan") return; return installHidScanner(handleScan); }, [method, classId, date, scoped, subjectId, period]);

  // taps set aside for the teacher, and unsent taps sitting in OTHER days/rooms
  const review: AttReviewRow[] = draft?.review ?? [];
  const elsewhere = attDrafts.value.filter((d) => d.key !== key);
  async function resend(r: AttReviewRow) { const d = await reviewResend(key, r.studentId); if (key === keyRef.current) setDraft(d); }
  async function discard(r: AttReviewRow) { const d = await reviewDiscard(key, r.studentId); if (key === keyRef.current) setDraft(d); }
  function openDraft(c: AttCtx) {
    setClassId(c.classId); setDate(c.date);
    setScoped(!!c.subjectId);
    if (c.subjectId) { setSubjectId(c.subjectId); setPeriod(c.period ?? 1); }
  }

  const conflicts = draft?.conflicts ?? [];
  const pending = Object.keys(draft?.rows ?? {}).length;
  const sync = attSync.value[key];

  const counts = STATUSES.map((s) => students.filter((st) => statusOf(st.id) === s).length);
  const marked = counts.reduce((a, b) => a + b, 0);
  const unmarked = students.length - marked;
  const days = weekDays(date);
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

  return (
    <div>
      <PageHeader icon="user-check" title="เช็คชื่อ"
        sub={<><span>{activeClasses.value.find((c) => c.id === classId)?.name} · {formatThaiDate(date)}</span><SaveBadge busy={!!sync?.busy} pending={pending} review={review.length} conflicts={conflicts.length} error={draft?.error} retrying={(sync?.tries ?? 0) > 0} offline={offline} loaded={loaded} onRetry={() => retryDraft(key)} /></>}
        actions={<Segmented value={method} onChange={setMethod} options={[
          { value: "tap", label: <><Icon name="hand-finger" size={15} /> แตะเลือก</> },
          { value: "scan", label: <><Icon name="qrcode" size={15} /> สแกน QR</> },
        ]} />}
      />

      <div class="att-toolbar">
        <ClassChips items={classItems} value={classId} onPick={setClassId} />
        <span class="grow" />
        <div class="att-datenav">
          <button class="icon" aria-label="วันก่อน" onClick={() => setDate(addDays(date, -1))} disabled={!!yearStart && date <= yearStart}><Icon name="chevron-left" size={16} /></button>
          <button onClick={() => setDate(todayBkk())}><Icon name="calendar" size={15} /> {date === todayBkk() ? "วันนี้" : formatThaiDate(date).replace(/ \d{4}$/, "")}</button>
          <button class="icon" aria-label="วันถัดไป" onClick={() => setDate(addDays(date, 1))} disabled={date >= todayBkk()}><Icon name="chevron-right" size={16} /></button>
        </div>
        <Segmented value={scoped ? "scoped" : "daily"} onChange={(v) => setScoped(v === "scoped")} options={[{ value: "daily", label: "รายวัน" }, { value: "scoped", label: "รายคาบ" }]} />
        {scoped && (<>
          <select value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)} style="width:auto;height:30px">
            {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
          </select>
          <select value={period} onInput={(e) => setPeriod(Number((e.target as HTMLSelectElement).value))} style="width:auto;height:30px">
            {[1,2,3,4,5,6,7].map((p) => <option value={p}>คาบ {p}</option>)}
          </select>
        </>)}
      </div>

      {!scoped && (
        <div class="att-week">
          {days.map((d) => {
            // the day on screen uses live counts; the others use the saved tally
            const wc = week.find((x) => x.classId === classId && x.date === d);
            const dm = d === date ? { marked, present: counts[0] + counts[1], absent: counts[4] } : { marked: wc?.marked ?? 0, present: (wc?.present ?? 0) + (wc?.late ?? 0), absent: wc?.absent ?? 0 };
            const p = attendanceProgress(dm.marked, students.length);
            const isToday = d === todayBkk();
            const future = d > todayBkk();
            const outside = !!yearStart && d < yearStart;
            return (
              <button class={d === date ? "on" : ""} onClick={() => setDate(d)} disabled={outside}>
                <div class={"wd" + (isToday ? " today" : "")}>
                  <span>{TH_DOW[new Date(d + "T00:00:00Z").getUTCDay()]} {Number(d.slice(8))}</span>
                  {p === "complete" ? <Icon name="circle-check" size={13} style="color:var(--text-success)" />
                    : p === "partial" ? <Icon name="circle-half-2" size={13} style="color:var(--text-warning)" />
                    : future ? null : <span style="width:7px;height:7px;border-radius:50%;background:var(--fill-warning)" />}
                </div>
                <div class="ws" style="color:var(--text-secondary)">{outside ? "ก่อนเปิดปี" : future ? "ยังไม่ถึง" : p === "complete" ? `มา ${dm.present} · ขาด ${dm.absent}` : p === "partial" ? `เช็ค ${dm.marked}/${students.length}` : "ยังไม่เช็ค"}</div>
              </button>
            );
          })}
        </div>
      )}

      <div class="card att-sum">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <span style="font-weight:500">มาเรียน {counts[0] + counts[1]} จาก {students.length} คน {marked ? <span class="muted" style="font-weight:400">({Math.round(((counts[0] + counts[1]) / (marked || 1)) * 100)}%)</span> : null}</span>
          <span class="page-sub">{unmarked > 0 ? `ยังไม่เช็ค ${unmarked} คน` : "ครบทุกคนแล้ว"}</span>
        </div>
        <StackBar segments={STATUSES.map((s, i) => ({ value: counts[i], color: DOT[s] }))} />
        {offline && <div class="att-offnote"><Icon name="cloud-off" size={14} /> ออฟไลน์ — แสดงเฉพาะที่แตะไว้ในเครื่องนี้ ระบบจะส่งและตรวจกับข้อมูลในระบบให้เมื่อต่อเน็ตได้</div>}
        <div class="att-legend">
          {STATUSES.map((s, i) => <span><span class="dot" style={`background:${DOT[s]}`} />{LABELS[s]} {counts[i]}</span>)}
          {unmarked > 0 && <span class="muted"><span class="dot" style="border:1px dashed var(--text-secondary)" />ยังไม่เช็ค {unmarked}</span>}
        </div>
      </div>

      {beforeYear && (
        <div class="imp-warn danger" style="margin:0 0 10px" role="alert"><Icon name="alert-triangle" size={15} /> วันที่ {formatThaiDate(date)} อยู่ก่อนวันเปิดปีการศึกษาปัจจุบัน ({formatThaiDate(yearStart)}) — เช็กชื่อก่อนวันนั้นไม่ได้ (ข้อมูลปีก่อนดูได้ที่หน้ารายงาน)</div>
      )}

      {method === "scan" && (
        <div class="card" style="margin-bottom:10px">
          <input autofocus placeholder="ยิง QR เพื่อเช็คชื่อ (สแกนหลังเวลาที่ตั้ง = สาย)" aria-label="รหัสนักเรียน"
            onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value; (e.target as HTMLInputElement).value = ""; if (v.trim()) handleScan(v); } }} />
          {scanMsg && <div class="page-sub" role="status" style="margin-top:6px">{scanMsg}</div>}
          {pickFrom && (
            <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
              {pickFrom.map((st) => (
                <button onClick={() => { setPickFrom(null); markScanned(st); }}><b style="font-weight:500">{fullName(st)}</b> <span class="muted">รหัส {st.code}</span></button>
              ))}
              <button class="ghost" onClick={() => setPickFrom(null)}>ยกเลิก</button>
            </div>
          )}
          {scanLog.slice(0, 5).map((r) => { const st = studentsById.value.get(r.id); return (
            <div class="att-scanrow"><Icon name="circle-check" size={16} style={r.late ? "color:var(--text-warning)" : "color:var(--text-success)"} />
              <span class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{st ? fullName(st) : r.id}</span>
              <span class="chip" style={r.late ? "background:var(--bg-warning);color:var(--text-warning)" : "background:var(--bg-success);color:var(--text-success)"}>{r.late ? "สาย" : "มา"} {new Date(r.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ); })}
        </div>
      )}

      {conflicts.length > 0 && (
        <div class="card" style="border-color:var(--border-warning);margin-bottom:10px">
          <div class="row" style="gap:6px;margin-bottom:6px;color:var(--text-warning)"><Icon name="alert-triangle" size={18} /> <span style="font-weight:500">ข้อมูลชนกับอีกเครื่อง {conflicts.length} รายการ</span></div>
          {conflicts.map((c) => { const st = studentsById.value.get(c.studentId); return (
            <div class="row" style="gap:8px;padding:8px 0;border-top:0.5px solid var(--border);flex-wrap:wrap">
              <div class="grow" style="min-width:120px">
                <div style="font-size:13px">{st ? fullName(st) : c.studentId}</div>
                <div class="page-sub">ในระบบ: {LABELS[c.server.status as AttendanceStatus]}{c.server.deviceName ? ` (${c.server.deviceName})` : ""} · ร่างนี้: {LABELS[c.draft.status as AttendanceStatus]}</div>
              </div>
              <button style="height:30px;font-size:12px" onClick={() => pick(c, "server")}>ใช้ของระบบ</button>
              <button class="primary" style="height:30px;font-size:12px" onClick={() => pick(c, "draft")}>ใช้ร่างนี้</button>
            </div>
          ); })}
        </div>
      )}

      {review.length > 0 && (
        <div class="card" style="border-color:var(--border-warning);margin-bottom:10px">
          <div class="row" style="gap:6px;margin-bottom:6px;color:var(--text-warning)"><Icon name="alert-triangle" size={18} /> <span style="font-weight:500">ต้องตรวจสอบ {review.length} รายการ — ยังไม่ได้ส่ง ไม่ถูกลบ</span></div>
          {review.map((r) => { const st = studentsById.value.get(r.studentId); return (
            <div class="row" style="gap:8px;padding:8px 0;border-top:0.5px solid var(--border);flex-wrap:wrap">
              <div class="grow" style="min-width:140px">
                <div style="font-size:13px">{st ? fullName(st) : r.studentId} · <b style="font-weight:500">{LABELS[r.status as AttendanceStatus] ?? r.status}</b></div>
                <div class="page-sub">{REVIEW_REASON[r.reason] ?? r.reason}</div>
              </div>
              <button style="height:30px;font-size:12px" onClick={() => resend(r)}>ส่งใหม่</button>
              <button class="ghost" style="height:30px;font-size:12px" onClick={() => discard(r)}>ทิ้ง</button>
            </div>
          ); })}
        </div>
      )}

      {elsewhere.length > 0 && (
        <div class="card" style="margin-bottom:10px">
          <div class="row" style="gap:6px;margin-bottom:6px"><Icon name="clock" size={18} /> <span style="font-weight:500">มีเช็คชื่อที่ยังไม่ได้ส่งในที่อื่น</span></div>
          {elsewhere.map((d) => (
            <div class="row" style="gap:8px;padding:6px 0;border-top:0.5px solid var(--border)">
              <span class="grow" style="font-size:13px">
                {activeClasses.value.find((c) => c.id === d.ctx.classId)?.name ?? d.ctx.classId} · {formatThaiDate(d.ctx.date)}{d.ctx.subjectId ? ` · คาบ ${d.ctx.period ?? "-"}` : ""}
                <span class="page-sub"> — {[d.rows - d.held > 0 && `รอส่ง ${d.rows - d.held}`, d.held > 0 && `ชนกัน ${d.held}`, d.review > 0 && `ต้องตรวจสอบ ${d.review}`].filter(Boolean).join(" · ")}</span>
              </span>
              <button style="height:28px;font-size:12px" onClick={() => openDraft(d.ctx)}>เปิด</button>
            </div>
          ))}
        </div>
      )}

      {method === "tap" && (
        <div class="att-brush">
          <span class="lbl">แตะแล้วเป็น:</span>
          <button class={"bopt" + (brush === "cycle" ? " on" : "")} onClick={() => setBrush("cycle")}><Icon name="refresh" size={14} /> วนสถานะ</button>
          {STATUSES.map((s) => <button class={"bopt" + (brush === s ? " on" : "")} onClick={() => setBrush(s)}><span class="dot" style={`background:${DOT[s]}`} />{LABELS[s]}</button>)}
          <span class="grow" />
          <button onClick={markAllPresent}><Icon name="checks" size={15} /> มาทั้งหมด</button>
        </div>
      )}

      <div class={"att-tiles" + (loaded ? "" : " loading")} aria-busy={!loaded}>
        {students.map((st) => {
          const s = statusOf(st.id);
          return (
            <button class={"att-tile " + (s ?? "") + (hit === st.id ? " hit" : "")} onClick={() => tap(st.id)} aria-label={`เลขที่ ${st.number} ${fullName(st)} ${s ? LABELS[s] : "ยังไม่เช็ค"}`}>
              <span class="no muted">เลขที่ {st.number ?? "-"}</span>
              <span class="nm">{shortName(st)}</span>
              <span class="stt">{s ? LABELS[s] : "แตะเพื่อเช็ค"}</span>
            </button>
          );
        })}
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
  retrying: boolean; offline: boolean; loaded: boolean; onRetry: () => void;
}) {
  if (p.review > 0) return <span class="chip" style={CHIP_WARN}><Icon name="alert-triangle" size={13} /> ต้องตรวจสอบ {p.review}</span>;
  if (p.conflicts > 0) return <span class="chip" style={CHIP_WARN}><Icon name="alert-triangle" size={13} /> ข้อมูลชนกัน {p.conflicts}</span>;
  if (p.error) return <button class="chip" style={CHIP_BAD + CHIP_BTN} onClick={p.onRetry}><Icon name="cloud-off" size={13} /> บันทึกไม่สำเร็จ · ลองอีกครั้ง</button>;
  if (p.busy) return <span class="chip" style={CHIP_NEUTRAL}><Icon name="loader-2" size={13} class="spin" /> กำลังบันทึก</span>;
  if (p.pending > 0) {
    return p.retrying || p.offline
      ? <button class="chip" style={CHIP_BAD + CHIP_BTN} onClick={p.onRetry}><Icon name="cloud-off" size={13} /> ยังไม่ได้ส่ง {p.pending} · ลองใหม่</button>
      : <span class="chip" style={CHIP_NEUTRAL}><Icon name="clock" size={13} /> รอบันทึก {p.pending}</span>;
  }
  if (!p.loaded) return null;
  if (p.offline) return <span class="chip" style={CHIP_WARN}><Icon name="cloud-off" size={13} /> ออฟไลน์</span>;
  return <span class="chip" style={CHIP_OK}><Icon name="cloud-check" size={13} /> บันทึกแล้ว</span>;
}
