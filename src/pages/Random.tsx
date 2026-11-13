import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/random.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented, NoClasses, Switch } from "../components/ui";
import { activeClasses, studentsByClass, settings } from "../store";
import { api } from "../lib/api";
import { kvGet, kvSet } from "../lib/idb";
import { navigate, routeParams } from "../router";
import { useLoadGuard } from "../lib/loader";
import { pickNext, shuffle, attendancePool, type PoolBlocker } from "../lib/random";
import type { Student } from "@shared/types";
import { bkkToday } from "@shared/time";
import { randomLayout } from "../lib/pageCards";
import { isHiddenCard } from "../lib/cardLayout";
import { PageCardSettings } from "../components/cards/PageCardSettings";
import { RANDOM_CARD_META, RANDOM_LOCKED } from "../components/cards/meta";
import { ProjectorButton, ProjectorShell } from "../components/Projector";
import { projectorOn, pjHideNames } from "../lib/projector";
import { hideSignal, setHide } from "../lib/hideNames";
import { shortName, fullName } from "../lib/names";
import { beep, ting, primeAudio, getRandomTick, setRandomTick } from "../lib/sound";
import { notify } from "../lib/notify";
import { RandomHero, PersonChip } from "../components/random/parts";
import { roundCounts, groupPlan, byNumber, shortLabel, fullLabel, optionSummary } from "../components/random/model";

// group dots: a colour AND a number, never colour alone
const GROUP_COLORS = ["var(--fill-accent)", "var(--fill-success)", "var(--fill-warning)", "var(--fill-purple)", "var(--fill-danger)", "var(--tint-aqua-fg)"];

const todayBkk = () => bkkToday();

interface Att { status: "loading" | "ready" | "error"; marked: number; present: Set<string> }
const NOBODY: Att = { status: "loading", marked: 0, present: new Set() };

interface Person { badge: string; name: string }
/** What the stage shows, worked out at render time from ids (so a name is never frozen into text that outlives a "hide names" switch). */
interface Shown { badge: string; name: string; sub: string; pair?: Person[]; chips?: Person[] }

type View =
  | { k: "idle" }
  | { k: "spin"; id: string }
  | { k: "pick"; ids: string[]; pair: boolean }
  | { k: "skip"; ids: string[] }
  | { k: "group"; kk: number; size: number; n: number };
type Live = "" | "result" | "timeup" | "copied" | "undo" | "skip" | "newround";

type CardKey = "hist" | "opts" | "timer" | "pass" | "range" | "pair" | "gopts" | "left";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** phone width: the side panels fold into one <details> there (AC-122) */
function useNarrow(): boolean {
  const q = typeof matchMedia === "function" ? matchMedia("(max-width: 720px)") : null;
  const [n, setN] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const f = () => setN(q.matches);
    q.addEventListener?.("change", f); f();
    return () => q.removeEventListener?.("change", f);
  }, []);
  return n;
}

