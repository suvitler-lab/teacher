// Layout ก: the five side cards (BR-12: open / follow / absent / due / classes). They read the shared model only.
import type { JSX } from "preact";
import { Icon } from "../../Icon";
import { Avatar } from "../../ui";
import { Chip, ChipButton, CardHead, Bar } from "../shared";
import { LAYOUT_CARD_META, type LayoutCardKey } from "../../../lib/homeLayout";
import { studentsById, classById } from "../../../store";
import { navigate } from "../../../router";
import { fullName, shortName } from "../../../lib/names";
import { dueInfo } from "../../../lib/homeLogic";
import type { HomeLayoutProps } from "../meta";
import { roomRateSay } from "./logic";

const META = LAYOUT_CARD_META.a;
type P = Pick<HomeLayoutProps, "model" | "hide" | "pastYear">;
const title = (k: LayoutCardKey) => META[k]?.title ?? "";
const NoteOk = ({ children }: { children: string }) => <p class="hma-ok"><Icon name="circle-check" size={16} /> {children}</p>;

/** a child's button: opens the student (never drawn while names are hidden) */
function Person({ studentId, classId, sub }: { studentId: string; classId: string; sub?: string }) {
  const st = studentsById.value.get(studentId);
  const name = st ? shortName(st) : studentId;
  return (
    <button type="button" class="hma-person" title={st ? fullName(st) : undefined} onClick={() => navigate("/students", { class: classId, student: studentId })}>
      <Avatar student={st} size={28} />
      <span class="nm">{name}{sub && <small>{sub}</small>}</span>
    </button>
  );
}

// ---- ความคืบหน้ารายห้อง (BR-03) --------------------------------------------------------------------------------------
function OpenCard({ model }: P) {
  const rooms = model.rooms;
  return (
    <section class="card hma-card" aria-labelledby="hma-open">
      <CardHead id="hma-open" icon="clipboard-list" title={title("open")} link="สมุดคะแนน ›" onLink={() => navigate("/gradebook")} />
      {rooms.length === 0 ? <p class="page-sub">ยังไม่มีห้องเรียน</p> : rooms.map((r) => {
        const say = roomRateSay(r);
        return (
          <button type="button" key={r.classId} class="hma-room" onClick={() => navigate("/gradebook", { class: r.classId })}
            aria-label={`${r.name} ${say.text} · รอตรวจ ${r.awaiting} · ค้าง ${r.missing} · เปิดสมุดคะแนน`}>
            <span class="nm">{r.name}</span>
            <span class="mid">
              {say.kind === "none" ? <span class="page-sub">ยังไม่มีงานที่เปิดรับ</span>
                : say.kind === "notDue" ? <span class="page-sub">{say.text}</span>
                : <Bar pct={r.rate ?? 0} tone={r.missing > 0 ? "var(--fill-warning)" : "var(--fill-success)"} label={`${r.name} ${say.text}`} />}
              <span class="meta"><span>รอตรวจ {r.awaiting}</span><span>ค้าง {r.missing}</span><span>ส่งช้า {r.late}</span></span>
            </span>
            <span class="pct num">{r.rate == null ? "—" : <>{r.rate}<small>%</small></>}</span>
          </button>
        );
      })}
    </section>
  );
}

// ---- ต้องติดตาม (BR-05) ---------------------------------------------------------------------------------------------
function FollowCard({ model, hide }: P) {
  const groups = model.follow;
  return (
    <section class="card hma-card" aria-labelledby="hma-follow">
      <CardHead id="hma-follow" icon="flag" title={title("follow")} link="ดูในรายงาน ›" onLink={() => navigate("/reports")} />
      {groups.length === 0 ? <NoteOk>ไม่มีใครค้างงานที่เปิดรับอยู่</NoteOk> : groups.map((g) => (
        <div class="hma-fgroup" key={g.pieces}>
          <div class="hma-fh"><span class={"big num" + (g.pieces >= 2 ? " bad" : "")}>{g.pieces}</span><span>ชิ้นที่ค้าง · {g.people.length} คน</span></div>
          {hide
            ? <div class="hma-anon" aria-hidden="true">{g.people.map((_, i) => <span key={i}>•</span>)}</div>
            : <div class="hma-people">{g.people.map((p) => <Person key={p.studentId} studentId={p.studentId} classId={p.classId} sub={classById(p.classId)?.name} />)}</div>}
        </div>
      ))}
    </section>
  );
}

// ---- ไม่มาวันนี้ ---------------------------------------------------------------------------------------------------
const STATUS_TH = { absent: "ขาด", leave: "ลา", sick: "ป่วย", late: "สาย" } as const;
const STATUS_ICON = { absent: "x-circle", leave: "envelope-simple", sick: "thermometer", late: "clock" } as const;
const STATUS_ORDER = ["absent", "leave", "sick", "late"] as const;

