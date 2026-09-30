import { useEffect, useState } from "preact/hooks";
import "../styles/students.css";
import "../styles/print.css";
import { Icon } from "../components/Icon";
import { PageHeader, ClassChips, Avatar, EmptyState, YearBanner, TermPicker } from "../components/ui";
import { StudentDrawer } from "../components/StudentDrawer";
import { StickerSheet } from "../components/StickerSheet";
import { activeClasses, viewClasses, rosterCount, classById, viewTerm, viewingPastYear, studentsByClass, students as allStudents, qrRotatedAt, loadBootstrap } from "../store";
import { rosterOf } from "@shared/roster";
import { computeReport, type ReportPayload, type StudentReport } from "../lib/report";
import { selectedTermId } from "../store";
import type { Student } from "@shared/types";
import { api } from "../lib/api";
import { fullName } from "../lib/names";
import { ok, withToast } from "../lib/notify";
import { routeParams, navigate } from "../router";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import { parseImport } from "../lib/importParse";

const STATUS_LABEL: Record<string, string> = { active: "กำลังเรียน", finished: "จบปีการศึกษา", moved: "ย้ายออก", inactive: "ไม่ใช้งาน" };

export function StudentsPage() {
  const params = routeParams();
  const [classId, setClassId] = useState(params.class || viewClasses.value[0]?.id || "");
  const [edit, setEdit] = useState<Student | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showFormer, setShowFormer] = useState(false);
  const [former, setFormer] = useState<Student[]>([]);
  const [drawer, setDrawer] = useState<string | null>(params.student || null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState("");
  const [reports, setReports] = useState<Map<string, StudentReport>>(new Map());
  const [statsStatus, setStatsStatus] = useState<LoadStatus>("loading");
  const begin = useLoadGuard();

  // this year: who is in the class today. An earlier year: that year's class as it was (children who finished
  // included) — read-only here, since the class was closed when the new year started
  const past = viewingPastYear.value;
  const active = past
    ? rosterOf(allStudents.value, classId, classById(classId)?.year, viewTerm.value)
    : studentsByClass.value.get(classId) ?? [];
  const cls = classById(classId);
  // the term changed: the class we were on may not exist in that year
  useEffect(() => {
    if (!viewClasses.value.some((c) => c.id === classId)) setClassId(viewClasses.value[0]?.id ?? "");
  }, [selectedTermId.value]);
  const rotated = qrRotatedAt.value;

  // per-student stats for this class (submit rate, attendance)
  async function loadStats() {
    if (!classId) { setStatsStatus("ready"); return; } // no class yet: nothing to load (don't spin forever)
    const fresh = begin();
    // the previous class's numbers must not sit under this class's names while loading or after a failure
    setReports(new Map()); setStatsStatus("loading");
    try {
      const q = new URLSearchParams({ class: classId });
      if (selectedTermId.value) q.set("term", selectedTermId.value);
      const p = await api.get<ReportPayload>(`/api/reports/summary?${q}`);
      if (!fresh()) return;
      const model = computeReport(p);
      setReports(new Map(model.students.map((s) => [s.student.id, s])));
      setStatsStatus("ready");
    } catch {
      if (fresh()) setStatsStatus("error");
    }
  }
  useEffect(() => { loadStats(); }, [classId, selectedTermId.value]);
  useEffect(() => {
    if (!showFormer) { setFormer([]); return; }
    api.get<{ students: Student[] }>(`/api/students?class=${classId}&status=moved,inactive`).then((r) => setFormer(r.students)).catch(() => setFormer([]));
  }, [showFormer, classId]);

  async function rotateClass() {
    setMenu(false);
    if (!confirm(`ออก QR ใหม่ทั้งห้อง ${cls?.name}? บัตรเดิมจะใช้ไม่ได้`)) return;
    setBusy("rotate");
    const done = await withToast(() => api.post(`/api/classes/${classId}/qr/rotate`), "ออก QR ใหม่ไม่สำเร็จ");
    if (done) { await loadBootstrap(); ok("ออก QR ใหม่ทั้งห้องแล้ว"); }
    setBusy("");
  }

  if (printing) return <StickerSheet classId={classId} onClose={() => setPrinting(false)} />;

  const q = query.trim().toLowerCase();
  const shown = q ? active.filter((s) => [s.first_name, s.last_name, s.nickname, s.code, String(s.number)].some((v) => (v ?? "").toLowerCase().includes(q))) : active;
  const withMissing = active.filter((s) => (reports.get(s.id)?.missing ?? 0) > 0).length;
  // two children on one class number: the number picks a child when the card is forgotten, so this must be fixed
  const dupNumbers = (() => {
    const by = new Map<number, string[]>();
    for (const s of active) if (s.number != null) by.set(s.number, [...(by.get(s.number) ?? []), s.first_name]);
    return [...by.entries()].filter(([, names]) => names.length > 1).sort((a, b) => a[0] - b[0]);
  })();
  const avgAtt = (() => {
    const rs = [...reports.values()].filter((r) => r.attendance.daysMarked > 0);
    if (!rs.length) return null;
    return Math.round(rs.reduce((n, r) => n + (r.attendance.present + r.attendance.late) / r.attendance.daysMarked, 0) / rs.length * 100);
  })();

  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));

  return (
    <div>
      <PageHeader icon="id-badge-2" title="นักเรียน" sub={<span>{cls?.name} · {active.length} คน</span>}
        actions={<>
          <TermPicker />
          {!past && cls && <>
          <button onClick={() => setImporting(true)}><Icon name="table-import" size={16} /> นำเข้า Excel</button>
          <button class="primary" onClick={() => setEdit("new")}><Icon name="user-plus" size={16} /> เพิ่มนักเรียน</button>
          </>}
        </>}
      />

      <YearBanner note="เพิ่ม/นำเข้านักเรียนทำได้เฉพาะห้องของปีนี้" />
      <div style="margin-bottom:8px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>

      <div class="row" style="gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <div class="stu-search"><Icon name="search" size={16} class="muted" /><input placeholder="ค้นหาชื่อ ชื่อเล่น รหัส หรือเลขที่" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} /></div>
        {!past && <button onClick={() => setPrinting(true)}><Icon name="printer" size={16} /> พิมพ์สติกเกอร์ QR</button>}
        {!past && <div style="position:relative">
          <button class="icon" aria-label="เพิ่มเติม" onClick={() => setMenu((v) => !v)}><Icon name="dots-vertical" size={16} /></button>
          {menu && (<>
            <div style="position:fixed;inset:0;z-index:39" onClick={() => setMenu(false)} />
            <div class="gb-menu">
              <button onClick={rotateClass} disabled={busy === "rotate"}><Icon name="refresh" size={15} /> ออก QR ใหม่ทั้งห้อง</button>
              <button onClick={() => { setMenu(false); setShowFormer((v) => !v); }}><Icon name="user-off" size={15} /> {showFormer ? "ซ่อน" : "แสดง"}คนที่ย้ายออก/ไม่ใช้งาน</button>
            </div>
          </>)}
        </div>}
      </div>

      {dupNumbers.length > 0 && (
        <div class="imp-warn danger" style="margin:0 0 8px" role="alert">
          <Icon name="alert-triangle" size={15} />
          <span>เลขที่ซ้ำในห้องนี้: {dupNumbers.map(([n, names]) => `เลขที่ ${n} (${names.join(", ")})`).join(" · ")} — แก้เลขที่ให้ไม่ซ้ำ ไม่เช่นนั้นสแกนด้วยเลขที่จะเลือกคนไม่ได้</span>
        </div>
      )}

      <div class="stu-summary">
        {statsStatus === "ready" ? (<>
          <span><span class="muted">ส่งงานครบ</span> <b style="color:var(--text-success)">{active.length - withMissing} คน</b></span>
          <span><span class="muted">มีงานค้าง</span> <b style="color:var(--text-danger)">{withMissing} คน</b></span>
          {avgAtt != null && <span><span class="muted">มาเรียนเฉลี่ย</span> <b>{avgAtt}%</b></span>}
        </>) : statsStatus === "loading" ? (
          <span class="muted"><Icon name="loader-2" size={14} class="spin" /> กำลังโหลดสถิติ…</span>
        ) : (
          <span style="color:var(--text-warning)"><Icon name="cloud-off" size={14} /> โหลดสถิติไม่สำเร็จ{navigator.onLine ? "" : " (ออฟไลน์)"} · <button class="lk" style="background:none;border:none;color:var(--text-accent);cursor:pointer;padding:0;font:inherit" onClick={() => loadStats()}>ลองอีกครั้ง</button></span>
        )}
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <div class="stu-list-head"><span>เลขที่</span><span>ชื่อ - สกุล</span><span>รหัส</span><span>ส่งงาน</span><span class="num" style="text-align:right">ค้าง</span><span>มา</span><span /></div>
        {!cls ? (
          <EmptyState icon="school" text="ยังไม่มีห้องเรียน — สร้างห้องก่อน แล้วค่อยนำเข้านักเรียน" action={<button class="primary" onClick={() => navigate("/settings")}><Icon name="settings" size={16} /> ไปที่ตั้งค่า › ห้องเรียน</button>} />
        ) : shown.length === 0 ? (
          <EmptyState icon="user-question" text={q ? "ไม่พบนักเรียนที่ค้นหา" : "ยังไม่มีนักเรียนในห้องนี้"} action={!q && !past && <button class="primary" onClick={() => setEdit("new")}><Icon name="plus" size={16} /> เพิ่มนักเรียน</button>} />
        ) : shown.map((st, i) => {
          const r = reports.get(st.id);
          const attPct = r && r.attendance.daysMarked ? Math.round(((r.attendance.present + r.attendance.late) / r.attendance.daysMarked) * 100) : null;
          const submitPct = r ? r.percent : 0; // no stats yet ≠ "handed everything in"
          return (
            <div class={"stu-lrow" + (drawer === st.id ? " sel" : "")} onClick={() => setDrawer(st.id)}>
              <Avatar text={String(st.number ?? i + 1)} />
              <div style="min-width:0"><div class="name">{fullName(st)}{st.status !== "active" && <span class="chip" style="margin-left:6px;font-size:11px">{STATUS_LABEL[st.status]}</span>}{rotated[st.id] && <span class="stu-qrnew" style="margin-left:6px"><Icon name="refresh" size={10} /> QR ใหม่</span>}</div><div class="page-sub">{st.nickname}</div></div>
              <span class="code">{st.code}</span>
              <span class="sc num"><span class="stu-mini"><i style={`width:${submitPct}%${submitPct < 85 ? ";background:var(--fill-warning)" : ""}`} /></span>{r ? `${r.submitted}/${r.applicable}` : "—"}</span>
              <span class="num" style="text-align:right">{r && r.missing > 0 ? <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)">{r.missing}</span> : <span class="muted">–</span>}</span>
              <span class="att num" style="font-variant-numeric:tabular-nums">{attPct != null ? attPct + "%" : "—"}</span>
              <Icon name="chevron-right" size={16} class="muted" />
            </div>
          );
        })}
      </div>

      {showFormer && (
        <div class="card" style="margin-top:12px">
          <div style="font-weight:500;margin-bottom:6px">ย้ายออก / ไม่ใช้งาน ({former.length})</div>
          {former.length === 0 ? <div class="page-sub">ไม่มี</div> : former.map((st) => (
            <div class="row" style="gap:10px;padding:6px 0;border-top:0.5px solid var(--border)">
              <Avatar student={st} />
              <span class="grow">{fullName(st)} <span class="page-sub">· {st.status === "moved" ? "ย้ายออก" : "ไม่ใช้งาน"}</span></span>
              <button style="height:28px;font-size:12px" onClick={() => setEdit(st)}><Icon name="edit" size={14} /> แก้ไข</button>
            </div>
          ))}
        </div>
      )}

      {drawer && <StudentDrawer studentId={drawer} classId={classId} onClose={() => setDrawer(null)} onEdit={(s) => { setDrawer(null); setEdit(s); }} />}
      {edit && <StudentModal student={edit === "new" ? null : edit} classId={classId} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await loadBootstrap(); loadStats(); }} />}
      {importing && <ImportModal classId={classId} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await loadBootstrap(); }} />}
    </div>
  );
}

