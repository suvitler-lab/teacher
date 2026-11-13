// S5 time-sheet form (ux.md "แผ่นตั้งเวลาคาบ"): period count, a start–end per period, up to 3 breaks, school days.
// Used inside FrameSheet (T-16) and by Settings › เวลาเรียน (T-22) — one form, one set of rules (AC-17).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { MAX_PERIODS, validateFrame, type Frame, type FrameInput, type FrameIssue, type Weekday } from "@shared/timetable";
import { online } from "../../../lib/outbox";
import { settings } from "../../../store";
import { DAY_NAMES, DAY_SHORT, MSG } from "../../../lib/timetable/messages";
import { ttFrame, saveFrame, type FrameRemove } from "../../../lib/timetable/store";
import { Icon } from "../../Icon";
import { ALL_DAYS, canAddBreak, cloneDraft, fieldKey, hasIssue, issuesOfRow, newBreak, toggleDay, withPeriodCount } from "./frameDraft";
import { RemoveConfirm } from "./RemoveConfirm";
import "../../../styles/timetable-frame.css";

export const FRAME_OFFLINE = "ออฟไลน์ — ตั้งเวลาคาบได้เมื่อออนไลน์";
export const FRAME_SEEDED = "นำเวลาเดิมมาใส่แล้ว ตรวจแล้วกดบันทึก";
export const FRAME_COUNT_HINT = "ตั้งได้ 1–8 คาบ";

/** True when the draft started from the old `period_times` setting (never saved as a frame) — AC-12. */
function seededFromLegacy(frame: Frame): boolean {
  if (frame.saved) return false;
  try {
    const o = JSON.parse(settings.value?.period_times || "null");
    return !!o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length > 0;
  } catch {
    return false;
  }
}

let uid = 0;

