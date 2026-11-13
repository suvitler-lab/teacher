// Layout ค: the tiles under the focus box (BR-12: att / open / follow). They read the shared model only.
import type { JSX } from "preact";
import { Icon } from "../../Icon";
import { Avatar } from "../../ui";
import { CardHead, Bar } from "../shared";
import { LAYOUT_CARD_META, type LayoutCardKey } from "../../../lib/homeLayout";
import { studentsById, classById } from "../../../store";
import { navigate } from "../../../router";
import { fullName, shortName } from "../../../lib/names";
import type { HomeLayoutProps } from "../meta";
import { attTotals, roomChips, roomRateSay } from "../a/logic";
import { ATT_ICON, ATT_KEYS, ATT_TH, ringSegments } from "./logic";

const META = LAYOUT_CARD_META.c;
type P = Pick<HomeLayoutProps, "model" | "hide" | "pastYear">;
const title = (k: LayoutCardKey) => META[k]?.title ?? "";

// ---- มาเรียนวันนี้ (BR-04): the ring is the model's percent, the legend the checked rooms' totals ---------------------
const R = 52, SW = 14, C = 2 * Math.PI * R;

function AttTile({ model }: P) {
  const a = model.summary.att;
  const t = attTotals(model.rooms);
  const marked = t.present + t.late + t.leave + t.sick + t.absent;
  const came = t.present + t.late;
  const chips = roomChips(model.rooms);
  const segs = ringSegments(t, C);
  const say = t.checked > 0 && a.pct != null
    ? `มาเรียน ${a.pct}% · มา ${t.present} สาย ${t.late} ลา ${t.leave} ป่วย ${t.sick} ขาด ${t.absent}`
    : "ยังไม่ได้เช็คชื่อวันนี้";
  return (
    <section class="card hmc-tile" aria-labelledby="hmc-att">
      <CardHead id="hmc-att" icon="user-check" title={title("att")} link="เช็คชื่อ ›" onLink={() => navigate("/attendance")} />
      {chips.length === 0 ? <p class="page-sub">ยังไม่มีข้อมูลเช็คชื่อ</p> : (<>
        <div class="hmc-att">
          <div class="hmc-ring" role="img" aria-label={say}>
            <svg viewBox="0 0 132 132" aria-hidden="true" focusable="false">
              <circle cx="66" cy="66" r={R} fill="none" stroke="var(--ring-track)" stroke-width={SW} />
              {segs.map((s) => (
                <circle key={s.key} cx="66" cy="66" r={R} fill="none" stroke={`var(--att-${s.key})`} stroke-width={SW} transform="rotate(-90 66 66)"
                  stroke-dasharray={`${s.len.toFixed(1)} ${C.toFixed(1)}`} stroke-dashoffset={(-s.off).toFixed(1)} />
              ))}
            </svg>
            <div class="mid" aria-hidden="true">{t.checked > 0 && a.pct != null ? <><b class="num">{a.pct}<small>%</small></b><span>มา {came}/{marked}</span></> : <b class="num">—</b>}</div>
          </div>
          <ul class="hmc-legend" aria-label="จำนวนตามสถานะ">
            {ATT_KEYS.map((k) => (
              <li key={k}><i class={"sw " + k} aria-hidden="true" /><Icon name={ATT_ICON[k]} size={16} />{ATT_TH[k]}<b class="num">{t[k]}</b></li>
            ))}
          </ul>
        </div>
        <p class="hmc-headline">{a.headline}</p>
        <div class="hmc-chips">{chips.map((c) => (
          <span key={c.classId} class={"hmc-chip " + (c.ok ? "ok" : "no")}><Icon name={c.ok ? "circle-check" : "alert-circle"} size={16} />{c.text}</span>
        ))}</div>
        {t.checked > 0 && chips.some((c) => !c.ok) && <p class="page-sub">นับเฉพาะห้องที่เช็คแล้ว</p>}
      </>)}
    </section>
  );
}

// ---- งานแต่ละห้อง (BR-03) -------------------------------------------------------------------------------------------
function OpenTile({ model }: P) {
  const rooms = model.rooms;
  return (
    <section class="card hmc-tile" aria-labelledby="hmc-open">
      <CardHead id="hmc-open" icon="clipboard-list" title={title("open")} link="สมุดคะแนน ›" onLink={() => navigate("/gradebook")} />
      {rooms.length === 0 ? <p class="page-sub">ยังไม่มีห้องเรียน</p> : rooms.map((r) => {
        const say = roomRateSay(r);
        return (
          <button type="button" key={r.classId} class="hmc-room" onClick={() => navigate("/gradebook", { class: r.classId })}
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

// ---- ต้องติดตาม (BR-05): from the (at most 8) children the server sent, so never "all" -----------------------------------
function Person({ studentId, classId }: { studentId: string; classId: string }) {
  const st = studentsById.value.get(studentId);
  return (
    <button type="button" class="hmc-person" title={st ? fullName(st) : undefined} onClick={() => navigate("/students", { class: classId, student: studentId })}>
      <Avatar student={st} size={28} />
      <span class="nm">{st ? shortName(st) : studentId}<small>{classById(classId)?.name}</small></span>
    </button>
  );
}

function FollowTile({ model, hide }: P) {
  const groups = model.follow;
  return (
    <section class="card hmc-tile" aria-labelledby="hmc-follow">
      <CardHead id="hmc-follow" icon="flag" title={title("follow")} link="ดูในรายงาน ›" onLink={() => navigate("/reports")} />
      {groups.length === 0 ? <p class="hmc-ok"><Icon name="circle-check" size={16} /> ไม่มีใครค้างงานที่เปิดรับอยู่</p> : groups.map((g) => (
        <div class="hmc-fgroup" key={g.pieces}>
          <div class="hmc-fh"><span class={"big num" + (g.pieces >= 2 ? " bad" : "")}>{g.pieces}</span><span>ชิ้นที่ค้าง · {g.people.length} คน</span></div>
          {hide
            ? <div class="hmc-anon" aria-hidden="true">{g.people.map((_, i) => <span key={i}>•</span>)}</div>
            : <div class="hmc-people">{g.people.map((p) => <Person key={p.studentId} studentId={p.studentId} classId={p.classId} />)}</div>}
        </div>
      ))}
      {hide && groups.length > 0 && <p class="page-sub">ซ่อนชื่ออยู่ — แสดงเฉพาะจำนวน</p>}
    </section>
  );
}

const VIEW: Partial<Record<LayoutCardKey, (p: P) => JSX.Element>> = { att: AttTile, open: OpenTile, follow: FollowTile };
/** Tiles that talk about today: an earlier year has no roll-call of "today". */
const TODAY_ONLY: LayoutCardKey[] = ["att"];

export function Tiles({ cards, ...p }: P & { cards: LayoutCardKey[] }) {
  const shown = cards.filter((k) => VIEW[k] && !(p.pastYear && TODAY_ONLY.includes(k)));
  return <>{shown.map((k) => { const V = VIEW[k]!; return <V key={k} {...p} />; })}</>;
}

