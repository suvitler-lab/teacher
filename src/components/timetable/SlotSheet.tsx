// S4 · add / edit one cell. The place is fixed (day + period are shown, not chosen): a cell holds one item, so a clash cannot be made here.
// Teaching = room (required) + subject (optional) · activity = a name of 1–40 characters. Saves at once (EP-11), keeps what was typed when it fails.
import { useEffect, useRef, useState } from "preact/hooks";
import { LABEL_MAX, graphemeCount, type Frame, type Slot, type SlotKind, type Weekday } from "@shared/timetable";
import { classInYear } from "@shared/roster";
import type { Class, Subject, Term } from "@shared/types";
import { Dialog } from "../Dialog";
import { Icon } from "../Icon";
import { DAY_NAMES, MSG, dayWord } from "../../lib/timetable/messages";
import { ttTables } from "../../lib/timetable/state";
import { dismissNotice, removeSlot, upsertSlot } from "../../lib/timetable/store";
import "../../styles/timetable.css";

export interface SlotSheetProps {
  term: Term;
  frame: Frame;
  weekday: Weekday;
  period: number;
  existing: Slot | null;
  classes: Class[];
  subjects: Subject[];
  onClose: (saved: boolean) => void;
}

let lastPick: { classId: string; subjectId: string } = { classId: "", subjectId: "" }; // the room/subject used last: the next empty cell starts there

/** Names of activities already on screen (any loaded term) — one tap to reuse. */
function recentLabels(): string[] {
  const seen = new Set<string>();
  for (const t of Object.values(ttTables.value)) for (const s of t.slots) if (s.kind === "activity" && s.label) seen.add(s.label.trim());
  return [...seen].slice(0, 8);
}

