import type { DashboardPayload } from "@shared/types";
import type { HomeCardKey } from "../../lib/homeCards";
import type { Layout } from "../../lib/appearance";
import type { LayoutCardKey } from "../../lib/homeLayout";
import type { DueGroup, FollowGroup, HomeSummary, RoomStat, TodayRow } from "../../lib/homeLogic";
import { W } from "../../lib/pageColumns";

// ---- the contract between the shared home page (Home.tsx) and the three layouts (a / b / c) --------------------------

/** The lists behind the numbers (the drawer that opens when a number is tapped). */
export type ListKind = "open" | "awaiting" | "missing";

/** One room as the layouts need it: the numbers of BR-03 / BR-04 plus the name and the head count. */
/**
 * `rate`/`att` null = "—" / no data (NOT 0%); `att` null = the dashboard has no roll-call row for the room (show "—"), `att.progress === "none"` = "ยังไม่เช็ค".
 * `studentCount` is the roster on this device (0 until it loads); use `att.total` for "N คน" next to attendance. `follow` = BR-05 groups of this room
 * (from the at most 8 children the server sent: never say "ทั้งหมด"); `absent` = today's non-present children of the room (counts per status: filter it).
 */
export interface HomeRoom extends RoomStat {
  name: string; studentCount: number;
  follow: FollowGroup[];
  absent: { studentId: string; status: "late" | "leave" | "sick" | "absent" }[];
}

/** Everything a layout shows, worked out once from the EP-06 payload (BR-09: no layout has a formula of its own). */
export interface HomeModel {
  d: DashboardPayload;
  /** today in Bangkok, YYYY-MM-DD */
  today: string;
  /** awaiting / missing / open count / attendance headline / due-today count (the four numbers of AC-09) */
  summary: HomeSummary;
  /** the rooms of the year on screen, in menu order, with BR-03 + BR-04 numbers (rooms with nobody in them have studentCount 0) */
  rooms: HomeRoom[];
  /** the BR-01 list with the "ทำทีหลัง" rows already moved to the end (BR-02); tomorrow's rows last */
  todo: TodayRow[];
  /** how many of those rows are counted: the big number "เหลือ N อย่าง" */
  todayCount: number;
  /** the rows pushed back this visit, in the order they were pushed (not saved) */
  deferred: string[];
  /** work due today / tomorrow with who has not handed in (BR-06) */
  due: DueGroup[];
  /** BR-05 groups (at most 8 children come from the server: never call it "all") */
  follow: FollowGroup[];
  /** `d.dueSoon` / `d.absentToday` are always arrays here (an old offline copy has none); still read the figures from this model, not from `d` */
  /** the offline copy: true when the numbers are the last saved ones */
  stale: boolean;
  /** when the shown numbers were fetched (ms) */
  at: number | null;
}

/** What Home.tsx hands to the layout the teacher chose. The layout draws; it does not compute. */
export interface HomeLayoutProps {
  layout: Layout;
  model: HomeModel;
  /** the sub-cards the teacher wants in this layout, visible only, in the teacher's order (BR-12) */
  cards: LayoutCardKey[];
  /** hide student names (BR-08): no name, no initials, no avatar letters, no "copy to LINE" button */
  hide: boolean;
  /** an earlier academic year is on screen: no "today", quick actions say "ใช้ห้องของปีนี้" */
  pastYear: boolean;
  /** BR-02 "ทำทีหลัง": push this row to the end of the queue (this visit only; announced by the shared live region) */
  onDefer: (rowKey: string) => void;
  /** open the drawer behind a number */
  openList: (kind: ListKind) => void;
  /** open "ปรับหน้าหลัก" */
  openCustomize: () => void;
}

/** What each card is called and does, for the "ปรับหน้าหลัก" list. `fresh` = a card added after the first design round. */
export const CARD_META: Record<HomeCardKey, { title: string; icon: string; desc: string; fresh?: boolean }> = {
  open: { title: "งานที่กำลังเก็บ", icon: "clipboard-list", desc: "ความคืบหน้าทุกห้อง เรียงใกล้กำหนดก่อน" },
  att: { title: "เช็คชื่อวันนี้", icon: "user-check", desc: "ห้องไหนเช็คแล้ว ยังเหลือใคร" },
  follow: { title: "ต้องติดตาม", icon: "flag", desc: "นักเรียนที่ค้างส่งมากที่สุด" },
  due: { title: "ครบกำหนดวันนี้/พรุ่งนี้", icon: "calendar-due", desc: "ใครยังไม่ส่ง จะได้เตือนก่อนเลิกเรียน · คัดลอกไป LINE ได้", fresh: true },
  absent: { title: "ใครไม่มาวันนี้", icon: "user-x", desc: "ขาด ลา ป่วย สาย รายห้อง หลังเช็คชื่อ", fresh: true },
  classes: { title: "ห้องของฉัน", icon: "school", desc: "จำนวนคน อัตราส่ง และมาเรียนรายห้อง" },
  queue: { title: "ค้างในเครื่องนี้", icon: "device-mobile", desc: "รายการที่ยังไม่ขึ้นระบบ / ส่งไม่สำเร็จ" },
  backup: { title: "สำรองข้อมูล", icon: "database-export", desc: "สำรองล่าสุดและปุ่มดาวน์โหลด" },
  term: { title: "ภาคเรียน", icon: "calendar-stats", desc: "เทอมปัจจุบัน ช่วงวัน สัปดาห์ที่ผ่านไป" },
};

/** Rough height of each card (~ height / 8rem) so the columns on a wide screen come out level. Static on purpose: cards must not jump when they load. */
export const CARD_WEIGHT: Record<HomeCardKey, number> = {
  open: W.L, att: W.M, follow: W.M, due: W.M, absent: W.S, classes: W.L, queue: W.S, backup: W.S, term: W.S,
};
