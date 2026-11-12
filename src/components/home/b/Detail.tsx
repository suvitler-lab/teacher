// Layout ข: the room that is picked — its open work, who to follow up, who is away today (AC-27, AC-28). Numbers come from the model.
import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { assignmentFraction } from "@shared/metrics";
import { Icon } from "../../Icon";
import { Avatar } from "../../ui";
import { Chip } from "../shared";
import { navigate } from "../../../router";
import { studentsById, subjectById, workTypeById } from "../../../store";
import { fullName, shortName } from "../../../lib/names";
import { dueInfo } from "../../../lib/homeLogic";
import type { LayoutCardKey } from "../../../lib/homeLayout";
import { LAYOUT_CARD_META } from "../../../lib/homeLayout";
import type { HomeLayoutProps, HomeRoom } from "../meta";
import { SHOWN_WORK, headCount, roomOpenWork, workSegments, type RoomWork } from "./logic";

type P = Pick<HomeLayoutProps, "model" | "hide" | "pastYear"> & { room: HomeRoom };
const META = LAYOUT_CARD_META.b;

function Person({ studentId, classId }: { studentId: string; classId: string }) {
  const st = studentsById.value.get(studentId);
  return (
    <button type="button" class="hmb-person" title={st ? fullName(st) : undefined} onClick={() => navigate("/students", { class: classId, student: studentId })}>
      <Avatar student={st} size={28} />
      <span class="nm">{st ? shortName(st) : studentId}</span>
    </button>
  );
}

// ---- the open work of the room ---------------------------------------------------------------------------------------
function WorkRow({ w, room, pastYear, today }: { w: RoomWork; room: HomeRoom; pastYear: boolean; today: string }) {
  const { a, p } = w;
  const asg = a.assignment;
  const due = dueInfo(asg.due_date, today);
  const seg = workSegments(p);
  const subj = subjectById(asg.subject_id)?.name, type = workTypeById(asg.type_id)?.name;
  const canScan = !pastYear && (p.total - p.excused - p.submitted > 0 || p.missing > 0);
  const go = (rows?: string) => navigate("/gradebook", { class: room.classId, subject: asg.subject_id, asg: asg.id, rows });
  return (
    <li class="hmb-asg">
      <div class="top">
        <div class="t">
          <h3 class="clamp2" title={asg.title} tabIndex={-1}>{asg.title}</h3>
          <p>{[subj, type, `เต็ม ${asg.full_score}`].filter(Boolean).join(" · ")}</p>
        </div>
        <Chip tone={due.tone} icon={due.icon}>{due.text}</Chip>
        {canScan && <button type="button" class="icon-btn" aria-label={`สแกนรับ ${asg.title} ${room.name}`} onClick={() => navigate("/scan", { asg: asg.id, class: room.classId })}><Icon name="scan" size={20} /></button>}
      </div>
      <div class="hmb-stack" role="img" aria-label={`${room.name} ${asg.title}: ส่งแล้ว ${p.submitted - seg.awaiting} รอตรวจ ${seg.awaiting} ค้าง ${seg.missing} ยังไม่ถึงกำหนด ${seg.pending}`}>
        {seg.handed > 0 && <i style={`flex:${seg.handed};background:var(--fill-success)`} />}
        {seg.awaiting > 0 && <i style={`flex:${seg.awaiting};background:var(--fill-accent)`} />}
        {seg.pending > 0 && <i style={`flex:${seg.pending};background:var(--border-strong)`} />}
        {seg.missing > 0 && <i style={`flex:${seg.missing};background:var(--fill-danger)`} />}
      </div>
      <div class="nums">
        <span>ส่งแล้ว <b>{assignmentFraction(p)}</b></span>
        {p.awaiting > 0 && <button type="button" class="num-btn" onClick={() => go("awaiting")}><Icon name="hourglass-empty" size={16} />รอตรวจ <b>{p.awaiting}</b></button>}
        {p.missing > 0 && <button type="button" class="num-btn bad" onClick={() => go("missing")}><Icon name="alert-circle" size={16} />ค้าง <b>{p.missing}</b></button>}
        {p.late > 0 && <span>ส่งช้า <b>{p.late}</b></span>}
        {seg.pending > 0 && <span>ยังไม่ถึงกำหนด <b>{seg.pending}</b></span>}
      </div>
    </li>
  );
}