export function StudentModal({ student, classId, onClose, onSaved }: { student: Student | null; classId: string; onClose: () => void; onSaved: () => void }) {
  const [prefix, setPrefix] = useState(student?.prefix ?? "ด.ช.");
  const [firstName, setFirstName] = useState(student?.first_name ?? "");
  const [lastName, setLastName] = useState(student?.last_name ?? "");
  const [nickname, setNickname] = useState(student?.nickname ?? "");
  const [code, setCode] = useState(student?.code ?? "");
  const [number, setNumber] = useState<number | "">(student?.number ?? "");
  const [status, setStatus] = useState(student?.status ?? "active");
  // the day they left (moved / inactive): a past term still counts them; empty = today
  const [leftAt, setLeftAt] = useState(student?.left_at ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr("");
    if (!firstName.trim() || !code.trim()) return setErr("กรอกชื่อและรหัสนักเรียน");
    setBusy(true);
    try {
      await api.post("/api/students", {
        id: student?.id, code: code.trim(), prefix, first_name: firstName.trim(), last_name: lastName.trim(),
        nickname: nickname || null, class_id: classId, number: number === "" ? null : Number(number), status,
        ...((status === "moved" || status === "inactive") && leftAt ? { left_at: leftAt } : {}),
      });
      onSaved();
    } catch (e: any) { setErr(e.message || "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function rotate() { if (!student) return; await api.post(`/api/students/${student.id}/qr/rotate`).catch(() => {}); onSaved(); }

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" role="dialog" aria-label="นักเรียน" style="max-width:480px">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <h2 style="font-size:18px">{student ? "แก้ไขนักเรียน" : "เพิ่มนักเรียน"}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div class="modal-grid3">
          <label class="field"><span>คำนำหน้า</span>
            <select value={prefix} onInput={(e) => setPrefix((e.target as HTMLSelectElement).value)}><option>ด.ช.</option><option>ด.ญ.</option><option>นาย</option><option>น.ส.</option></select>
          </label>
          <label class="field" style="grid-column:span 2"><span>รหัสนักเรียน</span><input value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} /></label>
        </div>
        <div class="modal-grid2">
          <label class="field"><span>ชื่อ</span><input value={firstName} onInput={(e) => setFirstName((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>สกุล</span><input value={lastName} onInput={(e) => setLastName((e.target as HTMLInputElement).value)} /></label>
        </div>
        <div class="modal-grid3">
          <label class="field"><span>ชื่อเล่น</span><input value={nickname} onInput={(e) => setNickname((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>เลขที่</span><input type="number" value={number} onInput={(e) => setNumber((e.target as HTMLInputElement).value === "" ? "" : Number((e.target as HTMLInputElement).value))} /></label>
          <label class="field"><span>สถานะ</span>
            <select value={status} onInput={(e) => setStatus((e.target as HTMLSelectElement).value as Student["status"])}><option value="active">กำลังเรียน</option><option value="moved">ย้ายออก</option><option value="inactive">ไม่ใช้งาน</option><option value="finished">จบปีการศึกษา</option></select>
          </label>
        </div>
        {(status === "moved" || status === "inactive") && (
          <label class="field"><span>ออกเมื่อ (เว้นว่าง = วันนี้)</span>
            <input type="date" value={leftAt} onInput={(e) => setLeftAt((e.target as HTMLInputElement).value)} />
          </label>
        )}
        {student && <div class="page-sub" style="margin:6px 0">QR ปัจจุบัน: <span style="font-family:var(--font-mono)">{student.qr_token}</span></div>}
        {err && <div style="color:var(--text-danger);font-size:13px;margin:6px 0">{err}</div>}
        <div class="row" style="justify-content:space-between;margin-top:10px">
          {student ? <button onClick={rotate}><Icon name="refresh" size={16} /> ออก QR ใหม่</button> : <span />}
          <div class="row" style="gap:8px">
            <button onClick={onClose}>ยกเลิก</button>
            <button class="primary" onClick={save} disabled={busy}>{busy ? <Icon name="loader-2" class="spin" /> : <Icon name="device-floppy" />} บันทึก</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ImportPreview {
  rows: { code: string; action: "create" | "update" | "same" | "move" | "reactivate"; reactivates?: boolean; from?: { class_id: string | null; status: string; number: number | null; name: string } }[];
  summary: { create: number; update: number; same: number; move: number; reactivate: number };
  dupCodes: string[]; dupNumbers: number[];
  numberClashes: { number: number; code: string; name: string }[];
  classActive?: number; notInPaste?: number; // children already in the class / of them, not in this paste
}
const MAX_IMPORT = 200;

const ACTION_LABEL = {
  create: { text: "ใหม่", style: "background:var(--bg-success);color:var(--text-success)" },
  update: { text: "แก้ข้อมูล", style: "background:var(--bg-accent);color:var(--text-accent)" },
  same: { text: "เหมือนเดิม", style: "background:var(--surface-1);color:var(--text-secondary)" },
  move: { text: "ย้ายห้อง", style: "background:var(--bg-warning);color:var(--text-warning)" },
  reactivate: { text: "กลับมาใช้งาน", style: "background:var(--bg-warning);color:var(--text-warning)" },
} as const;

function ImportModal({ classId, onClose, onDone }: { classId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [confirmed, setConfirmed] = useState(false);
  const begin = useLoadGuard();

  const { rows, skipped } = parseImport(text);
  const tooMany = rows.length > MAX_IMPORT;
  const cls = activeClasses.value.find((c) => c.id === classId);

  // Ask the server what this paste WOULD do (it matches by code and overwrites — including moving
  // a student into this class and reactivating them) before anything is written.
  useEffect(() => {
    setConfirmed(false);
    if (rows.length === 0 || tooMany) { setPreview(null); setPreviewState("idle"); return; }
    setPreviewState("loading");
    const fresh = begin();
    const t = setTimeout(() => {
      api.post<ImportPreview>("/api/students/import/preview", { class_id: classId, students: rows })
        .then((p) => { if (fresh()) { setPreview(p); setPreviewState("ready"); } })
        .catch(() => { if (fresh()) { setPreview(null); setPreviewState("error"); } });
    }, 400);
    return () => clearTimeout(t);
  }, [text, classId]);

  const risky = preview ? preview.summary.move + preview.summary.reactivate : 0;
  // most of the class isn't in this list: probably a new year's children going into last year's class
  const oldClassWarn = !!preview && (preview.notInPaste ?? 0) >= 5 && (preview.notInPaste ?? 0) * 2 >= (preview.classActive ?? 0);
  // children who finished last year and are being brought into this class: their old-year history stays with the old class
  const returning = preview ? preview.rows.filter((r) => r.from?.status === "finished").length : 0;
  // a repeated code, or two children on one class number, can't be imported (it would put a mark on the wrong child)
  const blocked = !!preview && (preview.dupCodes.length > 0 || preview.dupNumbers.length > 0 || preview.numberClashes.length > 0);
  const canImport = !busy && rows.length > 0 && !tooMany && previewState === "ready" && !blocked && (risky === 0 || confirmed);

  async function doImport() {
    setErr("");
    if (rows.length === 0) return setErr("ไม่พบข้อมูลที่อ่านได้ — วางจาก Excel (คอลัมน์: รหัส, คำนำหน้า ชื่อ สกุล, เลขที่)");
    setBusy(true);
    try { await api.post("/api/students/import", { class_id: classId, students: rows }); onDone(); }
    catch (e: any) { setErr(e.message || "นำเข้าไม่สำเร็จ"); } finally { setBusy(false); }
  }

  const sum = preview?.summary;
  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" role="dialog" aria-label="นำเข้านักเรียน" style="max-width:600px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:18px">นำเข้านักเรียนจาก Excel → {cls?.name}</h2>
          <button class="icon ghost" aria-label="ปิด" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div class="page-sub" style="margin-bottom:8px">คัดลอกจาก Excel แล้ววางที่นี่ · คอลัมน์: รหัส | คำนำหน้า ชื่อ สกุล | เลขที่ · รหัสที่มีอยู่แล้วจะถูกอัปเดต</div>
        <textarea rows={6} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder={"10501\tด.ช. ภูมิพัฒน์ ใจดี\t1\n10502\tด.ญ. ปุณยวีร์ แสงทอง\t2"} style="font-family:var(--font-mono);font-size:13px" />

        {rows.length > 0 && (
          <div class="imp-sum">
            {previewState === "loading" && <span class="muted"><Icon name="loader-2" size={14} class="spin" /> กำลังตรวจกับข้อมูลในระบบ…</span>}
            {previewState === "error" && <span style="color:var(--text-warning)"><Icon name="cloud-off" size={14} /> ตรวจกับระบบไม่ได้{navigator.onLine ? "" : " (ออฟไลน์)"} — ต่อเน็ตแล้วแก้ข้อความเล็กน้อยเพื่อตรวจใหม่</span>}
            {sum && (<>
              <span class="chip" style={ACTION_LABEL.create.style}>เพิ่มใหม่ {sum.create}</span>
              <span class="chip" style={ACTION_LABEL.update.style}>แก้ข้อมูล {sum.update}</span>
              <span class="chip" style={ACTION_LABEL.same.style}>เหมือนเดิม {sum.same}</span>
              {sum.move > 0 && <span class="chip" style={ACTION_LABEL.move.style}>ย้ายห้อง {sum.move}</span>}
              {sum.reactivate > 0 && <span class="chip" style={ACTION_LABEL.reactivate.style}>กลับมาใช้งาน {sum.reactivate}</span>}
            </>)}
          </div>
        )}

        {tooMany && <div class="imp-warn danger"><Icon name="alert-triangle" size={15} /> นำเข้าได้ครั้งละไม่เกิน {MAX_IMPORT} คน (วางมา {rows.length}) — แบ่งเป็นหลายรอบ</div>}
        {preview && preview.dupCodes.length > 0 && <div class="imp-warn danger"><Icon name="alert-triangle" size={15} /> รหัสซ้ำในรายการ: {preview.dupCodes.join(", ")} — แก้ให้เหลือแถวเดียวต่อรหัสก่อนนำเข้า</div>}
        {preview && preview.dupNumbers.length > 0 && <div class="imp-warn danger"><Icon name="alert-triangle" size={15} /> เลขที่ซ้ำกันในรายการ: {preview.dupNumbers.join(", ")} — แก้ให้ไม่ซ้ำก่อนนำเข้า (เลขที่ใช้เลือกนักเรียนตอนสแกน)</div>}
        {preview && preview.numberClashes.length > 0 && <div class="imp-warn danger"><Icon name="alert-triangle" size={15} /> เลขที่ชนกับนักเรียนที่ไม่ได้อยู่ในรายการ: {preview.numberClashes.map((c) => `เลขที่ ${c.number} (${c.name})`).join(", ")} — แก้เลขที่ในรายการ หรือย้ายเลขที่ของคนเดิมก่อน</div>}
        {oldClassWarn && (
          <div class="imp-warn"><Icon name="info-circle" size={15} /> ห้องนี้ยังมีนักเรียนเดิม {preview!.notInPaste} คนที่ไม่อยู่ในรายการนี้ — ถ้านี่คือนักเรียนของปีการศึกษาใหม่ ให้ปิดหน้าต่างนี้แล้วใช้ “เริ่มภาคเรียนใหม่” (ตั้งค่า › ภาคเรียน) ก่อน จะได้ห้องว่างของปีใหม่ และรายงานปีที่แล้วไม่ปนกับเด็กชุดใหม่</div>
        )}
        {returning > 0 && (
          <div class="imp-warn"><Icon name="info-circle" size={15} /> {returning} คนเคยเรียนกับครูปีที่แล้ว (จบปีการศึกษา) — นำเข้าจะย้ายมาห้องนี้ และประวัติปีเก่าของคนเหล่านี้จะไม่แสดงในรายงานปีเก่าอีก</div>
        )}
        {skipped.length > 0 && <div class="imp-warn"><Icon name="info-circle" size={15} /> อ่านไม่ได้ {skipped.length} บรรทัด (ต้องมีรหัส 3 หลักขึ้นไป และชื่อ): {skipped.slice(0, 3).join(" ⏎ ")}{skipped.length > 3 ? " …" : ""}</div>}

        {rows.length > 0 && (
          <div class="card" style="margin-top:8px;padding:0;overflow:hidden;max-height:220px;overflow-y:auto">
            <div class="row" style="padding:6px 12px;background:var(--surface-1);font-size:12px"><span style="width:60px">รหัส</span><span class="grow">ชื่อ</span><span style="width:40px">เลขที่</span><span style="width:100px;text-align:right">ผล</span></div>
            {rows.slice(0, MAX_IMPORT).map((r, i) => {
              const pr = preview?.rows[i];
              const lab = pr ? ACTION_LABEL[pr.action] : null;
              return (
                <div class="row" style="padding:6px 12px;border-top:0.5px solid var(--border);gap:0">
                  <span class="code" style="width:60px;font-family:var(--font-mono);font-size:12px">{r.code}</span>
                  <span class="grow" style="font-size:13px;min-width:0">{r.prefix} {r.first_name} {r.last_name}
                    {pr?.action === "move" && pr.from && <span class="page-sub"> · จาก {(classById(pr.from!.class_id)?.name ?? "ห้องอื่น")}{pr.reactivates ? " (และกลับมาใช้งาน)" : ""}</span>}
                    {pr?.action === "reactivate" && pr.from && <span class="page-sub"> · เดิมสถานะ {STATUS_LABEL[pr.from.status] ?? pr.from.status}</span>}
                  </span>
                  <span style="width:40px">{r.number ?? "-"}</span>
                  <span style="width:100px;text-align:right">{lab && <span class="chip" style={lab.style}>{lab.text}</span>}</span>
                </div>
              );
            })}
          </div>
        )}

        {risky > 0 && (
          <label class="imp-confirm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed((e.target as HTMLInputElement).checked)} />
            <span>ตรวจแล้ว — ยอมรับการ<b style="font-weight:500">ย้ายห้อง {sum!.move} คน</b>{sum!.reactivate > 0 ? <> และ<b style="font-weight:500">เปลี่ยนสถานะกลับมาใช้งาน {sum!.reactivate} คน</b></> : null} (ข้อมูลเดิมของนักเรียนเหล่านี้จะถูกแก้)</span>
          </label>
        )}

        {err && <div style="color:var(--text-danger);font-size:13px;margin-top:8px">{err}</div>}
        <div class="row" style="justify-content:space-between;margin-top:10px">
          <span class="page-sub">อ่านได้ {rows.length} รายการ</span>
          <div class="row" style="gap:8px">
            <button onClick={onClose}>ยกเลิก</button>
            <button class="primary" onClick={doImport} disabled={!canImport}>{busy ? <Icon name="loader-2" class="spin" /> : <Icon name="download" />} นำเข้า {rows.length} คน</button>
          </div>
        </div>
      </div>
    </div>
  );
}
