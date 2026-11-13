// Layout ข "แผงรายห้อง": a panel per room with a ring, the day's list as pills, and the picked room's detail below (AC-25..29).
// Everything comes from `props.model` (worked out once in Home.tsx / homeLogic.ts); this file only draws it.
import "../../../styles/home-b.css";
import { useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { Greeting } from "../Greeting";
import { QuickActions } from "../QuickActions";
import { ResumeScan } from "../Resume";
import { Chip } from "../shared";
import { navigate } from "../../../router";
import type { HomeLayoutProps } from "../meta";
import { Panel, RoomChips, isCompact } from "./Panels";
import { RoomDetail } from "./Detail";
import { TodoStrip } from "./Strip";
import { pickedRoom } from "./logic";

export function LayoutB({ model, cards, hide, pastYear, openList }: HomeLayoutProps) {
  // null = the room the page chooses by itself (the first one that needs the teacher); a tap picks one for this visit only
  const [picked, setPicked] = useState<string | null>(null);
  const { summary, stale, rooms } = model;
  const att = summary.att;
  const room = pickedRoom(model, picked);
  const compact = isCompact(rooms.length);
  const pick = (id: string) => {
    setPicked(id);
    // a phone shows one panel at a time: bring the detail into view
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 720px)").matches) {
      setTimeout(() => document.querySelector(".hmb-detail, .hmb-empty")?.scrollIntoView?.({ block: "start" }), 0);
    }
  };
  const link = (text: string, label: string, go: () => void) => <button type="button" class="hmb-link" aria-label={label} onClick={go}>{text}</button>;
  const attText = att.pct != null ? `มาเรียน ${att.pct}% · ${att.headline}` : att.headline;
  return (
    <div class="hmb">
      <div class="hmb-top">
        <Greeting class="hmb-greet" />
        <p class="hmb-line" role="group" aria-label="ตัวเลขสรุป">
          {!pastYear && <>{link(attText, `เช็คชื่อ ${attText} · ไปหน้าเช็คชื่อ`, () => navigate("/attendance"))}<span aria-hidden="true">·</span></>}
          {!pastYear && <>{link(`ครบกำหนดวันนี้ ${summary.dueToday} งาน`, `ครบกำหนดวันนี้ ${summary.dueToday} งาน · ไปสมุดคะแนน`, () => navigate("/gradebook"))}<span aria-hidden="true">·</span></>}
          {link(`รอตรวจ ${summary.awaiting} ชิ้น`, `รอตรวจ ${summary.awaiting} ชิ้น เปิดรายการ`, () => openList("awaiting"))}<span aria-hidden="true">·</span>
          {link(`ค้างส่ง ${summary.missing} ชิ้น`, `ค้างส่ง ${summary.missing} ชิ้น เปิดรายการ`, () => openList("missing"))}
          {stale && <Chip tone="warning" icon="wifi-off">ข้อมูลเก่า</Chip>}
        </p>
      </div>
      <QuickActions class="hmb-dock" />
      {!pastYear && <ResumeScan />}
      {pastYear ? <p class="hmb-past"><Icon name="info-circle" size={16} /> ดูข้อมูลของปีที่ผ่านมา · ไม่มีงานของวันนี้</p> : <TodoStrip model={model} hide={hide} />}
      <h2 class="sr-only" id="hmb-rooms-h">ภาพรวมรายห้อง</h2>
      {compact && room && <RoomChips rooms={rooms} current={room.classId} onPick={pick} />}
      <div class={"hmb-panels" + (compact ? " compact" : "")} role="group" aria-labelledby="hmb-rooms-h">
        {rooms.map((r, i) => <Panel key={r.classId} room={r} index={i} on={r.classId === room?.classId} compact={compact} hide={hide} pastYear={pastYear} onPick={() => pick(r.classId)} />)}
      </div>
      {room && <RoomDetail model={model} room={room} cards={cards} hide={hide} pastYear={pastYear} />}
    </div>
  );
}
