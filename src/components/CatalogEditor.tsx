import { useState } from "preact/hooks";
import { Icon } from "./Icon";
import { classes, subjects, workTypes, terms, currentTerm, startTermOpen, loadBootstrap } from "../store";
import type { Class, Subject, Term, WorkType } from "@shared/types";
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

/**
 * Move a row up/down. The list order IS the `sort` column, so this swaps the row with its neighbour and
 * writes only the rows whose number actually changes (renumbering 10, 20, 30… also untangles rows that
 * all started at the same number). One reload at the end, and even after a failure — show what is true.
 */
function useReorder<T extends { id: string; sort: number }>(endpoint: string, toBody: (x: T, sort: number) => unknown, failMsg: string) {
  return async (list: T[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const order = [...list];
    [order[i], order[j]] = [order[j], order[i]];
    const changes = order.map((x, idx) => ({ x, sort: (idx + 1) * 10 })).filter((c) => c.x.sort !== c.sort);
    await withToast(async () => { for (const c of changes) await api.post(endpoint, toBody(c.x, c.sort)); }, failMsg);
    await loadBootstrap();
  };
}

const COLOR_TH: Record<string, string> = { blue: "น้ำเงิน", aqua: "ฟ้า", violet: "ม่วง", orange: "ส้ม", green: "เขียว", magenta: "ชมพู", red: "แดง" };

function ColorSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select value={value} aria-label={label} onInput={(e) => onChange((e.target as HTMLSelectElement).value)} style="width:auto">
      {COLORS.map((c) => <option value={c}>{COLOR_TH[c] ?? c}</option>)}
    </select>
  );
}

function MoveButtons({ i, n, label, move }: { i: number; n: number; label: string; move: (dir: -1 | 1) => void }) {
  return (
    <span class="row" style="gap:2px;flex:none">
      <button class="icon ghost" style="width:30px;height:30px" aria-label={`เลื่อน ${label} ขึ้น`} title="เลื่อนขึ้น" disabled={i === 0} onClick={() => move(-1)}><Icon name="chevron-up" size={16} /></button>
      <button class="icon ghost" style="width:30px;height:30px" aria-label={`เลื่อน ${label} ลง`} title="เลื่อนลง" disabled={i === n - 1} onClick={() => move(1)}><Icon name="chevron-down" size={16} /></button>
    </span>
  );
}

const SMALL = "height:30px;font-size:12px";
const ROW = "padding:8px 0;border-top:0.5px solid var(--border)";