function WorkCard({ model, room, pastYear }: P) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const grown = useRef(false);
  // after "ดูทั้งหมด" the button is gone: keyboard focus goes to the first work that was added (R-3505)
  useEffect(() => {
    if (!all || !grown.current) return;
    grown.current = false;
    list.current?.querySelectorAll<HTMLElement>(".hmb-asg h3")[SHOWN_WORK]?.focus();
  }, [all]);
  const work = roomOpenWork(model, room.classId);
  const shown = all ? work : work.slice(0, SHOWN_WORK);
  return (
    <section class="card hmb-work" aria-labelledby="hmb-det-h">
      <div class="hm-cardhead">
        <h2 id="hmb-det-h" class="hmb-det-h"><span class="ell" title={room.name}>กำลังดู {room.name} · งานที่เปิดรับ</span></h2>
        <button type="button" class="hmb-btn" onClick={() => navigate("/gradebook", { new: 1, class: room.classId })}><Icon name="plus" size={20} />สร้างงาน</button>
      </div>
      {work.length === 0 ? <p class="page-sub">ยังไม่มีงานที่เปิดรับ</p> : (<>
        <ol class="hmb-asgs" ref={list}>{shown.map((w) => <WorkRow key={w.a.assignment.id} w={w} room={room} pastYear={pastYear} today={model.today} />)}</ol>
        {work.length > SHOWN_WORK && !all && <button type="button" class="hmb-btn ghost" onClick={() => { grown.current = true; setAll(true); }}>ดูทั้งหมด ({work.length}) <Icon name="chevron-down" size={20} /></button>}
      </>)}
      <div class="hmb-legend" aria-hidden="true">
        <span><i style="background:var(--fill-success)" />ส่งแล้ว</span><span><i style="background:var(--fill-accent)" />รอตรวจ</span>
        <span><i style="background:var(--border-strong)" />ยังไม่ถึงกำหนด</span><span><i style="background:var(--fill-danger)" />ค้างส่ง</span>
      </div>
      <button type="button" class="hmb-btn ghost" onClick={() => navigate("/gradebook", { class: room.classId })}>สมุดคะแนน {room.name} <Icon name="chevron-right" size={20} /></button>
    </section>
  );
}

// ---- ต้องติดตาม (BR-05): this room's children out of the (at most 8) the server sent ----------------------------------
function FollowCard({ room, hide }: P) {
  return (
    <section class="card hmb-side" aria-labelledby="hmb-fol-h">
      <div class="hm-cardhead"><h2 id="hmb-fol-h"><Icon name={META.follow?.icon ?? "flag"} size={20} /><span class="ell" title={`ต้องติดตาม · ${room.name}`}>ต้องติดตาม · {room.name}</span></h2></div>
      {room.follow.length === 0 ? <p class="ok"><Icon name="circle-check" size={16} /> ไม่มีใครค้างมากในห้องนี้</p> : room.follow.map((g) => (
        <div class="grp" key={g.pieces}>
          <div class="fh"><span class={"big num" + (g.pieces >= 2 ? " bad" : "")}>{g.pieces}</span><span>ชิ้นที่ค้าง · {g.people.length} คน</span></div>
          {hide
            ? <div class="anon" aria-hidden="true">{g.people.map((_, i) => <span key={i}>•</span>)}</div>
            : <div class="people">{g.people.map((p) => <Person key={p.studentId} studentId={p.studentId} classId={p.classId} />)}</div>}
        </div>
      ))}
      {hide && room.follow.length > 0 && <p class="page-sub">ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน</p>}
      <button type="button" class="hmb-btn ghost" onClick={() => navigate("/reports")}>ดูในรายงาน <Icon name="chevron-right" size={20} /></button>
    </section>
  );
}