function AbsentCard({ model, hide }: P) {
  const rooms = model.rooms.filter((r) => r.att && r.att.total > 0);
  return (
    <section class="card hma-card" aria-labelledby="hma-absent">
      <CardHead id="hma-absent" icon="user-x" title={title("absent")} link="เช็คชื่อ ›" onLink={() => navigate("/attendance")} />
      {rooms.length === 0 && <p class="page-sub">ยังไม่มีข้อมูลเช็คชื่อ</p>}
      {rooms.map((r) => {
        if (r.att!.progress === "none") return <div class="hma-abs" key={r.classId}><b class="nm">{r.name}</b><Chip tone="warning" icon="clock">ยังไม่ได้เช็คชื่อ</Chip></div>;
        if (r.absent.length === 0) return <div class="hma-abs" key={r.classId}><b class="nm">{r.name}</b><Chip tone="success" icon="circle-check">มาครบ</Chip></div>;
        return (
          <div class="hma-abs" key={r.classId}>
            <b class="nm">{r.name}</b>
            <div class="grow">
              {STATUS_ORDER.map((s) => {
                const who = r.absent.filter((x) => x.status === s);
                if (who.length === 0) return null;
                return (
                  <div class="hma-ab-line" key={s}>
                    <Chip tone={s === "absent" ? "danger" : s === "late" ? "warning" : "muted"} icon={STATUS_ICON[s]}>{STATUS_TH[s]} {who.length}</Chip>
                    {!hide && who.map((w) => <Person key={w.studentId} studentId={w.studentId} classId={r.classId} />)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {hide && <p class="page-sub">ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน</p>}
    </section>
  );
}

// ---- ครบกำหนด (BR-06) ----------------------------------------------------------------------------------------------
function DueCard({ model }: P) {
  const groups = model.due;
  return (
    <section class="card hma-card" aria-labelledby="hma-due">
      <CardHead id="hma-due" icon="calendar-due" title={title("due")} link="สมุดคะแนน ›" onLink={() => navigate("/gradebook")} />
      {groups.length === 0 ? <NoteOk>ไม่มีงานครบกำหนดวันนี้หรือพรุ่งนี้</NoteOk> : groups.map((g) => {
        const info = dueInfo(g.assignment.due_date, model.today);
        return (
          <div class="hma-due" key={g.assignment.id}>
            <div class="hma-due-h"><b class="ttl" title={g.assignment.title}>{g.assignment.title}</b><Chip tone={info.tone} icon={info.icon}>{info.text}</Chip></div>
            <div class="hma-due-rooms">
              {g.classes.map((c) => <Chip key={c.classId} tone="danger" icon="alert-circle">{model.rooms.find((r) => r.classId === c.classId)?.name ?? ""} ยังไม่ส่ง {c.n} คน</Chip>)}
            </div>
            <button type="button" class="hma-btn" onClick={() => navigate("/scan", { asg: g.assignment.id, class: g.classes[0]?.classId })}
              aria-label={`สแกนรับงาน ${g.assignment.title}`}><Icon name="scan" size={20} />สแกนรับงาน</button>
          </div>
        );
      })}
    </section>
  );
}

// ---- ห้องของฉัน (off until the teacher turns it on) -----------------------------------------------------------------
function ClassesCard({ model, pastYear }: P) {
  const rooms = model.rooms;
  return (
    <section class="card hma-card" aria-labelledby="hma-classes">
      <CardHead id="hma-classes" icon="school" title={title("classes")} link="นักเรียน ›" onLink={() => navigate("/students")} />
      {rooms.length === 0 ? <p class="page-sub">ยังไม่มีห้องเรียน</p> : (
        <div class="hma-clsgrid">
          {rooms.map((r) => {
            const count = r.att?.total ?? r.studentCount;
            const attText = pastYear ? null : r.att?.pct != null ? `${r.att.pct}%` : r.att?.progress === "none" ? "ยังไม่เช็ค" : "—";
            const say = roomRateSay(r); // R-3401: unknown is not 0 — no bar, no "0%"
            return (
              <div class="hma-cls" key={r.classId}>
                <button type="button" class="hma-cls-main" onClick={() => navigate("/students", { class: r.classId })}>
                  {count === 0 ? (<><span class="nm">{r.name}</span><span class="page-sub">ยังไม่มีนักเรียน · นำเข้านักเรียน</span></>) : (<>
                    <span class="hma-cls-h"><span class="nm">{r.name}</span><span class="page-sub">{count} คน</span></span>
                    <span class="page-sub">{say.kind === "notDue" ? say.text : <>อัตราส่ง {r.rate == null ? "—" : r.rate + "%"}</>}{attText != null && ` · มาเรียนวันนี้ ${attText}`}</span>
                    {r.rate != null && <Bar pct={r.rate} label={`${r.name} ${say.text}`} />}
                  </>)}
                </button>
                {count > 0 && !pastYear && <ChipButton icon="user-check" onClick={() => navigate("/attendance", { class: r.classId })} label={`เช็คชื่อ ${r.name}`}>เช็คชื่อ</ChipButton>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const VIEW: Partial<Record<LayoutCardKey, (p: P) => JSX.Element>> = { open: OpenCard, follow: FollowCard, absent: AbsentCard, due: DueCard, classes: ClassesCard };
/** Cards that talk about today: an earlier year has no "today" (the date, the roll-call, what is due). */
const TODAY_ONLY: LayoutCardKey[] = ["absent", "due"];

export function SideCards({ cards, ...p }: P & { cards: LayoutCardKey[] }) {
  return <>{cards.filter((k) => !(p.pastYear && TODAY_ONLY.includes(k))).map((k) => { const V = VIEW[k]; return V ? <V key={k} {...p} /> : null; })}</>;
}
