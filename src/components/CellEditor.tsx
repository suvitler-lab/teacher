import { useState } from "preact/hooks";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { DateField } from "./ui";
import { bkkToday } from "@shared/time";
import { checkReceivedDate, type ReceivedDateProblem } from "@shared/received-date";
import { isHalfStep } from "@shared/grade";
import { formatThaiDate } from "../lib/dates";

export type CellStatus = "void" | "submitted" | "excused";

/** What the teacher chose in the cell editor. `receivedDate` is a Thai calendar day (CE) and only means something when submitted; null = leave the stored day alone. */
export interface CellChange { status: CellStatus; score: number | null; receivedDate: string | null }

export interface CellNow { status: CellStatus; score: number | null; late: boolean; submittedAt: number | null }

const PROBLEM: Record<ReceivedDateProblem, string> = {
  received_date_invalid: "วันที่ไม่ถูกต้อง",
  received_date_future: "เลือกวันอนาคตไม่ได้",
  received_date_before_assigned: "วันที่รับอยู่ก่อนวันมอบหมายงาน",
};

/** A typed score: blank = no score yet; otherwise 0–full in steps of 0.5 (the same rule as the quick input and the server). */
export function parseScore(raw: string, full: number): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > full || !isHalfStep(n)) return { ok: false, message: `คะแนนต้อง 0–${full} (ทีละ 0.5)` };
  return { ok: true, value: n };
}

