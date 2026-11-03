import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { Icon } from "../Icon";
import { Avatar, ProgressBar, StackBar, Segmented } from "../ui";
import { Chip, ChipButton, CardHead } from "./shared";
import {
  settings, currentTerm, viewClasses, classById, subjectById, workTypeById, studentsById, startTermOpen, studentsByClass,
} from "../../store";
import { navigate } from "../../router";
import { formatThaiDate, formatThaiDateMs } from "../../lib/dates";
import { fullName, shortName } from "../../lib/names";
import { dashboard } from "../../lib/dashboard";
import { hideNames } from "../../lib/homePrefs";
import { pendingCount, failedCount } from "../../lib/outbox";
import { attDrafts, attDraftCount } from "../../lib/attSync";
import { failedPanelOpen } from "../Overlays";
import { followUpText } from "../../lib/report";
import { notify } from "../../lib/notify";
import { dueInfo, shouldClose, openDays } from "../../lib/homeLogic";
import { attendanceProgress, assignmentRate, assignmentFraction } from "@shared/metrics";
import { bkkToday } from "@shared/time";
import type { AssignmentDashboard, AttendanceDay, ClassProgress } from "@shared/types";
import type { HomeCardKey } from "../../lib/homeCards";

const today = () => bkkToday();

// ---- งานที่กำลังเก็บ ----------------------------------------------------------------------------------------------
type Filter = "open" | "grading" | "close";
const SHOWN = 5; // how many assignments before "ดูทั้งหมด": 21 pieces of work made this card longer than the screen

function ClassRow({ a, p, open }: { a: AssignmentDashboard; p: ClassProgress; open: boolean }) {
  const id = a.assignment.id;
  const notYet = p.total - p.excused - p.submitted - p.missing; // not handed in, but not overdue yet
  const tone = p.missing > 0 ? "var(--fill-warning)" : "var(--fill-success)";
  const cls = classById(p.classId);
  return (
    <div class="hm-prog">
      <span>{cls?.name}</span>
      <ProgressBar pct={assignmentRate(p)} tone={tone} />
      <span class="num">{assignmentFraction(p)}</span>
      <span class="hm-chips">
        {p.missing > 0 && <ChipButton tone="danger" icon="alert-circle" onClick={() => navigate("/gradebook", { class: p.classId, subject: a.assignment.subject_id, asg: id, rows: "missing" })}>ยังไม่ส่ง {p.missing}</ChipButton>}
        {p.awaiting > 0 && <ChipButton tone="accent" icon="hourglass-empty" onClick={() => navigate("/gradebook", { class: p.classId, subject: a.assignment.subject_id, asg: id, rows: "awaiting" })}>รอตรวจ {p.awaiting}</ChipButton>}
        {open && notYet > 0 && <ChipButton icon="scan" onClick={() => navigate("/scan", { asg: id, class: p.classId })}>สแกนห้องนี้</ChipButton>}
        {p.missing === 0 && p.awaiting === 0 && !(open && notYet > 0) && <Chip tone="success" icon="circle-check">ครบแล้ว</Chip>}
      </span>
    </div>
  );
}

