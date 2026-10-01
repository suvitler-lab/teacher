import { useEffect, useState } from "preact/hooks";
import "../styles/home.css";
import { Icon } from "../components/Icon";
import { PageHeader, StatCard, StackBar, ProgressBar, Avatar, TermPicker, YearBanner, EmptyState, Drawer, LoadError } from "../components/ui";
import {
  settings, selectedTermId, currentTerm, startTermOpen, viewingPastYear, classById, subjectById, workTypeById, studentsById,
} from "../store";
import { navigate } from "../router";
import { formatThaiDate, formatThaiTimeMs } from "../lib/dates";
import { fullName } from "../lib/names";
import { dashboard, dashboardStale, dashboardAt, dashboardStatus, loadDashboard } from "../lib/dashboard";
import { attendanceProgress } from "@shared/metrics";
import { attDraftCount } from "../lib/attSync";
import { pendingCount, failedCount } from "../lib/outbox";
import type { AttendanceDay, AssignmentDashboard } from "@shared/types";

function bkkToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
}
function dueChip(due: string | null, today: string) {
  if (!due) return null;
  const d = daysUntil(due, today);
  if (d < 0) return { cls: "danger", text: `เลยกำหนด ${-d} วัน` };
  if (d === 0) return { cls: "warning", text: "ครบกำหนดวันนี้" };
  if (d === 1) return { cls: "warning", text: "ส่งพรุ่งนี้" };
  return { cls: "muted", text: `ส่ง ${formatThaiDate(due)}` };
}
const CHIP: Record<string, string> = {
  danger: "background:var(--bg-danger);color:var(--text-danger)",
  warning: "background:var(--bg-warning);color:var(--text-warning)",
  muted: "background:var(--surface-1);color:var(--text-secondary)",
  accent: "background:var(--bg-accent);color:var(--text-accent)",
};

type ListKind = "open" | "awaiting" | "missing";
interface ListRow { a: AssignmentDashboard; classId: string; n: number; total: number }

// The rows behind a stat card — built from the same payload as the card's number, so the list
// always adds up to the figure the teacher tapped.
function listRows(kind: ListKind, open: AssignmentDashboard[], grading: AssignmentDashboard[]): ListRow[] {
  const out: ListRow[] = [];
  const source = kind === "awaiting" ? [...open, ...grading] : open; // closed work still needs grading, but nobody chases it
  for (const a of source) for (const p of a.perClass) {
    const n = kind === "open" ? p.submitted : kind === "awaiting" ? p.awaiting : p.missing;
    if (kind === "open" || n > 0) out.push({ a, classId: p.classId, n, total: p.total });
  }
  return out.sort((x, y) =>
    (classById(x.classId)?.name ?? "").localeCompare(classById(y.classId)?.name ?? "", "th") ||
    (x.a.assignment.due_date ?? "9999").localeCompare(y.a.assignment.due_date ?? "9999"));
}

