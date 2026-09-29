import { useState } from "preact/hooks";
import { Icon } from "./Icon";
import { classes, subjects, workTypes, terms, currentTerm, startTermOpen, loadBootstrap } from "../store";
import type { Term } from "@shared/types";
import { api } from "../lib/api";
import { ok, err, withToast } from "../lib/notify";

type Tab = "classes" | "subjects" | "types" | "terms";
const TABS: { key: Tab; label: string }[] = [
  { key: "classes", label: "ห้องเรียน" },
  { key: "subjects", label: "วิชา" },
  { key: "types", label: "ประเภทงาน" },
  { key: "terms", label: "ภาคเรียน" },
];

const COLORS = ["blue", "aqua", "violet", "orange", "green", "magenta", "red"];

export function CatalogEditor() {
  const [tab, setTab] = useState<Tab>("classes");
  return (
    <div>
      <div class="stu-tabs" style="margin-bottom:12px">
        {TABS.map((t) => (
          <button class={"stu-tab " + (t.key === tab ? "on" : "")} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "classes" && <ClassEditor />}
      {tab === "subjects" && <SubjectEditor />}
      {tab === "types" && <TypeEditor />}
      {tab === "terms" && <TermEditor />}
    </div>
  );
}

function useSave(endpoint: string, failMsg: string) {
  return async (body: unknown) => {
    const done = await withToast(() => api.post(endpoint, body), failMsg);
    if (done) { await loadBootstrap(); ok("บันทึกแล้ว"); }
    return done;
  };
}

function ClassEditor() {
  const save = useSave("/api/classes", "บันทึกห้องไม่สำเร็จ");
  const [name, setName] = useState("");
  // A class belongs to one academic year. Last year's classes (closed when the new year started) are kept
  // for the reports and can't be brought back — a new year gets new classes.
  const year = currentTerm.value?.year;
  const isPast = (c: { year: number | null }) => year != null && c.year != null && c.year < year;
  const now = classes.value.filter((c) => !isPast(c));
  const past = classes.value.filter(isPast);
  return (
    <div>
      {now.map((c) => (
        <div class="row" style="gap:8px;padding:8px 0;border-top:0.5px solid var(--border)">
          <span class="grow">{c.name}{c.archived ? " (เก็บแล้ว)" : ""}</span>
          <button style="height:30px;font-size:12px" onClick={() => save({ id: c.id, name: c.name, grade: c.grade, sort: c.sort, archived: !c.archived })}>
            {c.archived ? "นำกลับ" : "เก็บ"}
          </button>
        </div>
      ))}
      {past.length > 0 && (
        <details style="margin-top:10px">
          <summary class="page-sub" style="cursor:pointer">ห้องของปีที่ผ่านมา ({past.length}) — เก็บไว้ดูรายงานย้อนหลัง</summary>
          {past.map((c) => (
            <div class="row" style="gap:8px;padding:6px 0;border-top:0.5px solid var(--border)">
              <span class="grow">{c.name} <span class="page-sub">· ปีการศึกษา {c.year}</span></span>
            </div>
          ))}
        </details>
      )}
      <div class="row" style="gap:8px;margin-top:10px">
        <input placeholder="เพิ่มห้อง เช่น ป.6/3" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button class="primary" onClick={async () => { if (!name.trim()) return; const g = name.split("/")[0]; if (await save({ name: name.trim(), grade: g, sort: (Math.max(0, ...now.map((c) => c.sort)) + 10) })) setName(""); }}>
          <Icon name="plus" size={16} /> เพิ่ม
        </button>
      </div>
    </div>
  );
}

function SubjectEditor() {
  const save = useSave("/api/subjects", "บันทึกวิชาไม่สำเร็จ");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("blue");
  return (
    <div>
      {subjects.value.map((s) => (
        <div class="row" style="gap:8px;padding:8px 0;border-top:0.5px solid var(--border)">
          <span class={"chip " + s.color}>{s.name}</span>
          <span class="grow page-sub">{s.code}</span>
          <button style="height:30px;font-size:12px" onClick={() => save({ id: s.id, code: s.code, name: s.name, color: s.color, sort: s.sort, archived: !s.archived })}>
            {s.archived ? "นำกลับ" : "เก็บ"}
          </button>
        </div>
      ))}
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <input placeholder="ชื่อวิชา" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style="width:auto;flex:1;min-width:120px" />
        <input placeholder="รหัส (เช่น ว16101)" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} style="width:130px" />
        <select value={color} onInput={(e) => setColor((e.target as HTMLSelectElement).value)} style="width:auto">
          {COLORS.map((c) => <option value={c}>{c}</option>)}
        </select>
        <button class="primary" onClick={async () => { if (!name.trim()) return; if (await save({ name: name.trim(), code: code || null, color, sort: (subjects.value.length + 1) * 10 })) { setName(""); setCode(""); } }}>
          <Icon name="plus" size={16} /> เพิ่ม
        </button>
      </div>
    </div>
  );
}

function TypeEditor() {
  const save = useSave("/api/work-types", "บันทึกประเภทงานไม่สำเร็จ");
  const [name, setName] = useState("");
  return (
    <div>
      {workTypes.value.map((w) => (
        <div class="row" style="gap:8px;padding:8px 0;border-top:0.5px solid var(--border)">
          <span class={"chip " + w.color}>{w.name}</span>
          <span class="grow page-sub">เต็ม {w.default_full}{w.is_exam ? " · สอบ" : ""}</span>
          <button style="height:30px;font-size:12px" onClick={() => save({ id: w.id, name: w.name, icon: w.icon, color: w.color, is_exam: w.is_exam, default_full: w.default_full, sort: w.sort, archived: !w.archived })}>
            {w.archived ? "นำกลับ" : "เก็บ"}
          </button>
        </div>
      ))}
      <div class="row" style="gap:8px;margin-top:10px">
        <input placeholder="เพิ่มประเภทงาน" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button class="primary" onClick={async () => { if (!name.trim()) return; if (await save({ name: name.trim(), icon: "file-text", color: "violet", default_full: 10, sort: (workTypes.value.length + 1) * 10 })) setName(""); }}>
          <Icon name="plus" size={16} /> เพิ่ม
        </button>
      </div>
    </div>
  );
}

function TermRow({ t, save }: { t: Term; save: (body: unknown) => Promise<void> }) {
  const [start, setStart] = useState(t.start_date ?? "");
  const [end, setEnd] = useState(t.end_date ?? "");
  const cur = currentTerm.value;
  // switching between the terms of the SAME academic year is one tap; another year needs "เริ่มภาคเรียนใหม่"
  // (it also opens that year's classes), and going back to an earlier year is done with the term picker instead
  const canSwitch = !t.is_current && !!cur && t.year === cur.year;
  const changed = start !== (t.start_date ?? "") || end !== (t.end_date ?? "");
  return (
    <div style="padding:8px 0;border-top:0.5px solid var(--border)">
      <div class="row" style="gap:8px">
        <div class="grow">{t.name}{t.is_current ? " · ปัจจุบัน" : ""}</div>
        {canSwitch && (
          <button style="height:30px;font-size:12px" onClick={() => save({ id: t.id, year: t.year, term: t.term, name: t.name, start_date: t.start_date, end_date: t.end_date, is_current: true })}>
            ตั้งเป็นปัจจุบัน
          </button>
        )}
      </div>
      <div class="row" style="gap:6px;margin-top:4px;flex-wrap:wrap">
        <input type="date" aria-label={`วันเริ่ม ${t.name}`} value={start} onInput={(e) => setStart((e.target as HTMLInputElement).value)} style="width:auto;height:30px" />
        <span class="page-sub">–</span>
        <input type="date" aria-label={`วันสิ้นสุด ${t.name}`} value={end} onInput={(e) => setEnd((e.target as HTMLInputElement).value)} style="width:auto;height:30px" />
        {changed && (
          <button class="primary" style="height:30px;font-size:12px"
            onClick={() => save({ id: t.id, year: t.year, term: t.term, name: t.name, start_date: start || null, end_date: end || null, is_current: t.is_current })}>
            บันทึกวันที่
          </button>
        )}
      </div>
    </div>
  );
}

function TermEditor() {
  const [year, setYear] = useState(currentTerm.value?.year ?? 2569);
  const [term, setTerm] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  async function save(body: unknown) {
    try { await api.post("/api/terms", body); await loadBootstrap(); ok("บันทึกภาคเรียนแล้ว"); }
    catch (e: any) { err(e.message || "บันทึกภาคเรียนไม่สำเร็จ"); }
  }
  return (
    <div>
      <div class="row" style="gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
        <span class="page-sub grow">ภาคเรียนปัจจุบัน: <b>{currentTerm.value?.name ?? "ยังไม่มี"}</b> · เปลี่ยนภาคเรียน/ขึ้นปีการศึกษาใหม่ด้วยปุ่มนี้ (ข้อมูลเดิมไม่ถูกแก้)</span>
        <button class="primary" onClick={() => { startTermOpen.value = true; }}><Icon name="calendar-plus" size={16} /> เริ่มภาคเรียนใหม่</button>
      </div>
      {terms.value.map((t) => <TermRow key={t.id + (t.start_date ?? "") + (t.end_date ?? "")} t={t} save={save} />)}
      <div class="modal-grid2" style="margin-top:10px">
        <label class="field"><span>ปี (พ.ศ.)</span><input type="number" value={year} onInput={(e) => setYear(Number((e.target as HTMLInputElement).value))} /></label>
        <label class="field"><span>ภาคเรียน</span><select value={term} onInput={(e) => setTerm(Number((e.target as HTMLSelectElement).value))}><option value={1}>1</option><option value={2}>2</option></select></label>
      </div>
      <div class="modal-grid2">
        <label class="field"><span>วันเริ่ม</span><input type="date" value={start} onInput={(e) => setStart((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>วันสิ้นสุด</span><input type="date" value={end} onInput={(e) => setEnd((e.target as HTMLInputElement).value)} /></label>
      </div>
      <button class="primary" style="margin-top:6px" onClick={() => save({ year, term, name: `${term}/${year}`, start_date: start || null, end_date: end || null })}>
        <Icon name="plus" size={16} /> เพิ่มภาคเรียน (ไม่เปลี่ยนภาคเรียนปัจจุบัน)
      </button>
    </div>
  );
}
