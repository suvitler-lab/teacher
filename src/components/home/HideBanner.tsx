import { Icon } from "../Icon";
import { hideNames, setHideNames } from "../../lib/homePrefs";

/** The yellow strip under the top bar while names are hidden (BR-08): says so, and offers the way back. */
export function HideBanner() {
  if (!hideNames.value) return null;
  return (
    <div class="hm-banner warn" role="status">
      <Icon name="eye-off" size={20} />
      <span class="grow"><b>ซ่อนชื่อนักเรียนอยู่</b> · ทุกการ์ดแสดงเฉพาะจำนวน (สำหรับตอนสะท้อนจอขึ้นทีวี)</span>
      <button class="ghost" onClick={() => setHideNames(false)}>แสดงชื่อ</button>
    </div>
  );
}
