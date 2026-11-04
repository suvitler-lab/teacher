import { useEffect, useState } from "preact/hooks";
import { Dialog } from "../Dialog";
import { Icon } from "../Icon";
import { Avatar, DateField } from "../ui";
import { CardHead } from "../home/shared";
import { PageCols, useRegionRem } from "../PageCols";
import { STUDENTS_WEIGHT } from "../cards/meta";
import { W } from "../../lib/pageColumns";
import type { ComponentChildren } from "preact";
import { activeClasses, classById, qrRotatedAt, studentsById } from "../../store";
import { studentsLayout } from "../../lib/pageCards";
import { visibleCards } from "../../lib/cardLayout";
import type { StudentsCard } from "../../lib/pageCards";
import { api } from "../../lib/api";
import { fullName } from "../../lib/names";
import { formatThaiDate, formatThaiDateMs } from "../../lib/dates";
import { attendancePercent } from "@shared/metrics";
import type { StudentReport } from "../../lib/report";
import type { Student } from "@shared/types";

// ---- sorting ---------------------------------------------------------------------------------------------------
export type StuSort = "number" | "name" | "att" | "missing" | "submit";
/** The words of the sort <select>: what comes first. */
export const SORT_LABEL: Record<StuSort, string> = { number: "เลขที่", name: "ชื่อ", missing: "ค้างมากก่อน", submit: "ส่งน้อยก่อน", att: "มาเรียนน้อยก่อน" };
export const SORT_ORDER: StuSort[] = ["number", "name", "missing", "submit", "att"];
/** The chosen order, and whether the teacher flipped it with a second tap on the column head. */
export interface StuSortState { by: StuSort; flip: boolean }
const SORT_KEY = "ngankrob-students-sort";

export function loadStuSort(): StuSortState {
  try {
    const raw = localStorage.getItem(SORT_KEY) ?? "";
    const [v, f] = raw.split(":");
    if (SORT_ORDER.includes(v as StuSort)) return { by: v as StuSort, flip: f === "r" };
  } catch { /* private window */ }
  return { by: "number", flip: false };
}
export function saveStuSort(v: StuSortState) { try { localStorage.setItem(SORT_KEY, v.by + (v.flip ? ":r" : "")); } catch { /* ignore */ } }
/** A tap on a column head: the same column flips the order, another column starts with its own natural order. */
export function nextStuSort(cur: StuSortState, by: StuSort): StuSortState { return cur.by === by ? { by, flip: !cur.flip } : { by, flip: false }; }

/**
 * Order the roster. number = by class number (those without one last) · name = Thai alphabet · att = least attendance
 * first (a child with no marks yet last) · missing = most work missing first · submit = least handed in first (no stats last).
 * Ties fall back to the class number. `flip` reverses the whole order.
 */
export function sortRoster(list: Student[], reports: Map<string, StudentReport>, by: StuSort, flip = false): Student[] {
  const num = (s: Student) => s.number ?? Number.MAX_SAFE_INTEGER;
  const att = (s: Student) => { const r = reports.get(s.id); const p = r ? attendancePercent(r.attendance) : null; return p == null ? Number.MAX_SAFE_INTEGER : p; };
  const miss = (s: Student) => reports.get(s.id)?.missing ?? 0;
  const sent = (s: Student) => reports.get(s.id)?.percent ?? Number.MAX_SAFE_INTEGER;
  const byName = (a: Student, b: Student) => fullName(a).localeCompare(fullName(b), "th");
  const out = [...list].sort((a, b) => {
    const k = by === "name" ? byName(a, b) : by === "att" ? att(a) - att(b) : by === "missing" ? miss(b) - miss(a) : by === "submit" ? sent(a) - sent(b) : 0;
    return k || num(a) - num(b) || byName(a, b);
  });
  return flip ? out.reverse() : out;
}

// ---- the cards -----------------------------------------------------------------------------------------------------
export function rotatedIn(list: Student[], rotated: Record<string, number>): Student[] {
  return list.filter((s) => rotated[s.id]);
}

/** Which children the list shows: all, only those with nothing missing, or only those with work missing. */
export type StuFilter = "all" | "done" | "missing";

interface CardsProps {
  classId: string; active: Student[]; statsReady: boolean; statsLoading: boolean; withMissing: number; avgAtt: number | null; past: boolean;
  former: Student[]; formerFailed: boolean; showFormer: boolean;
  filter: StuFilter; onFilter: (f: StuFilter) => void;
  onPrint: (scope: "all" | "rotated") => void; onEdit: (s: Student) => void; onOpen: (id: string) => void;
  onReactivate: (s: Student) => void;
}

