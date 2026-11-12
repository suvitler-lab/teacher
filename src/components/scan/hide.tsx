import { Icon } from "../Icon";
import type { Student } from "@shared/types";
import { hideSignal, setHide } from "../../lib/hideNames";
import { fullName } from "../../lib/names";

// The scan page's own "hide names" switch (BR-18 / AC-77): per device, never follows the home page or the TV's switch.
// The TV (ScanProjector) reads `pjHideNames` only — nothing here touches it.

/** Is the scan page hiding names? Read inside a component to follow the switch. */
export const scanHiding = () => hideSignal("scan").value;
/** Same, without subscribing — for plain functions (toasts, logs) that build a text once. */
export const scanHidingNow = () => hideSignal("scan").peek();

/** "เลขที่ 7" when hidden, otherwise `เลขที่ 7 <name>` — for labels that always carried the number */
export function whoLabel(st: Student, hide: boolean): string {
  return hide ? `เลขที่ ${st.number ?? "-"}` : `เลขที่ ${st.number ?? "-"} ${fullName(st)}`;
}

/** The button in the bar: eye + "ซ่อนชื่อ"/"ซ่อนชื่ออยู่" (never colour alone), `aria-pressed` */
export function HideButton({ cls = "sc-cb" }: { cls?: string }) {
  const hide = scanHiding();
  return (
    <button type="button" class={cls + " sc-hidebtn"} aria-pressed={hide} onClick={() => setHide("scan", !hide)}
      aria-label={hide ? "ซ่อนชื่ออยู่ — แตะเพื่อแสดงชื่อ" : "ซ่อนชื่อนักเรียน"}>
      <Icon name={hide ? "eye-off" : "eye"} size={20} /> <span class="att-hide-sm">{hide ? "ซ่อนชื่ออยู่" : "ซ่อนชื่อ"}</span>
    </button>
  );
}

/** Under the bar while names are hidden: says so and offers the way back */
export function HideNotice() {
  if (!scanHiding()) return null;
  return (
    <div class="sc-hidenote" role="status">
      <Icon name="eye-off" size={20} />
      <span class="grow">ซ่อนชื่อนักเรียนอยู่ · ทุกจุดแสดงเฉพาะเลขที่</span>
      <button type="button" class="sc-cb" onClick={() => setHide("scan", false)}>แสดงชื่อ</button>
    </div>
  );
}