export function OpenCard() {
  const d = dashboard.value!;
  const [filter, setFilter] = useState<Filter>("open");
  const [all, setAll] = useState(false);
  const t = today();
  const closeList = d.openAssignments.filter((a) => shouldClose(a.assignment, t));
  const list = filter === "open"
    ? [...d.openAssignments].sort((x, y) => (x.assignment.due_date ?? "9999").localeCompare(y.assignment.due_date ?? "9999"))
    : filter === "close" ? closeList : d.gradingAssignments;
  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <section class="card" aria-labelledby="hc-open">
      <CardHead id="hc-open" icon="clipboard-list" title="งานที่กำลังเก็บ"
        extra={<Segmented label="กรองงาน" value={filter} onChange={(v) => { setFilter(v); setAll(false); }} options={[
          { value: "open", label: `เปิดรับ (${d.openAssignments.length})` },
          { value: "grading", label: `ปิดแล้ว-รอตรวจ (${d.gradingAssignments.length})` },
          { value: "close", label: `ควรปิดรับ (${closeList.length})` },
        ]} />} />
      {filter === "close" && <div class="hm-note"><Icon name="info-circle" size={16} /> ไม่มีกำหนดส่งและเปิดเกิน 14 วัน หรือเลยกำหนดเกิน 7 วัน — เด็กที่ไม่ส่งจะนับว่าค้างเมื่อปิดรับงาน</div>}
      {list.length === 0 ? (
        <div class="uc-empty">
          <div class="ei"><Icon name={filter === "open" ? "clipboard-off" : "circle-check"} size={32} /></div>
          <div>{filter === "open" ? "ยังไม่มีงานที่เปิดรับ" : filter === "close" ? "ไม่มีงานที่ควรปิดรับ" : "ไม่มีงานรอตรวจ"}</div>
          {filter === "open" && <div style="margin-top:10px"><button class="primary" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus" size={20} /> สร้างงาน</button></div>}
        </div>
      ) : shown.map((a) => {
        const wt = workTypeById(a.assignment.type_id);
        const subj = subjectById(a.assignment.subject_id);
        const due = dueInfo(a.assignment.due_date, t);
        const isOpen = a.assignment.status === "open";
        return (
          <div class="hm-asg">
            <div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start">
              <div style="min-width:0">
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  {wt && <span class={"chip " + wt.color}>{wt.name}</span>}
                  <span class="page-sub">{subj?.name} · เต็ม {a.assignment.full_score}{!isOpen ? " · ปิดรับแล้ว" : ""}</span>
                </div>
                <div class="ttl">{a.assignment.title}</div>
              </div>
              <span class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
                <Chip tone={due.tone} icon={due.icon}>{!a.assignment.due_date && filter === "close" ? `ไม่มีกำหนดส่ง · เปิดมา ${openDays(a.assignment, t)} วัน` : due.text}</Chip>
                {filter === "close" && <ChipButton icon="x" onClick={() => navigate("/gradebook", { class: a.perClass[0]?.classId, subject: a.assignment.subject_id, asg: a.assignment.id })}>ปิดรับงาน</ChipButton>}
              </span>
            </div>
            {a.perClass.map((p) => <ClassRow a={a} p={p} open={isOpen} />)}
          </div>
        );
      })}
      {list.length > SHOWN && !all && <button class="ghost" style="width:100%;margin-top:4px" onClick={() => setAll(true)}>ดูทั้งหมด ({list.length}) <Icon name="chevron-down" size={20} /></button>}
      <div class="row" style="justify-content:flex-end;gap:4px;margin-top:4px">
        <button class="lk" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus" size={16} /> สร้างงาน</button>
        <button class="lk" onClick={() => navigate("/gradebook")}>สมุดคะแนน ›</button>
      </div>
    </section>
  );
}

