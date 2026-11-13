import { Icon } from "../Icon";
import { navigate } from "../../router";
import { viewingPastYear } from "../../store";
import { dashboard } from "../../lib/dashboard";
import { attendanceHeadline } from "../../lib/homeLogic";

/**
 * The four quick buttons, the same in every layout and in every state (they work while the numbers load or when offline):
 * สแกนส่งงาน · เช็คชื่อ · สุ่มชื่อ · สร้างงาน. The line under "เช็คชื่อ" is `attendanceHeadline` (BR-09).
 * `class` lets a layout style its own arrangement (a row, a dock, 2 x 2) without touching the buttons.
 */
export function QuickActions({ class: cls }: { class?: string }) {
  const d = dashboard.value;
  const past = viewingPastYear.value;
  const quick = (sub: string) => (past ? "ใช้ห้องของปีนี้" : sub);
  const attLine = past ? "ใช้ห้องของปีนี้" : d ? attendanceHeadline(d.attendanceToday.filter((a) => a.total > 0)) : "เช็คชื่อประจำวัน";
  return (
    <div class={"hm-actions" + (cls ? " " + cls : "")}>
      <a class="hm-action primary" href="#/scan"><span class="ic"><Icon name="scan" size={24} /></span><div><div class="t">สแกนส่งงาน</div><div class="s">{quick("ใช้เครื่องอ่าน QR หรือกล้อง")}</div></div></a>
      <a class="hm-action" href="#/attendance"><span class="ic"><Icon name="user-check" size={24} /></span><div><div class="t">เช็คชื่อ</div><div class="s">{attLine}</div></div></a>
      <a class="hm-action" href="#/random"><span class="ic"><Icon name="dice-3" size={24} /></span><div><div class="t">สุ่มชื่อ</div><div class="s">{quick("สุ่มเฉพาะคนที่มาเรียน")}</div></div></a>
      <button class="hm-action" onClick={() => navigate("/gradebook", { new: 1 })}><span class="ic"><Icon name="plus" size={24} /></span><div><div class="t">สร้างงาน</div><div class="s">หลายห้องพร้อมกัน</div></div></button>
    </div>
  );
}