export function Home() {
  const s = settings.value;
  const today = bkkToday();
  const [list, setList] = useState<ListKind | null>(null);

  useEffect(() => { loadDashboard(selectedTermId.value); }, [selectedTermId.value]);

  const d = dashboard.value;
  const status = dashboardStatus.value;
  const open = d?.openAssignments ?? [];
  const grading = d?.gradingAssignments ?? [];

  // attendance today: every class that has students, judged by how many were actually checked
  const att = (d?.attendanceToday ?? []).filter((a) => a.total > 0);
  const prog = att.map((a) => attendanceProgress(a.marked, a.total));
  const completeN = prog.filter((p) => p === "complete").length;
  const partialN = prog.filter((p) => p === "partial").length;
  const attMarked = att.reduce((n, a) => n + a.marked, 0);
  const attPresent = att.reduce((n, a) => n + a.present + a.late, 0);
  const attPct = attMarked ? Math.round((attPresent / attMarked) * 100) : 0;
  const attSub = att.length === 0 ? "ยังไม่มีนักเรียน"
    : completeN === att.length ? "วันนี้เช็คครบทุกห้อง"
    : `ยังเหลือ ${att.length - completeN} ห้อง`;

  const lastBackup = s?.last_backup_at ? Number(s.last_backup_at) : 0;
  const backupStale = !lastBackup || Date.now() - lastBackup > 7 * 86400000;

  const rows = list ? listRows(list, open, grading) : [];
  const LIST_TITLE: Record<ListKind, string> = { open: "งานที่เปิดรับ", awaiting: "งานรอตรวจ", missing: "งานค้างส่ง" };
  const LIST_HINT: Record<ListKind, string> = {
    open: "ส่งแล้ว / ทั้งห้อง แยกตามห้องและงาน",
    awaiting: "รวมงานที่ปิดรับแล้วแต่ยังตรวจไม่เสร็จ",
    missing: "เฉพาะงานที่ยังเปิดรับ — งานที่ปิดแล้วไม่นับ",
  };

  return (
    <div>
      <PageHeader
        icon="home"
        title={`สวัสดี ${s?.teacher_name || "คุณครู"}`}
        sub={<>
          <span>{s?.school_name}</span>
          <span>· {formatThaiDate(today)}</span>
          {dashboardStale.value && dashboardAt.value && (
            <span class="chip" style={CHIP.warning}><Icon name="cloud-off" size={13} /> ข้อมูล ณ {formatThaiTimeMs(dashboardAt.value)}</span>
          )}
        </>}
        actions={<TermPicker />}
      />

      <YearBanner note="สิ่งที่ค้างของปีนั้นยังตรวจและแก้คะแนนได้" />
      {/* the current term's last day has passed: the next step is starting the new term (which, at year end, also opens the new year's classes) */}
      {!viewingPastYear.value && currentTerm.value?.end_date && currentTerm.value.end_date < today && (
        <div class="hm-backup" style="margin:0 0 10px">
          <Icon name="calendar-event" size={18} />
          <span class="grow">ภาคเรียน {currentTerm.value.name} สิ้นสุดเมื่อ {formatThaiDate(currentTerm.value.end_date)} แล้ว — พร้อมเริ่มภาคเรียนถัดไปไหม</span>
          <button onClick={() => { startTermOpen.value = true; }}>เริ่มภาคเรียนใหม่</button>
        </div>
      )}
      {(attDraftCount.value + pendingCount.value + failedCount.value) > 0 && (
        <div class="hm-backup" style="margin:0 0 10px">
          <Icon name="clock" size={18} />
          <span class="grow">
            ยังมีข้อมูลที่ยังไม่ได้ส่งขึ้นระบบ:
            {attDraftCount.value > 0 ? ` เช็คชื่อ ${attDraftCount.value}` : ""}
            {pendingCount.value > 0 ? ` · คะแนน ${pendingCount.value}` : ""}
            {failedCount.value > 0 ? ` · ส่งไม่สำเร็จ ${failedCount.value}` : ""}
          </span>
          {attDraftCount.value > 0 && <button onClick={() => navigate("/attendance")}>ดูเช็คชื่อ</button>}
        </div>
      )}

      <div class="hm-actions">
        <a class="hm-action primary" href="#/scan"><Icon name="scan" /><div><div class="t">สแกนส่งงาน</div><div class="s">เครื่องยิง · กล้อง</div></div></a>
        <a class="hm-action" href="#/attendance"><Icon name="user-check" /><div><div class="t">เช็คชื่อ</div><div class="s">{d ? attSub : "เช็คชื่อประจำวัน"}</div></div></a>
        <button class="hm-action" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="circle-plus" /><div><div class="t">สร้างงาน</div><div class="s">หลายห้องพร้อมกัน</div></div></button>
        <a class="hm-action" href="#/random"><Icon name="arrows-shuffle" /><div><div class="t">สุ่มชื่อ</div><div class="s">เฉพาะคนที่มา</div></div></a>
      </div>

      {status === "error" && !d ? (
        <LoadError onRetry={() => loadDashboard(selectedTermId.value)}
          text={navigator.onLine ? "โหลดข้อมูลหน้าหลักไม่สำเร็จ" : "ออฟไลน์ — ยังไม่มีข้อมูลของเทอมนี้ในเครื่อง (เลือกเทอมอื่น หรือรอต่อเน็ต)"} />
      ) : !d ? (
        <div class="card"><EmptyState icon="loader-2" text="กำลังโหลด…" /></div>
      ) : (<>
      <div class="stat-row" style="margin-bottom:12px">
        <StatCard label="งานที่เปิดรับ" value={open.length} icon="clipboard-list" hint="กดดูรายห้อง" onClick={() => setList("open")} />
        <StatCard label="รอตรวจ" value={d.awaitingCount} unit="ชิ้น" icon="pencil" hint="รวมงานที่ปิดรับแล้ว" onClick={() => setList("awaiting")} />
        <StatCard label="ค้างส่ง" value={d.missingCount} unit="ชิ้น" valueTone="danger" tone="danger" icon="alert-circle" hint="เฉพาะงานที่ยังเปิดรับ" onClick={() => setList("missing")} />
        <StatCard label="มาเรียนวันนี้" value={attMarked ? `${attPct}%` : "—"} tone="success" icon="user-check"
          hint={att.length ? `เช็คครบ ${completeN} จาก ${att.length} ห้อง${partialN ? ` · บางส่วน ${partialN}` : ""}` : "—"} onClick={() => navigate("/attendance")} />
      </div>

      <div class="hm-cols">
        <div class="card">
          <div class="hm-cardhead"><span class="row" style="gap:6px"><Icon name="clipboard-list" size={18} />งานที่กำลังเก็บ</span><button class="lk" onClick={() => navigate("/gradebook")}>สมุดคะแนน ›</button></div>
          {open.length === 0 ? (
            <EmptyState icon="clipboard-off" text="ยังไม่มีงานที่เปิดรับ" action={<button class="primary" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus" size={16} /> สร้างงาน</button>} />
          ) : open.map((a) => {
            const wt = workTypeById(a.assignment.type_id);
            const subj = subjectById(a.assignment.subject_id);
            const chip = dueChip(a.assignment.due_date, today);
            return (
              <div class="hm-asg">
                <div class="row" style="justify-content:space-between;gap:8px">
                  <div style="min-width:0">
                    <div class="row" style="gap:6px">
                      {wt && <span class={"chip " + wt.color}>{wt.name}</span>}
                      <span class="page-sub">{subj?.name} · เต็ม {a.assignment.full_score}</span>
                    </div>
                    <div class="ttl">{a.assignment.title}</div>
                  </div>
                  {chip && <span class="chip" style={CHIP[chip.cls]}>{chip.text}</span>}
                </div>
                {a.perClass.map((p) => {
                  const cls = classById(p.classId);
                  const pct = p.total ? Math.round((p.submitted / p.total) * 100) : 0;
                  const tone = p.missing > 0 ? "var(--fill-warning)" : "var(--fill-success)";
                  return (
                    <div class="hm-prog">
                      <span>{cls?.name}</span>
                      <ProgressBar pct={pct} tone={tone} />
                      <span class="num">{p.submitted}/{p.total}</span>
                      {p.awaiting > 0 ? <span class="chip" style={CHIP.accent}>รอตรวจ {p.awaiting}</span>
                        : p.missing > 0 ? <span class="chip" style={CHIP.danger}>ค้าง {p.missing}</span>
                        : <button class="chip" style={CHIP.muted + ";border:none;cursor:pointer"} onClick={() => navigate("/scan", { asg: a.assignment.id, class: p.classId })}><Icon name="scan" size={13} /> สแกน</button>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div class="hm-side">
          <div class="card">
            <div class="hm-cardhead"><span class="row" style="gap:6px"><Icon name="user-check" size={18} />เช็คชื่อวันนี้</span><button class="lk" onClick={() => navigate("/attendance")}>เช็คชื่อ ›</button></div>
            {att.length === 0 ? <div class="page-sub">ยังไม่มีห้องที่มีนักเรียน</div> : att.map((a) => <AttRow key={a.classId} a={a} />)}
          </div>
          <div class="card">
            <div class="hm-cardhead"><span class="row" style="gap:6px"><Icon name="flag" size={18} />ต้องติดตาม</span><button class="lk" onClick={() => navigate("/reports")}>รายงาน ›</button></div>
            {d.followUp.length === 0 ? (
              <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={14} /> ไม่มีงานค้างส่ง</div>
            ) : d.followUp.map((f) => {
              const st = studentsById.value.get(f.studentId);
              const cls = classById(f.classId);
              return (
                <button class="hm-follow" onClick={() => navigate("/students", { class: f.classId, student: f.studentId })}>
                  <Avatar student={st} />
                  <div class="grow" style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{st ? fullName(st) : f.studentId}</div><div class="page-sub">{cls?.name}</div></div>
                  <span class="chip" style={CHIP.danger}>ค้าง {f.missing}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      </>)}

      {backupStale && (
        <div class="hm-backup">
          <Icon name="database-export" size={18} />
          <span class="grow">{lastBackup ? `สำรองข้อมูลล่าสุด ${Math.round((Date.now() - lastBackup) / 86400000)} วันที่แล้ว` : "ยังไม่เคยสำรองข้อมูล"} · ควรสำรองสัปดาห์ละครั้ง</span>
          <button onClick={() => navigate("/settings", { section: "backup" })}>สำรองตอนนี้</button>
        </div>
      )}

      {list && (
        <Drawer title={<><div style="font-weight:500;font-size:16px">{LIST_TITLE[list]} · {list === "open" ? open.length : rows.reduce((n, r) => n + r.n, 0)}</div><div class="page-sub">{LIST_HINT[list]}</div></>} onClose={() => setList(null)}>
          {rows.length === 0 ? <EmptyState icon="circle-check" text="ไม่มีรายการ" /> : rows.map((r) => {
            const subj = subjectById(r.a.assignment.subject_id);
            return (
              <button class="hm-follow" onClick={() => {
                setList(null);
                navigate("/gradebook", {
                  class: r.classId, subject: r.a.assignment.subject_id, asg: r.a.assignment.id,
                  rows: list === "awaiting" ? "awaiting" : list === "missing" ? "missing" : undefined,
                });
              }}>
                <span class="chip" style={CHIP.muted}>{classById(r.classId)?.name}</span>
                <div class="grow" style="min-width:0">
                  <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500">{r.a.assignment.title}</div>
                  <div class="page-sub">{subj?.name}{r.a.assignment.status === "closed" ? " · ปิดรับแล้ว" : ""}{r.a.assignment.due_date ? ` · ส่ง ${formatThaiDate(r.a.assignment.due_date)}` : ""}</div>
                </div>
                {list === "open"
                  ? <span class="chip" style={CHIP.muted}>{r.n}/{r.total}</span>
                  : <span class="chip" style={list === "missing" ? CHIP.danger : CHIP.accent}>{list === "missing" ? "ค้าง" : "รอตรวจ"} {r.n}</span>}
              </button>
            );
          })}
        </Drawer>
      )}
    </div>
  );
}

function AttRow({ a }: { a: AttendanceDay }) {
  const cls = classById(a.classId);
  const p = attendanceProgress(a.marked, a.total);
  if (p === "none") {
    return (
      <button class="hm-att hm-att-link row" style="justify-content:space-between" onClick={() => navigate("/attendance", { class: a.classId })}>
        <span style="font-weight:500">{cls?.name}</span>
        <span class="chip" style={CHIP.warning}><Icon name="clock" size={13} /> ยังไม่เช็ค · {a.total} คน</span>
      </button>
    );
  }
  const parts = [
    a.present && `มา ${a.present}`, a.late && `สาย ${a.late}`, a.leave && `ลา ${a.leave}`,
    a.sick && `ป่วย ${a.sick}`, a.absent && `ขาด ${a.absent}`,
  ].filter(Boolean).join(" · ");
  return (
    <button class="hm-att hm-att-link" onClick={() => navigate("/attendance", { class: a.classId })}>
      <div class="row" style="justify-content:space-between;gap:6px">
        <span style="font-weight:500">{cls?.name}</span>
        {p === "partial"
          ? <span class="chip" style={CHIP.warning}><Icon name="circle-half-2" size={13} /> เช็คบางส่วน {a.marked}/{a.total} · เหลือ {a.total - a.marked} คน</span>
          : <span class="page-sub" style="font-variant-numeric:tabular-nums">{parts}</span>}
      </div>
      {p === "partial" && <div class="page-sub" style="margin-top:2px;font-variant-numeric:tabular-nums">{parts}</div>}
      <div style="margin-top:4px"><StackBar segments={[
        { value: a.present, color: "var(--fill-success)" },
        { value: a.late, color: "var(--fill-warning)" },
        { value: a.leave, color: "var(--fill-accent)" },
        { value: a.sick, color: "var(--fill-purple)" },
        { value: a.absent, color: "var(--fill-danger)" },
        // the unchecked remainder, so a half-done room looks half done
        { value: p === "partial" ? a.total - a.marked : 0, color: "var(--border-strong)" },
      ]} /></div>
    </button>
  );
}