/** The line under the received day, in the words of the design: on time / how many days late / no due date; and the day it was taken. */
export function dateLine(day: string, due: string | null, today: string): string {
  const recv = day === today ? "วันนี้" : formatThaiDate(day);
  if (!due) return `ไม่มีกำหนดส่ง · รับ ${recv}`;
  if (day <= due) return `ส่งทันกำหนด · รับ ${recv}`;
  const late = Math.round((Date.parse(day + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / 86_400_000);
  return `ส่งช้า ${late} วัน · รับ ${recv}`;
}

/** The Thai day a cell was received on (its `submitted_at`), or null when nothing is handed in. */
export const receivedDayOf = (c: CellNow | undefined): string | null => (c && c.status === "submitted" && c.submittedAt ? bkkToday(c.submittedAt) : null);

/** The quick scores offered under the box (touch): full, full−1, full−2 and half — each once, none below 0. */
export function quickScores(full: number): number[] {
  return [full, full - 1, full - 2, Math.round(full / 2)].filter((x, i, a) => x >= 0 && a.indexOf(x) === i);
}

const STATUS_OPTIONS: { value: CellStatus; label: string; icon: string }[] = [
  { value: "void", label: "ยังไม่ส่ง", icon: "circle-dashed" },
  { value: "submitted", label: "ส่งแล้ว", icon: "check" },
  { value: "excused", label: "ยกเว้น", icon: "ban" },
];

/**
 * The cell editor: status (not handed in / handed in / excused), score and the day the work was received — for the
 * moments the quick input in the cell is not enough. It never decides "late": that is derived from the received day and
 * the due date by the server (BR-04); the line under the date only previews it.
 */
export function CellEditor({ studentName, title, fullScore, assignedDate, dueDate, now, onClose, onSave }: {
  studentName: string; title: string; fullScore: number; assignedDate: string | null; dueDate: string | null;
  now: CellNow | undefined; onClose: () => void; onSave: (c: CellChange) => void;
}) {
  const today = bkkToday();
  const curDay = receivedDayOf(now);
  // an old hand-in has no stored day: it stays "unknown" until the teacher picks one (never silently stamped as today)
  const dayUnknown = now?.status === "submitted" && !curDay;
  const [status, setStatus] = useState<CellStatus>(now?.status ?? "void");
  const [score, setScore] = useState(now?.score != null ? String(now.score) : "");
  const [day, setDay] = useState(curDay ?? today);
  const [picked, setPicked] = useState(false);
  const submitted = status === "submitted";
  const yesterday = bkkToday(Date.now() - 86_400_000);
  const unknownShown = dayUnknown && !picked;
  const pickDay = (d: string) => { setDay(d); setPicked(true); };

  const parsed = parseScore(score, fullScore);
  const scoreBad = submitted && !parsed.ok;
  // the day already stored is what it is (an old hand-in may sit before the assigned date): only a day the teacher PICKS is checked
  const dayProblem = submitted && !unknownShown && day !== curDay ? checkReceivedDate(day, { today, assignedDate }) : null;
  const changed = status !== (now?.status ?? "void") || (submitted && ((parsed.ok ? parsed.value : null) !== (now?.score ?? null) || (!unknownShown && day !== (curDay ?? today))));
  const clearsScore = status === "void" && now?.status === "submitted" && now.score != null;
  const fromExcused = status === "submitted" && now?.status === "excused";
  const onDue = dueDate && dueDate <= today && (!assignedDate || dueDate >= assignedDate) ? dueDate : null;

  function save() {
    if (scoreBad || dayProblem || !changed) return;
    onSave({ status, score: submitted && parsed.ok ? parsed.value : null, receivedDate: submitted && !unknownShown ? day : null });
  }
  const pickStatus = (s: CellStatus) => { setStatus(s); if (s === "submitted" && now?.status !== "submitted") { setDay(today); setPicked(true); } };

  return (
    <div class="modal-overlay" style="z-index:150" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog label={`แก้ไขช่อง ${studentName} · ${title}`} style="max-width:440px" onClose={onClose}>
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <h2 style="font-size:1.2rem;overflow-wrap:anywhere">{studentName}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div class="page-sub" style="margin-bottom:10px;overflow-wrap:anywhere">{title} · เต็ม {fullScore}</div>

        <div class="page-sub" id="ce-status" style="margin-bottom:4px">สถานะ</div>
        <div class="seg ce-status" role="radiogroup" aria-labelledby="ce-status">
          {STATUS_OPTIONS.map((o) => (
            <button type="button" role="radio" aria-checked={status === o.value} tabIndex={status === o.value ? 0 : -1} class={status === o.value ? "on" : ""}
              onClick={() => pickStatus(o.value)}
              onKeyDown={(e) => {
                const i = STATUS_OPTIONS.findIndex((x) => x.value === status);
                const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const next = STATUS_OPTIONS[(i + d + STATUS_OPTIONS.length) % STATUS_OPTIONS.length];
                pickStatus(next.value);
                requestAnimationFrame(() => ((e.currentTarget as HTMLElement).parentElement?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
              }}>
              <Icon name={o.icon} size={18} /> {o.label}
            </button>
          ))}
        </div>
        {status === "excused" && <div class="page-sub" style="margin-top:6px">ยกเว้น = ไม่นับในอัตราส่งและคะแนนสะสม</div>}
        {clearsScore && <div class="ce-note" role="status"><Icon name="info-circle" size={16} /> คะแนน {now!.score} จะถูกล้าง</div>}
        {fromExcused && <div class="ce-note" role="status"><Icon name="info-circle" size={16} /> จะเปลี่ยนจากยกเว้นเป็นส่งแล้ว</div>}

        {submitted && (
          <>
            <label class="field" style="margin-top:10px"><span>คะแนน (เต็ม {fullScore})</span>
              <input inputMode="decimal" aria-label="คะแนน" value={score} placeholder="ยังไม่มีคะแนน" onInput={(e) => setScore((e.target as HTMLInputElement).value)} aria-invalid={scoreBad}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); save(); } }} />
            </label>
            {scoreBad && !parsed.ok && <div class="page-sub" style="color:var(--text-danger)" role="alert">{parsed.message}</div>}
            <div class="ce-quick" role="group" aria-label="คะแนนลัด">
              {quickScores(fullScore).map((q) => (
                <button type="button" class={String(q) === score ? "primary" : ""} aria-pressed={String(q) === score} onClick={() => setScore(String(q))}>{q === fullScore ? `เต็ม ${q}` : q}</button>
              ))}
            </div>

            <div class="page-sub" style="margin:10px 0 4px">วันที่รับงาน</div>
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">
              <button type="button" aria-pressed={!unknownShown && day === today} class={!unknownShown && day === today ? "primary" : ""} onClick={() => pickDay(today)}>วันนี้</button>
              <button type="button" aria-pressed={!unknownShown && day === yesterday} class={!unknownShown && day === yesterday ? "primary" : ""} onClick={() => pickDay(yesterday)}>เมื่อวาน</button>
              {onDue && <button type="button" aria-pressed={!unknownShown && day === onDue} class={!unknownShown && day === onDue ? "primary" : ""} onClick={() => pickDay(onDue)}><Icon name="calendar-due" size={16} /> ตามกำหนดส่ง · {formatThaiDate(onDue).replace(/ \d{4}$/, "")}</button>}
            </div>
            <DateField value={day} onChange={pickDay} label="วันที่รับงาน" />
            {dayProblem
              ? <div class="page-sub" style="color:var(--text-danger);margin-top:4px" role="alert">{PROBLEM[dayProblem]}</div>
              : unknownShown
                ? <div class="page-sub" style="margin-top:4px">ส่งแล้ว · ไม่ทราบวันที่รับ <span class="muted">(เลือกวันเพื่อบันทึก)</span></div>
                : <div class="page-sub" style="margin-top:4px">{dateLine(day, dueDate, today)} <span class="muted">(ระบบคำนวณส่งช้าเอง)</span></div>}
          </>
        )}

        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="button" class="primary" disabled={!changed || scoreBad || !!dayProblem} onClick={save}>บันทึก</button>
        </div>
      </Dialog>
    </div>
  );
}
