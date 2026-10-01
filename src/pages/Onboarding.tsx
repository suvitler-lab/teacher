import { useState } from "preact/hooks";
import "../styles/onboarding.css";
import { Icon } from "../components/Icon";
import { api, ApiError } from "../lib/api";
import { classes, subjects, terms, settings, loadBootstrap, onboardingOn, setSelectedTerm } from "../store";
import { navigate } from "../router";

const STEPS = ["โรงเรียน", "ภาคเรียน", "ห้องเรียน", "วิชา", "เสร็จแล้ว"];
const GRADES = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const SUBJECT_IDEAS = ["ภาษาไทย", "คณิตศาสตร์", "วิทยาศาสตร์", "ภาษาอังกฤษ", "สังคมศึกษา", "สุขศึกษาและพลศึกษา", "ศิลปะ", "การงานอาชีพ", "คอมพิวเตอร์"];
const COLORS = ["blue", "green", "orange", "violet", "aqua", "magenta", "red"];

function bkkToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
/** The academic year (พ.ศ.) and term the calendar suggests: term 1 from May, term 2 from Oct; Jan–Mar still belongs to last year's term 2. */
function suggestedTerm(): { year: number; term: number } {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  const m = d.getUTCMonth(); // 0 = Jan
  const be = d.getUTCFullYear() + 543;
  if (m <= 2) return { year: be - 1, term: 2 };
  return { year: be, term: m >= 9 ? 2 : 1 };
}
/** ป.6/1 · ม.1/2 … from "ป.6" and 3 rooms */
function roomNames(grade: string, rooms: number): string[] {
  return Array.from({ length: rooms }, (_, i) => `${grade}/${i + 1}`);
}
/** Split what the teacher typed: commas, spaces-only-between-lines, new lines. Drops blanks and repeats. */
function parseNames(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n،;]+/)) {
    const n = raw.trim().replace(/\s+/g, " ");
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function NameChips({ names, onRemove }: { names: string[]; onRemove: (n: string) => void }) {
  if (!names.length) return null;
  return (
    <div class="ob-chips">
      {names.map((n) => (
        <span class="ob-chip" key={n}>
          {n}
          <button type="button" class="ob-x" aria-label={`เอา ${n} ออก`} onClick={() => onRemove(n)}><Icon name="x" size={13} /></button>
        </span>
      ))}
    </div>
  );
}

/**
 * First-run guide: school → term → classes → subjects, then what to do next. Every step saves as it goes and only
 * adds what is not there yet, so going back, retrying after a failure, or reloading in the middle never duplicates
 * anything. The guide is closed for good (settings.onboarding_done) when it is finished or skipped.
 */
export function Onboarding() {
  const s = settings.value;
  const startStep = terms.value.length === 0 ? 0 : classes.value.length === 0 ? 2 : 3;
  const [step, setStep] = useState(startStep);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 1 school
  const [school, setSchool] = useState(s?.school_name === "โรงเรียนบ้านตัวอย่าง" ? "" : s?.school_name ?? "");
  const [teacher, setTeacher] = useState(s?.teacher_name === "ครูผู้สอน" ? "" : s?.teacher_name ?? "");
  // 2 term
  const [year, setYear] = useState(suggestedTerm().year);
  const [term, setTerm] = useState(suggestedTerm().term);
  const [start, setStart] = useState(bkkToday());
  // 3 classes
  const [names, setNames] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [grade, setGrade] = useState("ป.6");
  const [rooms, setRooms] = useState(1);
  // 4 subjects
  const [subs, setSubs] = useState<string[]>([]);
  const [typedSub, setTypedSub] = useState("");

  const existingClasses = new Set(classes.value.filter((c) => !c.archived).map((c) => c.name));
  const existingSubjects = new Set(subjects.value.filter((c) => !c.archived).map((c) => c.name));

  async function run(fn: () => Promise<void>, next: number) {
    setErr(""); setBusy(true);
    try { await fn(); setStep(next); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  const saveSchool = () => run(async () => {
    await api.put("/api/settings", { school_name: school.trim() || "โรงเรียน", teacher_name: teacher.trim() || "ครูผู้สอน" });
    await loadBootstrap();
  }, 1);

  const saveTerm = () => run(async () => {
    if (terms.value.length === 0) {
      const res = await api.post<{ termId: string }>("/api/terms/start", {
        expectedCurrentTermId: null, year, term, name: `${term}/${year}`, start_date: start,
      });
      await loadBootstrap();
      setSelectedTerm(res.termId);
    }
  }, 2);

  const addNames = (list: string[]) => setNames((cur) => [...cur, ...list.filter((n) => !cur.includes(n))]);
  function addTypedClasses() { addNames(parseNames(typed)); setTyped(""); }
  const saveClasses = () => run(async () => {
    const pending = [...names, ...parseNames(typed)].filter((n, i, a) => a.indexOf(n) === i);
    let sort = classes.value.length;
    for (const name of pending) {
      if (existingClasses.has(name)) continue;
      await api.post("/api/classes", { name, grade: name.split("/")[0], sort: ++sort });
      existingClasses.add(name);
    }
    setTyped("");
    await loadBootstrap();
  }, 3);

  const addSub = (list: string[]) => setSubs((cur) => [...cur, ...list.filter((n) => !cur.includes(n))]);
  const saveSubjects = () => run(async () => {
    const pending = [...subs, ...parseNames(typedSub)].filter((n, i, a) => a.indexOf(n) === i);
    let sort = subjects.value.length;
    for (const name of pending) {
      if (existingSubjects.has(name)) continue;
      await api.post("/api/subjects", { name, color: COLORS[sort % COLORS.length], sort: ++sort });
      existingSubjects.add(name);
    }
    setTypedSub("");
    await loadBootstrap();
  }, 4);

  async function close(then?: () => void) {
    setBusy(true);
    // closed on this device either way; if the server can't be told now the guide simply shows once more next time
    if (settings.value) settings.value = { ...settings.value, onboarding_done: true };
    try { await api.put("/api/settings", { onboarding_done: true }); } catch { /* see above */ }
    onboardingOn.value = false;
    setBusy(false);
    then?.();
  }
  function skip() {
    if (confirm("ข้ามการตั้งค่าเริ่มต้น? ตั้งเองภายหลังได้ที่ ตั้งค่า และหน้านักเรียน")) void close();
  }

  const canTerm = year >= 2500 && year <= 2700 && !!start;

  return (
    <div class="ob-wrap">
      <div class="ob-card card">
        <div class="ob-head">
          <div class="auth-logo" style="margin:0"><Icon name="checks" size={28} /></div>
          <div>
            <h1 style="font-size:20px">ยินดีต้อนรับสู่งานครบ</h1>
            <div class="page-sub">ตั้งค่าเริ่มต้น 4 ขั้นตอน ใช้เวลาไม่ถึง 3 นาที</div>
          </div>
        </div>

        <ol class="ob-steps" aria-label="ขั้นตอน">
          {STEPS.map((label, i) => (
            <li class={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              <span class="dot">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              <span class="lbl">{label}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <form onSubmit={(e) => { e.preventDefault(); void saveSchool(); }}>
            <h2 class="ob-h">โรงเรียนและครูผู้สอน</h2>
            <p class="ob-p">ชื่อนี้ขึ้นบนหน้าหลัก รายงาน และใบสติกเกอร์ QR แก้ทีหลังได้ที่ ตั้งค่า</p>
            <label class="field"><span>ชื่อโรงเรียน</span>
              <input value={school} placeholder="เช่น โรงเรียนบ้านตัวอย่าง" autofocus onInput={(e) => setSchool((e.target as HTMLInputElement).value)} />
            </label>
            <label class="field"><span>ชื่อครู (ที่แสดงทักทาย)</span>
              <input value={teacher} placeholder="เช่น ครูสมชาย" onInput={(e) => setTeacher((e.target as HTMLInputElement).value)} />
            </label>
            <Nav busy={busy} err={err} nextLabel="ถัดไป" onSkip={skip} />
          </form>
        )}

        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); void saveTerm(); }}>
            <h2 class="ob-h">ภาคเรียนปัจจุบัน</h2>
            {terms.value.length > 0
              ? <p class="ob-p">มีภาคเรียน <b>{terms.value.find((t) => t.is_current)?.name ?? terms.value[0].name}</b> แล้ว ไปขั้นถัดไปได้เลย</p>
              : (<>
                <p class="ob-p">งาน เช็คชื่อ และห้องเรียนจะอยู่ในปีการศึกษานี้ ปีหน้าเริ่มปีใหม่ได้จากปุ่ม “เริ่มภาคเรียนใหม่” โดยข้อมูลปีนี้ไม่หาย</p>
                <div class="modal-grid2">
                  <label class="field"><span>ปีการศึกษา (พ.ศ.)</span>
                    <input type="number" inputMode="numeric" value={year} onInput={(e) => setYear(Number((e.target as HTMLInputElement).value))} />
                  </label>
                  <label class="field"><span>ภาคเรียน</span>
                    <select value={term} onInput={(e) => setTerm(Number((e.target as HTMLSelectElement).value))}><option value={1}>1</option><option value={2}>2</option></select>
                  </label>
                </div>
                <label class="field"><span>วันเปิดภาคเรียน</span>
                  <input type="date" value={start} onInput={(e) => setStart((e.target as HTMLInputElement).value)} />
                </label>
              </>)}
            <Nav busy={busy} err={err} nextLabel="ถัดไป" disabled={terms.value.length === 0 && !canTerm} onBack={() => setStep(0)} onSkip={skip} />
          </form>
        )}

        {step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); void saveClasses(); }}>
            <h2 class="ob-h">ห้องเรียนที่สอน</h2>
            <p class="ob-p">เลือกชั้นและจำนวนห้องเพื่อสร้างชื่ออัตโนมัติ หรือพิมพ์เอง (คั่นด้วยจุลภาค) ยังไม่ต้องใส่นักเรียนตอนนี้</p>
            <div class="ob-gen">
              <select value={grade} aria-label="ชั้น" onInput={(e) => setGrade((e.target as HTMLSelectElement).value)}>
                {GRADES.map((g) => <option>{g}</option>)}
              </select>
              <select value={rooms} aria-label="จำนวนห้อง" onInput={(e) => setRooms(Number((e.target as HTMLSelectElement).value))}>
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option value={n}>{n} ห้อง</option>)}
              </select>
              <button type="button" onClick={() => addNames(roomNames(grade, rooms))}><Icon name="plus" size={16} /> เพิ่ม {grade}/1{rooms > 1 ? `–${rooms}` : ""}</button>
            </div>
            <div class="ob-add">
              <input value={typed} placeholder="หรือพิมพ์ชื่อห้อง เช่น ป.6/1, ป.6/2"
                onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTypedClasses(); } }} />
              <button type="button" onClick={addTypedClasses} disabled={!typed.trim()}>เพิ่ม</button>
            </div>
            {existingClasses.size > 0 && <div class="ob-p" style="margin:8px 0 0">มีอยู่แล้ว: {[...existingClasses].join(", ")}</div>}
            <NameChips names={names} onRemove={(n) => setNames((c) => c.filter((x) => x !== n))} />
            <Nav busy={busy} err={err} nextLabel={names.length || typed.trim() ? "บันทึกห้องเรียน" : "ข้ามขั้นนี้"} onBack={() => setStep(1)} onSkip={skip} />
          </form>
        )}

        {step === 3 && (
          <form onSubmit={(e) => { e.preventDefault(); void saveSubjects(); }}>
            <h2 class="ob-h">วิชาที่สอน</h2>
            <p class="ob-p">แตะเพื่อเลือกวิชา หรือพิมพ์เพิ่มเอง วิชาใช้จัดกลุ่มงานและคะแนน เพิ่มทีหลังได้</p>
            <div class="ob-chips">
              {SUBJECT_IDEAS.map((n) => {
                const on = subs.includes(n) || existingSubjects.has(n);
                return (
                  <button type="button" class={"cls-chip " + (on ? "on" : "")} aria-pressed={on} disabled={existingSubjects.has(n)}
                    onClick={() => setSubs((c) => c.includes(n) ? c.filter((x) => x !== n) : [...c, n])}>
                    {on && <Icon name="check" size={14} />} {n}
                  </button>
                );
              })}
            </div>
            <div class="ob-add">
              <input value={typedSub} placeholder="วิชาอื่น ๆ เช่น ภาษาจีน, ผู้ใช้ปัญญา"
                onInput={(e) => setTypedSub((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(parseNames(typedSub)); setTypedSub(""); } }} />
              <button type="button" onClick={() => { addSub(parseNames(typedSub)); setTypedSub(""); }} disabled={!typedSub.trim()}>เพิ่ม</button>
            </div>
            <NameChips names={subs.filter((n) => !SUBJECT_IDEAS.includes(n))} onRemove={(n) => setSubs((c) => c.filter((x) => x !== n))} />
            <Nav busy={busy} err={err} nextLabel={subs.length || typedSub.trim() ? "บันทึกวิชา" : "ข้ามขั้นนี้"} onBack={() => setStep(2)} onSkip={skip} />
          </form>
        )}

        {step === 4 && (
          <div>
            <div class="ob-done"><Icon name="circle-check" size={44} /></div>
            <h2 class="ob-h" style="text-align:center">พร้อมใช้งานแล้ว</h2>
            <p class="ob-p" style="text-align:center">
              {terms.value.find((t) => t.is_current)?.name ? `ภาคเรียน ${terms.value.find((t) => t.is_current)!.name} · ` : ""}
              {classes.value.filter((c) => !c.archived).length} ห้อง · {subjects.value.filter((c) => !c.archived).length} วิชา
            </p>
            <div class="ob-next">
              <button class="primary" disabled={busy || classes.value.length === 0} onClick={() => close(() => navigate("/students"))}>
                <Icon name="users" size={18} /> เพิ่มรายชื่อนักเรียน (นำเข้า Excel)
              </button>
              <button disabled={busy} onClick={() => close(() => navigate("/gradebook", { new: 1 }))}>
                <Icon name="plus" size={18} /> สร้างงานแรก
              </button>
              <button class="ghost" disabled={busy} onClick={() => close(() => navigate("/home"))}>ไปหน้าหลัก</button>
            </div>
            {classes.value.length === 0 && <p class="ob-p" style="text-align:center;margin-top:10px">ยังไม่มีห้องเรียน — เพิ่มห้องก่อนจึงนำเข้านักเรียนได้ <button class="lk" style="background:none;border:none;cursor:pointer;color:var(--text-accent);padding:0;font:inherit" onClick={() => setStep(2)}>กลับไปเพิ่มห้อง</button></p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Nav({ busy, err, nextLabel, disabled, onBack, onSkip }: {
  busy: boolean; err: string; nextLabel: string; disabled?: boolean; onBack?: () => void; onSkip: () => void;
}) {
  return (
    <>
      {err && <div class="auth-err" role="alert" style="margin-top:10px">{err}</div>}
      <div class="ob-nav">
        <button type="button" class="ghost" onClick={onSkip} disabled={busy}>ข้ามการตั้งค่า</button>
        <span style="flex:1" />
        {onBack && <button type="button" onClick={onBack} disabled={busy}>ย้อนกลับ</button>}
        <button class="primary" disabled={busy || disabled}>
          {busy ? <Icon name="loader-2" class="spin" /> : null} {nextLabel}
        </button>
      </div>
    </>
  );
}