/**
 * The cards on show, in the teacher's order — except "sum" (the class numbers), which is pinned first. "ย้ายออก/ไม่ใช้งาน" also comes up
 * when the teacher asks for it in the ⋮ menu, even while the card is switched off; the QR card is not for a past year; the numbers
 * hold their place while they load (so the list does not change width when they arrive) but not after a failed load.
 */
export function studentCardKeys(p: Pick<CardsProps, "statsReady" | "statsLoading" | "past" | "showFormer">): StudentsCard[] {
  const keys = (visibleCards(studentsLayout.value) as StudentsCard[]).filter((k) => (k === "sum" ? p.statsReady || p.statsLoading : k === "qr" ? !p.past : true));
  if (p.showFormer && !keys.includes("moved")) keys.push("moved");
  return keys.includes("sum") ? ["sum", ...keys.filter((k) => k !== "sum")] : keys;
}

/** The given cards spread over at most `max` columns (the list itself is fixed). */
export function StudentsCards({ keys, max, ...p }: CardsProps & { keys: StudentsCard[]; max: number }) {
  if (keys.length === 0) return null;
  const rotated = rotatedIn(p.active, qrRotatedAt.value);
  const done = p.active.length - p.withMissing;
  const view: Record<StudentsCard, () => preact.JSX.Element | null> = {
    sum: () => !p.statsReady ? <div class="stu-tilebox"><div class="stu-skel" aria-hidden="true" /></div> : (
      <div class="stu-tilebox"><section class="stu-tiles" aria-labelledby="sk-sum">
        <h2 id="sk-sum" class="sr-only">สรุปห้อง</h2>
        <button type="button" class="stu-tile" aria-pressed={p.filter === "done"} onClick={() => p.onFilter(p.filter === "done" ? "all" : "done")}>
          <Icon name="circle-check" size={20} class="ok" /><span class="tx"><span class="tl">ส่งงานครบ</span><span class="tv ok">{done} คน</span></span>
        </button>
        <button type="button" class="stu-tile" aria-pressed={p.filter === "missing"} disabled={p.withMissing === 0} onClick={() => p.onFilter(p.filter === "missing" ? "all" : "missing")}>
          <Icon name="alert-circle" size={20} class={p.withMissing > 0 ? "bad" : undefined} /><span class="tx"><span class="tl">มีงานค้าง</span><span class={"tv" + (p.withMissing > 0 ? " bad" : "")}>{p.withMissing} คน</span></span>
        </button>
        {p.avgAtt != null && (
          <div class="stu-tile"><Icon name="user-check" size={20} /><span class="tx"><span class="tl">มาเรียนเฉลี่ย</span><span class="tv">{p.avgAtt}%</span></span></div>
        )}
      </section></div>
    ),
    qr: () => (
      <section class="card stu-qrcard" aria-labelledby="sk-qr">
        <CardHead id="sk-qr" icon="qrcode" title="สติกเกอร์ / QR ใหม่" />
        <div class="page-sub" style="margin-bottom:6px">{rotated.length > 0 ? `QR ใหม่ใน 60 วัน (${rotated.length} คน)` : "ยังไม่มี QR ใหม่ใน 60 วัน"}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          {rotated.length > 0 && <button class="primary" onClick={() => p.onPrint("rotated")}><Icon name="printer" size={20} /> พิมพ์เฉพาะ QR ใหม่ ({rotated.length})</button>}
          <button onClick={() => p.onPrint("all")}><Icon name="printer" size={20} /> พิมพ์ทั้งห้อง</button>
        </div>
      </section>
    ),
    moved: () => (
      <section class="card stu-sidecard" aria-labelledby="sk-mv">
        <CardHead id="sk-mv" icon="user-off" title={`ย้ายออก / ไม่ใช้งาน (${p.former.length})`} />
        {p.formerFailed ? <div class="page-sub" style="color:var(--text-warning)"><Icon name="cloud-off" size={16} /> โหลดรายชื่อไม่สำเร็จ — ปิดแล้วเปิดใหม่อีกครั้ง</div>
          : p.former.length === 0 ? <div class="page-sub">ไม่มี</div> : p.former.map((st) => (
            <div class="stu-former" key={st.id}>
              <Avatar student={st} />
              <span class="grow" title={fullName(st)}>{fullName(st)} <span class="page-sub">· {st.status === "moved" ? "ย้ายออก" : "ไม่ใช้งาน"}{st.left_at ? ` ${formatThaiDate(st.left_at)}` : ""}</span></span>
              <button onClick={() => p.onEdit(st)}><Icon name="edit" size={16} /> แก้ไข</button>
              <button onClick={() => p.onReactivate(st)}><Icon name="user-check" size={16} /> กลับมาใช้งาน</button>
            </div>
          ))}
      </section>
    ),
    recent: () => <RecentStudents onOpen={p.onOpen} />,
  };
  return <PageCols keys={keys} max={max} weightOf={(k) => STUDENTS_WEIGHT[k] ?? W.M} render={(k) => view[k]()} />;
}

