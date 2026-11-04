import { schoolLabel } from "../lib/orgNames";
import { useEffect, useState } from "preact/hooks";
import "../styles/home.css";
import { Icon } from "../components/Icon";
import { PageHeader, StatCard, TermPicker, YearBanner, EmptyState, Drawer } from "../components/ui";
import { HomeSkeleton, HomeError, NoClassesCard, NoStudentsCard } from "../components/home/States";
import { Chip } from "../components/home/shared";
import { TodoCard } from "../components/home/Todo";
import { ResumeScan } from "../components/home/Resume";
import { CardSettings } from "../components/home/CardSettings";
import { CARD_VIEW } from "../components/home/cards";
import { CARD_WEIGHT } from "../components/home/meta";
import { PageCols } from "../components/PageCols";
import {
  settings, selectedTermId, viewingPastYear, classById, subjectById, viewClasses, studentsByClass,
} from "../store";
import { navigate } from "../router";
import { online } from "../lib/outbox";
import { formatThaiDate } from "../lib/dates";
import { dashboard, dashboardStale, dashboardAt, dashboardStatus, loadDashboard } from "../lib/dashboard";
import { formatThaiTimeMs } from "../lib/dates";
import { homeCards, hideNames, setHideNames } from "../lib/homePrefs";
import { visibleOrder, type HomeCardKey } from "../lib/homeCards";
import { attendanceHeadline } from "../lib/homeLogic";
import { attendanceProgress, attendancePercent } from "@shared/metrics";
import { bkkToday } from "@shared/time";
import type { AssignmentDashboard } from "@shared/types";

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
  const [prefsOpen, setPrefsOpen] = useState(false);

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
  const attPct = attendancePercent(att.reduce((c, a) => ({
    present: c.present + a.present, late: c.late + a.late, leave: c.leave + a.leave, sick: c.sick + a.sick, absent: c.absent + a.absent,
  }), { present: 0, late: 0, leave: 0, sick: 0, absent: 0 }));
  const pastYear = viewingPastYear.value;
  const rooms = viewClasses.value;
  const noClasses = rooms.length === 0;
  // classes exist but nobody is in them (judged from the roster, and only once the dashboard agrees)
  const noStudents = !noClasses && !!d && att.length === 0 && [...open, ...grading].every((a) => a.perClass.every((p) => p.total === 0)) && rooms.every((c) => (studentsByClass.value.get(c.id)?.length ?? 0) === 0);
  const stale = dashboardStale.value;
  const staleTag = stale ? <> <Chip tone="warning">ข้อมูลเก่า</Chip></> : null;

  const rows = list ? listRows(list, open, grading) : [];
  const LIST_TITLE: Record<ListKind, string> = { open: "งานที่เปิดรับ", awaiting: "งานรอตรวจ", missing: "ยังไม่ส่ง" };
  const LIST_HINT: Record<ListKind, string> = {
    open: "ส่งแล้ว / ทั้งห้อง แยกตามห้องและงาน",
    awaiting: "รวมงานที่ปิดรับแล้วแต่ยังตรวจไม่เสร็จ",
    missing: "เฉพาะงานที่ยังเปิดรับ — งานที่ปิดแล้วไม่นับ",
  };

  // the cards the teacher chose, in the order chosen. On a wide screen <PageCols> spreads them over up to three
  // columns (the next card goes to the shortest column), so the first card is always top-left.
  const order = visibleOrder(homeCards.value).filter((k) => !(pastYear && k === "att"));
  const view = (k: HomeCardKey) => { const C = CARD_VIEW[k]; return <C />; };

  const attLine = pastYear ? "ใช้ห้องของปีนี้" : d ? attendanceHeadline(d.attendanceToday.filter((a) => a.total > 0)) : "เช็คชื่อประจำวัน";
  const quick = (sub: string) => (pastYear ? "ใช้ห้องของปีนี้" : sub);

  return (
    <div class="hm pg">
      <PageHeader
        icon="home"
        title={`สวัสดี ${s?.teacher_name || "คุณครู"}`}
        sub={<>
          <span>{schoolLabel(s?.school_name)}</span>
          <span class="hm-sep">{formatThaiDate(today)}</span>
          {stale && dashboardAt.value && <Chip tone="warning" icon="wifi-off">ออฟไลน์ · ข้อมูลเมื่อ {formatThaiTimeMs(dashboardAt.value)}</Chip>}
        </>}
        actions={<>
          <TermPicker />
          <button class={"ghost hm-hide" + (hideNames.value ? " on" : "")} aria-pressed={hideNames.value} aria-label="ซ่อนชื่อนักเรียน"
            title="ซ่อนชื่อนักเรียนทุกการ์ด (ใช้ตอนสะท้อนจอขึ้นทีวี)" onClick={() => setHideNames(!hideNames.value)}>
            <Icon name={hideNames.value ? "eye-off" : "eye"} size={20} /><span class="hm-btn-t">{hideNames.value ? "ซ่อนชื่ออยู่" : "ซ่อนชื่อ"}</span>
          </button>
          <button class="ghost" aria-label="ปรับหน้าหลัก" onClick={() => setPrefsOpen(true)}><Icon name="layout-grid" size={20} /><span class="hm-btn-t">ปรับหน้าหลัก</span></button>
        </>}
      />

      <YearBanner note="สิ่งที่ค้างของปีนั้นยังตรวจและแก้คะแนนได้" />
      {hideNames.value && (
        <div class="hm-banner warn" role="status">
          <Icon name="eye-off" size={20} />
          <span class="grow"><b>ซ่อนชื่อนักเรียนอยู่</b> · ทุกการ์ดแสดงเฉพาะจำนวน (สำหรับตอนสะท้อนจอขึ้นทีวี)</span>
          <button class="ghost" onClick={() => setHideNames(false)}>แสดงชื่อ</button>
        </div>
      )}
      <TodoCard />

      <div class="hm-actions">
        <a class="hm-action primary" href="#/scan"><span class="ic"><Icon name="scan" size={24} /></span><div><div class="t">สแกนส่งงาน</div><div class="s">{quick("ใช้เครื่องอ่าน QR หรือกล้อง")}</div></div></a>
        <a class="hm-action" href="#/attendance"><span class="ic"><Icon name="user-check" size={24} /></span><div><div class="t">เช็คชื่อ</div><div class="s">{attLine}</div></div></a>
        <a class="hm-action" href="#/random"><span class="ic"><Icon name="dice-3" size={24} /></span><div><div class="t">สุ่มชื่อ</div><div class="s">{quick("สุ่มเฉพาะคนที่มาเรียน")}</div></div></a>
        <button class="hm-action" onClick={() => navigate("/gradebook", { new: 1 })}><span class="ic"><Icon name="plus" size={24} /></span><div><div class="t">สร้างงาน</div><div class="s">หลายห้องพร้อมกัน</div></div></button>
      </div>
      {!pastYear && <ResumeScan />}

      {noClasses ? (
        <NoClassesCard />
      ) : status === "error" && !d ? (
        <HomeError online={online.value && navigator.onLine} onRetry={() => loadDashboard(selectedTermId.value, { force: true })} />
      ) : !d ? (
        <HomeSkeleton />
      ) : noStudents ? (
        <NoStudentsCard />
      ) : (<>
        <div class="stat-row hm-stats">
          <StatCard label="งานที่เปิดรับ" value={open.length} icon="clipboard-list" tone="neutral" hint={<>กดดูรายห้อง{staleTag}</>} onClick={() => setList("open")} />
          <StatCard label="รอตรวจ" value={d.awaitingCount} unit="ชิ้น" icon="hourglass-empty" hint={<>รวมงานที่ปิดรับแล้ว{staleTag}</>} onClick={() => setList("awaiting")} />
          <StatCard label="ยังไม่ส่ง" value={d.missingCount} unit="ชิ้น" valueTone={d.missingCount > 0 ? "danger" : undefined} tone="danger" icon="alert-circle" hint={<>นับเฉพาะงานที่ยังรับอยู่{staleTag}</>} onClick={() => setList("missing")} />
          {pastYear
            ? <StatCard label="มาเรียนวันนี้" value="—" tone="success" icon="user-check" hint="ปีเก่า ไม่มีเช็คชื่อวันนี้" onClick={() => navigate("/attendance")} />
            : <StatCard label="มาเรียนวันนี้" value={attPct != null ? `${attPct}%` : <span class="hm-val-text">ยังไม่ได้เช็คชื่อ</span>} tone="success" icon="user-check"
              hint={<>{att.length ? `เช็คครบ ${completeN} จาก ${att.length} ห้อง${partialN ? ` · บางส่วน ${partialN}` : ""}` : "ยังไม่มีนักเรียน"}{staleTag}</>} onClick={() => navigate("/attendance")} />}
        </div>

        {order.length === 0 ? (
          <div class="card"><EmptyState icon="layout-grid" text="ยังไม่ได้เปิดการ์ดใดไว้" action={<button onClick={() => setPrefsOpen(true)}><Icon name="layout-grid" size={20} /> ปรับหน้าหลัก</button>} /></div>
        ) : (
          <PageCols keys={order} max={3} weightOf={(k) => CARD_WEIGHT[k]} render={view} />
        )}
      </>)}

      {prefsOpen && <CardSettings onClose={() => setPrefsOpen(false)} />}

      {list && (
        <Drawer label={LIST_TITLE[list]} title={<><h2 class="hm-drawer-t">{LIST_TITLE[list]} · {list === "open" ? open.length : rows.reduce((n, r) => n + r.n, 0)}</h2><div class="page-sub">{LIST_HINT[list]}</div></>} onClose={() => setList(null)}>
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
                <Chip tone="muted">{classById(r.classId)?.name}</Chip>
                <div class="grow" style="min-width:0">
                  <div class="hm-ell" style="font-weight:500" title={r.a.assignment.title}>{r.a.assignment.title}</div>
                  <div class="page-sub">{subj?.name}{r.a.assignment.status === "closed" ? " · ปิดรับแล้ว" : ""}{r.a.assignment.due_date ? ` · ส่ง ${formatThaiDate(r.a.assignment.due_date)}` : ""}</div>
                </div>
                {list === "open"
                  ? <Chip tone="muted">{r.n}/{r.total}</Chip>
                  : <Chip tone={list === "missing" ? "danger" : "accent"} icon={list === "missing" ? "alert-circle" : "hourglass-empty"}>{list === "missing" ? "ยังไม่ส่ง" : "รอตรวจ"} {r.n}</Chip>}
              </button>
            );
          })}
        </Drawer>
      )}
    </div>
  );
}
