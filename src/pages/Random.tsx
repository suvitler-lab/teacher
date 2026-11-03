import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/random.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented, NoClasses } from "../components/ui";
import { activeClasses, studentsByClass } from "../store";
import { api } from "../lib/api";
import { kvGet, kvSet } from "../lib/idb";
import { shortName, fullName } from "../lib/names";
import { navigate } from "../router";
import { useLoadGuard } from "../lib/loader";
import { pickNext, shuffle, remainingInRound, attendancePool, type PoolBlocker } from "../lib/random";
import type { Student } from "@shared/types";
import { bkkToday } from "@shared/time";
import { randomLayout } from "../lib/pageCards";
import { isHiddenCard } from "../lib/cardLayout";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { RANDOM_CARD_META, RANDOM_LOCKED } from "../components/cards/meta";
import { ProjectorButton, ProjectorShell } from "../components/Projector";
import { projectorOn } from "../lib/projector";

const GROUP_COLORS = ["var(--tint-blue-fg)", "var(--tint-aqua-fg)", "var(--tint-violet-fg)", "var(--tint-orange-fg)", "var(--tint-green-fg)", "var(--tint-magenta-fg)", "var(--tint-red-fg)", "var(--text-secondary)"];

const todayBkk = () => bkkToday();

interface Att { status: "loading" | "ready" | "error"; marked: number; present: Set<string> }
const NOBODY: Att = { status: "loading", marked: 0, present: new Set() };

