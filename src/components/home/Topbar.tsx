import { useState } from "preact/hooks";
import { Icon } from "../Icon";
import { TermPicker } from "../ui";
import { Chip } from "./shared";
import { settings, viewTerm, currentTerm } from "../../store";
import { schoolLabel } from "../../lib/orgNames";
import { formatThaiDate, formatThaiTimeMs } from "../../lib/dates";
import { hideNames, setHideNames } from "../../lib/homePrefs";
import { bkkToday } from "@shared/time";

/**
 * The bar above every layout, in the same place whichever layout is chosen: the date and term as text, the term picker,
 * the hide-names switch (aria-pressed, an icon AND words) and the "ปรับหน้าหลัก" chip. On a phone the buttons keep only their icon
 * (each still has its aria-label) and stay 44 px.
 */
export function HomeTopbar({ stale, at, onCustomize }: { stale: boolean; at: number | null; onCustomize: () => void }) {
  const [said, setSaid] = useState("");
  const hide = hideNames.value;
  const term = viewTerm.value ?? currentTerm.value;
  return (
    <div class="hm-top">
      <div class="hm-top-l">
        <span class="hm-top-school">{schoolLabel(settings.value?.school_name)}</span>
        <span class="hm-top-date">{formatThaiDate(bkkToday())}</span>
        {term && <span class="hm-top-term">{/^ภาคเรียน/.test(term.name) ? term.name : "ภาคเรียน " + term.name}</span>}
        {stale && at && <Chip tone="warning" icon="wifi-off">ออฟไลน์ · ข้อมูลเมื่อ {formatThaiDate(bkkToday(at))} {formatThaiTimeMs(at)}</Chip>}
      </div>
      <div class="hm-top-act">
        <TermPicker />
        <button class={"ghost hm-hide" + (hide ? " on" : "")} aria-pressed={hide} aria-label="ซ่อนชื่อนักเรียน"
          title="ซ่อนชื่อนักเรียนทุกการ์ด (ใช้ตอนสะท้อนจอขึ้นทีวี)"
          onClick={() => { setHideNames(!hide); setSaid(hide ? "แสดงชื่อนักเรียนแล้ว" : "ซ่อนชื่อนักเรียนแล้ว"); }}>
          <Icon name={hide ? "eye-off" : "eye"} size={20} /><span class="hm-btn-t">{hide ? "ซ่อนชื่ออยู่" : "ซ่อนชื่อ"}</span>
        </button>
        <button class="ghost hm-adjust" aria-label="ปรับหน้าหลัก" onClick={onCustomize}>
          <Icon name="layout-grid" size={20} /><span class="hm-btn-t">ปรับหน้าหลัก</span>
        </button>
      </div>
      <span class="sr-only" aria-live="polite">{said}</span>
    </div>
  );
}