/** Width of the page body (rem) from which the list and the cards sit side by side (the list row needs about 34rem + the 20rem aside). */
export const STUDENT_SPLIT_REM = 54;

/**
 * The list and its cards. Wide: the list on the left, every card in a 20rem column on the right that stays on screen while the list
 * scrolls. Narrower: the numbers ("sum") above the list, the other cards in 1-2 columns below it. The width that decides it is the
 * body's own, so a bigger text size falls back to the stacked form by itself. The list is never remounted when that changes.
 */
export function StudentsBody({ list, cards, ...p }: { list: ComponentChildren; cards: boolean } & CardsProps) {
  const [ref, rem] = useRegionRem<HTMLDivElement>();
  const keys = cards ? studentCardKeys(p) : [];
  const split = keys.length > 0 && rem >= STUDENT_SPLIT_REM;
  const pin = !split && keys[0] === "sum";
  const rest = split ? keys : keys.filter((k) => k !== "sum");
  return (
    <div ref={ref} class="stu-body">
      {pin ? <div key="pin" class="stu-pin"><StudentsCards {...p} keys={["sum"]} max={1} /></div> : null}
      <div key="grid" class={"pg-split" + (split ? " sm" : "")} data-split={split ? "sm" : "stack"}>
        <div class="stu-main">{list}</div>
        {rest.length > 0 ? (
          <div class={"pg-aside" + (split ? " sticky" : "")} role={split ? "complementary" : undefined} aria-label={split ? "การ์ดข้างรายชื่อ" : undefined}>
            <StudentsCards {...p} keys={rest} max={split ? 1 : 2} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface AuditLite { id: number; at: number; action: string; student_id: string | null }
function RecentStudents({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<AuditLite[] | null>(null);
  useEffect(() => { api.get<{ rows: AuditLite[] }>("/api/audit?entity=student&limit=5").then((r) => setRows(r.rows ?? []), () => setRows([])); }, []);
  return (
    <section class="card stu-sidecard" aria-labelledby="sk-rc">
      <CardHead id="sk-rc" icon="history" title="เพิ่ม/แก้ล่าสุด" extra={<span class="page-sub">ทุกห้อง</span>} />
      {rows === null ? <div class="page-sub">กำลังโหลด…</div> : rows.length === 0 ? <div class="page-sub">ยังไม่มีรายการ</div> : rows.map((r) => (
        <button class="gc-row" key={r.id} disabled={!r.student_id} onClick={() => r.student_id && onOpen(r.student_id)}>
          <span class="grow">{r.action === "create" ? "เพิ่ม" : "แก้ข้อมูล"} {r.student_id && studentsById.value.get(r.student_id) ? fullName(studentsById.value.get(r.student_id)!) : ""}</span><span class="page-sub">{formatThaiDateMs(r.at)}</span>
        </button>
      ))}
    </section>
  );
}

// ---- move to another class ---------------------------------------------------------------------------------------------
const HISTORY_MOVE = "ย้ายไม่ได้ — มีประวัติเดิมหรือเป็นการย้ายข้ามปี เก็บนักเรียนไว้ในห้องเดิมเพื่อรักษารายงานย้อนหลัง";

export function studentBody(st: Student, over: Record<string, unknown>) {
  return { id: st.id, code: st.code, prefix: st.prefix, first_name: st.first_name, last_name: st.last_name, nickname: st.nickname, class_id: st.class_id, number: st.number, status: st.status, ...over };
}

/** Choose the class a child moves to. The server is asked first (the same check the import uses): a child with history stays. */
export function MoveStudentDialog({ student, fromClassId, onClose, onDone }: { student: Student; fromClassId: string; onClose: () => void; onDone: () => void }) {
  const others = activeClasses.value.filter((c) => c.id !== fromClassId);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [state, setState] = useState<"idle" | "checking" | "ok" | "blocked" | "error">("idle");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setErr("");
    if (!to) { setState("idle"); return; }
    let live = true;
    setState("checking");
    api.post<{ blockedMoves?: unknown[] }>("/api/students/import/preview", {
      class_id: to, students: [{ code: student.code, prefix: student.prefix ?? "", first_name: student.first_name, last_name: student.last_name, number: null }],
    }).then((r) => { if (live) setState(r.blockedMoves?.length ? "blocked" : "ok"); }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [to]);

  async function move() {
    setBusy(true); setErr("");
    try { await api.post("/api/students", studentBody(student, { class_id: to, number: null })); onDone(); }
    catch (e: any) { setErr(e?.code === "history_move_blocked" || /history/.test(String(e?.message)) ? HISTORY_MOVE : e?.message || "ย้ายห้องไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return (
    <div class="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <Dialog label={`ย้ายห้อง ${fullName(student)}`} onClose={onClose} dismissible={!busy} style="max-width:440px">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <h2 style="font-size:1.2rem">ย้ายห้อง</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose} disabled={busy}><Icon name="x" /></button>
        </div>
        <div style="font-weight:500">{fullName(student)}</div>
        <div class="page-sub" style="margin-bottom:8px">จาก {classById(fromClassId)?.name} · เลขที่เดิม {student.number ?? "-"} (ตั้งเลขที่ใหม่ในห้องปลายทางหลังย้าย)</div>
        {others.length === 0 ? <div class="imp-warn">ยังไม่มีห้องอื่นให้ย้ายไป</div> : (
          <label class="field"><span>ย้ายไปห้อง</span>
            <select aria-label="ห้องปลายทาง" value={to} onInput={(e) => setTo((e.target as HTMLSelectElement).value)}>{others.map((c) => <option value={c.id}>{c.name}</option>)}</select>
          </label>
        )}
        {state === "checking" && <div class="page-sub"><Icon name="loader-2" size={14} class="spin" /> กำลังตรวจกับข้อมูลในระบบ…</div>}
        {state === "blocked" && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={15} /> {HISTORY_MOVE}</div>}
        {state === "error" && <div class="imp-warn" role="status"><Icon name="cloud-off" size={15} /> ตรวจกับระบบไม่ได้ (ออฟไลน์) — ย้ายห้องต้องออนไลน์</div>}
        {err && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={15} /> {err}</div>}
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button class="primary" onClick={move} disabled={busy || state !== "ok" || !to}>{busy ? <Icon name="loader-2" class="spin" size={16} /> : <Icon name="arrow-right" size={16} />} ย้ายห้อง</button>
        </div>
      </Dialog>
    </div>
  );
}

// ---- moved out / no longer using the app -------------------------------------------------------------------------------
/** Take a child out of the class: moved away, or just not in use. They keep their history; the class no longer counts them. */
export function LeaveDialog({ student, onClose, onDone }: { student: Student; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<"moved" | "inactive">("moved");
  const [leftAt, setLeftAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true); setErr("");
    try { await api.post("/api/students", studentBody(student, { status, ...(leftAt ? { left_at: leftAt } : {}) })); onDone(); }
    catch (e: any) { setErr(e?.message || "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return (
    <div class="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <Dialog label={`ย้ายออก/ไม่ใช้งาน ${fullName(student)}`} onClose={onClose} dismissible={!busy} style="max-width:440px">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <h2 style="font-size:1.2rem">ย้ายออก / ไม่ใช้งาน</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose} disabled={busy}><Icon name="x" /></button>
        </div>
        <div style="font-weight:500;margin-bottom:6px">{fullName(student)}</div>
        <div class="row" style="gap:6px;margin-bottom:8px" role="group" aria-label="สถานะใหม่">
          <button aria-pressed={status === "moved"} class={status === "moved" ? "primary" : ""} onClick={() => setStatus("moved")}>ย้ายออก</button>
          <button aria-pressed={status === "inactive"} class={status === "inactive" ? "primary" : ""} onClick={() => setStatus("inactive")}>ไม่ใช้งาน</button>
        </div>
        <label class="field"><span>ออกเมื่อ (เว้นว่าง = วันนี้)</span><DateField value={leftAt} onChange={setLeftAt} label="ออกเมื่อ" /></label>
        <div class="page-sub">ประวัติคะแนนและเช็คชื่อเดิมยังอยู่ · แต่จะไม่ถูกนับในห้อง และสแกนรับงานไม่ได้ · กลับมาใช้งานได้ที่การ์ด "ย้ายออก / ไม่ใช้งาน"</div>
        {err && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={15} /> {err}</div>}
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button class="primary" onClick={save} disabled={busy}>บันทึก</button>
        </div>
      </Dialog>
    </div>
  );
}
