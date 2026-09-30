import { useState } from "preact/hooks";
import { Icon } from "./Icon";
import { activeSubjects, activeWorkTypes, classesForTerm, classById, currentTermId, currentTerm, selectedTermId, viewingPastYear, terms, UNASSIGNED, upsertAssignment } from "../store";
import { api } from "../lib/api";
import type { Assignment } from "@shared/types";
import { DateField } from "./ui";

function todayBkk(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// new work goes into the term the teacher is looking at ("no term yet" stays no term) — unless that is a
// past academic year: its classes are closed, so new work belongs to the current term
function newWorkTerm(): string | null {
  const sel = selectedTermId.value;
  if (sel === UNASSIGNED) return null;
  if (viewingPastYear.value) return currentTermId.value;
  return sel ?? currentTermId.value;
}

// Last year's class "ป.6/1" and this year's "ป.6/1" are different rows: carry a class over by its NAME
function mapClassIds(ids: string[], targets: { id: string; name: string }[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const t = targets.find((c) => c.id === id) ?? targets.find((c) => c.name === classById(id)?.name);
    if (t && !out.includes(t.id)) out.push(t.id);
  }
  return out;
}

export function AssignmentModal({
  existing,
  copyFrom,
  defaultClassId,
  defaultSubjectId,
  onClose,
  onSaved,
}: {
  existing?: Assignment;
  copyFrom?: Assignment; // prefill from this, but save as a new assignment
  defaultClassId?: string;
  defaultSubjectId?: string;
  onClose: () => void;
  onSaved: (a: Assignment) => void;
}) {
  const wts = activeWorkTypes.value;
  const base = existing ?? copyFrom; // fields to prefill
  // editing keeps the work's own term (and so its year's classes); new/copy goes into newWorkTerm()
  const targetTermId = existing ? existing.term_id : newWorkTerm();
  const classChoices = classesForTerm(targetTermId);
  const movedToCurrent = !existing && viewingPastYear.value;
  const [typeId, setTypeId] = useState(base?.type_id ?? wts.find((w) => !w.is_exam)?.id ?? wts[0]?.id ?? "");
  const [title, setTitle] = useState(base?.title ?? "");
  const [subjectId, setSubjectId] = useState(base?.subject_id ?? defaultSubjectId ?? activeSubjects.value[0]?.id ?? "");
  const wt = wts.find((w) => w.id === typeId);
  const [fullScore, setFullScore] = useState(base?.full_score ?? wt?.default_full ?? 10);
  const [unit, setUnit] = useState(base?.unit ?? "");
  // a copy starts today with no due date so it isn't accidentally overdue
  const [assignedDate, setAssignedDate] = useState(existing?.assigned_date ?? todayBkk());
  const [dueDate, setDueDate] = useState(existing?.due_date ?? "");
  const [classIds, setClassIds] = useState<string[]>(existing ? existing.class_ids : mapClassIds(base?.class_ids ?? (defaultClassId ? [defaultClassId] : []), classChoices));
  const [publish, setPublish] = useState(base ? base.publish_scores : true);
  const [note, setNote] = useState(base?.note ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function pickType(id: string) {
    setTypeId(id);
    const w = wts.find((x) => x.id === id);
    if (w) {
      setFullScore(w.default_full);
      if (w.is_exam) setPublish(false);
    }
  }

  function toggleClass(id: string) {
    setClassIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function save() {
    setErr("");
    if (!title.trim()) return setErr("ใส่ชื่องาน");
    if (!Number.isInteger(fullScore) || fullScore < 1 || fullScore > 100) return setErr("คะแนนเต็ม 1–100");
    if (dueDate && assignedDate && dueDate < assignedDate) return setErr("วันกำหนดส่งต้องไม่ก่อนวันสั่งงาน");
    if (classIds.length === 0) return setErr("เลือกอย่างน้อย 1 ห้อง");
    setBusy(true);
    try {
      const res = await api.post<{ assignment: Assignment }>("/api/assignments", {
        // editing keeps the work's own term (even "none"); new/copy goes into the term the teacher is viewing
        id: existing?.id, term_id: targetTermId, subject_id: subjectId, type_id: typeId,
        title: title.trim(), unit: unit || null, full_score: fullScore,
        assigned_date: assignedDate || null, due_date: dueDate || null, note: note || null,
        publish_scores: publish, status: existing?.status ?? "open", class_ids: classIds,
      });
      upsertAssignment(res.assignment); // reflect on Home/Scan without a reload
      onSaved(res.assignment);
    } catch (e: any) {
      if (e.code === "score_over_full") setErr(`ลดคะแนนเต็มไม่ได้ มี ${e.data?.over ?? ""} รายการที่คะแนนเกิน`);
      else setErr(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" role="dialog" aria-label="สร้างงาน">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <h2 style="font-size:18px">{existing ? "แก้ไขงาน" : "สร้างงานใหม่"}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose}><Icon name="x" /></button>
        </div>

        <label class="field"><span>ประเภทงาน</span></label>
        <div class="row wrap" style="gap:6px;margin-bottom:12px">
          {wts.map((w) => (
            <button
              class={"type-chip " + (w.id === typeId ? "on " : "") + w.color}
              onClick={() => pickType(w.id)}
              aria-pressed={w.id === typeId}
            >
              <Icon name={w.icon} size={16} /> {w.name}
            </button>
          ))}
        </div>

        <label class="field">
          <span>ชื่องาน / เรื่อง</span>
          <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="เช่น ใบงานที่ 5 เรื่อง ระบบหายใจ" />
        </label>

        <div class="modal-grid3">
          <label class="field">
            <span>วิชา</span>
            <select value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)}>
              {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label class="field">
            <span>คะแนนเต็ม</span>
            <input type="number" min={1} max={100} value={fullScore} onInput={(e) => setFullScore(Number((e.target as HTMLInputElement).value))} />
          </label>
          <label class="field">
            <span>หน่วย/บท</span>
            <input value={unit} onInput={(e) => setUnit((e.target as HTMLInputElement).value)} />
          </label>
        </div>

        <div class="modal-grid2">
          <label class="field">
            <span>วันที่สั่งงาน</span>
            <DateField value={assignedDate} onChange={setAssignedDate} />
          </label>
          <label class="field">
            <span>กำหนดส่ง</span>
            <DateField value={dueDate} onChange={setDueDate} />
          </label>
        </div>

        {movedToCurrent && (
          <div class="imp-warn" style="margin:0 0 8px"><Icon name="info-circle" size={15} /> ตอนนี้ดูปีการศึกษาที่ผ่านมา — งานใหม่จะสร้างใน {terms.value.find((t) => t.id === currentTermId.value)?.name ?? currentTerm.value?.name ?? "ภาคเรียนปัจจุบัน"} และมอบหมายให้ห้องของปีนี้ (ห้องชื่อเดียวกันกับที่คัดลอกมา)</div>
        )}
        <label class="field"><span>มอบหมายให้ห้อง</span></label>
        <div class="row wrap" style="gap:6px;margin-bottom:10px">
          {classChoices.map((c) => (
            <button class={"cls-chip " + (classIds.includes(c.id) ? "on" : "")} onClick={() => toggleClass(c.id)}>
              {classIds.includes(c.id) && <Icon name="check" size={14} />} {c.name}
            </button>
          ))}
        </div>

        <div class="row" style="justify-content:space-between;background:var(--surface-1);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:10px">
          <div>
            <div style="font-weight:500;font-size:14px">ให้ผู้ปกครองเห็นคะแนน</div>
            <div class="page-sub">{publish ? "เห็นสถานะและคะแนนทันที" : "ซ่อนคะแนนไว้ก่อน"}</div>
          </div>
          <button class={"switch " + (publish ? "on" : "")} role="switch" aria-checked={publish} onClick={() => setPublish(!publish)}>
            <span class="knob" />
          </button>
        </div>

        <label class="field">
          <span>คำชี้แจง (ผู้ปกครองเห็นด้วย)</span>
          <textarea rows={2} value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        </label>

        {err && <div style="color:var(--text-danger);font-size:13px;margin:6px 0">{err}</div>}

        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px">
          <button onClick={onClose}>ยกเลิก</button>
          <button class="primary" onClick={save} disabled={busy}>
            {busy ? <Icon name="loader-2" class="spin" /> : <Icon name="device-floppy" />} บันทึกงาน
          </button>
        </div>
      </div>
    </div>
  );
}
