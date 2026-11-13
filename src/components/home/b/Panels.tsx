// Layout ข: one panel per room (ring with the handed-in %, the four numbers, today's roll-call, who to follow up) and the chips that pick a room on a phone.
import { Icon } from "../../Icon";
import { Avatar } from "../../ui";
import { Chip } from "../shared";
import { studentsById } from "../../../store";
import type { HomeRoom } from "../meta";
import { COMPACT_AFTER, attShort, attWords, followCount, followIds, headCount, panelLabel } from "./logic";

/** The ring: the % is the model's `rate` (BR-03). No rate = an empty track and "—", never 0%. A picture only: the words next to it say the same. */
export function Ring({ pct, size, stroke, big }: { pct: number | null; size: number; stroke: number; big?: boolean }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, h = size / 2;
  return (
    <span class={"hmb-ring" + (big ? " big" : "")} style={`width:${size}px;height:${size}px`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle cx={h} cy={h} r={r} fill="none" stroke="var(--ring-track)" stroke-width={stroke} />
        {pct != null && pct > 0 && (
          <circle class="val" cx={h} cy={h} r={r} fill="none" stroke="var(--c)" stroke-width={stroke} stroke-linecap="round"
            stroke-dasharray={`${(c * Math.min(100, pct) / 100).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${h} ${h})`} />
        )}
      </svg>
      <span class="rc num">{pct == null ? "—" : <>{pct}<small>%</small></>}</span>
    </span>
  );
}

/** Today's roll-call as a bar (the colours are the theme's attendance colours; the numbers in words sit beside it, so colour is never the only signal). */
function AttBar({ a }: { a: NonNullable<HomeRoom["att"]> }) {
  const parts = [[a.present, "present"], [a.late, "late"], [a.leave, "leave"], [a.sick, "sick"], [a.absent, "absent"]] as const;
  return <span class="hmb-attbar" aria-hidden="true">{parts.filter((p) => p[0] > 0).map(([v, k]) => <i key={k} style={`flex:${v};background:var(--att-${k})`} />)}</span>;
}

function Foot({ room, hide, on }: { room: HomeRoom; hide: boolean; on: boolean }) {
  const n = followCount(room);
  const ids = hide ? [] : followIds(room, 4);
  return (
    <span class="p-foot">
      {n > 0 ? (<>
        {ids.length > 0 && <span class="av-stack" aria-hidden="true">{ids.map((id) => <Avatar key={id} student={studentsById.value.get(id)} size={26} />)}</span>}
        <span>ต้องติดตาม {n} คน</span>
      </>) : <span><Icon name="smiley" size={16} /> ไม่มีคนค้างมาก</span>}
      {on ? <span class="viewing"><Icon name="chevron-down" size={16} />กำลังดู</span> : <Icon name="chevron-right" size={16} />}
    </span>
  );
}

export function Panel({ room, index, on, compact, hide, pastYear, onPick }: {
  room: HomeRoom; index: number; on: boolean; compact: boolean; hide: boolean; pastYear: boolean; onPick: () => void;
}) {
  const a = room.att;
  const empty = headCount(room) === 0;
  const checked = !pastYear && !!a && a.progress !== "none";
  return (
    <button type="button" class={"hmb-panel" + (compact ? " cp" : "")} data-ci={index % 4} data-room={room.classId} aria-pressed={on} aria-label={panelLabel(room, pastYear)} onClick={onPick}>
      <span class="p-head">
        <span class="nm" title={room.name}>{room.name}</span>
        {!empty && <span class="sub">{headCount(room)} คน · {room.openCount} {compact ? "งาน" : "งานเปิดรับ"}</span>}
      </span>
      {empty ? (
        <span class="nostu"><Icon name="student" size={20} /> ยังไม่มีนักเรียน</span>
      ) : (<>
        <span class="p-mid">
          <Ring pct={room.rate} size={compact ? 72 : 132} stroke={compact ? 9 : 14} big={!compact} />
          {compact ? (
            <span class="cp-n">
              <span>ส่ง <b>{room.submitted}</b> · ค้าง <b class="bad">{room.missing}</b></span>
              <span>รอตรวจ <b>{room.awaiting}</b></span>
              {!pastYear && (a && a.progress === "none" ? <Chip tone="warning" icon="clock">ยังไม่เช็ค</Chip> : <span>{attShort(room)}</span>)}
            </span>
          ) : (
            <span class="p-stats">
              <span><span>ส่งแล้ว</span><b>{room.submitted}</b></span>
              <span><span>ค้างส่ง</span><b class="bad">{room.missing}</b></span>
              <span><span>รอตรวจ</span><b>{room.awaiting}</b></span>
              <span><span>ส่งช้า</span><b>{room.late}</b></span>
            </span>
          )}
        </span>
        {!compact && !pastYear && (
          <span class="p-att">
            {checked && a ? (<>
              <span class="row2"><span>{attWords(room)}</span><span class="muted">ลา/ป่วย/ขาด {a.leave + a.sick + a.absent}</span></span>
              <AttBar a={a} />
            </>) : a && a.progress === "none" ? <Chip tone="warning" icon="clock">ยังไม่ได้เช็คชื่อวันนี้</Chip> : <span class="muted">{attWords(room)}</span>}
          </span>
        )}
        <Foot room={room} hide={hide} on={on} />
      </>)}
    </button>
  );
}

/** More than three rooms: a row of chips picks the room (on a phone it is the only way: the panels of the other rooms are folded away). */
export function RoomChips({ rooms, current, onPick }: { rooms: HomeRoom[]; current: string; onPick: (id: string) => void }) {
  return (
    <div class="hmb-chips" role="group" aria-label="เลือกห้อง (เลื่อนซ้ายขวาได้)">
      {rooms.map((r) => (
        <button type="button" key={r.classId} class="rchip" aria-pressed={r.classId === current} aria-label={r.name} onClick={() => onPick(r.classId)}>
          {r.classId === current && <Icon name="check" size={16} />}<span>{r.name}</span>
        </button>
      ))}
    </div>
  );
}

export const isCompact = (n: number) => n > COMPACT_AFTER;