export function RandomPage() {
  // `#/random?class=<id>` opens that room; an unknown / archived / other-year id falls back to the first room as before
  const linked = routeParams().class;
  const linkedOk = !!linked && activeClasses.value.some((c) => c.id === linked);
  const [classId, setClassId] = useState(linkedOk ? linked! : (activeClasses.value[0]?.id ?? ""));
  useEffect(() => { if (linkedOk) setClassId(linked!); }, [linked, linkedOk]);
  const [mode, setMode] = useState<"pick" | "group">("pick");
  const [presentOnly, setPresentOnly] = useState(true);
  const [noRepeat, setNoRepeat] = useState(true);
  const [count, setCount] = useState(1);
  const [att, setAtt] = useState<Att>(NOBODY);
  const [histReady, setHistReady] = useState(false); // the day's history has been read: no "0 drawn" before it is known
  const [view, setView] = useState<View>({ k: "idle" });
  const [live, setLive] = useState<Live>(""); // what the polite line reads out, once per moment (not on every spinning frame)
  const [groups, setGroups] = useState<Student[][]>([]);
  const [rolling, setRolling] = useState(false);
  const [skipping, setSkipping] = useState(false); // the short "skipped" moment before the next child is drawn
  const [called, setCalled] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const calledRef = useRef<Set<string>>(new Set());
  const skippedRef = useRef<string[]>([]); // who was just skipped: not drawn again straight away
  const epoch = useRef(0); // bumped when the room / mode changes or the page closes: a draw or skip still in flight stops
  const histEpoch = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const goBtn = useRef<HTMLButtonElement>(null);
  const goRef = useRef<(afterSkip?: boolean) => void>(() => {});
  const wantFocus = useRef(false);
  const mounted = useRef(true);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const narrow = useNarrow();
  const [foldOpen, setFoldOpen] = useState(false);
  const hideBtn = useRef<HTMLButtonElement>(null);
  const layout = randomLayout.value;
  const on = (k: CardKey) => !isHiddenCard(layout as never, k as never);
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
  const [tick, setTick] = useState(getRandomTick); // the soft "ting": this device only, off at first (D44)
  const begin = useLoadGuard();
  // this page's own "hide names" switch (BR-18 / AC-119): per device. The TV does NOT read it: it follows pjHideNames only (AC-120)
  const hide = hideSignal("random").value;

  const allStudents = studentsByClass.value.get(classId) ?? [];
  const byId = new Map(allStudents.map((s) => [s.id, s]));
  const maxNo = Math.max(1, ...allStudents.map((s) => s.number ?? 0));
  const histKey = `random:${classId}:${todayBkk()}`;
  const histKeyNow = useRef(histKey); // the key of the room on screen NOW (a render closure only knows the key it was drawn with)
  histKeyNow.current = histKey;
  const roomEmpty = allStudents.length === 0;

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
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn: () => void, ms: number) => { const t = setTimeout(fn, ms); timers.current.push(t); };

  useEffect(() => {
    mounted.current = true;
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { mounted.current = false; epoch.current++; clearTimers(); window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  useEffect(() => {
    epoch.current++; clearTimers(); // a draw / skip of the room we are leaving must not land in the new one
    const e = ++histEpoch.current;
    setRolling(false); setSkipping(false);
    setHistReady(false); calledRef.current = new Set(); setCalled([]);
    skippedRef.current = [];
    loadPresent();
    kvGet<string[]>(histKey).then((h) => { if (histEpoch.current !== e) return; calledRef.current = new Set(h ?? []); setCalled(h ?? []); setHistReady(true); });
    setView({ k: "idle" }); setGroups([]); setLive(""); setLastPicks([]);
    setLeft(timerSec); setRunning(false); setTimeUp(false);
  }, [classId]);
  // the number range starts as the whole room (1 to the last number), not 1 to 99
  useEffect(() => { setFromTxt("1"); setToTxt(String(maxNo)); }, [classId, maxNo]);

  // Who can be drawn. "Only those who came" never quietly turns into "the whole class".
  // Until the day's history is read nothing can be drawn (a draw now could repeat somebody), so it counts as "loading".
  const effAtt: Att = histReady ? att : { ...att, status: "loading" };
  const base: { pool: Student[]; blocker: PoolBlocker } =
    presentOnly ? attendancePool(allStudents, effAtt) : histReady ? { pool: allStudents, blocker: "none" } : { pool: [], blocker: "loading" };
  // "range" narrows who can be drawn to numbers x..y — only when that card is on, so a hidden card never changes the draw
  const rangeFrom = Math.max(1, Math.floor(Number(fromTxt)) || 1);
  const rangeTo = Math.floor(Number(toTxt)) || maxNo;
  const ranged = on("range") && useRange;
  const pool = ranged ? base.pool.filter((st) => (st.number ?? 0) >= rangeFrom && (st.number ?? 0) <= rangeTo) : base.pool;
  // an empty draw because of the number range is not "nobody came": it has its own words and its own way out
  const rangeEmpty = base.blocker === "none" && ranged && pool.length === 0;
  // an empty room is checked first: it must never read as "not checked yet" or "nobody came"
  const blocker: PoolBlocker | "range" | "empty" = roomEmpty ? "empty" : base.blocker !== "none" ? base.blocker : rangeEmpty ? "range" : pool.length === 0 ? "nobody" : "none";

  const calledSet = new Set(called);
  const counts = roundCounts(pool, calledSet, noRepeat);
  const poolById = new Map(pool.map((s) => [s.id, s]));
  const numbersReady = histReady && pool.length > 0;

  function saveHistory(next: Set<string>) { calledRef.current = next; const arr = [...next]; setCalled(arr); void kvSet(histKey, arr); }
  function focusGoSoon() { wantFocus.current = true; }
  useEffect(() => {
    if (wantFocus.current && !rolling && !skipping) { wantFocus.current = false; goBtn.current?.focus(); }
  });

  function resetHistory() {
    // "start a new round" can be taken back for 5 seconds: the old set is kept in memory only (gone when the page closes)
    const before = new Set(calledRef.current), beforePicks = lastPicks, key = histKey;
    saveHistory(new Set()); setLastPicks([]); setRunning(false);
    setLive("newround");
    focusGoSoon();
    notify("info", `เริ่มรอบใหม่แล้ว · สุ่มแล้ว 0 จาก ${counts.N}`, { action: { label: "เลิกทำ", run: () => {
      // only while this room is still on screen and nothing was drawn since (otherwise the old set would overwrite newer draws)
      if (!mounted.current || key !== histKeyNow.current || calledRef.current.size > 0) return;
      saveHistory(before); setLastPicks(beforePicks);
    } } });
  }

  function go(afterSkip = false) {
    if (rolling || (skipping && !afterSkip) || !histReady) return;
    setGroups([]); if (!afterSkip) setLive("");
    if (pool.length === 0) return;
    const e = epoch.current;

    if (mode === "group") {
      const s = shuffle(pool);
      const { k, size } = groupPlan(s.length, count, byGroups && on("gopts"));
      const g: Student[][] = Array.from({ length: k }, () => []);
      s.forEach((st, i) => g[i % k].push(st));
      setGroups(g);
      // "how many groups" and "how many per group" are different questions: say the size that really came out
      setView({ k: "group", kk: k, size, n: s.length });
      setLive("result");
      return;
    }

    const want = pair && on("pair") ? 2 : count;
    // the child just skipped is left out of this one draw (when there are enough others), so "skip" really moves on
    const avoid = skippedRef.current; skippedRef.current = [];
    const drawPool = avoid.length > 0 && pool.length - avoid.length >= want ? pool.filter((st) => !avoid.includes(st.id)) : pool;
    const { picks, called: next } = pickNext(drawPool, want, calledRef.current, noRepeat);
    setLeft(timerSec); setRunning(false); setTimeUp(false);
    if (tick) primeAudio(); // wake the audio context inside the tap: iOS keeps a later timer-driven ting silent
    setRolling(true);
    wantFocus.current = document.activeElement === goBtn.current || document.activeElement === document.body || !document.activeElement;
    const finish = () => {
      if (epoch.current !== e) return;
      setView({ k: "pick", ids: picks.map((x) => x.id), pair: picks.length > 1 && pair && on("pair") });
      setLive("result");
      setLastPicks(picks.map((x) => x.id));
      setRolling(false);
      saveHistory(next);
      if (tick && picks.length > 0) ting(); // one soft note per settled result; silent when the app sound is off
      if (on("timer") && autoTimer && picks.length > 0) { setLeft(timerSec); setRunning(true); }
    };
    // a person who asks their device for less motion gets the answer at once, without the spinning names
    if (reducedMotion()) { finish(); return; }
    let delay = 40;
    const step = () => {
      if (epoch.current !== e) return;
      const r = pool[Math.floor(Math.random() * pool.length)];
      setView({ k: "spin", id: r.id });
      delay *= 1.13;
      if (delay < 340) { later(step, delay); return; }
      finish();
    };
    step();
  }
  goRef.current = go;

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
    skippedRef.current = [...lastPicks];
    const who = lastPicks;
    setLastPicks([]);
    setRunning(false); setTimeUp(false); setLeft(timerSec);
    saveHistory(next);
    // say who was skipped for a moment, then draw: without this the name just flickered into the next draw
    setView({ k: "skip", ids: who }); setLive("skip");
    setSkipping(true);
    const e = epoch.current;
    later(() => { if (epoch.current !== e) return; setSkipping(false); goRef.current(true); }, 700);
  }
  // undo: take the last child back out of the called list and show nothing (the teacher decides what comes next)
  function undoLast() {
    if (rolling || skipping || lastPicks.length === 0) return;
    const next = new Set(calledRef.current);
    lastPicks.forEach((id) => next.delete(id));
    setLastPicks([]);
    setView({ k: "idle" }); setLive("undo");
    setRunning(false); setTimeUp(false); setLeft(timerSec);
    saveHistory(next);
    focusGoSoon();
  }

  function changeMode(m: "pick" | "group") {
    epoch.current++; clearTimers();
    setRolling(false); setSkipping(false);
    setMode(m); setCount(m === "group" ? 4 : 1); setGroups([]); setView({ k: "idle" }); setLive("");
    setRunning(false); setTimeUp(false); setLeft(timerSec);
  }

  // the timer: one second at a time; at zero it stops, says so and sounds once
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (running && left === 0) { setRunning(false); setTimeUp(true); setLive("timeup"); beep.dup(); }
  }, [left, running]);
  function toggleTimer() {
    if (running) { setRunning(false); return; }
    if (left === 0) setLeft(timerSec);
    setTimeUp(false);
    setRunning(true);
  }
  function resetTimer() { setLeft(timerSec); setRunning(false); setTimeUp(false); }
  function toggleTick() { const v = !tick; setTick(v); setRandomTick(v); }

  function copyGroups() {
    if (hideSignal("random").peek()) return; // read now, not the render's copy: the switch may have changed since
    const text = groups.map((g, i) => `กลุ่ม ${i + 1}: ${g.map((s) => shortName(s)).join(", ")}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setLive("copied"); later(() => { setCopied(false); setLive(""); }, 2000); });
  }

  // ---- what to show: derived from ids at render ----
  const people = (ids: string[]) => ids.map((id) => byId.get(id)).filter((s): s is Student => !!s);
  // what one screen shows; `hideIt` is this page's switch for the page and pjHideNames for the TV (two screens, two switches)
  const buildShown = (hideIt: boolean): Shown | null => {
    if (view.k === "spin") {
      const r = byId.get(view.id); if (!r) return null;
      return { badge: String(r.number ?? "?"), name: hideIt ? `เลขที่ ${r.number ?? "-"}` : r.first_name, sub: hideIt ? "" : `เลขที่ ${r.number ?? "-"}` };
    }
    if (view.k === "skip") {
      const ps = people(view.ids);
      return { badge: "↷", name: hideIt ? `ข้าม${ps.map((s) => fullLabel(s, true)).join(" · ")} แล้ว` : `ข้าม ${ps.map((s) => fullLabel(s, false)).join(" · ")} แล้ว`, sub: "กำลังสุ่มคนต่อไป…" };
    }
    if (view.k === "group") return { badge: String(view.kk), name: `แบ่งได้ ${view.kk} กลุ่ม`, sub: `กลุ่มละประมาณ ${view.size} คน · ${view.n} คน` };
    if (view.k !== "pick") return null;
    const ps = people(view.ids); if (ps.length === 0) return null;
    const nums = hideIt ? "" : ps.map((s) => "เลขที่ " + (s.number ?? "-")).join(" · ");
    if (ps.length === 1) {
      const s = ps[0];
      return { badge: String(s.number ?? "?"), name: fullLabel(s, hideIt), sub: hideIt ? "" : s.nickname ? `“${s.nickname}” · เลขที่ ${s.number ?? "-"}` : `เลขที่ ${s.number ?? "-"}` };
    }
    const person = (s: Student): Person => ({ badge: String(s.number ?? "?"), name: shortLabel(s, hideIt) });
    if (view.pair) return { badge: "2", name: ps.map((s) => shortLabel(s, hideIt)).join(" คู่กับ "), sub: nums, pair: ps.map(person) };
    return { badge: String(ps.length), name: ps.map((s) => shortLabel(s, hideIt)).join(" · "), sub: nums, chips: ps.map(person) };
  };
  const shown = buildShown(hide);
  // read out once per moment, built from ids here (never from stored text): "สุ่มได้ เลขที่ 12 สมหญิง ใจดี" / names hidden = the number alone
  const says = (ids: string[]) => people(ids).map((s) => `เลขที่ ${s.number ?? "-"}${hide ? "" : " " + fullName(s)}`);
  const announce =
    live === "copied" ? "คัดลอกแล้ว" : live === "timeup" ? "หมดเวลา" : live === "undo" ? "เลิกทำแล้ว" : live === "newround" ? "เริ่มรอบใหม่แล้ว"
    : live === "skip" && view.k === "skip" ? `ข้าม ${says(view.ids).join(" · ")} แล้ว`
    : live === "result" && view.k === "group" ? `แบ่งได้ ${view.kk} กลุ่ม กลุ่มละประมาณ ${view.size} คน`
    : live === "result" && view.k === "pick" && shown ? `สุ่มได้ ${view.ids.length > 1 ? view.ids.length + " คน " : ""}${says(view.ids).join(" · ")}`
    : "";

  const classItems = activeClasses.value.map((c) => ({ id: c.id, name: c.name, count: (studentsByClass.value.get(c.id) ?? []).length }));
  const roomName = activeClasses.value.find((c) => c.id === classId)?.name ?? "";
  const cameN = allStudents.filter((s) => att.present.has(s.id)).length;
  const cameKnown = att.status === "ready" && att.marked > 0;
  const cameToday = roomEmpty ? "ห้องนี้ยังไม่มีนักเรียน" : cameKnown ? `มาเรียนวันนี้ ${cameN} จาก ${allStudents.length} คน` : att.status === "ready" ? "วันนี้ยังไม่ได้เช็คชื่อ" : att.status === "error" ? "โหลดเช็คชื่อไม่สำเร็จ" : "กำลังโหลดเช็คชื่อ…";

  if (!classId) return <><PageHeader icon="arrows-shuffle" title="สุ่มชื่อ" /><NoClasses /></>;

  // ---- the TV view: only the TV is on the screen. It follows the TV's own switch (pjHideNames), never this page's button (AC-120) ----
  if (projectorOn.value) {
    const hidePj = pjHideNames.value;
    const shownPj = buildShown(hidePj);
    const cols = Math.min(groups.length, 4);
    const lab = (st: Student) => shortLabel(st, hidePj);
    const reason = roomEmpty ? "ห้องนี้ยังไม่มีนักเรียน" : blocker === "loading" ? "กำลังโหลด…" : blocker === "error" ? "โหลดเช็คชื่อไม่สำเร็จ"
      : blocker === "unchecked" ? "วันนี้ยังไม่ได้เช็คชื่อห้องนี้" : blocker === "nobody" ? "วันนี้ไม่มีใครมาเรียน" : blocker === "range" ? "ไม่มีใครในช่วงเลขที่ที่เลือก" : "ยังไม่มีรายชื่อให้สุ่ม";
    // not a per-child figure: how many came and how many are left (BR-24)
    const tally = numbersReady ? (presentOnly ? `มาเรียน ${cameN}` : `ทั้งห้อง ${allStudents.length}`) + (mode === "pick" && noRepeat ? ` · เหลือ ${counts.m}` : "") : "";
    return (
      <ProjectorShell page="random">
        {tally && <div class="pj-tally">{tally}</div>}
        {pool.length === 0 ? <div class="empty">{reason}</div>
          : mode === "group" && groups.length > 0 ? (
            <div class="pgroups" style={`--g:${Math.max(1, cols)}`}>
              {groups.map((g, i) => (
                <div class="pcard">
                  <b>กลุ่ม {i + 1}</b>
                  <div class={"pnames" + (g.length > 8 ? " two" : "")}>
                    {g.map((st, k) => <div>{leaders && on("gopts") && k === 0 ? "★ " : ""}{lab(st)}</div>)}
                  </div>
                </div>
              ))}
            </div>
          )
          : shownPj ? (
            <div class="pcard pj-stage">
              {shownPj.pair
                ? <div class="pj-cards">{shownPj.pair.map((p, i) => <>{i > 0 && <span class="pj-with">คู่กับ</span>}<div class="pj-person"><span class="rbadge">{p.badge}</span><div class="big">{p.name}</div></div></>)}</div>
                : shownPj.chips
                  ? <div class="pj-cards">{shownPj.chips.map((p) => <div class="pj-person"><span class="rbadge">{p.badge}</span><div class="big">{p.name}</div></div>)}</div>
                  : <><span class="rbadge" style="display:inline-flex;align-items:center;justify-content:center;border-radius:50%">{shownPj.badge}</span>
                      <div class="big">{shownPj.name}</div>
                      {shownPj.sub && <div class="pj-sub">{shownPj.sub}</div>}</>}
              {on("timer") && mode === "pick" && view.k === "pick" && <div class={"rtimer" + (timeUp ? " done" : "")} role="timer" aria-live="off">{timeUp ? <><Icon name="alarm" size={56} /> หมดเวลา</> : left}</div>}
            </div>
          )
          : <div class="empty">พร้อมสุ่ม — กด “{mode === "group" ? "จับกลุ่ม" : "สุ่มคนต่อไป"}”</div>}
        <div class="rbtns">
          <button class="pjbtn" onClick={() => go()} disabled={rolling || skipping || pool.length === 0}><Icon name="arrows-shuffle" size={40} />{mode === "group" ? "จับกลุ่ม" : "สุ่มคนต่อไป"}</button>
          {on("pass") && mode === "pick" && <button class="pjbtn sec" onClick={passCurrent} disabled={rolling || skipping || lastPicks.length === 0}><Icon name="player-skip-forward" size={32} />ข้าม</button>}
        </div>
      </ProjectorShell>
    );
  }

  const cardKeys = (layout.order as string[]).filter((k) => !isHiddenCard(layout as never, k as never)) as CardKey[];
  const hasResult = view.k === "pick" || view.k === "skip" || lastPicks.length > 0;
  const stageTimer = on("timer") && mode === "pick" && view.k === "pick";
  const rangePair: [number, number] | null = ranged ? [rangeFrom, rangeTo] : null;
  const summary = mode === "group"
    ? `${byGroups && on("gopts") ? `แบ่ง ${count} กลุ่ม` : `กลุ่มละ ${count} คน`}${leaders && on("gopts") ? " · มีหัวหน้ากลุ่ม" : ""}`
    : optionSummary({ want: count, pair: pair && on("pair"), noRepeat, timer: on("timer") ? timerSec : null, range: rangePair });
  const goDisabled = rolling || skipping || pool.length === 0;
  const why = rolling || skipping ? "" : blocker === "loading" ? "รอสักครู่" : blocker === "none" ? "" : blocker === "empty" ? "ห้องนี้ยังไม่มีนักเรียน" : "ยังไม่มีรายชื่อให้สุ่ม — ดูเหตุผลด้านบน";

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
    if (k === "left") {
      if (mode !== "pick") return null;
      const rest = pool.filter((s) => !calledSet.has(s.id)).sort(byNumber);
      const out = allStudents.length - base.pool.length;
      return (
        <section class="card rnd-card" aria-labelledby="rnd-left-h">
          <h2 class="rnd-h" id="rnd-left-h"><Icon name="users" size={20} /> ยังไม่ถูกสุ่ม ({numbersReady ? counts.m : "–"})</h2>
          {!numbersReady ? <div class="rnd-tip">{blocker === "loading" ? "กำลังโหลด…" : "ยังไม่มีรายชื่อให้สุ่ม"}</div>
            : rest.length === 0 ? <div class="rnd-tip" style="color:var(--text-success)"><Icon name="circle-check" size={16} /> สุ่มครบทุกคนแล้ว</div>
            : <div class="rnd-hist" tabindex={0} aria-label="รายชื่อที่ยังไม่ถูกสุ่ม">{rest.map((s) => <PersonChip s={s} hide={hide} tone="left" />)}</div>}
          {presentOnly && out > 0 && att.status === "ready" && <div class="rnd-tip rnd-out">ไม่อยู่ในรอบนี้ {out} คน (ไม่ได้มาหรือยังไม่เช็คชื่อ)</div>}
        </section>
      );
    }
    if (k === "hist") {
      if (mode !== "pick") return null;
      const done = called.map((id) => poolById.get(id)).filter((s): s is Student => !!s);
      return (
        <section class="card rnd-card" aria-labelledby="rnd-hist-h">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
            <h2 class="rnd-h" id="rnd-hist-h"><Icon name="user-check" size={20} /> สุ่มแล้ว ({numbersReady ? counts.n : "–"}){numbersReady ? ` · เหลือ ${counts.m}` : ""}</h2>
            {called.length > 0 && <button class="ghost" onClick={resetHistory}><Icon name="refresh" size={18} /> เริ่มรอบใหม่</button>}
          </div>
          {counts.full && <div class="rnd-tip" style="color:var(--text-success);margin-top:6px">สุ่มครบทุกคนแล้ว ({counts.N}) — สุ่มครั้งถัดไปเริ่มรอบใหม่</div>}
          {done.length === 0 ? <div class="rnd-tip" style="margin-top:6px">ยังไม่มีใครถูกเรียก</div> : (
            <div class="rnd-hist" style="margin-top:8px" tabindex={0} aria-label="รายชื่อที่สุ่มแล้ว ตามลำดับที่เรียก">
              {done.map((s, i) => <PersonChip s={s} hide={hide} tone={i === done.length - 1 ? "last" : "done"}>{i === done.length - 1 && <Icon name="sparkle" size={14} />}</PersonChip>)}
            </div>
          )}
        </section>
      );
    }
    if (k === "opts") {
      return (
        <section class="card rnd-card" id="rnd-opts" tabindex={-1} aria-labelledby="rnd-opts-h">
          <h2 class="rnd-h" id="rnd-opts-h"><Icon name="list-numbers" size={20} /> ตัวเลือก</h2>
          <div class="rnd-ctl">
            {mode === "pick" && toggle(noRepeat, "ไม่ซ้ำจนครบ", () => setNoRepeat((v) => !v))}
            <span class="rnd-tip">{mode === "group" ? (byGroups && on("gopts") ? "กี่กลุ่ม" : "กลุ่มละ") : "จำนวนต่อครั้ง"}</span>
            {mode === "pick" && pair && on("pair")
              ? <b style="font-size:1.2rem;min-width:2.5rem;text-align:center">2</b>
              : stepper(count, setCount, mode === "group" ? 2 : 1, mode === "group" ? 8 : 6, mode === "group" ? (byGroups && on("gopts") ? "กี่กลุ่ม" : "กลุ่มละ") : "จำนวนต่อครั้ง")}
          </div>
          {mode === "pick" && (
            <div class="rnd-swrow">
              <Switch on={tick} onToggle={toggleTick} label="เสียงติ๊งตอนได้ชื่อ" />
              <span>เสียงติ๊งตอนได้ชื่อ <small class="rnd-tip">(เครื่องนี้เท่านั้น{settings.value?.sound_enabled === false ? " · เสียงของแอปปิดอยู่ในตั้งค่า จึงไม่ดัง" : ""})</small></span>
            </div>
          )}
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
              {/* one timer element on the page: while the stage shows its ring, that one is the timer */}
              <span class="rnd-timer" role={stageTimer ? undefined : "timer"} aria-live={stageTimer ? undefined : "off"}>{left} <small>วิ</small></span>
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
            {timeUp && <span class="rnd-timeup"><Icon name="alarm" size={20} /> หมดเวลา</span>}
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
    if (k === "pass") return null; // the skip / undo buttons sit under the draw button, shown while this card is on
    // gopts
    if (mode !== "group") return null;
    return (
      <section class="card rnd-card" aria-labelledby="rnd-gopts-h">
        <h2 class="rnd-h" id="rnd-gopts-h"><Icon name="crown" size={20} /> ตัวเลือกกลุ่ม</h2>
        <div class="rnd-ctl">
          <Segmented value={byGroups ? "n" : "size"} label="แบ่งกลุ่มแบบไหน" onChange={(v) => { setByGroups(v === "n"); setGroups([]); setView({ k: "idle" }); setLive(""); }} options={[{ value: "size", label: "กลุ่มละกี่คน" }, { value: "n", label: "กี่กลุ่ม" }]} />
          {toggle(leaders, "สุ่มหัวหน้ากลุ่ม", () => setLeaders((v) => !v), "crown")}
        </div>
      </section>
    );
  };
  const cards = cardKeys.map(card).filter(Boolean);

  const stage = (() => {
    if (blocker === "empty") {
      return (
        <>
          <Icon name="users" size={32} class="rnd-empty-ic" />
          <div class="rnd-name dim">ห้องนี้ยังไม่มีนักเรียน</div>
          <div class="rnd-sub">นำเข้ารายชื่อจาก Excel หรือเพิ่มทีละคน</div>
          <button class="rnd-gobtn" onClick={() => navigate("/students")}><Icon name="upload" size={20} /> นำเข้านักเรียน</button>
        </>
      );
    }
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
    if (!shown) {
      return (
        <>
          <Icon name={mode === "group" ? "users-group" : "dice-3"} size={40} class="rnd-empty-ic" />
          <div class="rnd-name dim">{mode === "group" ? "พร้อมจับกลุ่ม" : "พร้อมสุ่ม"}</div>
          <div class="rnd-sub">กดปุ่ม หรือกด Space</div>
        </>
      );
    }
    if (shown.pair) {
      return (
        <div class="rnd-pairs">
          {shown.pair.map((p, i) => (
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
        <div class="rnd-badge">{shown.badge}</div>
        {shown.chips
          ? <div class="rnd-picked">{shown.chips.map((p) => <span class="rnd-chip big"><b>{p.badge}</b>{hide ? "" : p.name}</span>)}</div>
          : <div class={"rnd-name" + (shown.name.length > 22 ? " long" : "")}>{shown.name}</div>}
        {shown.sub && <div class="rnd-sub">{shown.sub}</div>}
      </>
    );
  })();

  const popKey = view.k === "pick" || view.k === "group" ? "pop" : "";
  const noticeNode = blocker !== "none" && blocker !== "empty" && (
    <div class="rnd-notice" role="status">
      <Icon name={blocker === "loading" ? "loader-2" : blocker === "error" ? "cloud-off" : "alert-triangle"} size={20} class={blocker === "loading" ? "spin" : undefined} />
      <div class="grow">
        {blocker === "loading" && "กำลังโหลดรายชื่อคนที่มาเรียน…"}
        {blocker === "error" && <>โหลดข้อมูลเช็คชื่อไม่สำเร็จ จึงยังไม่รู้ว่าใครมาเรียน{!online && <><br />สุ่มทั้งห้องได้ปกติ ประวัติเก็บในเครื่อง</>}</>}
        {blocker === "unchecked" && <><b>วันนี้ยังไม่ได้เช็คชื่อห้องนี้</b> จึงยังไม่รู้ว่าใครมาเรียน · เช็คชื่อรายคาบไม่นับ</>}
        {blocker === "nobody" && "เช็คชื่อแล้ว แต่วันนี้ไม่มีใครมาเรียน — ไม่มีรายชื่อให้สุ่ม"}
        {blocker === "range" && `ไม่มีใครเลขที่ ${rangeFrom}–${rangeTo} ในรายชื่อที่สุ่มได้ (${presentOnly ? "คนที่มาเรียน" : "ทั้งห้อง"}) — ปรับช่วงเลขที่ หรือปิดช่วงเลขที่`}
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        {(blocker === "unchecked" || blocker === "nobody") && <button onClick={() => navigate("/attendance", { class: classId })}>ไปเช็คชื่อ</button>}
        {blocker === "error" && <button onClick={loadPresent}><Icon name="refresh" size={16} /> ลองอีกครั้ง</button>}
        {blocker === "range" && <button onClick={() => setUseRange(false)}>ปิดช่วงเลขที่</button>}
        {presentOnly && <button onClick={() => setPresentOnly(false)}>ใช้ทั้งห้อง ({allStudents.length})</button>}
      </div>
    </div>
  );

  return (
    <div class="rnd2">
      <PageHeader icon="arrows-shuffle" title="สุ่มชื่อ"
        sub={<span>{roomName} · {cameToday}</span>}
        actions={<>
          <button ref={hideBtn} class="ghost rnd-hidebtn" aria-pressed={hide} onClick={() => setHide("random", !hide)} aria-label={hide ? "ซ่อนชื่ออยู่ — แตะเพื่อแสดงชื่อ" : "ซ่อนชื่อนักเรียน"}><Icon name={hide ? "eye-off" : "eye"} size={18} /> <span class="att-hide-sm">{hide ? "ซ่อนชื่ออยู่" : "ซ่อนชื่อ"}</span></button>
          <button class="ghost" onClick={() => setPrefsOpen(true)} aria-label="ปรับการ์ด"><Icon name="layout-grid" size={18} /> <span class="att-hide-sm">ปรับการ์ด</span></button>
          <ProjectorButton />
        </>}
      />

      {hide && (
        <div class="rnd-notice rnd-hidenote" role="status">
          <Icon name="eye-off" size={20} />
          <div class="grow">ซ่อนชื่อนักเรียนอยู่ · แสดงเฉพาะเลขที่</div>
          <button onClick={() => { setHide("random", false); setTimeout(() => hideBtn.current?.focus(), 0); }}>แสดงชื่อ</button>
        </div>
      )}
      {prefsOpen && <PageCardSettings page="random" title="หน้าสุ่มชื่อ" layout={layout} meta={RANDOM_CARD_META} locked={RANDOM_LOCKED} onClose={() => setPrefsOpen(false)} />}

      <RandomHero room={roomName} mode={mode} onMode={changeMode} presentOnly={presentOnly} onPool={() => setPresentOnly((v) => !v)} noRepeat={noRepeat}
        counts={counts} ready={numbersReady} known={blocker === "none" || blocker === "nobody" || blocker === "range" || blocker === "empty"} loading={blocker === "loading"} total={allStudents.length} offline={!online && blocker === "error"}
        came={cameKnown ? String(cameN) : "–"} />

      <div style="margin-bottom:8px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>
      {noticeNode}

      <div class="rnd-cols">
        <div class="rnd-left">
          {/* while the names spin nothing is read out; the result is read once from the line below */}
          <div class={"rnd-stage" + (!shown || pool.length === 0 ? " idle" : "") + (mode === "group" && view.k === "group" ? " compact" : "")} aria-live="off" aria-busy={rolling}>
            <div class={"rnd-stage-in " + popKey} key={view.k === "pick" ? "p" + called.join() + view.ids.join() : view.k} aria-hidden={rolling ? "true" : undefined}>
              {stage}
            </div>
            {stageTimer && (
              <div class="rnd-stage-timer">
                {timeUp
                  ? <span class="rnd-timeup"><Icon name="alarm" size={28} /> หมดเวลา</span>
                  : <div class="rnd-ring" style={`--p:${timerSec ? Math.max(0, Math.min(100, (left * 100) / timerSec)) : 0}`}><span class="rnd-timer" role="timer" aria-live="off">{left} <small>วิ</small></span></div>}
                <button onClick={toggleTimer}><Icon name={running ? "player-pause" : "player-play"} size={20} /> {running ? "หยุด" : "เริ่ม"}</button>
                <button class="ghost" onClick={resetTimer}><Icon name="refresh" size={20} /> ตั้งใหม่</button>
              </div>
            )}
          </div>
          <div class="sr-only" role="status" aria-live="polite">{announce}</div>

          <div class="rnd-controls">
            <button ref={goBtn} class="primary rnd-go" onClick={() => go()} disabled={goDisabled || !histReady} aria-describedby={why ? "rnd-why" : undefined}>
              <Icon name={rolling ? "loader-2" : mode === "group" ? "users-group" : "dice-3"} size={28} class={rolling ? "spin" : undefined} />{" "}
              {rolling ? "กำลังสุ่ม…" : mode === "group" ? (groups.length > 0 ? "จับกลุ่มอีกครั้ง" : "จับกลุ่ม") : hasResult ? "สุ่มคนต่อไป" : "สุ่มเลย"} <span class="rnd-key">(Space)</span>
            </button>
          </div>
          {why && <div class="rnd-why" id="rnd-why" role="status">{why}</div>}
          {counts.full && mode === "pick" && !rolling && <div class="rnd-tip rnd-fullnote">สุ่มครั้งถัดไปเริ่มรอบใหม่</div>}

          {mode === "pick" && on("pass") && (
            <div class="rnd-passrow">
              <button onClick={passCurrent} disabled={rolling || skipping || lastPicks.length === 0}><Icon name="player-skip-forward" size={20} /> ข้ามคนนี้ (ไม่นับว่าสุ่มแล้ว)</button>
              <button class="ghost" onClick={undoLast} disabled={rolling || skipping || lastPicks.length === 0}><Icon name="arrow-back-up" size={20} /> เลิกทำครั้งล่าสุด</button>
            </div>
          )}

          {on("opts") && (
            <button class="rnd-summary" onClick={() => { setFoldOpen(true); setTimeout(() => { const el = document.getElementById("rnd-opts"); el?.scrollIntoView({ block: "nearest" }); el?.focus(); }, 0); }}>
              <Icon name="list-numbers" size={18} /> {summary}
            </button>
          )}
        </div>

        {(() => {
          const body = <>{cards}{cards.length === 0 && <div class="card rnd-tip">ปิดการ์ดทั้งหมดอยู่ — กด “ปรับการ์ด” เพื่อเปิด</div>}</>;
          return narrow
            ? <details class="rnd-fold" open={foldOpen} onToggle={(e) => setFoldOpen((e.target as HTMLDetailsElement).open)}>
                <summary>รายชื่อที่สุ่มแล้ว · ยังไม่ถูกสุ่ม · ตัวเลือก</summary>
                <div class="rnd-right">{body}</div>
              </details>
            : <div class="rnd-right">{body}</div>;
        })()}
      </div>

      {mode === "group" && groups.length > 0 && (
        <>
          <div class="rnd-grouphead">
            <span class="rnd-tip">ผลจับกลุ่มไม่ถูกบันทึก — คัดลอกไว้ถ้าต้องใช้{hide && " · ปิดไว้ขณะซ่อนชื่อ"}</span>
            <button class="ghost" onClick={copyGroups} disabled={hide} title={hide ? "ปิดไว้ขณะซ่อนชื่อ" : undefined}><Icon name={copied ? "check" : "copy"} size={18} /> {copied ? "คัดลอกแล้ว" : "คัดลอกรายชื่อ"}</button>
          </div>
          <div class="rnd-groups">
            {groups.map((g, i) => (
              <div class="rnd-group">
                <div class="gh"><span class="gd" style={`background:${GROUP_COLORS[i % GROUP_COLORS.length]}`} />กลุ่ม {i + 1} <span class="muted" style="font-weight:400">({g.length})</span></div>
                <div class={"gl" + (g.length > 8 ? " two" : "")}>
                  {g.map((s, k) => (
                    <div class="gm">
                      {leaders && on("gopts") && k === 0
                        ? <span class="lead"><Icon name="star" size={16} class="star" /><span class="lead-tag">หัวหน้า</span> {hide ? shortLabel(s, true) : `${s.number ?? "-"} ${shortLabel(s, false)}`}</span>
                        : <>{hide ? shortLabel(s, true) : `${s.number ?? "-"} ${shortLabel(s, false)}`}</>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
