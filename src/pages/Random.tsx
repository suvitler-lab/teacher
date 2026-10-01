import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/random.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Segmented } from "../components/ui";
import { activeClasses, studentsByClass } from "../store";
import { api } from "../lib/api";
import { kvGet, kvSet } from "../lib/idb";
import { shortName, fullName } from "../lib/names";
import { navigate } from "../router";
import { useLoadGuard } from "../lib/loader";
import { pickNext, shuffle, remainingInRound, attendancePool, type PoolBlocker } from "../lib/random";
import type { Student } from "@shared/types";

const GROUP_COLORS = ["var(--tint-blue-fg)", "var(--tint-aqua-fg)", "var(--tint-violet-fg)", "var(--tint-orange-fg)", "var(--tint-green-fg)", "var(--tint-magenta-fg)", "var(--tint-red-fg)", "var(--text-secondary)"];

function todayBkk(): string { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }

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
  const [projector, setProjector] = useState(false);
  const [called, setCalled] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const calledRef = useRef<Set<string>>(new Set());
  const begin = useLoadGuard();

  const allStudents = studentsByClass.value.get(classId) ?? [];
  const histKey = `random:${classId}:${todayBkk()}`;

  async function loadPresent() {
    if (!classId) return;
    const fresh = begin();
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
  const { pool, blocker }: { pool: Student[]; blocker: PoolBlocker } =
    presentOnly ? attendancePool(allStudents, att) : { pool: allStudents, blocker: "none" };

  function saveHistory(next: Set<string>) { calledRef.current = next; const arr = [...next]; setCalled(arr); void kvSet(histKey, arr); }
  function resetHistory() { saveHistory(new Set()); }

  function go() {
    if (rolling) return;
    setGroups([]);
    if (pool.length === 0) return;

    if (mode === "group") {
      const s = shuffle(pool);
      const k = Math.max(1, Math.round(s.length / count));
      const g: Student[][] = Array.from({ length: k }, () => []);
      s.forEach((st, i) => g[i % k].push(st));
      setGroups(g);
      setDisplay({ badge: String(k), name: `แบ่งได้ ${k} กลุ่ม`, sub: `กลุ่มละ ~${count} คน จาก ${s.length} คน` });
      return;
    }

    const { picks, called: next } = pickNext(pool, count, calledRef.current, noRepeat);
    setRolling(true);
    let delay = 40;
    const step = () => {
      const r = pool[Math.floor(Math.random() * pool.length)];
      setDisplay({ badge: String(r.number ?? "?"), name: r.first_name, sub: `เลขที่ ${r.number ?? "-"}` });
      delay *= 1.13;
      if (delay < 340) { setTimeout(step, delay); return; }
      if (picks.length === 1) setDisplay({ badge: String(picks[0].number ?? "?"), name: fullName(picks[0]), sub: picks[0].nickname ? `“${picks[0].nickname}” · เลขที่ ${picks[0].number ?? "-"}` : `เลขที่ ${picks[0].number ?? "-"}` });
      else setDisplay({ badge: String(picks.length), name: picks.map((s) => shortName(s)).join(" · "), sub: picks.map((s) => "เลขที่ " + (s.number ?? "-")).join(" · ") });
      setRolling(false);
      saveHistory(next);
    };
    step();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "INPUT") { e.preventDefault(); go(); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function copyGroups() {
    const text = groups.map((g, i) => `กลุ่ม ${i + 1}: ${g.map((s) => shortName(s)).join(", ")}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const remaining = remainingInRound(pool, calledRef.current);
  const classItems = activeClasses.value.map((c) => ({ id: c.id, name: c.name, count: (studentsByClass.value.get(c.id) ?? []).length }));
  const cameToday = att.status === "ready" && att.marked > 0 ? `มาเรียนวันนี้ ${att.present.size} จาก ${allStudents.length} คน` : att.status === "ready" ? "วันนี้ยังไม่ได้เช็คชื่อ" : att.status === "error" ? "โหลดเช็คชื่อไม่สำเร็จ" : "กำลังโหลดเช็คชื่อ…";

  return (
    <div class={projector ? "projector" : ""}>
      <PageHeader icon="arrows-shuffle" title="สุ่มชื่อ"
        sub={<span>{activeClasses.value.find((c) => c.id === classId)?.name} · {cameToday}</span>}
        actions={<>
          <Segmented value={mode} onChange={(v) => { setMode(v); setCount(v === "group" ? 4 : 1); setGroups([]); }} options={[
            { value: "pick", label: <><Icon name="user" size={15} /> สุ่มชื่อ</> },
            { value: "group", label: <><Icon name="users-group" size={15} /> จับกลุ่ม</> },
          ]} />
          <button class={projector ? "primary" : ""} onClick={() => setProjector(!projector)} aria-pressed={projector}><Icon name="device-tv" size={16} /> จอใหญ่</button>
        </>}
      />

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
            {blocker === "unchecked" && <button style="height:30px;font-size:12px" onClick={() => navigate("/attendance")}>ไปเช็คชื่อ</button>}
            {blocker === "error" && <button style="height:30px;font-size:12px" onClick={loadPresent}><Icon name="refresh" size={14} /> ลองอีกครั้ง</button>}
            {blocker !== "loading" && <button style="height:30px;font-size:12px" onClick={() => setPresentOnly(false)}>ใช้ทั้งห้อง ({allStudents.length})</button>}
          </div>
        </div>
      )}

      <div class={"rnd-stage" + (!display ? " idle" : "")} role="status" aria-live="polite">
        {display && <div class="rnd-badge">{display.badge}</div>}
        <div class="rnd-name">{display?.name ?? (pool.length === 0 ? "ยังไม่มีรายชื่อให้สุ่ม" : "พร้อมสุ่ม")}</div>
        <div class="rnd-sub">{display?.sub ?? (pool.length === 0 ? "ดูข้อความด้านบน" : "กดปุ่ม หรือกด Space")}</div>
      </div>

      {mode === "group" && groups.length > 0 && (
        <>
          <div class="row" style="justify-content:flex-end;margin-bottom:6px">
            <button class="ghost" style="height:28px;font-size:12px" onClick={copyGroups}><Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "คัดลอกแล้ว" : "คัดลอกรายชื่อ"}</button>
          </div>
          <div class="rnd-groups">
            {groups.map((g, i) => (
              <div class="rnd-group">
                <div class="gh"><span class="gd" style={`background:${GROUP_COLORS[i % GROUP_COLORS.length]}`} />กลุ่ม {i + 1} <span class="muted" style="font-weight:400">({g.length})</span></div>
                <div style="font-size:13px;line-height:1.6">{g.map((s) => `${s.number ?? "-"} ${shortName(s)}`).join(" · ")}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div class="rnd-controls" style="margin-top:12px">
        <label class={"rnd-opt" + (presentOnly ? " on" : "")}><input type="checkbox" checked={presentOnly} onChange={(e) => setPresentOnly((e.target as HTMLInputElement).checked)} /> เฉพาะคนที่มา ({presentOnly ? pool.length : att.present.size})</label>
        {mode === "pick" && <label class={"rnd-opt" + (noRepeat ? " on" : "")}><input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat((e.target as HTMLInputElement).checked)} /> ไม่ซ้ำจนครบ</label>}
        <div class="rnd-count">
          <span style="font-size:13px">{mode === "group" ? "กลุ่มละ" : "จำนวน"}</span>
          <button class="icon step" onClick={() => setCount((c) => Math.max(mode === "group" ? 2 : 1, c - 1))} aria-label="ลด">−</button>
          <span style="min-width:18px;text-align:center;font-weight:500">{count}</span>
          <button class="icon step" onClick={() => setCount((c) => Math.min(mode === "group" ? 8 : 6, c + 1))} aria-label="เพิ่ม">+</button>
        </div>
        <span class="grow" />
        <button class="primary" style="height:44px;padding:0 22px;font-size:16px" onClick={go} disabled={rolling || pool.length === 0}>
          <Icon name="arrows-shuffle" /> {mode === "group" ? "จับกลุ่ม" : "สุ่มเลย"}
        </button>
      </div>

      {mode === "pick" && (
        <div class="card" style="margin-top:12px">
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px"><b style="font-weight:500">เรียกแล้ว {called.length}</b> <span class="muted">· เหลือ {remaining} คนในรอบนี้</span></span>
            {called.length > 0 && <button class="ghost" style="height:26px;font-size:12px" onClick={resetHistory}><Icon name="refresh" size={14} /> เริ่มรอบใหม่</button>}
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
