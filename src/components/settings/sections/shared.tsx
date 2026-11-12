import type { ComponentChildren } from "preact";
import { Icon } from "../../Icon";
import { online } from "../../../lib/outbox";
import { projectorOn } from "../../../lib/projector";
import { Switch } from "../../ui";

/** True while the screen is being projected: the settings page reads but never writes (AC-248). */
export const useReadOnly = (): boolean => projectorOn.value;
/** True when the device has no network: server-side writes wait for a connection (AC-217). */
export const useOffline = (): boolean => !online.value;

/** A device's name for the screen: while projecting it can carry a person's name, so it shows as "เครื่อง N" (AC-248). */
export const deviceLabel = (name: string, index: number, ro: boolean): string => (ro ? `เครื่อง ${index + 1}` : name);

/** Where a setting applies: synced to every device, or kept on this one only (BR-51). Icon + words, never colour alone. */
export function Scope({ all }: { all?: boolean }) {
  return <span class="chip set-scope" title={all ? "ค่านี้ใช้กับทุกเครื่องที่เข้าสู่ระบบ" : "ค่านี้ไม่ซิงก์ไปเครื่องอื่น"}><Icon name={all ? "cloud" : "device-mobile"} size={13} /> {all ? "ทุกเครื่อง" : "เครื่องนี้เท่านั้น"}</span>;
}

/** The yellow dot on "สำรองและกู้คืน" when a backup is due (with words for a screen reader). */
export function WarnDot() {
  return <><span class="warndot" aria-hidden="true" /><span class="sr-only">ควรสำรองข้อมูล</span></>;
}

/** How a setting is saved: at once, or with the save bar. While projecting nothing can be saved. */
export function SaveMode({ mode }: { mode: "now" | "form" }) {
  const ro = useReadOnly();
  return <span class="set-mode">{ro ? "ปิดอยู่ตอนฉายจอ" : mode === "now" ? "บันทึกทันที" : "กดบันทึกที่แถบด้านล่าง"}</span>;
}

/** One setting: name + hint on the left, the control on the right. */
export function Row({ label, hint, scope, mode, children }: { label: string; hint?: string; scope?: "all" | "device"; mode?: "now" | "form"; children: ComponentChildren }) {
  return (
    <div class="set-row">
      <div class="set-l">
        <div class="set-label">{label}{scope && <Scope all={scope === "all"} />}</div>
        {hint && <div class="page-sub">{hint}</div>}
        {mode && <SaveMode mode={mode} />}
      </div>
      <div class="set-r">{children}</div>
    </div>
  );
}

/** A switch with its visible "เปิด/ปิด" word (a role=switch button; the whole control is >= 44px). */
export function SwitchRow({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <span class="set-sw">
      <span class="set-onoff" aria-hidden="true">{on ? "เปิด" : "ปิด"}</span>
      <Switch on={on} onToggle={onToggle} label={label} />
    </span>
  );
}

/** "ต้องออนไลน์" next to a button that waits for a connection. */
export function NeedOnline() { return <span class="page-sub set-need-online">ต้องออนไลน์</span>; }
