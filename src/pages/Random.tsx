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
import { beep } from "../lib/sound";

// group dots: a colour AND a number, never colour alone
const GROUP_COLORS = ["var(--fill-accent)", "var(--fill-success)", "var(--fill-warning)", "var(--fill-purple)", "var(--fill-danger)", "var(--tint-aqua-fg)"];

const todayBkk = () => bkkToday();

interface Att { status: "loading" | "ready" | "error"; marked: number; present: Set<string> }
const NOBODY: Att = { status: "loading", marked: 0, present: new Set() };

interface Person { badge: string; name: string }
/** What the stage shows. `pair` = two cards side by side, `chips` = several drawn at once, otherwise one badge + one name. */
interface Shown { badge: string; name: string; sub: string; pair?: Person[]; chips?: Person[] }

type CardKey = "hist" | "opts" | "timer" | "pass" | "range" | "pair" | "gopts";

export function RandomPage() {
  const [classId, setClassId] = useState(activeClasses.value[0]?.id ?? "");
  const [mode, setMode] = useState<"pick" | "group">("pick");
  const [presentOnly, setPresentOnly] = useState(true);
  const [noRepeat, setNoRepeat] = useState(true);
  const [count, setCount] = useState(1);
  const [att, setAtt] = useState<Att>(NOBODY);
  const [display, setDisplay] = useState<Shown | null>(null);
  const [announce, setAnnounce] = useState(""); // read out once, when the draw has settled (not on every spinning frame)
  const [groups, setGroups] = useState<Student[][]>([]);
  const [rolling, setRolling] = useState(false);
  const [skipping, setSkipping] = useState(false); // the short "skipped" moment before the next child is drawn
  const [called, setCalled] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const calledRef = useRef<Set<string>>(new Set());
  const skippedRef = useRef<string[]>([]); // who was just skipped: not drawn again straight away
  const [prefsOpen, setPrefsOpen] = useState(false);
  const layout = randomLayout.value;
  const on = (k: CardKey) => !isHiddenCard(layout, k);
  const [useRange, setUseRange] = useState(false);
  const [fromTxt, setFromTxt] = useState("1");
  const [toTxt, setToTxt] = useState("1");
  const [pair, setPair] = useState(false);
  const [byGroups, setByGroups] = useState(false);
  const [leaders, setLeaders] = useState(true);
  const [timerSec, setTimerSec] = useState(30);
  const [left, setLeft] = useState(30);
  const [running, setRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [autoTimer, setAutoTimer] = useState(true); // start the timer by itself when a name has been drawn
  const [lastPicks, setLastPicks] = useState<string[]>([]);
  const begin = useLoadGuard();

  const allStudents = studentsByClass.value.get(classId) ?? [];
  const maxNo = Math.max(1, ...allStudents.map((s) => s.number ?? 0));
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
    setDisplay(null); setGroups([]); setAnnounce(""); setLastPicks([]);
  }, [classId]);
  // the number range starts as the whole room (1 to the last number), not 1 to 99
  useEffect(() => { setFromTxt("1"); setToTxt(String(maxNo)); }, [classId, maxNo]);

  // Who can be drawn. "Only those who came" never quietly turns into "the whole class".
  const base: { pool: Student[]; blocker: PoolBlocker } =
    presentOnly ? attendancePool(allStudents, att) : { pool: allStudents, blocker: "none" };
  // "range" narrows who can be drawn to numbers x..y — only when that card is on, so a hidden card never changes the draw
  const rangeFrom = Math.max(1, Math.floor(Number(fromTxt)) || 1);
  const rangeTo = Math.floor(Number(toTxt)) || maxNo;
  const ranged = on("range") && useRange;
  const pool = ranged ? base.pool.filter((st) => (st.number ?? 0) >= rangeFrom && (st.number ?? 0) <= rangeTo) : base.pool;
  // an empty draw because of the number range is not "nobody came": it has its own words and its own way out
  const rangeEmpty = base.blocker === "none" && ranged && pool.length === 0;
  const blocker: PoolBlocker | "range" = base.blocker !== "none" ? base.blocker : rangeEmpty ? "range" : pool.length === 0 ? "nobody" : "none";

  function saveHistory(next: Set<string>) { calledRef.current = next; const arr = [...next]; setCalled(arr); void kvSet(histKey, arr); }
  function resetHistory() { saveHistory(new Set()); }

  function go() {
    if (rolling || skipping) return;
    setGroups([]);
    if (pool.length === 0) return;
    setAnnounce("");

    if (mode === "group") {
      const s = shuffle(pool);
      const k = byGroups && on("gopts") ? Math.max(1, Math.min(s.length, count)) : Math.max(1, Math.round(s.length / count));
      const g: Student[][] = Array.from({ length: k }, () => []);
      s.forEach((st, i) => g[i % k].push(st));
      setGroups(g);
      // "how many groups" and "how many per group" are different questions: say the size that really came out
      const size = Math.round(s.length / k);
      setDisplay({ badge: String(k), name: `แบ่งได้ ${k} กลุ่ม`, sub: `กลุ่มละประมาณ ${size} คน · ${s.length} คน` });
      setAnnounce(`แบ่งได้ ${k} กลุ่ม กลุ่มละประมาณ ${size} คน`);
      return;
    }

    const want = pair && on("pair") ? 2 : count;
    // the child just skipped is left out of this one draw (when there are enough others), so "skip" really moves on
    const avoid = skippedRef.current; skippedRef.current = [];
    const drawPool = avoid.length > 0 && pool.length - avoid.length >= want ? pool.filter((st) => !avoid.includes(st.id)) : pool;
    const { picks, called: next } = pickNext(drawPool, want, calledRef.current, noRepeat);
    setLeft(timerSec); setRunning(false); setTimeUp(false);
    setRolling(true);
    // a person who asks their device for less motion gets the answer at once, without the spinning names
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let delay = reduce ? 340 : 40;
    const step = () => {
      const r = pool[Math.floor(Math.random() * pool.length)];
      setDisplay({ badge: String(r.number ?? "?"), name: r.first_name, sub: `เลขที่ ${r.number ?? "-"}` });
      delay *= 1.13;
      if (delay < 340) { setTimeout(step, delay); return; }
      const sub = picks.map((s) => "เลขที่ " + (s.number ?? "-")).join(" · ");
      let shown: Shown;
      if (picks.length === 1) shown = { badge: String(picks[0].number ?? "?"), name: fullName(picks[0]), sub: picks[0].nickname ? `“${picks[0].nickname}” · เลขที่ ${picks[0].number ?? "-"}` : `เลขที่ ${picks[0].number ?? "-"}` };
      else if (pair && on("pair")) shown = { badge: "2", name: picks.map((s) => shortName(s)).join(" คู่กับ "), sub, pair: picks.map((s) => ({ badge: String(s.number ?? "?"), name: shortName(s) })) };
      else shown = { badge: String(picks.length), name: picks.map((s) => shortName(s)).join(" · "), sub, chips: picks.map((s) => ({ badge: String(s.number ?? "?"), name: shortName(s) })) };
      setDisplay(shown);
      setAnnounce(`สุ่มได้ ${shown.name} ${shown.sub}`);
      setLastPicks(picks.map((x) => x.id));
      setRolling(false);
      saveHistory(next);
      if (on("timer") && autoTimer && picks.length > 0) { setLeft(timerSec); setRunning(true); }
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
    if (rolling || skipping || lastPicks.length === 0) return;
    const next = new Set(calledRef.current);
    lastPicks.forEach((id) => next.delete(id));
    calledRef.current = next;
    skippedRef.current = [...lastPicks];
    const skipped = display?.name;
    setLastPicks([]);
    setRunning(false);
    saveHistory(next);
    // say who was skipped for a moment, then draw: without this the name just flickered into the next draw
    if (skipped) setDisplay({ badge: "↷", name: `ข้าม ${skipped} แล้ว`, sub: "กำลังสุ่มคนต่อไป…" });
    setSkipping(true);
    setTimeout(() => { setSkipping(false); go(); }, 700);
  }
  // undo: take the last child back out of the called list and show nothing (the teacher decides what comes next)
  function undoLast() {
    if (rolling || skipping || lastPicks.length === 0) return;
    const next = new Set(calledRef.current);
    lastPicks.forEach((id) => next.delete(id));
    setLastPicks([]);
    setDisplay(null); setAnnounce("");
    setRunning(false);
    saveHistory(next);
  }

  // the timer: one second at a time; at zero it stops, says so and sounds once
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (running && left === 0) { setRunning(false); setTimeUp(true); beep.dup(); }
  }, [left, running]);
  function toggleTimer() {
    if (running) { setRunning(false); return; }
    if (left === 0) setLeft(timerSec);
    setTimeUp(false);
    setRunning(true);
  }
  function resetTimer() { setLeft(timerSec); setRunning(false); setTimeUp(false); }

  function copyGroups() {
    const text = groups.map((g, i) => `กลุ่ม ${i + 1}: ${g.map((s) => shortName(s)).join(", ")}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const remaining = remainingInRound(pool, calledRef.current);
  const classItems = activeClasses.value.map((c) => ({ id: c.id, name: c.name, count: (studentsByClass.value.get(c.id) ?? []).length }));
  const cameToday = att.status === "ready" && att.marked > 0 ? `มาเรียนวันนี้ ${att.present.size} จาก ${allStudents.length} คน` : att.status === "ready" ? "วันนี้ยังไม่ได้เช็คชื่อ" : att.status === "error" ? "โหลดเช็คชื่อไม่สำเร็จ" : "กำลังโหลดเช็คชื่อ…";

  if (!classId) return <><PageHeader icon="arrows-shuffle" title="สุ่มชื่อ" /><NoClasses /></>;

  // ---- the TV view: only the TV is on the screen ----
  if (projectorOn.value) {
    const cols = Math.min(groups.length, 4);
    return (
      <ProjectorShell page="random">
        {pool.length === 0 ? <div class="empty">ยังไม่มีรายชื่อ</div>
          : mode === "group" && groups.length > 0 ? (
            <div class="pgroups" style={`--g:${Math.max(1, cols)}`}>
              {groups.map((g, i) => (
                <div class="pcard">
                  <b>กลุ่ม {i + 1}</b>
                  <div class={"pnames" + (g.length > 8 ? " two" : "")}>
                    {g.map((st, k) => <div>{leaders && on("gopts") && k === 0 ? "★ " : ""}{shortName(st)}</div>)}
                  </div>
                </div>
              ))}
            </div>
          )
          : display ? (
            <div class="pcard" style="margin:auto;width:100%;display:flex;flex-direction:column;align-items:center;gap:calc(var(--pj-u)*12);padding:calc(var(--pj-u)*30)">
              <span class="rbadge" style="display:inline-flex;align-items:center;justify-content:center;border-radius:50%">{display.badge}</span>
              <div class="big">{display.name}</div>
              {on("timer") && mode === "pick" && <div class={"rtimer" + (timeUp ? " done" : "")} role="timer" aria-live="off">{timeUp ? "หมดเวลา" : left}</div>}
            </div>
          )
          : <div class="empty">พร้อมสุ่ม — กด “{mode === "group" ? "จับกลุ่ม" : "สุ่มคนต่อไป"}”</div>}
        <div class="rbtns">
          <button class="pjbtn" onClick={go} disabled={rolling || skipping || pool.length === 0}><Icon name="arrows-shuffle" size={40} />{mode === "group" ? "จับกลุ่ม" : "สุ่มคนต่อไป"}</button>
          {on("pass") && mode === "pick" && <button class="pjbtn sec" onClick={passCurrent} disabled={rolling || skipping || lastPicks.length === 0}><Icon name="player-skip-forward" size={32} />ข้าม</button>}
        </div>
      </ProjectorShell>
    );
  }

  const noun = presentOnly ? "เฉพาะคนที่มา" : "ทั้งห้อง";
  const cardKeys = layout.order.filter((k) => !isHiddenCard(layout, k)) as CardKey[];

  const poolChip = (
    <button class={"pill rnd-poolchip" + (presentOnly ? " on" : "")} aria-pressed={presentOnly} onClick={() => setPresentOnly((v) => !v)} title="กดเพื่อสลับระหว่างเฉพาะคนที่มา กับทั้งห้อง">
      <Icon name="user-check" size={20} /> {noun} ({pool.length})
    </button>
  );

  const stepper = (value: number, onChange: (n: number) => void, min: number, max: number, label: string) => (
    <span class="rnd-step" role="group" aria-label={label}>
      <button aria-label="ลด" onClick={() => onChange(Math.max(min, value - 1))}><Icon name="minus" size={20} /></button>
      <b>{value}</b>
      <button aria-label="เพิ่ม" onClick={() => onChange(Math.min(max, value + 1))}><Icon name="plus" size={20} /></button>
    </span>
  );
  const toggle = (onState: boolean, label: string, onClick: () => void, icon?: string) => (
    <button class={"pill" + (onState ? " on" : "")} aria-pressed={onState} onClick={onClick}><Icon name={icon ?? (onState ? "check" : "plus")} size={16} /> {label}</button>
  );

  const card = (k: CardKey) => {
    if (k === "hist") {
      if (mode !== "pick") return null;
      const full = noRepeat && called.length > 0 && remaining === 0 && pool.length > 0;
      return (
        <section class="card rnd-card" aria-labelledby="rnd-hist-h">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
            <h2 class="rnd-h" id="rnd-hist-h"><Icon name="users" size={20} /> เรียกแล้ว {called.length} · เหลือ {remaining} คนในรอบนี้</h2>
            {called.length > 0 && <button class="ghost" onClick={resetHistory}><Icon name="refresh" size={18} /> เริ่มรอบใหม่</button>}
          </div>
          <div class="rnd-pbar" role="progressbar" aria-label="เรียกไปแล้วกี่คนในรอบนี้" aria-valuemin={0} aria-valuemax={pool.length} aria-valuenow={Math.min(called.length, pool.length)}>
            <div style={`width:${pool.length ? Math.min(100, (called.length * 100) / pool.length) : 0}%`} />
          </div>
          {full && <div class="rnd-tip" style="color:var(--text-success);margin-bottom:6px">เรียกครบทุกคนแล้ว ({pool.length}) — สุ่มครั้งถัดไปเริ่มรอบใหม่</div>}
          {called.length === 0 ? <div class="rnd-tip">ยังไม่มีใครถูกเรียก</div> : (
            <div class="rnd-hist">
              {called.map((id, i) => { const st = allStudents.find((s) => s.id === id); if (!st) return null; return (
                <span class={"rnd-chip" + (i === called.length - 1 ? " last" : "")}><b>{st.number ?? "-"}</b>{shortName(st)}</span>
              ); })}
            </div>
          )}
        </section>
      );
    }
    if (k === "opts") {
      return (
        <section class="card rnd-card" aria-labelledby="rnd-opts-h">
          <h2 class="rnd-h" id="rnd-opts-h"><Icon name="list-numbers" size={20} /> ตัวเลือก</h2>
          <div class="rnd-ctl">
            {toggle(presentOnly, `เฉพาะคนที่มา (${base.pool.length})`, () => setPresentOnly((v) => !v))}
            {mode === "pick" && toggle(noRepeat, "ไม่ซ้ำจนครบ", () => setNoRepeat((v) => !v))}
            <span class="rnd-tip">{mode === "group" ? (byGroups && on("gopts") ? "กี่กลุ่ม" : "กลุ่มละ") : "จำนวนต่อครั้ง"}</span>
            {mode === "pick" && pair && on("pair")
              ? <b style="font-size:1.2rem;min-width:2.5rem;text-align:center">2</b>
              : stepper(count, setCount, mode === "group" ? 2 : 1, mode === "group" ? 8 : 6, mode === "group" ? (byGroups && on("gopts") ? "กี่กลุ่ม" : "กลุ่มละ") : "จำนวนต่อครั้ง")}
          </div>
        </section>
      );
    }
    if (k === "timer") {
      if (mode !== "pick") return null;
      const pct = timerSec ? Math.max(0, Math.min(100, (left * 100) / timerSec)) : 0;
      return (
        <section class="card rnd-card" aria-labelledby="rnd-timer-h">
          <h2 class="rnd-h" id="rnd-timer-h"><Icon name="stopwatch" size={20} /> จับเวลาตอบ</h2>
          <div class="rnd-timerbox">
            <div class={"rnd-ring" + (timeUp ? " done" : "")} style={`--p:${pct}`}>
              <span class="rnd-timer" role="timer" aria-live="off">{left} <small>วิ</small></span>
            </div>
            <div>
              <Segmented value={String(timerSec)} label="เวลา" onChange={(v) => { setTimerSec(Number(v)); setLeft(Number(v)); setRunning(false); setTimeUp(false); }} options={[{ value: "10", label: "10 วิ" }, { value: "30", label: "30 วิ" }, { value: "60", label: "60 วิ" }]} />
              <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
                <button class="primary" onClick={toggleTimer}><Icon name={running ? "player-pause" : "player-play"} size={20} /> {running ? "หยุด" : "เริ่มจับเวลา"}</button>
                <button class="ghost" onClick={resetTimer}><Icon name="refresh" size={20} /> ตั้งใหม่</button>
              </div>
            </div>
          </div>
          <div class="rnd-ctl">
            {toggle(autoTimer, "เริ่มเองหลังสุ่ม", () => setAutoTimer((v) => !v))}
            {timeUp && <span class="rnd-timeup" role="status"><Icon name="alarm" size={20} /> หมดเวลา</span>}
          </div>
        </section>
      );
    }
    if (k === "pass") {
      if (mode !== "pick") return null;
      const none = rolling || skipping || lastPicks.length === 0;
      return (
        <section class="card rnd-card" aria-labelledby="rnd-pass-h">
          <h2 class="rnd-h" id="rnd-pass-h"><Icon name="arrow-back-up" size={20} /> ข้าม / เลิกทำ</h2>
          <div class="rnd-ctl">
            <button onClick={passCurrent} disabled={none} style="min-height:3rem"><Icon name="player-skip-forward" size={20} /> ข้ามคนนี้ (ไม่นับว่าเรียกแล้ว)</button>
            <button class="ghost" onClick={undoLast} disabled={none} style="min-height:3rem"><Icon name="arrow-back-up" size={20} /> เลิกทำครั้งล่าสุด</button>
          </div>
        </section>
      );
    }
    if (k === "range") {
      if (mode !== "pick") return null;
      return (
        <section class="card rnd-card" aria-labelledby="rnd-range-h">
          <h2 class="rnd-h" id="rnd-range-h"><Icon name="arrows-horizontal" size={20} /> ช่วงเลขที่</h2>
          <div class="rnd-ctl">
            {toggle(useRange, "สุ่มเฉพาะเลขที่ในช่วง", () => setUseRange((v) => !v))}
            <input class="rnd-num" type="number" inputMode="numeric" min={1} max={99} aria-label="เลขที่เริ่มต้น" value={fromTxt}
              onInput={(e) => { setFromTxt((e.target as HTMLInputElement).value); setUseRange(true); }} />
            <span aria-hidden="true">–</span>
            <input class="rnd-num" type="number" inputMode="numeric" min={1} max={99} aria-label="เลขที่สุดท้าย" value={toTxt}
              onInput={(e) => { setToTxt((e.target as HTMLInputElement).value); setUseRange(true); }} />
          </div>
          <div class="rnd-tip" style="margin-top:6px">ห้องนี้มีเลขที่ 1–{maxNo} · พิมพ์เลขที่เริ่มและเลขที่สุดท้ายได้เลย</div>
        </section>
      );
    }
    if (k === "pair") {
      if (mode !== "pick") return null;
      return (
        <section class="card rnd-card" aria-labelledby="rnd-pair-h">
          <h2 class="rnd-h" id="rnd-pair-h"><Icon name="users-group" size={20} /> จับคู่</h2>
          <div class="rnd-ctl">{toggle(pair, "สุ่ม 2 คน แสดงเป็นคู่", () => setPair((v) => !v))}</div>
        </section>
      );
    }
    // gopts
    if (mode !== "group") return null;
    return (
      <section class="card rnd-card" aria-labelledby="rnd-gopts-h">
        <h2 class="rnd-h" id="rnd-gopts-h"><Icon name="crown" size={20} /> ตัวเลือกกลุ่ม</h2>
        <div class="rnd-ctl">
          <Segmented value={byGroups ? "n" : "size"} label="แบ่งกลุ่มแบบไหน" onChange={(v) => { setByGroups(v === "n"); setGroups([]); }} options={[{ value: "size", label: "กลุ่มละกี่คน" }, { value: "n", label: "กี่กลุ่ม" }]} />
          {toggle(leaders, "สุ่มหัวหน้ากลุ่ม", () => setLeaders((v) => !v), "crown")}
        </div>
      </section>
    );
  };
  const cards = cardKeys.map(card).filter(Boolean);

  const stage = (() => {
    if (pool.length === 0) {
      return (
        <>
          <Icon name="users" size={32} class="rnd-empty-ic" />
          <div class="rnd-name dim">ยังไม่มีรายชื่อให้สุ่ม</div>
          <div class="rnd-sub">ดูข้อความด้านบน</div>
          {blocker === "unchecked" && <button class="rnd-gobtn" onClick={() => navigate("/attendance", { class: classId })}><Icon name="user-check" size={20} /> ไปเช็คชื่อ</button>}
        </>
      );
    }
    if (!display) {
      return (
        <>
          <Icon name={mode === "group" ? "users-group" : "dice-3"} size={40} class="rnd-empty-ic" />
          <div class="rnd-name dim">{mode === "group" ? "พร้อมจับกลุ่ม" : "พร้อมสุ่ม"}</div>
          <div class="rnd-sub">กดปุ่ม หรือกด Space</div>
        </>
      );
    }
    if (display.pair) {
      return (
        <div class="rnd-pairs">
          {display.pair.map((p, i) => (
            <>
              {i > 0 && <span class="rnd-with"><Icon name="users" size={16} /> คู่กับ</span>}
              <div class="rnd-pair"><span class="rnd-badge">{p.badge}</span><div class="nm">{p.name}</div></div>
            </>
          ))}
        </div>
      );
    }
    return (
      <>
        <div class="rnd-badge">{display.badge}</div>
        {display.chips
          ? <div class="rnd-picked">{display.chips.map((p) => <span class="rnd-chip"><b>{p.badge}</b>{p.name}</span>)}</div>
          : <div class="rnd-name">{display.name}</div>}
        <div class="rnd-sub">{display.sub}</div>
      </>
    );
  })();

  return (
    <div>
      <PageHeader icon="arrows-shuffle" title="สุ่มชื่อ"
        sub={<span>{activeClasses.value.find((c) => c.id === classId)?.name} · {cameToday}</span>}
        actions={<>
          <button class="ghost" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={18} /> <span class="att-hide-sm">ปรับการ์ด</span></button>
          <ProjectorButton />
        </>}
      />

      {prefsOpen && <PageCardSettings page="random" title="หน้าสุ่มชื่อ" layout={layout} meta={RANDOM_CARD_META} locked={RANDOM_LOCKED} onClose={() => setPrefsOpen(false)} />}
      <div style="margin-bottom:8px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>

      {blocker !== "none" && (
        <div class="rnd-notice" role="status">
          <Icon name={blocker === "loading" ? "loader-2" : blocker === "error" ? "cloud-off" : "alert-triangle"} size={20} class={blocker === "loading" ? "spin" : undefined} />
          <div class="grow">
            {blocker === "loading" && "กำลังโหลดรายชื่อคนที่มาเรียน…"}
            {blocker === "error" && "โหลดข้อมูลเช็คชื่อไม่สำเร็จ จึงยังไม่รู้ว่าใครมาเรียน"}
            {blocker === "unchecked" && <><b>วันนี้ยังไม่ได้เช็คชื่อห้องนี้</b> จึงยังไม่รู้ว่าใครมาเรียน</>}
            {blocker === "nobody" && "เช็คชื่อแล้ว แต่วันนี้ไม่มีใครมาเรียน — ไม่มีรายชื่อให้สุ่ม"}
            {blocker === "range" && `ไม่มีใครเลขที่ ${rangeFrom}–${rangeTo} ในรายชื่อที่สุ่มได้ (${presentOnly ? "คนที่มาเรียน" : "ทั้งห้อง"}) — ปรับช่วงเลขที่ หรือปิดช่วงเลขที่`}
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            {blocker === "unchecked" && <button onClick={() => navigate("/attendance", { class: classId })}>ไปเช็คชื่อ</button>}
            {blocker === "error" && <button onClick={loadPresent}><Icon name="refresh" size={16} /> ลองอีกครั้ง</button>}
            {blocker === "range" && <button onClick={() => setUseRange(false)}>ปิดช่วงเลขที่</button>}
            {blocker !== "loading" && presentOnly && <button onClick={() => setPresentOnly(false)}>ใช้ทั้งห้อง ({allStudents.length})</button>}
          </div>
        </div>
      )}

      <div class="rnd-cols">
        <div class="rnd-left">
          {/* while the names spin nothing is read out; the result is read once from the line below */}
          <div class={"rnd-stage" + (!display || pool.length === 0 ? " idle" : "")} aria-live="off">
            {poolChip}
            {stage}
          </div>
          <div class="sr-only" role="status" aria-live="polite">{announce}</div>

          <div class="rnd-controls">
            <Segmented value={mode} label="โหมด" onChange={(v) => { setMode(v); setCount(v === "group" ? 4 : 1); setGroups([]); setDisplay(null); setAnnounce(""); }} options={[
              { value: "pick", label: <><Icon name="user" size={18} /> สุ่มชื่อ</> },
              { value: "group", label: <><Icon name="users-group" size={18} /> จับกลุ่ม</> },
            ]} />
            <button class="primary rnd-go" onClick={go} disabled={rolling || skipping || pool.length === 0}>
              <Icon name={mode === "group" ? "users-group" : "dice-3"} size={24} /> {mode === "group" ? "จับกลุ่ม" : "สุ่มเลย"} <span class="rnd-key">(Space)</span>
            </button>
          </div>

          {mode === "group" && groups.length > 0 && (
            <>
              <div class="rnd-grouphead">
                <button class="ghost" onClick={copyGroups}><Icon name={copied ? "check" : "copy"} size={18} /> {copied ? "คัดลอกแล้ว" : "คัดลอกรายชื่อ"}</button>
              </div>
              <div class="rnd-groups">
                {groups.map((g, i) => (
                  <div class="rnd-group">
                    <div class="gh"><span class="gd" style={`background:${GROUP_COLORS[i % GROUP_COLORS.length]}`} />กลุ่ม {i + 1} <span class="muted" style="font-weight:400">({g.length})</span></div>
                    <div class="gl">
                      {g.map((s, k) => (
                        <>
                          {k > 0 && " · "}
                          {leaders && on("gopts") && k === 0
                            ? <span class="lead"><Icon name="star" size={16} class="star" /><span class="sr-only">หัวหน้า </span> {s.number ?? "-"} {shortName(s)}</span>
                            : <>{s.number ?? "-"} {shortName(s)}</>}
                        </>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div class="rnd-right">
          {cards}
          {cards.length === 0 && <div class="card rnd-tip">ปิดการ์ดทั้งหมดอยู่ — กด “ปรับการ์ด” เพื่อเปิด</div>}
        </div>
      </div>
    </div>
  );
}
