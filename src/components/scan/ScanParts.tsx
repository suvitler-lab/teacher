import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon";
import { DateField } from "../../components/ui";
import { useConfirm } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { assignments, studentsById } from "../../store";
import { isHalfStep } from "@shared/grade";
import { bkkToday } from "@shared/time";
import { pendingOps, failedPairKeys, pairKey, failedCount, listFailed, retryFailed, discardFailed } from "../../lib/outbox";
import type { FailedItem } from "../../lib/idb";
import { err, notify } from "../../lib/notify";
import { FAIL_REASON } from "../../lib/failReasons";
import { checkReceivedDate } from "@shared/received-date";
import { fullName, shortName } from "../../lib/names";
import { navigate } from "../../router";
import type { Session, Feedback, RecentRow, RecvMethod } from "./state";
import { serverReachable } from "../../lib/session";
import { online } from "../../lib/outbox";
import { session, recvDate, recent, feedback, pending, activeAssignment, effSub, isLateDay, lastScore, submitTypedScore, undo, focusScan, thaiDayMonth, thaiShort, timeOf } from "./state";
import { PopMenu } from "./widgets";
import { scanHiding, whoLabel } from "./hide";
import type { Student } from "@shared/types";

export function RecentCard({ s, strip, onOpen, onAll }: { s: Session; strip: boolean; onOpen: (id: string) => void; onAll: () => void }) {
  const hide = scanHiding();
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
                <button class="rchip" aria-label={`ตัวเลือก ${whoLabel(st, hide)}`} onClick={() => onOpen(r.studentId)}>
                  <span class="avatar" aria-hidden="true">{st.number ?? "-"}</span>
                  {!hide && <span class="nm">{shortName(st)}</span>}
                  <span class={"sc-chip " + (r.score != null ? "success" : "accent")}>{r.score != null ? (hide ? "ส่งแล้ว" : `${r.score}/${s.fullScore}`) : "รอคะแนน"}</span>
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

/** BR-14 / AC-65: how a hand-in came in, as an icon plus a word (never the icon alone) — a row with no known method shows neither */
export const METHOD_VIEW: Record<RecvMethod, { icon: string; word: string }> = {
  hid: { icon: "barcode", word: "เครื่องยิง" },
  camera: { icon: "camera", word: "กล้อง" },
  manual: { icon: "keyboard", word: "พิมพ์" },
};

export function RecentRow({ r, s, onOpen }: { r: RecentRow; s: Session; onOpen: (id: string) => void }) {
  const st = studentsById.value.get(r.studentId)!;
  const hide = scanHiding();
  const how = r.method ? METHOD_VIEW[r.method] : null;
  return (
    <div class="recent-row">
      <div class="avatar" aria-hidden="true">{st.number ?? "-"}</div>
      <div class="grow rr-main">
        <div class="rr-nm">{hide ? `เลขที่ ${st.number ?? "-"}` : fullName(st)}</div>
        <div class="page-sub">{timeOf(r.at)} · {r.score != null ? (hide ? "ส่งแล้ว" : `${r.score}/${s.fullScore}`) : "รอคะแนน"}{r.recv ? ` · รับ ${thaiDayMonth(r.recv)}` : ""}</div>
        {how && <div class="page-sub sc-meth" data-method={r.method}><Icon name={how.icon} size={14} /> {how.word}</div>}
      </div>
      {r.score != null
        ? <span class="sc-chip success"><Icon name="check" size={14} /> ส่งแล้ว</span>
        : <span class="sc-chip accent"><Icon name="pencil" size={14} /> รอคะแนน</span>}
      <button class="icon ghost" aria-label={`ตัวเลือก ${whoLabel(st, hide)}`} onClick={() => onOpen(r.studentId)}><Icon name="dots-vertical" size={20} /></button>
    </div>
  );
}

/** Every scan of the round (the card shows four): a tap on ⋮ goes to that child's options. */
export function RecentAllSheet({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
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
export function OptionsSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const s = session.value!;
  const st = studentsById.value.get(id);
  if (!st) return null;
  const hide = scanHiding();
  const sub = effSub(id);
  const rec = recent.value.find((r) => r.studentId === id);
  const submitted = sub?.status === "submitted";
  // the server takes a first score for a hand-in received in THIS round; any other change of a score is the gradebook's
  const scoreHere = submitted && sub!.score == null && !!rec;
  const line = !sub ? "ยังไม่ส่ง"
    : sub.status === "excused" ? "ยกเว้น"
    : sub.score == null ? "รับงานแล้ว · รอคะแนน"
    : `ส่งแล้ว · ${hide ? "" : `${sub.score}/${s.fullScore} · `}${sub.late === true ? "ส่งช้า" : "ตรงเวลา"}`;
  return (
    <div class="modal-overlay sc-sheetov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog label={`ตัวเลือก ${whoLabel(st, hide)}`} onClose={onClose} class="modal sc-sheet">
        <h2 class="sc-sheet-h">{whoLabel(st, hide)}</h2>
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

export function markOf2(assignmentId: string, studentId: string): "pend" | "fail" | null {
  const k = pairKey({ assignmentId, studentId });
  return failedPairKeys.value.has(k) ? "fail" : pendingOps.value.has(k) ? "pend" : null;
}

/** "วันที่รับ: วันนี้ ▾" — pick the day the work was really handed in (between the day it was given and today). */
export function ReceivedDateChip({ assignedDate }: { assignedDate: string | null }) {
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
export function FailedPanel({ assignmentId, classId }: { assignmentId: string; classId: string }) {
  const hide = scanHiding();
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
        const who = st ? whoLabel(st, hide) : it.payload.studentId;
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

/** The child a result card is about (the card keeps only the text): the last scan when the op matches, else the one student whose full name it is */
function feedbackStudent(f: Feedback): Student[] {
  const r = recent.value[0];
  if (f.opId && r?.opId === f.opId) { const st = studentsById.value.get(r.studentId); if (st) return [st]; }
  if (!f.name) return [];
  return [...studentsById.value.values()].filter((st) => fullName(st) === f.name);
}

export function FeedbackCard({ hidden }: { hidden?: boolean }) {
  const hide = scanHiding();
  const f = feedback.value;
  const idle = !f;
  const shown: Feedback = f ?? { kind: "accent", icon: "scan", name: "พร้อมสแกน", sub: "ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter" };
  // AC-67: offline, a hand-in that is only on this device says so on its card ("… · รอส่งขึ้นระบบ"); online it is sent in a moment and the card stays as it was
  const offline = !(online.value && serverReachable.value);
  const queued = offline && !!shown.opId && !!pendingOps.value && [...pendingOps.value.values()].some((o) => o.opId === shown.opId);
  const sub = queued ? `${shown.sub} · รอส่งขึ้นระบบ` : shown.sub;
  if (idle && hidden) return null;
  // AC-77: no name, no score on the card (the child is "เลขที่ N"; the card says only "ส่งแล้ว")
  let name = shown.name;
  if (hide && !idle) { const m = feedbackStudent(shown); if (m.length > 0) name = m.length === 1 ? `เลขที่ ${m[0].number ?? "-"}` : "นักเรียน"; }
  const score = hide ? undefined : shown.score;
  return (
    <div class={"fb " + (idle ? "idle" : shown.kind) + (hidden ? " sr-only" : "")} role="status">
      <div class="ic"><Icon name={shown.icon} size={28} /></div>
      <div class="grow">
        <div class="name">{name}</div>
        <div class="sub">{sub}</div>
      </div>
      {score && <div class="score">{score}</div>}
      {!idle && shown.kind !== "danger" && shown.opId && recent.value[0]?.opId === shown.opId && !hidden && (
        <button class="fb-undo" aria-label="เลิกทำการสแกนล่าสุด" onClick={() => { undo(recent.value[0].studentId); focusScan(); }}><Icon name="arrow-back-up" size={20} /> เลิกทำ</button>
      )}
    </div>
  );
}

export const SEAT_WORD: Record<string, string> = { scored: "ส่งแล้ว มีคะแนน", late: "ส่งช้า", awaiting: "ส่งแล้ว รอตรวจ", missing: "ค้างส่ง", pending: "ยังไม่ส่ง", excused: "ยกเว้น" };
export const SEAT_ICON: Record<string, string> = { scored: "check", late: "clock", awaiting: "pencil", missing: "alert-circle", excused: "ban" };

export function ScorePad() {
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
  const hide = scanHiding();
  const quick = [s.fullScore, s.fullScore - 1, s.fullScore - 2, Math.round(s.fullScore * 0.5)].filter((n, i, a) => n >= 0 && a.indexOf(n) === i);
  const late = isLateDay();
  const hasDue = !!activeAssignment.value?.due_date;

  return (
    <section class="card sc-pad" aria-label={`ให้คะแนน เลขที่ ${st.number ?? "-"}`}>
      <div class="sc-pad-head">
        <span class="sc-pad-name" id="sc-pad-name">{hide ? `เลขที่ ${st.number ?? "-"}` : fullName(st)}</span>
        {!hide && <span class="sc-pad-no">เลขที่ {st.number ?? "-"}</span>}
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