export function RandomPage() {
  const [classId, setClassId] = useState(activeClasses.value[0]?.id ?? "");
  const [mode, setMode] = useState<"pick" | "group">("pick");
  const [presentOnly, setPresentOnly] = useState(true);
  const [noRepeat, setNoRepeat] = useState(true);
  const [count, setCount] = useState(1);
  const [att, setAtt] = useState<Att>(NOBODY);
  const [display, setDisplay] = useState<{ badge: string; name: string; sub: string } | null>(null);
  const [groups, setGroups] = useState<Student[][]>([]);
  const [rolling, setRolling] = useState(false);
  const [called, setCalled] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const calledRef = useRef<Set<string>>(new Set());
  const [prefsOpen, setPrefsOpen] = useState(false);
  const layout = randomLayout.value;
  const on = (k: "hist" | "opts" | "timer" | "pass" | "range" | "pair" | "gopts") => !isHiddenCard(layout, k);
  const [useRange, setUseRange] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(99);
  const [pair, setPair] = useState(false);
  const [byGroups, setByGroups] = useState(false);
  const [leaders, setLeaders] = useState(true);
  const [timerSec, setTimerSec] = useState(30);
  const [left, setLeft] = useState(30);
  const [running, setRunning] = useState(false);
  const [lastPicks, setLastPicks] = useState<string[]>([]);
  const begin = useLoadGuard();

  const allStudents = studentsByClass.value.get(classId) ?? [];
  const histKey = `random:${classId}:${todayBkk()}`;

  async function loadPresent() {
    const fresh = begin();
    if (!classId) { setAtt({ status: "ready", marked: 0, present: new Set() }); return; }
    setAtt({ status: "loading", marked: 0, present: new Set() });
    try {
      const q = new URLSearchParams({ date: todayBkk(), class: classId });
      const res = await api.get<{ rows: any[] }>(`/api/attendance?${q}`);
      if (!fresh()) return; // the teacher already picked another room
      const present = new Set<string>();
      for (const r of res.rows) if (r.status === "present" || r.status === "late") present.add(r.student_id);
      setAtt({ status: "ready", marked: res.rows.length, present });
    } catch {
      if (fresh()) setAtt({ status: "error", marked: 0, present: new Set() });
    }
  }
  useEffect(() => {
    loadPresent();
    kvGet<string[]>(histKey).then((h) => { calledRef.current = new Set(h ?? []); setCalled(h ?? []); });
    setDisplay(null); setGroups([]);
  }, [classId]);

  // Who can be drawn. "Only those who came" never quietly turns into "the whole class".
  const base: { pool: Student[]; blocker: PoolBlocker } =
    presentOnly ? attendancePool(allStudents, att) : { pool: allStudents, blocker: "none" };
  // "range" narrows who can be drawn to numbers x..y — only when that card is on, so a hidden card never changes the draw
  const ranged = on("range") && useRange;
  const pool = ranged ? base.pool.filter((st) => (st.number ?? 0) >= rangeFrom && (st.number ?? 0) <= rangeTo) : base.pool;
  const blocker: PoolBlocker = base.blocker !== "none" ? base.blocker : pool.length === 0 ? "nobody" : "none";

  function saveHistory(next: Set<string>) { calledRef.current = next; const arr = [...next]; setCalled(arr); void kvSet(histKey, arr); }
  function resetHistory() { saveHistory(new Set()); }

  function go() {
    if (rolling) return;
    setGroups([]);
    if (pool.length === 0) return;

    if (mode === "group") {
      const s = shuffle(pool);
      const k = byGroups && on("gopts") ? Math.max(1, Math.min(s.length, count)) : Math.max(1, Math.round(s.length / count));
      const g: Student[][] = Array.from({ length: k }, () => []);
      s.forEach((st, i) => g[i % k].push(st));
      setGroups(g);
      setDisplay({ badge: String(k), name: `แบ่งได้ ${k} กลุ่ม`, sub: `กลุ่มละ ~${count} คน จาก ${s.length} คน` });
      return;
    }

    const want = pair && on("pair") ? 2 : count;
    const { picks, called: next } = pickNext(pool, want, calledRef.current, noRepeat);
    setLeft(timerSec); setRunning(false);
    setRolling(true);
    let delay = 40;
    const step = () => {
      const r = pool[Math.floor(Math.random() * pool.length)];
      setDisplay({ badge: String(r.number ?? "?"), name: r.first_name, sub: `เลขที่ ${r.number ?? "-"}` });
      delay *= 1.13;
      if (delay < 340) { setTimeout(step, delay); return; }
      if (picks.length === 1) setDisplay({ badge: String(picks[0].number ?? "?"), name: fullName(picks[0]), sub: picks[0].nickname ? `“${picks[0].nickname}” · เลขที่ ${picks[0].number ?? "-"}` : `เลขที่ ${picks[0].number ?? "-"}` });
      else if (pair && on("pair")) setDisplay({ badge: "2", name: `${shortName(picks[0])} คู่กับ ${shortName(picks[1])}`, sub: picks.map((s) => "เลขที่ " + (s.number ?? "-")).join(" · ") });
      else setDisplay({ badge: String(picks.length), name: picks.map((s) => shortName(s)).join(" · "), sub: picks.map((s) => "เลขที่ " + (s.number ?? "-")).join(" · ") });
      setLastPicks(picks.map((x) => x.id));
      setRolling(false);
      saveHistory(next);
    };
    step();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat && !(e.target as HTMLElement)?.closest('input,textarea,select,button,a,[contenteditable="true"],[role="dialog"]')) { e.preventDefault(); go(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // skip: the child just drawn goes back into the pool (not counted as called), then the next one is drawn
  function passCurrent() {
    if (rolling || lastPicks.length === 0) return;
    const next = new Set(calledRef.current);
    lastPicks.forEach((id) => next.delete(id));
    calledRef.current = next;
    setLastPicks([]);
    saveHistory(next);
    setTimeout(go, 0);
  }
  // undo: take the last child back out of the called list and show nothing (the teacher decides what comes next)
  function undoLast() {
    if (rolling || lastPicks.length === 0) return;
    const next = new Set(calledRef.current);
    lastPicks.forEach((id) => next.delete(id));
    setLastPicks([]);
    setDisplay(null);
    saveHistory(next);
  }
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((v) => { if (v <= 1) { setRunning(false); return 0; } return v - 1; }), 1000);
    return () => clearInterval(t);
  }, [running]);

  function copyGroups() {
    const text = groups.map((g, i) => `กลุ่ม ${i + 1}: ${g.map((s) => shortName(s)).join(", ")}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const remaining = remainingInRound(pool, calledRef.current);
  const classItems = activeClasses.value.map((c) => ({ id: c.id, name: c.name, count: (studentsByClass.value.get(c.id) ?? []).length }));
  const cameToday = att.status === "ready" && att.marked > 0 ? `มาเรียนวันนี้ ${att.present.size} จาก ${allStudents.length} คน` : att.status === "ready" ? "วันนี้ยังไม่ได้เช็คชื่อ" : att.status === "error" ? "โหลดเช็คชื่อไม่สำเร็จ" : "กำลังโหลดเช็คชื่อ…";

  if (!classId) return <><PageHeader icon="arrows-shuffle" title="สุ่มชื่อ" /><NoClasses /></>;

  return (
    <div>
      <PageHeader icon="arrows-shuffle" title="สุ่มชื่อ"
        sub={<span>{activeClasses.value.find((c) => c.id === classId)?.name} · {cameToday}</span>}
        actions={<>
          <Segmented value={mode} onChange={(v) => { setMode(v); setCount(v === "group" ? 4 : 1); setGroups([]); }} options={[
            { value: "pick", label: <><Icon name="user" size={15} /> สุ่มชื่อ</> },
            { value: "group", label: <><Icon name="users-group" size={15} /> จับกลุ่ม</> },
          ]} />
          <button class="ghost" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={18} /> <span class="att-hide-sm">ปรับการ์ด</span></button>
          <ProjectorButton />
        </>}
      />

      {projectorOn.value && (
        <ProjectorShell page="random">
          {pool.length === 0 ? <div class="empty">ยังไม่มีรายชื่อ</div>
            : mode === "group" && groups.length > 0 ? <div class="pgroups">{groups.map((g, i) => <div class="pcard"><b>กลุ่ม {i + 1}</b><div>{g.map((st, k) => `${leaders && on("gopts") && k === 0 ? "★ " : ""}${shortName(st)}`).join(" · ")}</div></div>)}</div>
            : display ? <div class="pcard" style="margin:auto;width:100%;display:flex;flex-direction:column;align-items:center;gap:calc(var(--pj-u)*12);padding:calc(var(--pj-u)*30)"><span class="rbadge" style="display:inline-flex;align-items:center;justify-content:center;border-radius:50%">{display.badge}</span><div class="big">{display.name}</div></div>
            : <div class="empty">พร้อมสุ่ม — กด “{mode === "group" ? "จับกลุ่ม" : "สุ่มคนต่อไป"}”</div>}
          <div style="display:flex;justify-content:center"><button class="pjbtn" onClick={go} disabled={rolling || pool.length === 0}><Icon name="arrows-shuffle" size={40} />{mode === "group" ? "จับกลุ่ม" : "สุ่มคนต่อไป"}</button></div>
        </ProjectorShell>
      )}
      {prefsOpen && <PageCardSettings page="random" title="หน้าสุ่มชื่อ" layout={layout} meta={RANDOM_CARD_META} locked={RANDOM_LOCKED} onClose={() => setPrefsOpen(false)} />}
      <div style="margin-bottom:12px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>

      {blocker !== "none" && (
        <div class="rnd-notice" role="status">
          <Icon name={blocker === "loading" ? "loader-2" : blocker === "error" ? "cloud-off" : "info-circle"} size={18} class={blocker === "loading" ? "spin" : undefined} />
          <div class="grow">
            {blocker === "loading" && "กำลังโหลดรายชื่อคนที่มาเรียน…"}
            {blocker === "error" && "โหลดข้อมูลเช็คชื่อไม่สำเร็จ จึงยังไม่รู้ว่าใครมาเรียน"}
            {blocker === "unchecked" && "วันนี้ยังไม่ได้เช็คชื่อห้องนี้ จึงยังไม่รู้ว่าใครมาเรียน"}
            {blocker === "nobody" && "เช็คชื่อแล้ว แต่วันนี้ไม่มีใครมาเรียน — ไม่มีรายชื่อให้สุ่ม"}
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            {blocker === "unchecked" && <button style="height:2rem;font-size:var(--fs-xs)" onClick={() => navigate("/attendance")}>ไปเช็คชื่อ</button>}
            {blocker === "error" && <button style="height:2rem;font-size:var(--fs-xs)" onClick={loadPresent}><Icon name="refresh" size={14} /> ลองอีกครั้ง</button>}
            {blocker !== "loading" && <button style="height:2rem;font-size:var(--fs-xs)" onClick={() => setPresentOnly(false)}>ใช้ทั้งห้อง ({allStudents.length})</button>}
          </div>
        </div>
      )}

      <div class={"rnd-stage" + (!display ? " idle" : "")} role="status" aria-live="polite">
        <span class="rnd-poolchip"><Icon name="users" size={14} /> {presentOnly ? "เฉพาะคนที่มา" : "ทั้งห้อง"} ({pool.length})</span>
        {display && <div class="rnd-badge">{display.badge}</div>}
        <div class="rnd-name">{display?.name ?? (pool.length === 0 ? "ยังไม่มีรายชื่อให้สุ่ม" : "พร้อมสุ่ม")}</div>
        <div class="rnd-sub">{display?.sub ?? (pool.length === 0 ? "ดูข้อความด้านบน" : "กดปุ่ม หรือกด Space")}</div>
      </div>

      {mode === "group" && groups.length > 0 && (
        <>
          <div class="row" style="justify-content:flex-end;margin-bottom:6px">
            <button class="ghost" style="height:1.87rem;font-size:var(--fs-xs)" onClick={copyGroups}><Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอกรายชื่อ"}</button>
          </div>
          <div class="rnd-groups">
            {groups.map((g, i) => (
              <div class="rnd-group">
                <div class="gh"><span class="gd" style={`background:${GROUP_COLORS[i % GROUP_COLORS.length]}`} />กลุ่ม {i + 1} <span class="muted" style="font-weight:400">({g.length})</span></div>
                <div style="font-size:var(--fs-sm);line-height:1.6">{g.map((s, k) => `${leaders && on("gopts") && k === 0 ? "★ " : ""}${s.number ?? "-"} ${shortName(s)}`).join(" · ")}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div class="rnd-controls" style="margin-top:12px">
        {mode === "group" && groups.length > 0 && <span class="grow" />}
        <span class="grow" />
        {on("pass") && mode === "pick" && <>
          <button onClick={passCurrent} disabled={rolling || lastPicks.length === 0}><Icon name="player-skip-forward" size={18} /> ข้ามคนนี้</button>
          <button class="ghost" onClick={undoLast} disabled={rolling || lastPicks.length === 0}><Icon name="arrow-back-up" size={18} /> เลิกทำครั้งล่าสุด</button>
        </>}
        <button class="primary rnd-go" onClick={go} disabled={rolling || pool.length === 0}>
          <Icon name="arrows-shuffle" /> {mode === "group" ? "จับกลุ่ม" : "สุ่มเลย"} <span class="rnd-key">(Space)</span>
        </button>
      </div>

      {on("opts") && (
        <section class="card rnd-card" style="margin-top:12px" aria-label="ตัวเลือก">
          <div class="row wrap" style="gap:8px;align-items:center">
            <label class={"rnd-opt" + (presentOnly ? " on" : "")}><input type="checkbox" checked={presentOnly} onChange={(e) => setPresentOnly((e.target as HTMLInputElement).checked)} /> เฉพาะคนที่มา ({base.pool.length})</label>
            {mode === "pick" && <label class={"rnd-opt" + (noRepeat ? " on" : "")}><input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat((e.target as HTMLInputElement).checked)} /> ไม่ซ้ำจนครบ</label>}
            <div class="rnd-count">
              <span style="font-size:var(--fs-sm)">{mode === "group" ? (byGroups && on("gopts") ? "กี่กลุ่ม" : "กลุ่มละ") : "จำนวน"}</span>
              <button class="icon step" onClick={() => setCount((c) => Math.max(mode === "group" ? 2 : 1, c - 1))} aria-label="ลด">−</button>
              <span style="min-width:18px;text-align:center;font-weight:500">{pair && on("pair") && mode === "pick" ? 2 : count}</span>
              <button class="icon step" onClick={() => setCount((c) => Math.min(mode === "group" ? 8 : 6, c + 1))} aria-label="เพิ่ม">+</button>
            </div>
          </div>
        </section>
      )}

      {on("range") && mode === "pick" && (
        <section class="card rnd-card" style="margin-top:8px" aria-label="ช่วงเลขที่">
          <div class="row wrap" style="gap:8px;align-items:center">
            <label class={"rnd-opt" + (useRange ? " on" : "")}><input type="checkbox" checked={useRange} onChange={(e) => setUseRange((e.target as HTMLInputElement).checked)} /> สุ่มเฉพาะเลขที่</label>
            <span class="rnd-count">
              <button class="icon step" aria-label="เลขเริ่มลด" onClick={() => setRangeFrom((v) => Math.max(1, v - 1))}>−</button><b>{rangeFrom}</b><button class="icon step" aria-label="เลขเริ่มเพิ่ม" onClick={() => setRangeFrom((v) => Math.min(rangeTo, v + 1))}>+</button>
              <span>ถึง</span>
              <button class="icon step" aria-label="เลขท้ายลด" onClick={() => setRangeTo((v) => Math.max(rangeFrom, v - 1))}>−</button><b>{rangeTo}</b><button class="icon step" aria-label="เลขท้ายเพิ่ม" onClick={() => setRangeTo((v) => Math.min(99, v + 1))}>+</button>
            </span>
          </div>
        </section>
      )}

      {on("pair") && mode === "pick" && (
        <section class="card rnd-card" style="margin-top:8px" aria-label="จับคู่">
          <label class={"rnd-opt" + (pair ? " on" : "")}><input type="checkbox" checked={pair} onChange={(e) => setPair((e.target as HTMLInputElement).checked)} /> สุ่ม 2 คน แสดงเป็นคู่ “A คู่กับ B”</label>
        </section>
      )}

      {on("gopts") && mode === "group" && (
        <section class="card rnd-card" style="margin-top:8px" aria-label="ตัวเลือกกลุ่ม">
          <div class="row wrap" style="gap:8px;align-items:center">
            <Segmented value={byGroups ? "n" : "size"} onChange={(v) => { setByGroups(v === "n"); setGroups([]); }} options={[{ value: "size", label: "กลุ่มละกี่คน" }, { value: "n", label: "กี่กลุ่ม" }]} />
            <label class={"rnd-opt" + (leaders ? " on" : "")}><input type="checkbox" checked={leaders} onChange={(e) => setLeaders((e.target as HTMLInputElement).checked)} /> หัวหน้ากลุ่ม ★</label>
          </div>
        </section>
      )}

      {on("timer") && mode === "pick" && (
        <section class="card rnd-card" style="margin-top:8px" aria-label="จับเวลาตอบ">
          <div class="row wrap" style="gap:8px;align-items:center">
            <b style="font-weight:500"><Icon name="stopwatch" size={18} /> จับเวลาตอบ</b>
            <span class={"rnd-timer" + (left === 0 ? " done" : "")} role="timer" aria-live="off">{left} วิ</span>
            <Segmented value={String(timerSec)} onChange={(v) => { setTimerSec(Number(v)); setLeft(Number(v)); setRunning(false); }} options={[{ value: "10", label: "10 วิ" }, { value: "30", label: "30 วิ" }, { value: "60", label: "60 วิ" }]} />
            <button class="primary" onClick={() => { if (left === 0) setLeft(timerSec); setRunning((v) => !v); }}><Icon name={running ? "player-stop" : "player-play"} size={18} /> {running ? "หยุด" : "เริ่ม"}</button>
            <button class="ghost" onClick={() => { setLeft(timerSec); setRunning(false); }}>ตั้งใหม่</button>
          </div>
        </section>
      )}

      {mode === "pick" && on("hist") && (
        <div class="card" style="margin-top:12px">
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span style="font-size:var(--fs-sm)"><b style="font-weight:500">เรียกแล้ว {called.length}</b> <span class="muted">· เหลือ {remaining} คนในรอบนี้</span></span>
            {called.length > 0 && <button class="ghost" style="height:1.73rem;font-size:var(--fs-xs)" onClick={resetHistory}><Icon name="refresh" size={14} /> เริ่มรอบใหม่</button>}
          </div>
          {called.length === 0 ? <div class="page-sub">ยังไม่มีใครถูกเรียก</div> : (
            <div class="rnd-hist">
              {called.map((id, i) => { const st = allStudents.find((s) => s.id === id); if (!st) return null; return (
                <span class={"rnd-chip" + (i === called.length - 1 ? " last" : "")}><b>{st.number ?? "-"}</b>{shortName(st)}</span>
              ); })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