function ClassRow({ c, i, n, save, move }: { c: Class; i: number; n: number; save: (b: unknown) => Promise<boolean>; move: (dir: -1 | 1) => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(c.name);
  const body = (over: Record<string, unknown>) => ({ id: c.id, name: c.name, grade: c.grade, sort: c.sort, archived: c.archived, ...over });
  const nm = name.trim();
  return (
    <div style={ROW}>
      <div class="row" style="gap:8px">
        <MoveButtons i={i} n={n} label={c.name} move={move} />
        <span class="grow">{c.name}{c.archived ? " (เก็บแล้ว)" : ""} <span class="page-sub">· ปีการศึกษา {c.year ?? "—"}</span></span>
        <button style={SMALL} onClick={() => { setName(c.name); setEdit((v) => !v); }}>แก้ไข</button>
        <button style={SMALL} onClick={() => save(body({ archived: !c.archived }))}>{c.archived ? "นำกลับ" : "เก็บ"}</button>
      </div>
      {edit && (
        <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">
          <input value={name} aria-label={`ชื่อห้อง ${c.name}`} onInput={(e) => setName((e.target as HTMLInputElement).value)} style="width:auto;flex:1;min-width:120px" />
          <button class="primary" style={SMALL} disabled={!nm || nm === c.name}
            onClick={async () => { if (await save(body({ name: nm, grade: nm.includes("/") ? nm.split("/")[0] : c.grade }))) setEdit(false); }}>บันทึก</button>
          <button style={SMALL} onClick={() => setEdit(false)}>ยกเลิก</button>
        </div>
      )}
    </div>
  );
}

function ClassEditor() {
  const save = useSave("/api/classes", "บันทึกห้องไม่สำเร็จ");
  const reorder = useReorder<Class>("/api/classes", (c, sort) => ({ id: c.id, name: c.name, grade: c.grade, sort, archived: c.archived }), "จัดลำดับห้องไม่สำเร็จ");
  const [name, setName] = useState("");
  // A class belongs to one academic year. Last year's classes (closed when the new year started) are kept
  // for the reports and can't be brought back — a new year gets new classes.
  const year = currentTerm.value?.year;
  const isPast = (c: { year: number | null }) => year != null && c.year != null && c.year < year;
  const now = classes.value.filter((c) => !isPast(c));
  const past = classes.value.filter(isPast);
  return (
    <div>
      {now.map((c, i) => <ClassRow key={c.id} c={c} i={i} n={now.length} save={save} move={(dir) => reorder(now, i, dir)} />)}
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

function SubjectRow({ s, i, n, save, move }: { s: Subject; i: number; n: number; save: (b: unknown) => Promise<boolean>; move: (dir: -1 | 1) => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(s.name);
  const [code, setCode] = useState(s.code ?? "");
  const [color, setColor] = useState(s.color);
  const body = (over: Record<string, unknown>) => ({ id: s.id, code: s.code, name: s.name, color: s.color, sort: s.sort, archived: s.archived, ...over });
  const nm = name.trim();
  const changed = nm !== s.name || code.trim() !== (s.code ?? "") || color !== s.color;
  return (
    <div style={ROW}>
      <div class="row" style="gap:8px">
        <MoveButtons i={i} n={n} label={s.name} move={move} />
        <span class={"chip " + s.color}>{s.name}</span>
        <span class="grow page-sub">{s.code}{s.archived ? " (เก็บแล้ว)" : ""}</span>
        <button style={SMALL} onClick={() => { setName(s.name); setCode(s.code ?? ""); setColor(s.color); setEdit((v) => !v); }}>แก้ไข</button>
        <button style={SMALL} onClick={() => save(body({ archived: !s.archived }))}>{s.archived ? "นำกลับ" : "เก็บ"}</button>
      </div>
      {edit && (
        <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">
          <input value={name} aria-label={`ชื่อวิชา ${s.name}`} onInput={(e) => setName((e.target as HTMLInputElement).value)} style="width:auto;flex:1;min-width:120px" />
          <input value={code} aria-label={`รหัสวิชา ${s.name}`} placeholder="รหัส" onInput={(e) => setCode((e.target as HTMLInputElement).value)} style="width:110px" />
          <ColorSelect value={color} onChange={setColor} label={`สีของ ${s.name}`} />
          <button class="primary" style={SMALL} disabled={!nm || !changed}
            onClick={async () => { if (await save(body({ name: nm, code: code.trim() || null, color }))) setEdit(false); }}>บันทึก</button>
          <button style={SMALL} onClick={() => setEdit(false)}>ยกเลิก</button>
        </div>
      )}
    </div>
  );
}

function SubjectEditor() {
  const save = useSave("/api/subjects", "บันทึกวิชาไม่สำเร็จ");
  const reorder = useReorder<Subject>("/api/subjects", (s, sort) => ({ id: s.id, code: s.code, name: s.name, color: s.color, sort, archived: s.archived }), "จัดลำดับวิชาไม่สำเร็จ");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("blue");
  const list = subjects.value;
  return (
    <div>
      {list.map((s, i) => <SubjectRow key={s.id} s={s} i={i} n={list.length} save={save} move={(dir) => reorder(list, i, dir)} />)}
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <input placeholder="ชื่อวิชา" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style="width:auto;flex:1;min-width:120px" />
        <input placeholder="รหัส (เช่น ว16101)" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} style="width:130px" />
        <ColorSelect value={color} onChange={setColor} label="สีของวิชาใหม่" />
        <button class="primary" onClick={async () => { if (!name.trim()) return; if (await save({ name: name.trim(), code: code || null, color, sort: (list.length + 1) * 10 })) { setName(""); setCode(""); } }}>
          <Icon name="plus" size={16} /> เพิ่ม
        </button>
      </div>
    </div>
  );
}

/** A default full score is a whole number 1–100 (what the assignment form and the API accept). */
const validFull = (v: string) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100;

function TypeRow({ w, i, n, save, move }: { w: WorkType; i: number; n: number; save: (b: unknown) => Promise<boolean>; move: (dir: -1 | 1) => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(w.name);
  const [color, setColor] = useState(w.color);
  const [full, setFull] = useState(String(w.default_full));
  const [isExam, setIsExam] = useState(w.is_exam);
  const body = (over: Record<string, unknown>) => ({ id: w.id, name: w.name, icon: w.icon, color: w.color, is_exam: w.is_exam, default_full: w.default_full, sort: w.sort, archived: w.archived, ...over });
  const nm = name.trim();
  const changed = nm !== w.name || color !== w.color || Number(full) !== w.default_full || isExam !== w.is_exam;
  return (
    <div style={ROW}>
      <div class="row" style="gap:8px">
        <MoveButtons i={i} n={n} label={w.name} move={move} />
        <span class={"chip " + w.color}>{w.name}</span>
        <span class="grow page-sub">เต็ม {w.default_full}{w.is_exam ? " · สอบ" : ""}{w.archived ? " (เก็บแล้ว)" : ""}</span>
        <button style={SMALL} onClick={() => { setName(w.name); setColor(w.color); setFull(String(w.default_full)); setIsExam(w.is_exam); setEdit((v) => !v); }}>แก้ไข</button>
        <button style={SMALL} onClick={() => save(body({ archived: !w.archived }))}>{w.archived ? "นำกลับ" : "เก็บ"}</button>
      </div>
      {edit && (
        <div style="margin-top:6px">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <input value={name} aria-label={`ชื่อประเภทงาน ${w.name}`} onInput={(e) => setName((e.target as HTMLInputElement).value)} style="width:auto;flex:1;min-width:120px" />
            <ColorSelect value={color} onChange={setColor} label={`สีของ ${w.name}`} />
            <label class="row page-sub" style="gap:6px">คะแนนเต็มเริ่มต้น
              <input type="number" min={1} max={100} value={full} aria-label={`คะแนนเต็มเริ่มต้นของ ${w.name}`} onInput={(e) => setFull((e.target as HTMLInputElement).value)} style="width:72px" />
            </label>
            <label class="row page-sub" style="gap:6px"><input type="checkbox" checked={isExam} onChange={(e) => setIsExam((e.target as HTMLInputElement).checked)} style="width:auto" /> เป็นการสอบ</label>
          </div>
          <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">
            <button class="primary" style={SMALL} disabled={!nm || !validFull(full) || !changed}
              onClick={async () => { if (await save(body({ name: nm, color, default_full: Number(full), is_exam: isExam }))) setEdit(false); }}>บันทึก</button>
            <button style={SMALL} onClick={() => setEdit(false)}>ยกเลิก</button>
            <span class="page-sub">คะแนนเต็มเริ่มต้นใช้กับงานที่สร้างใหม่เท่านั้น — งานที่มีอยู่ไม่เปลี่ยน</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeEditor() {
  const save = useSave("/api/work-types", "บันทึกประเภทงานไม่สำเร็จ");
  const reorder = useReorder<WorkType>("/api/work-types", (w, sort) => ({ id: w.id, name: w.name, icon: w.icon, color: w.color, is_exam: w.is_exam, default_full: w.default_full, sort, archived: w.archived }), "จัดลำดับประเภทงานไม่สำเร็จ");
  const [name, setName] = useState("");
  const [color, setColor] = useState("violet");
  const [full, setFull] = useState("10");
  const list = workTypes.value;
  return (
    <div>
      {list.map((w, i) => <TypeRow key={w.id} w={w} i={i} n={list.length} save={save} move={(dir) => reorder(list, i, dir)} />)}
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <input placeholder="เพิ่มประเภทงาน" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style="width:auto;flex:1;min-width:120px" />
        <ColorSelect value={color} onChange={setColor} label="สีของประเภทงานใหม่" />
        <label class="row page-sub" style="gap:6px">เต็ม
          <input type="number" min={1} max={100} value={full} aria-label="คะแนนเต็มเริ่มต้นของประเภทใหม่" onInput={(e) => setFull((e.target as HTMLInputElement).value)} style="width:72px" />
        </label>
        <button class="primary" disabled={!name.trim() || !validFull(full)} onClick={async () => { if (await save({ name: name.trim(), icon: "file-text", color, default_full: Number(full), sort: (list.length + 1) * 10 })) setName(""); }}>
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