export function SlotSheet(p: SlotSheetProps) {
  const { existing } = p;
  const open = p.classes.filter((c) => !c.archived && classInYear(c.year, p.term.year)).sort((a, b) => a.sort - b.sort);
  const openSubjects = p.subjects.filter((s) => !s.archived).sort((a, b) => a.sort - b.sort);
  const oldClass = existing?.classId ? p.classes.find((c) => c.id === existing.classId) : undefined;
  const classGone = !!existing?.classId && (!oldClass || oldClass.archived);
  const oldSubject = existing?.subjectId ? p.subjects.find((s) => s.id === existing.subjectId) : undefined;
  const subjectGone = !!existing?.subjectId && (!oldSubject || oldSubject.archived);

  const startClass = existing?.classId ?? (open.some((c) => c.id === lastPick.classId) ? lastPick.classId : "");
  const startSubject = existing?.subjectId ?? (openSubjects.some((s) => s.id === lastPick.subjectId) ? lastPick.subjectId : "");
  const [kind, setKind] = useState<SlotKind>(existing?.kind ?? "class");
  const [classId, setClassId] = useState(existing?.kind === "class" ? startClass : existing ? "" : startClass);
  const [subjectId, setSubjectId] = useState(existing?.kind === "class" ? startSubject : existing ? "" : startSubject);
  const [label, setLabel] = useState(existing?.kind === "activity" ? existing.label ?? "" : "");
  const [errs, setErrs] = useState<{ cls?: string; label?: string }>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const submitting = useRef(false);
  const classRef = useRef<HTMLSelectElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  const per = p.frame.periods[p.period - 1];
  const where = `${dayWord(p.weekday)} · คาบ ${p.period} · ${per.start}–${per.end}`;
  const n = graphemeCount(label.trim());

  // switching the kind sends focus to the first field of the new group and says so (ux S4)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setAnnounce(kind === "activity" ? "ชนิดกิจกรรม" : "ชนิดสอนห้อง");
    (kind === "activity" ? labelRef.current : classRef.current)?.focus();
  }, [kind]);

  const pickClass = (e: Event) => { setClassId((e.target as HTMLSelectElement).value); setErrs((x) => ({ ...x, cls: undefined })); };
  const pickSubject = (e: Event) => setSubjectId((e.target as HTMLSelectElement).value);

  const validate = (): boolean => {
    const next: { cls?: string; label?: string } = {};
    if (kind === "class") {
      // an archived room stays valid while it is untouched (BR-06: the old slot is kept)
      if (!classId) next.cls = "เลือกห้อง";
    } else if (n === 0) next.label = "ใส่ชื่อกิจกรรม";
    else if (n > LABEL_MAX) next.label = "ไม่เกิน 40 ตัวอักษร";
    setErrs(next);
    if (next.cls) classRef.current?.focus();
    else if (next.label) labelRef.current?.focus();
    return !next.cls && !next.label;
  };

  const save = async (e?: Event) => {
    e?.preventDefault();
    if (submitting.current) return; // a quick second press changes nothing
    setFail(null);
    if (!validate()) return;
    submitting.current = true;
    setBusy(true);
    const slot: Slot = kind === "class"
      ? { weekday: p.weekday, period: p.period, kind: "class", classId, subjectId: subjectId || null, label: null }
      : { weekday: p.weekday, period: p.period, kind: "activity", classId: null, subjectId: null, label: label.trim() };
    const r = await upsertSlot(p.term.id, slot);
    submitting.current = false;
    setBusy(false);
    if (r.ok) {
      if (kind === "class") lastPick = { classId, subjectId };
      p.onClose(true);
      return;
    }
    if (["timetable_changed", "epoch_changed", "term_read_only", "unauthorized"].includes(r.code)) { p.onClose(false); return; } // the page banner says why
    dismissNotice(); // the message is shown here, not twice
    if (r.code === "bad_timetable" || r.issues?.length) setFail(r.message);
    else setFail(MSG.saveFailed);
  };

  const remove = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    p.onClose(true);
    await removeSlot(p.term.id, p.weekday, p.period);
    submitting.current = false;
  };

  const noClasses = open.length === 0 && !classGone;
  const title = existing ? "แก้คาบ" : "เพิ่มคาบ";

  return (
    <div class="modal-overlay tts-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) p.onClose(false); }}>
      <Dialog label={`${title} ${where}`} onClose={() => { if (!busy) p.onClose(false); }} class="modal tts-dlg">
        <form class="tts-form" onSubmit={save} noValidate>
          <div class="tts-head">
            <div class="tts-grow">
              <h2>{title}</h2>
              <p class="tts-where">{where}</p>
            </div>
            <button type="button" class="icon ghost" aria-label="ปิด" disabled={busy} onClick={() => p.onClose(false)}><Icon name="x" size={22} /></button>
          </div>

          <div class="tts-body">
            <fieldset class="tts-kind">
              <legend>ชนิดคาบ</legend>
              <label class={`tts-radio${kind === "class" ? " on" : ""}`}>
                <input ref={kind === "class" ? kindRef : undefined} type="radio" name="tts-kind" value="class" checked={kind === "class"} onChange={() => setKind("class")} />
                <Icon name="door" size={18} /> สอนห้อง
              </label>
              <label class={`tts-radio${kind === "activity" ? " on" : ""}`}>
                <input type="radio" name="tts-kind" value="activity" checked={kind === "activity"} onChange={() => setKind("activity")} />
                <Icon name="star" size={18} /> กิจกรรม
              </label>
            </fieldset>

            {kind === "class" ? (
              <>
                <div class="tts-field">
                  <label for="tts-class">ห้อง <span aria-hidden="true">*</span></label>
                  {noClasses ? (
                    <p class="tts-none">ยังไม่มีห้องในปีนี้ · <a href="#/settings?section=catalog">เพิ่มห้องในตั้งค่า</a></p>
                  ) : (
                    <select
                      id="tts-class" ref={classRef} value={classId} aria-invalid={errs.cls ? "true" : undefined} aria-describedby={errs.cls ? "tts-class-err" : classGone ? "tts-class-gone" : undefined}
                      onChange={pickClass} onInput={pickClass}
                    >
                      <option value="">เลือกห้อง</option>
                      {classGone && existing?.classId && <option value={existing.classId}>{oldClass?.name ?? "ห้องเดิม"} · {MSG.archivedBadge}</option>}
                      {open.map((c) => <option value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {classGone && classId === existing?.classId && <p id="tts-class-gone" class="tts-hint">ห้องนี้เก็บแล้ว เลือกห้องอื่นหรือนำห้องกลับในตั้งค่า</p>}
                  {errs.cls && <p id="tts-class-err" class="tts-err" role="alert"><Icon name="alert-circle" size={16} /> {errs.cls}</p>}
                </div>
                <div class="tts-field">
                  <label for="tts-subject">วิชา (ไม่ระบุก็ได้)</label>
                  <select id="tts-subject" value={subjectId} onChange={pickSubject} onInput={pickSubject}>
                    <option value="">ไม่ระบุ</option>
                    {subjectGone && existing?.subjectId && <option value={existing.subjectId}>{oldSubject?.name ?? "วิชาเดิม"} · {MSG.archivedBadge}</option>}
                    {openSubjects.map((s) => <option value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div class="tts-field">
                <label for="tts-label">ชื่อกิจกรรม <span aria-hidden="true">*</span></label>
                <input
                  id="tts-label" ref={labelRef} type="text" value={label} autoComplete="off" aria-invalid={errs.label ? "true" : undefined}
                  aria-describedby={errs.label ? "tts-label-err tts-cnt" : "tts-cnt"}
                  onInput={(e) => { setLabel((e.target as HTMLInputElement).value); setErrs((x) => ({ ...x, label: undefined })); }}
                />
                <p id="tts-cnt" class={`tts-cnt${n > LABEL_MAX ? " over" : ""}`}>{n > LABEL_MAX ? `เกิน ${n - LABEL_MAX} ตัว` : `${n}/${LABEL_MAX}`}</p>
                {errs.label && <p id="tts-label-err" class="tts-err" role="alert"><Icon name="alert-circle" size={16} /> {errs.label}</p>}
                {recentLabels().length > 0 && (
                  <div class="tts-recent" role="group" aria-label="ที่เคยใช้">
                    <span>ที่เคยใช้:</span>
                    {recentLabels().map((r) => <button type="button" class="tts-pill" onClick={() => { setLabel(r); setErrs((x) => ({ ...x, label: undefined })); labelRef.current?.focus(); }}>{r}</button>)}
                  </div>
                )}
              </div>
            )}

            {fail && (
              <div class="tts-fail" role="alert">
                <Icon name="alert-circle" size={18} /> <span>{fail}</span>
                {fail === MSG.saveFailed && <button type="submit" disabled={busy}>{MSG.retry}</button>}
              </div>
            )}
            <p class="tts-live" role="status" aria-live="polite">{announce}</p>
          </div>

          <div class="tts-foot">
            {existing && <button type="button" class="danger tts-del" disabled={busy} onClick={remove}><Icon name="trash" size={18} /> {MSG.menuDelete}</button>}
            <span class="tts-sp" />
            <button type="button" disabled={busy} onClick={() => p.onClose(false)}>ยกเลิก</button>
            <button type="submit" class="primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

export const slotWhere = (w: Weekday, period: number) => `${DAY_NAMES[w]} คาบ ${period}`;