export function FrameEditor({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<FrameInput>(() => cloneDraft(ttFrame.value));
  const [seeded] = useState(() => seededFromLegacy(ttFrame.value));
  const [tried, setTried] = useState(false); // after the first save attempt the errors follow every edit
  const [serverIssues, setServerIssues] = useState<FrameIssue[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ count: number; removes: FrameRemove[] } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const busy = useRef(false); // a fast double tap must not send twice
  const alive = useRef(true);
  const root = useRef<HTMLFormElement>(null);
  const focusKey = useRef<string | null>(null);
  const id = useMemo(() => `tf${++uid}`, []);
  const offline = online.value === false;

  useEffect(() => () => { alive.current = false; }, []);

  const issues: FrameIssue[] = serverIssues ?? (tried ? validateFrame(draft) : []);
  // updater form: two quick edits in one frame (a fast tap on two days) must both land
  const edit = (fn: (d: FrameInput) => FrameInput) => { setDraft(fn); setServerIssues(null); setFailed(null); };

  // focus the field the last action asked for (the first wrong field, or the add-break button after a delete) once it is on screen
  useEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    focusKey.current = null;
    root.current?.querySelector<HTMLElement>(`[data-f="${key}"]`)?.focus();
  });

  async function submit(confirmRemove?: number) {
    if (busy.current || offline) return;
    const input: FrameInput = { periods: draft.periods, breaks: draft.breaks.map((b) => ({ ...b, name: b.name.trim() })), days: draft.days };
    const own = validateFrame(input);
    setTried(true);
    if (own.length > 0) { setServerIssues(null); setConfirm(null); setFailed(null); focusKey.current = fieldKey(own[0]); return; }
    busy.current = true; setSaving(true); setFailed(null);
    let r: Awaited<ReturnType<typeof saveFrame>>;
    try {
      r = await saveFrame(input, confirmRemove === undefined ? {} : { confirmRemove });
    } finally {
      busy.current = false;
    }
    if (!alive.current) return;
    setSaving(false);
    if (r.ok) { setConfirm(null); onSaved?.(); return; }
    if (r.code === "frame_removes_slots" && r.removes && r.removes.length > 0) { setConfirm({ count: r.count ?? r.removes.length, removes: r.removes }); return; }
    setConfirm(null);
    if (r.issues && r.issues.length > 0) {
      setServerIssues(r.issues as FrameIssue[]);
      focusKey.current = fieldKey(r.issues[0] as FrameIssue);
      return;
    }
    setFailed(r.message || MSG.saveFailed);
  }

  const n = draft.periods.length;
  const step = (delta: number) => {
    if (delta > 0 && n >= MAX_PERIODS) { setHint(FRAME_COUNT_HINT); return; }
    if (delta < 0 && n <= 1) return;
    setHint(null);
    edit((d) => withPeriodCount(d, d.periods.length + delta));
  };
  const setPeriod = (i: number, k: "start" | "end", v: string) => edit((d) => ({ ...d, periods: d.periods.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  const setBreak = (i: number, k: "name" | "start" | "end", v: string) => edit((d) => ({ ...d, breaks: d.breaks.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));
  const delBreak = (i: number) => { focusKey.current = "addbreak"; edit((d) => ({ ...d, breaks: d.breaks.filter((_, j) => j !== i) })); };
  const countHint = n >= MAX_PERIODS ? FRAME_COUNT_HINT : hint ?? "1–8 คาบ";
  const countIssue = issues.find((i) => i.field === "periods");
  const dayIssue = issues.filter((i) => i.field === "days");
  const err = (list: FrameIssue[], eid: string) => list.length > 0 && (
    <div class="tf-ferr" id={eid}>{list.map((i, k) => <p key={k}><Icon name="alert-circle" size={16} />{i.message}</p>)}</div>
  );

  return (
    <form ref={root} class="tf-form" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div class="tf-body">
        {issues.length > 0 && <div class="tf-sum" role="alert"><Icon name="alert-circle" size={20} />แก้ {issues.length} จุดก่อนบันทึก</div>}
        {failed && (
          <div class="tf-sum" role="alert"><Icon name="alert-circle" size={20} /><span class="tf-grow">{failed}</span>
            <button type="button" onClick={() => void submit()} disabled={saving || offline}>{MSG.retry}</button></div>
        )}
        {seeded && <p class="tf-note" role="status">{FRAME_SEEDED}</p>}

        <div class="tf-fld">
          <span class="tf-lg" id={`${id}-cl`}>จำนวนคาบต่อวัน</span>
          <div class="tf-cnt">
            <button type="button" class="icon" aria-label="ลดจำนวนคาบ" disabled={n <= 1} onClick={() => step(-1)}><Icon name="minus" size={22} /></button>
            <div class="tf-num" role="spinbutton" tabIndex={0} aria-labelledby={`${id}-cl`} aria-valuemin={1} aria-valuemax={MAX_PERIODS} aria-valuenow={n} aria-valuetext={`${n} คาบ`}
              data-f="count" aria-invalid={countIssue ? "true" : undefined} aria-describedby={`${id}-ch`}
              onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); step(-1); } }}>{n}</div>
            <button type="button" class="icon" aria-label="เพิ่มจำนวนคาบ" disabled={n >= MAX_PERIODS} onClick={() => step(1)}><Icon name="plus" size={22} /></button>
            <span class="tf-hint" id={`${id}-ch`} aria-live="polite">{countHint}</span>
          </div>
          {countIssue && err([countIssue], `${id}-ce`)}
        </div>

        <fieldset>
          <legend>เวลาแต่ละคาบ</legend>
          <div class="tf-list">
            <div class="tf-prow tf-hd" aria-hidden="true"><span /><span>เริ่ม</span><span>ถึง</span></div>
            {draft.periods.map((p, i) => {
              const rowIssues = issuesOfRow(issues, `periods.${i}`);
              const eid = `${id}-pe${i}`;
              return (
                <div class="tf-rowwrap" key={i}>
                  <div class="tf-prow">
                    <span class="tf-pn">คาบ {i + 1}</span>
                    <input type="time" step={60} value={p.start} aria-label={`เวลาเริ่มคาบ ${i + 1}`} data-f={`periods.${i}.start`}
                      aria-invalid={hasIssue(rowIssues, `periods.${i}.start`) ? "true" : undefined} aria-describedby={rowIssues.length ? eid : undefined}
                      onInput={(e) => setPeriod(i, "start", (e.currentTarget as HTMLInputElement).value)} />
                    <input type="time" step={60} value={p.end} aria-label={`เวลาจบคาบ ${i + 1}`} data-f={`periods.${i}.end`}
                      aria-invalid={hasIssue(rowIssues, `periods.${i}.end`) ? "true" : undefined} aria-describedby={rowIssues.length ? eid : undefined}
                      onInput={(e) => setPeriod(i, "end", (e.currentTarget as HTMLInputElement).value)} />
                  </div>
                  {err(rowIssues, eid)}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend>ช่วงพัก (ไม่เกิน 3)</legend>
          <div class="tf-list">
            {draft.breaks.map((b, i) => {
              const rowIssues = issuesOfRow(issues, `breaks.${i}`);
              const eid = `${id}-be${i}`;
              const d = rowIssues.length ? eid : undefined;
              const bad = (k: string) => (hasIssue(rowIssues, `breaks.${i}.${k}`) ? "true" : undefined);
              return (
                <div class="tf-rowwrap" key={i}>
                  <div class="tf-brow">
                    <input class="tf-bn" value={b.name} autoComplete="off" aria-label={`ชื่อช่วงพักที่ ${i + 1}`} data-f={`breaks.${i}.name`} aria-invalid={bad("name")} aria-describedby={d}
                      onInput={(e) => setBreak(i, "name", (e.currentTarget as HTMLInputElement).value)} />
                    <input type="time" step={60} value={b.start} aria-label={`เวลาเริ่มช่วงพักที่ ${i + 1}`} data-f={`breaks.${i}.start`} aria-invalid={bad("start")} aria-describedby={d}
                      onInput={(e) => setBreak(i, "start", (e.currentTarget as HTMLInputElement).value)} />
                    <input type="time" step={60} value={b.end} aria-label={`เวลาจบช่วงพักที่ ${i + 1}`} data-f={`breaks.${i}.end`} aria-invalid={bad("end")} aria-describedby={d}
                      onInput={(e) => setBreak(i, "end", (e.currentTarget as HTMLInputElement).value)} />
                    <button type="button" class="icon" aria-label={`ลบ ${b.name.trim() || `ช่วงพักที่ ${i + 1}`}`} onClick={() => delBreak(i)}><Icon name="trash" size={20} /></button>
                  </div>
                  {err(rowIssues, eid)}
                </div>
              );
            })}
            {canAddBreak(draft)
              ? <button type="button" class="tf-add" data-f="addbreak" onClick={() => edit((d) => (canAddBreak(d) ? { ...d, breaks: [...d.breaks, newBreak(d)] } : d))}><Icon name="plus" size={18} />เพิ่มช่วงพัก</button>
              : <span class="tf-hint" data-f="addbreak" tabIndex={-1}>ตั้งช่วงพักได้ไม่เกิน 3 ช่วง</span>}
          </div>
        </fieldset>

        <fieldset>
          <legend>วันเรียน</legend>
          <div class="tf-days">
            {ALL_DAYS.map((w: Weekday, k) => {
              const on = draft.days.includes(w);
              return (
                <button type="button" class="tf-day" key={w} aria-pressed={on} aria-label={`วัน${DAY_NAMES[w]}`} data-f={k === 0 ? "days" : undefined} aria-describedby={dayIssue.length ? `${id}-de` : undefined}
                  onClick={() => edit((d) => ({ ...d, days: toggleDay(d.days, w) }))}>{on && <Icon name="check" size={16} />}{DAY_SHORT[w].replace(".", "")}</button>
              );
            })}
          </div>
          {err(dayIssue, `${id}-de`)}
        </fieldset>
        <p class="tf-hint">ใช้กับทุกภาคเรียน · เวลาเริ่มคาบใช้ตัดสิน “สาย” ด้วย</p>
      </div>

      <div class="tf-foot">
        {offline && <p class="tf-off" role="status"><Icon name="wifi-off" size={18} />{FRAME_OFFLINE}</p>}
        <span class="tf-grow" />
        {onCancel && <button type="button" onClick={onCancel}>ยกเลิก</button>}
        <button type="submit" class="primary" disabled={saving || offline}>{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>

      {confirm && <RemoveConfirm removes={confirm.removes} busy={saving} onNo={() => setConfirm(null)} onYes={() => void submit(confirm.count)} />}
    </form>
  );
}
