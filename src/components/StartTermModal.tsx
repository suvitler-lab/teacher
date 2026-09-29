import { useState } from "preact/hooks";
import { Icon } from "./Icon";
import { classesForTerm, currentTerm, students, assignments, terms, loadBootstrap, setSelectedTerm } from "../store";
import { api, ApiError } from "../lib/api";
import { formatThaiDate } from "../lib/dates";
import { ok } from "../lib/notify";
import { pendingCount } from "../lib/outbox";
import { attDraftCount } from "../lib/attSync";

function todayBkk(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function dayAfter(iso: string): string {
  return new Date(Date.parse(iso) + 86400000).toISOString().slice(0, 10);
}

/**
 * Start a new term. Within the same academic year it only adds the term; for a new year it also opens the
 * new year's classes (same names, empty), puts last year's classes away and marks their children "finished".
 * Nothing of last year is changed or deleted — it stays under its own term in the term picker.
 */
export function StartTermModal({ onClose }: { onClose: () => void }) {
  const cur = currentTerm.value;
  const beYear = new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear() + 543;
  // the natural next step: term 1 → term 2 of the same year, term 2 → term 1 of the next year
  const next = cur ? (cur.term >= 2 ? { year: cur.year + 1, term: 1 } : { year: cur.year, term: cur.term + 1 }) : { year: beYear, term: 1 };
  const [year, setYear] = useState(next.year);
  const [term, setTerm] = useState(next.term);
  const [start, setStart] = useState(cur?.end_date ? dayAfter(cur.end_date) : todayBkk());
  const [end, setEnd] = useState("");

  const newYear = !cur || year > cur.year;
  const oldClasses = cur ? classesForTerm(cur.id) : [];
  const [keep, setKeep] = useState<Set<string>>(() => new Set(oldClasses.map((c) => c.id)));
  const [closeWork, setCloseWork] = useState(true);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [stale, setStale] = useState(false);

  const oldIds = new Set(oldClasses.map((c) => c.id));
  const finishing = students.value.filter((s) => s.status === "active" && s.class_id && oldIds.has(s.class_id)).length;
  const yearTermIds = new Set(terms.value.filter((t) => cur && t.year === cur.year).map((t) => t.id));
  const openWork = assignments.value.filter((a) => a.status === "open" && a.term_id && yearTermIds.has(a.term_id)).length;
  const unsent = pendingCount.value + attDraftCount.value;

  const name = `${term}/${year}`;
  const backwards = !!cur && (year < cur.year || (year === cur.year && term <= cur.term));
  const exists = terms.value.some((t) => t.year === year && t.term === term);
  const badDates = !start || (!!end && end < start);
  const problem = backwards ? "ภาคเรียนใหม่ต้องมาหลังภาคเรียนปัจจุบัน"
    : exists ? `มีภาคเรียน ${name} อยู่แล้ว — ตั้งเป็นปัจจุบันได้จากรายการภาคเรียน`
    : badDates ? (start ? "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" : "ใส่วันเริ่มภาคเรียน") : "";
  const canStart = !busy && !problem && (!newYear || sure);

  function toggle(id: string) {
    setKeep((k) => { const n = new Set(k); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function go() {
    setErr(""); setBusy(true);
    try {
      const res = await api.post<{ termId: string; newYear: boolean; classes: { id: string }[]; finished: number }>("/api/terms/start", {
        expectedCurrentTermId: cur?.id ?? null, year, term, name,
        start_date: start, end_date: end || null,
        ...(newYear ? { keepClasses: [...keep], closeOpenWork: closeWork } : {}),
      });
      await loadBootstrap();
      setSelectedTerm(res.termId);
      ok(res.newYear
        ? `เริ่มปีการศึกษา ${year} แล้ว — เปิดห้องใหม่ ${res.classes.length} ห้อง · นักเรียน ${res.finished} คนจบปีการศึกษา`
        : `เริ่มภาคเรียน ${name} แล้ว`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "term_changed") {
        // a second tap or another device already did it: show what is true now
        setStale(true);
        await loadBootstrap().catch(() => {});
      }
      setErr(e instanceof ApiError ? e.message : "เริ่มภาคเรียนไม่สำเร็จ ลองอีกครั้ง");
    } finally { setBusy(false); }
  }

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" role="dialog" aria-label="เริ่มภาคเรียนใหม่" style="max-width:520px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:18px">เริ่มภาคเรียนใหม่</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div class="page-sub" style="margin-bottom:10px">
          ภาคเรียนปัจจุบัน: <b>{cur?.name ?? "ยังไม่มี"}</b> · สิ่งที่ทำไว้ในภาคเรียนเดิมไม่ถูกลบหรือแก้ — ดูย้อนหลังได้จากตัวเลือกเทอมด้านบน
        </div>

        <div class="modal-grid2">
          <label class="field"><span>ปีการศึกษา (พ.ศ.)</span>
            <input type="number" value={year} onInput={(e) => setYear(Number((e.target as HTMLInputElement).value))} />
          </label>
          <label class="field"><span>ภาคเรียน</span>
            <select value={term} onInput={(e) => setTerm(Number((e.target as HTMLSelectElement).value))}><option value={1}>1</option><option value={2}>2</option></select>
          </label>
        </div>
        <div class="modal-grid2">
          <label class="field"><span>วันเริ่ม</span><input type="date" value={start} onInput={(e) => setStart((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>วันสิ้นสุด (ใส่ทีหลังได้)</span><input type="date" value={end} onInput={(e) => setEnd((e.target as HTMLInputElement).value)} /></label>
        </div>
        {problem && <div class="imp-warn danger" role="alert"><Icon name="alert-triangle" size={15} /> {problem}</div>}

        {!newYear && (
          <div class="imp-warn" style="background:var(--bg-accent);color:var(--text-accent)">
            <Icon name="info-circle" size={15} /> ปีการศึกษาเดิม ({cur?.year}) — ห้องและนักเรียนเหมือนเดิม เปลี่ยนเฉพาะภาคเรียนปัจจุบันเป็น <b>{name}</b>
          </div>
        )}

        {newYear && cur && (<>
          <div class="imp-warn" style="background:var(--bg-accent);color:var(--text-accent)">
            <Icon name="info-circle" size={15} /> <span>เป็น<b>ปีการศึกษาใหม่ ({year})</b> — ห้องเรียนเป็นของแต่ละปี ปีใหม่จะได้ห้องว่างชื่อเดิม ส่วนห้องปี {cur.year} เก็บไว้พร้อมนักเรียนและงานทั้งหมด</span>
          </div>

          <label class="field" style="margin-top:10px"><span>ห้องที่เปิดต่อในปี {year} (ห้องว่าง ชื่อเดิม)</span></label>
          <div class="row wrap" style="gap:6px;margin-bottom:8px">
            {oldClasses.length === 0 && <span class="page-sub">ไม่มีห้องในปีนี้</span>}
            {oldClasses.map((c) => (
              <button class={"cls-chip " + (keep.has(c.id) ? "on" : "")} onClick={() => toggle(c.id)} aria-pressed={keep.has(c.id)}>
                {keep.has(c.id) && <Icon name="check" size={14} />} {c.name}
              </button>
            ))}
          </div>

          <ul class="sty-list" style="margin:6px 0 8px 18px;padding:0;font-size:13px;line-height:1.7">
            <li>นักเรียน <b>{finishing} คน</b> ที่ยังกำลังเรียนในห้องปี {cur.year} จะเป็น “จบปีการศึกษา” (ข้อมูลและคะแนนยังอยู่)</li>
            <li>ห้องปี {cur.year} ทั้งหมดถูกเก็บ · เช็กชื่อ/สแกนใช้ห้องของปี {year} เท่านั้น</li>
          </ul>

          {openWork > 0 && (
            <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-bottom:8px;cursor:pointer">
              <input type="checkbox" checked={closeWork} onChange={(e) => setCloseWork((e.target as HTMLInputElement).checked)} style="width:auto;height:auto;margin-top:3px" />
              <span>ปิดรับงานที่ยังเปิดอยู่ของปี {cur.year} ({openWork} งาน) — ตรวจ/แก้คะแนนย้อนหลังได้ตามเดิม</span>
            </label>
          )}
        </>)}

        {unsent > 0 && (
          <div class="imp-warn"><Icon name="alert-triangle" size={15} /> เครื่องนี้ยังมีข้อมูลรอส่ง {unsent} รายการ — ควรรอให้ส่งเสร็จก่อน (รายการของห้องที่ปิดแล้วจะไปอยู่ในรายการ “ต้องตรวจสอบ”)</div>
        )}

        {newYear && cur && (
          <label class="imp-confirm">
            <input type="checkbox" checked={sure} onChange={(e) => setSure((e.target as HTMLInputElement).checked)} />
            <span>ตรวจแล้ว — เริ่มปีการศึกษา <b style="font-weight:500">{year}</b> ({formatThaiDate(start)}) ย้อนกลับเองไม่ได้ แต่ข้อมูลปี {cur.year} ไม่หายและดูได้ตลอด</span>
          </label>
        )}

        {err && (
          <div style="color:var(--text-danger);font-size:13px;margin-top:8px" role="alert">
            {err}{stale && <> · <button class="lk" style="background:none;border:none;color:var(--text-accent);cursor:pointer;padding:0;font:inherit" onClick={onClose}>ปิดหน้าต่างนี้</button></>}
          </div>
        )}
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button onClick={onClose}>ยกเลิก</button>
          <button class="primary" onClick={go} disabled={!canStart}>
            {busy ? <Icon name="loader-2" class="spin" /> : <Icon name="calendar-plus" />} เริ่มภาคเรียน {name}
          </button>
        </div>
      </div>
    </div>
  );
}