// ---- ไม่มาวันนี้ ---------------------------------------------------------------------------------------------------
const STATUS_TH = { absent: "ขาด", leave: "ลา", sick: "ป่วย", late: "สาย" } as const;
const STATUS_ICON = { absent: "x-circle", leave: "envelope-simple", sick: "thermometer", late: "clock" } as const;
const STATUS_ORDER = ["absent", "leave", "sick", "late"] as const;

function AbsentCard({ room, hide }: P) {
  const a = room.att;
  return (
    <section class="card hmb-side" aria-labelledby="hmb-abs-h">
      <div class="hm-cardhead"><h2 id="hmb-abs-h"><Icon name={META.absent?.icon ?? "user-x"} size={20} /><span>{META.absent?.title ?? "ไม่มาวันนี้"}</span></h2></div>
      {!a ? <p class="page-sub">ยังไม่มีข้อมูลเช็คชื่อ</p>
        : a.progress === "none" ? (<>
          <p class="page-sub">ยังไม่ได้เช็คชื่อ {room.name} วันนี้</p>
          <button type="button" class="hmb-btn primary" onClick={() => navigate("/attendance", { class: room.classId })}><Icon name="user-check" size={20} />เช็คชื่อ {room.name}</button>
        </>)
        : room.absent.length === 0 && a.progress === "partial" ? (<>
          <p class="page-sub">ยังไม่มีคนขาด/ลา · เช็คแล้ว {a.marked} จาก {a.total} คน</p>
          <button type="button" class="hmb-btn primary" onClick={() => navigate("/attendance", { class: room.classId })}><Icon name="user-check" size={20} />เช็คชื่อ {room.name}</button>
        </>)
        : room.absent.length === 0 ? <p class="ok"><Icon name="circle-check" size={16} /> มาครบทุกคน</p>
        : (<div class="abs-list">
          {STATUS_ORDER.map((s) => {
            const who = room.absent.filter((x) => x.status === s);
            if (who.length === 0) return null;
            return (
              <div class="abs-row" key={s}>
                <Chip tone={s === "absent" ? "danger" : s === "late" ? "warning" : "muted"} icon={STATUS_ICON[s]}>{STATUS_TH[s]} {who.length}</Chip>
                {!hide && who.map((w) => <Person key={w.studentId} studentId={w.studentId} classId={room.classId} />)}
              </div>
            );
          })}
          {hide && <p class="page-sub">ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน</p>}
          {a.progress === "partial" && <p class="page-sub">เช็คแล้ว {a.marked} จาก {a.total} คน</p>}
        </div>)}
    </section>
  );
}

const SIDE: Partial<Record<LayoutCardKey, (p: P) => JSX.Element>> = { follow: FollowCard, absent: AbsentCard };
/** "ไม่มาวันนี้" talks about today: an earlier year has none. */
const TODAY_ONLY: LayoutCardKey[] = ["absent"];

export function RoomDetail({ model, room, cards, hide, pastYear }: Pick<HomeLayoutProps, "model" | "cards" | "hide" | "pastYear"> & { room: HomeRoom }) {
  if (headCount(room) === 0) {
    return (
      <section class="card hmb-empty" aria-labelledby="hmb-det-h">
        <h2 id="hmb-det-h" class="hmb-det-h"><span class="ell" title={room.name}>{room.name}</span></h2>
        <p>ยังไม่มีนักเรียนในห้อง</p>
        <p class="page-sub">นำเข้ารายชื่อจาก Excel หรือเพิ่มทีละคน</p>
        <button type="button" class="hmb-btn primary" onClick={() => navigate("/students", { class: room.classId })}><Icon name="table-import" size={20} />นำเข้านักเรียน</button>
      </section>
    );
  }
  const side = cards.filter((k) => SIDE[k] && !(pastYear && TODAY_ONLY.includes(k)));
  const p: P = { model, room, hide, pastYear };
  return (
    <div class={"hmb-detail" + (side.length === 0 ? " solo" : "")} role="region" aria-label={`รายละเอียด ${room.name}`}>
      <WorkCard key={room.classId} {...p} />
      {side.length > 0 && <div class="hmb-sidecol">{side.map((k) => { const V = SIDE[k]!; return <V key={k} {...p} />; })}</div>}
    </div>
  );
}