// ---- เช็คชื่อวันนี้ -----------------------------------------------------------------------------------------------
function AttRow({ a }: { a: AttendanceDay }) {
  const cls = classById(a.classId);
  const p = attendanceProgress(a.marked, a.total);
  if (p === "none") {
    return (
      <button class="hm-att hm-att-link row" style="justify-content:space-between" onClick={() => navigate("/attendance", { class: a.classId })}>
        <span style="font-weight:500">{cls?.name}</span>
        <Chip tone="warning" icon="clock">ยังไม่ได้เช็คชื่อ · {a.total} คน</Chip>
      </button>
    );
  }
  const parts = [a.present && `มา ${a.present}`, a.late && `สาย ${a.late}`, a.leave && `ลา ${a.leave}`, a.sick && `ป่วย ${a.sick}`, a.absent && `ขาด ${a.absent}`].filter(Boolean).join(" · ");
  return (
    <button class="hm-att hm-att-link" onClick={() => navigate("/attendance", { class: a.classId })}>
      <div class="row" style="justify-content:space-between;gap:6px">
        <span style="font-weight:500">{cls?.name}</span>
        {p === "partial"
          ? <Chip tone="warning" icon="circle-half-2">เช็คบางส่วน {a.marked}/{a.total} · เหลือ {a.total - a.marked} คน</Chip>
          : <span class="page-sub num">{parts}</span>}
      </div>
      {p === "partial" && <div class="page-sub num" style="margin-top:2px">{parts}</div>}
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

export function AttCard() {
  const att = (dashboard.value?.attendanceToday ?? []).filter((a) => a.total > 0);
  return (
    <section class="card" aria-labelledby="hc-att">
      <CardHead id="hc-att" icon="user-check" title="เช็คชื่อวันนี้" link="เช็คชื่อ ›" onLink={() => navigate("/attendance")} />
      {att.length === 0 ? <div class="page-sub">ยังไม่มีห้องที่มีนักเรียน</div> : att.map((a) => <AttRow key={a.classId} a={a} />)}
    </section>
  );
}

// ---- ต้องติดตาม --------------------------------------------------------------------------------------------------
export function FollowCard() {
  const d = dashboard.value!;
  return (
    <section class="card" aria-labelledby="hc-fol">
      <CardHead id="hc-fol" icon="flag" title="ต้องติดตาม" link="รายงาน ›" onLink={() => navigate("/reports")} />
      {d.followUp.length === 0 ? (
        <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={16} /> ไม่มีใครค้างส่ง</div>
      ) : hideNames.value ? (
        <div>
          <div class="hm-kv"><span>นักเรียนที่ค้างส่ง</span><b class="num">{d.followUp.length} คน</b></div>
          <div class="page-sub">ซ่อนชื่ออยู่ — กด "แสดงชื่อ" ด้านบนเพื่อดูรายคน</div>
        </div>
      ) : d.followUp.map((f) => {
        const st = studentsById.value.get(f.studentId);
        const cls = classById(f.classId);
        return (
          <button class="hm-follow" onClick={() => navigate("/students", { class: f.classId, student: f.studentId })}>
            <Avatar student={st} />
            <div class="grow" style="min-width:0"><div class="hm-ell">{st ? fullName(st) : f.studentId}</div><div class="page-sub">{cls?.name}</div></div>
            <Chip tone="danger" icon="alert-circle">ยังไม่ส่ง {f.missing} ชิ้น</Chip>
          </button>
        );
      })}
    </section>
  );
}

// ---- ครบกำหนดวันนี้/พรุ่งนี้ ----------------------------------------------------------------------------------------
export function DueCard() {
  const d = dashboard.value!;
  const [openRow, setOpenRow] = useState<Record<string, boolean>>({});
  const t = today();
  // a copy of the dashboard saved on this device before the update has no dueSoon / absentToday: treat as empty
  const rows = (d.dueSoon ?? []).flatMap((r) => {
    const a = d.openAssignments.find((x) => x.assignment.id === r.assignmentId);
    return a ? [{ r, a, key: r.assignmentId + ":" + r.classId }] : [];
  });
  function label(id: string) {
    const st = studentsById.value.get(id);
    return st ? `${st.number ?? "-"} ${shortName(st)}` : id;
  }
  function copyLine(r: (typeof rows)[number]) {
    const kids = r.r.studentIds.map((id) => studentsById.value.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
    const text = followUpText(kids.map((s) => ({ student: s, missing: [r.a.assignment.title] })), `${classById(r.r.classId)?.name ?? ""} ${r.a.assignment.title}`, formatThaiDateMs(Date.now()));
    navigator.clipboard?.writeText(text).then(() => notify("success", "คัดลอกแล้ว วางใน LINE ได้เลย"), () => notify("error", "คัดลอกไม่สำเร็จ"));
  }
  return (
    <section class="card" aria-labelledby="hc-due">
      <CardHead id="hc-due" icon="calendar-due" title="ครบกำหนดวันนี้/พรุ่งนี้" link="สมุดคะแนน ›" onLink={() => navigate("/gradebook")} />
      {rows.length === 0 ? (
        <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={16} /> ไม่มีงานครบกำหนดวันนี้หรือพรุ่งนี้</div>
      ) : rows.map(({ r, a, key }) => {
        const due = dueInfo(a.assignment.due_date, t);
        const open = !!openRow[key];
        return (
          <div class="hm-asg">
            <div class="row" style="justify-content:space-between;gap:6px;align-items:flex-start">
              <div style="min-width:0"><div class="ttl">{a.assignment.title}</div><div class="page-sub">{classById(r.classId)?.name} · {subjectById(a.assignment.subject_id)?.name}</div></div>
              <Chip tone={due.tone} icon={due.icon}>{due.text}</Chip>
            </div>
            <div class="row" style="margin-top:6px;flex-wrap:wrap;gap:6px">
              <Chip tone="danger" icon="alert-circle">ยังไม่ส่ง {r.studentIds.length} คน</Chip>
              {hideNames.value
                ? <Chip tone="muted" icon="eye-off">ซ่อนชื่ออยู่</Chip>
                : <ChipButton icon={open ? "chevron-up" : "chevron-down"} onClick={() => setOpenRow({ ...openRow, [key]: !open })}>{open ? "ซ่อนรายชื่อ" : "ดูรายชื่อ"}</ChipButton>}
              {!hideNames.value && <ChipButton icon="copy" onClick={() => copyLine({ r, a, key })}>คัดลอกไป LINE</ChipButton>}
              <ChipButton icon="scan" onClick={() => navigate("/scan", { asg: a.assignment.id, class: r.classId })}>สแกนห้องนี้</ChipButton>
            </div>
            {open && !hideNames.value && <div class="hm-names">{r.studentIds.map((id) => <button class="hm-chip hm-chipbtn muted" onClick={() => navigate("/students", { class: r.classId, student: id })}>{label(id)}</button>)}</div>}
          </div>
        );
      })}
    </section>
  );
}

// ---- ใครไม่มาวันนี้ ------------------------------------------------------------------------------------------------
const STATUS_TH = { absent: "ขาด", leave: "ลา", sick: "ป่วย", late: "สาย" } as const;
const STATUS_ORDER = ["absent", "leave", "sick", "late"] as const;

export function AbsentCard() {
  const d = dashboard.value!;
  const att = d.attendanceToday.filter((a) => a.total > 0);
  return (
    <section class="card" aria-labelledby="hc-abs">
      <CardHead id="hc-abs" icon="user-x" title="ใครไม่มาวันนี้" link="เช็คชื่อ ›" onLink={() => navigate("/attendance")} />
      {att.length === 0 && <div class="page-sub">ยังไม่มีห้องที่มีนักเรียน</div>}
      {att.map((a) => {
        const cls = classById(a.classId);
        if (attendanceProgress(a.marked, a.total) === "none") return <div class="hm-kv"><span style="font-weight:500">{cls?.name}</span><Chip tone="warning" icon="clock">ยังไม่ได้เช็คชื่อ</Chip></div>;
        const mine = (d.absentToday ?? []).filter((x) => x.classId === a.classId);
        if (mine.length === 0) return <div class="hm-kv"><span style="font-weight:500">{cls?.name}</span><Chip tone="success" icon="circle-check">มาครบ</Chip></div>;
        return (
          <div class="hm-kv" style="align-items:flex-start">
            <span style="font-weight:500;min-width:3.4em">{cls?.name}</span>
            <span class="grow" style="display:flex;flex-direction:column;gap:4px">
              {STATUS_ORDER.map((s) => {
                const who = mine.filter((x) => x.status === s);
                if (!who.length) return null;
                return (
                  <span class="row" style="flex-wrap:wrap;gap:4px">
                    <b class="page-sub" style="min-width:3.2em">{STATUS_TH[s]} {who.length}</b>
                    {!hideNames.value && who.map((w) => {
                      const st = studentsById.value.get(w.studentId);
                      return <button class="hm-chip hm-chipbtn muted" onClick={() => navigate("/students", { class: w.classId, student: w.studentId })}>{st ? `${st.number ?? "-"} ${shortName(st)}` : w.studentId}</button>;
                    })}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
      {hideNames.value && <div class="page-sub" style="margin-top:4px">ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน</div>}
    </section>
  );
}

// ---- ห้องของฉัน ---------------------------------------------------------------------------------------------------
export function ClassesCard() {
  const d = dashboard.value!;
  const rooms = viewClasses.value;
  return (
    <section class="card" aria-labelledby="hc-cls">
      <CardHead id="hc-cls" icon="school" title="ห้องของฉัน" link="นักเรียน ›" onLink={() => navigate("/students")} />
      {rooms.length === 0 ? <div class="page-sub">ยังไม่มีห้องเรียนในปีนี้</div> : (
        <div class="hm-clsgrid">
          {rooms.map((c) => {
            const count = studentsByClass.value.get(c.id)?.length ?? 0;
            const per = d.openAssignments.flatMap((a) => a.perClass.filter((p) => p.classId === c.id));
            const sub = per.reduce((n, p) => n + p.submitted, 0), miss = per.reduce((n, p) => n + p.missing, 0);
            const rate = sub + miss > 0 ? Math.round((sub * 100) / (sub + miss)) : null;
            const att = d.attendanceToday.find((x) => x.classId === c.id);
            const attText = att && att.marked > 0 ? `${Math.round(((att.present + att.late) * 100) / att.marked)}%` : "ยังไม่เช็ค";
            return (
              <div class="hm-cls">
                {count === 0 ? (
                  <button class="hm-cls-main" onClick={() => navigate("/students", { class: c.id })}><span class="nm">{c.name}</span><div class="page-sub">ยังไม่มีนักเรียน · นำเข้านักเรียน</div></button>
                ) : (
                  <button class="hm-cls-main" onClick={() => navigate("/students", { class: c.id })}>
                    <div class="row" style="justify-content:space-between"><span class="nm">{c.name}</span><span class="page-sub">{count} คน</span></div>
                    <div class="page-sub">อัตราส่ง {rate == null ? "—" : rate + "%"} · มาเรียนวันนี้ {attText}</div>
                    <div style="margin-top:6px"><ProgressBar pct={rate ?? 0} /></div>
                  </button>
                )}
                {count > 0 && <ChipButton icon="user-check" onClick={() => navigate("/attendance", { class: c.id })}>เช็คชื่อ</ChipButton>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---- ค้างในเครื่องนี้ ----------------------------------------------------------------------------------------------
export function QueueCard() {
  const n = pendingCount.value + failedCount.value + attDraftCount.value;
  return (
    <section class="card" aria-labelledby="hc-q">
      <CardHead id="hc-q" icon="device-mobile" title="ค้างในเครื่องนี้" />
      {n === 0 ? <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={16} /> ทุกอย่างขึ้นระบบแล้ว</div> : (
        <>
          <div class="hm-kv"><span class="row"><Icon name="cloud-upload" size={20} /> คะแนน/การส่งงาน รอส่ง</span><b class="num">{pendingCount.value}</b></div>
          <div class="hm-kv"><span class="row"><Icon name="user-check" size={20} /> เช็คชื่อ รอส่ง</span>
            <span class="row"><b class="num">{attDraftCount.value}</b>{attDrafts.value.length > 0 && <ChipButton onClick={() => navigate("/attendance")}>ดูเช็คชื่อ</ChipButton>}</span></div>
          <div class="hm-kv"><span class="row" style="color:var(--text-danger)"><Icon name="cloud-x" size={20} /> ส่งไม่สำเร็จ</span>
            <span class="row"><b class="num" style="color:var(--text-danger)">{failedCount.value}</b>{failedCount.value > 0 && <ChipButton tone="danger" onClick={() => { failedPanelOpen.value = true; }}>ดูรายการ</ChipButton>}</span></div>
          <div class="page-sub" style="margin-top:6px">จะส่งให้เองเมื่อกลับมาออนไลน์ · <button class="lk" style="min-height:0;padding:0" onClick={() => navigate("/settings", { section: "general" })}>ที่เก็บข้อมูลในเครื่อง ›</button></div>
        </>
      )}
    </section>
  );
}

// ---- สำรองข้อมูล / ภาคเรียน ---------------------------------------------------------------------------------------
export function BackupCard() {
  const last = settings.value?.last_backup_at ? Number(settings.value.last_backup_at) : 0;
  const days = last ? Math.round((Date.now() - last) / 86_400_000) : null;
  return (
    <section class="card" aria-labelledby="hc-bk">
      <CardHead id="hc-bk" icon="database-export" title="สำรองข้อมูล" />
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div><div>{days == null ? "ยังไม่เคยสำรองข้อมูล" : `สำรองล่าสุด ${days} วันที่แล้ว`}</div><div class="page-sub">ควรสำรองสัปดาห์ละครั้ง · ไฟล์มีข้อมูลนักเรียน เก็บให้ปลอดภัย</div></div>
        <button onClick={() => navigate("/settings", { section: "backup" })}><Icon name="database-export" size={20} /> สำรองตอนนี้</button>
      </div>
    </section>
  );
}

export function TermCard() {
  const t = currentTerm.value;
  const ended = !!t?.end_date && t.end_date < today();
  const weeks = t?.start_date && t.end_date ? Math.max(1, Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 604_800_000)) : null;
  const done = weeks && t?.start_date ? Math.max(0, Math.min(weeks, Math.ceil((Date.parse(today()) - Date.parse(t.start_date)) / 604_800_000))) : null;
  return (
    <section class="card" aria-labelledby="hc-tm">
      <CardHead id="hc-tm" icon="calendar-stats" title="ภาคเรียน" link="ตั้งค่าภาคเรียน ›" onLink={() => navigate("/settings", { section: "catalog" })} />
      {!t ? <div class="page-sub">ยังไม่ได้ตั้งภาคเรียน</div> : (
        <>
          <div class="hm-kv"><span>ภาคเรียนปัจจุบัน</span><b>{t.name}</b></div>
          {t.start_date && t.end_date && <div class="hm-kv"><span>ช่วงวัน</span><b>{formatThaiDate(t.start_date)} – {formatThaiDate(t.end_date)}{ended ? " (สิ้นสุดแล้ว)" : ""}</b></div>}
          {weeks && done != null && (
            <>
              <div class="hm-kv"><span>สัปดาห์ที่ผ่านไป</span><b class="num">{ended ? weeks : done} / {weeks}</b></div>
              <ProgressBar pct={Math.round(((ended ? weeks : done) * 100) / weeks)} tone="var(--fill-accent)" />
            </>
          )}
          {ended && <div class="row" style="justify-content:flex-end;margin-top:8px"><button onClick={() => { startTermOpen.value = true; }}><Icon name="calendar-event" size={20} /> เริ่มภาคเรียนใหม่</button></div>}
        </>
      )}
    </section>
  );
}

export const CARD_VIEW: Record<HomeCardKey, () => JSX.Element> = {
  open: OpenCard, att: AttCard, follow: FollowCard, due: DueCard, absent: AbsentCard,
  classes: ClassesCard, queue: QueueCard, backup: BackupCard, term: TermCard,
};
