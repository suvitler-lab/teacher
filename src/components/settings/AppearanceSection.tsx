// Settings > หน้าตา (T-32): home layout (ก/ข/ค), skin, light/dark, text size and density, with a live preview.
// Every tap shows at once and is saved in the background by saveAppearance (D41): offline or a failed save puts the old
// look back and says why (D38/AC-05). No save button. Text size + density stay per device (display.ts), as before.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../Icon";
import { Segmented } from "../ui";
import { useConfirm } from "../ConfirmDialog";
import { settings } from "../../store";
import { navigate } from "../../router";
import { appearance, saveAppearance, DEFAULT_APPEARANCE, type Layout, type Skin, type TimetableStyle } from "../../lib/appearance";
import { loadSkinAssets } from "../../lib/fonts";
import { Scope, SaveMode } from "./sections/shared";
import { notify } from "../../lib/notify";
import type { ThemeChoice } from "../../lib/theme";
import { getFontSize, getDensity, setFontSize, resetFontSize, setDensity, defaultFont, isCoarse, FONT_MIN, FONT_MAX, DENSITY_LABEL, type Density } from "../../lib/display";

export const LAYOUT_OPTIONS: readonly { key: Layout; name: string; hint: string }[] = [
  { key: "a", name: "ก วันนี้ของครู", hint: "ไล่งานตามลำดับของวัน เหมาะกับคนที่อยากเห็นภาพรวมทั้งวัน" },
  { key: "b", name: "ข แผงรายห้อง", hint: "ดูทีละห้อง เหมาะกับครูที่สอนหลายห้อง" },
  { key: "c", name: "ค โฟกัสงานถัดไป", hint: "ทีละเรื่อง ใหญ่ ชัด เหมาะกับใช้ในห้องเรียน" },
];
export const TIMETABLE_OPTIONS: readonly { key: TimetableStyle; name: string; hint: string }[] = [
  { key: "a", name: "ก ตารางกระดาษ", hint: "เหมือนตารางที่โรงเรียนแจก เห็นทั้งสัปดาห์" },
  { key: "b", name: "ข ปฏิทิน", hint: "แกนเวลา เห็นว่าตอนนี้ถึงคาบไหน" },
  { key: "c", name: "ค วันนี้เป็นหลัก", hint: "เห็นคาบถัดไปก่อน แก้ทีละวัน" },
];
export const SKIN_OPTIONS: readonly { key: Skin; name: string; hint: string }[] = [
  { key: "pro", name: "มืออาชีพ", hint: "สะอาดตา จริงจัง" },
  { key: "warm", name: "อบอุ่น", hint: "นุ่มนวล เป็นกันเอง" },
  { key: "playful", name: "สดใส", hint: "สดใส มีชีวิตชีวา" },
];
export const MODE_OPTIONS: readonly { key: ThemeChoice; name: string; icon: string }[] = [
  { key: "system", name: "ตามเครื่อง", icon: "desktop" },
  { key: "light", name: "สว่าง", icon: "sun" },
  { key: "dark", name: "มืด", icon: "moon" },
];

type Patch = { skin?: Skin; layout?: Layout; timetable?: TimetableStyle; theme?: ThemeChoice };
const SETTLE_MS = 350;
type Status = "idle" | "saving" | "saved" | "offline" | "failed";
const STATUS_TEXT: Record<Exclude<Status, "idle">, { text: string; icon: string }> = {
  saving: { text: "กำลังบันทึก…", icon: "loader-2" },
  saved: { text: "บันทึกแล้ว · ใช้กับทุกเครื่อง", icon: "check-circle" },
  offline: { text: "ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์", icon: "wifi-slash" },
  failed: { text: "บันทึกหน้าตาไม่สำเร็จ — ยังเป็นค่าเดิม", icon: "warning" },
};

/** A plain picture of a home layout, drawn with the colours of the skin on screen. */
function LayoutThumb({ k }: { k: Layout }) {
  return (
    <svg class="ap-thumb" viewBox="0 0 96 60" aria-hidden="true" focusable="false">
      <rect class="t-bg" x="0.5" y="0.5" width="95" height="59" rx="5" />
      {k === "a" && <>
        <rect class="t-hero" x="6" y="6" width="84" height="14" rx="3" />
        <rect class="t-ac" x="10" y="10" width="14" height="6" rx="2" />
        <rect class="t-card" x="6" y="25" width="52" height="8" rx="2" /><rect class="t-card" x="6" y="36" width="52" height="8" rx="2" /><rect class="t-card" x="6" y="47" width="52" height="8" rx="2" />
        <rect class="t-card" x="62" y="25" width="28" height="14" rx="2" /><rect class="t-card" x="62" y="42" width="28" height="13" rx="2" />
      </>}
      {k === "b" && <>
        <rect class="t-card" x="6" y="6" width="24" height="49" rx="3" />
        <rect class="t-ac" x="9" y="10" width="18" height="8" rx="2" /><rect class="t-ln" x="9" y="21" width="18" height="6" rx="2" /><rect class="t-ln" x="9" y="30" width="18" height="6" rx="2" />
        <rect class="t-hero" x="34" y="6" width="56" height="12" rx="3" />
        <rect class="t-card" x="34" y="22" width="26" height="14" rx="2" /><rect class="t-card" x="64" y="22" width="26" height="14" rx="2" />
        <rect class="t-card" x="34" y="40" width="56" height="15" rx="2" />
      </>}
      {k === "c" && <>
        <rect class="t-hero" x="12" y="6" width="72" height="26" rx="4" />
        <rect class="t-ac" x="18" y="22" width="22" height="6" rx="3" />
        <rect class="t-card" x="6" y="37" width="26" height="18" rx="2" /><rect class="t-card" x="35" y="37" width="26" height="18" rx="2" /><rect class="t-card" x="64" y="37" width="26" height="18" rx="2" />
      </>}
    </svg>
  );
}

/** A plain picture of a timetable style (ก paper grid, ข time-axis calendar, ค today first), in the skin's colours. */
function TimetableThumb({ k }: { k: TimetableStyle }) {
  return (
    <svg class="ap-thumb" viewBox="0 0 96 60" aria-hidden="true" focusable="false">
      <rect class="t-bg" x="0.5" y="0.5" width="95" height="59" rx="5" />
      {k === "a" && <>
        {[0, 1, 2, 3, 4].map((r) => <rect class="t-ln" x="6" y={8 + r * 10} width="10" height="7" rx="1.5" />)}
        {[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => <rect class={(r + c) % 3 === 0 ? "t-ac" : "t-card"} x={19 + c * 15} y={8 + r * 10} width="13" height="7" rx="1.5" />))}
      </>}
      {k === "b" && <>
        {[0, 1, 2, 3].map((c) => <rect class="t-ln" x={14 + c * 20} y="6" width="16" height="4" rx="1" />)}
        {[0, 1, 2].map((r) => <rect class="t-ln" x="5" y={16 + r * 15} width="6" height="3" rx="1" />)}
        <rect class="t-ac" x="14" y="14" width="16" height="14" rx="2" /><rect class="t-card" x="34" y="20" width="16" height="12" rx="2" />
        <rect class="t-card" x="54" y="14" width="16" height="10" rx="2" /><rect class="t-ac" x="74" y="30" width="16" height="14" rx="2" />
        <rect class="t-hero" x="8" y="36" width="82" height="2.5" rx="1" />
      </>}
      {k === "c" && <>
        <rect class="t-hero" x="6" y="6" width="84" height="20" rx="3" />
        <rect class="t-ac" x="10" y="10" width="24" height="6" rx="2" />
        {[0, 1, 2].map((r) => <rect class="t-card" x="6" y={30 + r * 10} width="56" height="7" rx="2" />)}
        <rect class="t-card" x="66" y="30" width="24" height="27" rx="2" />
      </>}
    </svg>
  );
}

/** One big radio card: the real radio input fills the card, so the whole card is the tap target. */
function ChoiceCard({ name, value, checked, onPick, skin, children, label }: {
  name: string; value: string; checked: boolean; onPick: () => void; skin?: Skin; children: ComponentChildren; label: string;
}) {
  return (
    <label class={"ap-card" + (checked ? " on" : "")} data-skin={skin}>
      <input type="radio" name={name} value={value} checked={checked} aria-label={label} onChange={onPick} />
      {children}
      {checked && <span class="ap-used"><Icon name="check-circle" size={18} />ใช้อยู่</span>}
    </label>
  );
}

// Text size + row density: per device, applied at once, see lib/display.ts (moved here from "ทั่วไป", same behaviour).
function DisplayRows() {
  const [fs, setFs] = useState(getFontSize);
  const [den, setDen] = useState<Density>(getDensity);
  const def = defaultFont(isCoarse());
  return (
    <>
      <div class="set-row"><div class="set-l"><div style="font-weight:500">ขนาดตัวอักษร <ThisDevice /></div><div class="page-sub">ใช้ทั้งแอป · จำไว้ในเครื่องนี้ · ค่าเริ่มต้น {def}</div></div>
        <div class="fs-step">
          <button aria-label="ลดขนาดตัวอักษร" disabled={fs <= FONT_MIN} onClick={() => setFs(setFontSize(fs - 1))}><Icon name="minus" size={24} /></button>
          <div class="v" role="status" aria-live="polite" aria-label={`ขนาดตัวอักษร ${fs}`}>{fs}</div>
          <button aria-label="เพิ่มขนาดตัวอักษร" disabled={fs >= FONT_MAX} onClick={() => setFs(setFontSize(fs + 1))}><Icon name="plus" size={24} /></button>
          <button aria-label={`ใช้ขนาดค่าเริ่มต้น ${def}`} disabled={fs === def} onClick={() => setFs(resetFontSize())}>ค่าเริ่มต้น</button>
        </div>
      </div>
      <div class="set-row"><div class="set-l"><div style="font-weight:500">ความหนาแน่น <ThisDevice /></div><div class="page-sub">ระยะห่างระหว่างแถวและปุ่ม (ไม่ต่ำกว่า 44px บนจอสัมผัส)</div></div>
        <Segmented label="ความหนาแน่น" value={den} onChange={(v) => setDen(setDensity(v))} options={(["compact", "normal", "roomy"] as Density[]).map((d) => ({ value: d, label: DENSITY_LABEL[d] }))} />
      </div>
      <div class="fs-live" role="group" aria-label="ตัวอย่างสด ขนาดตัวอักษร">
        <div style="font-weight:500">ตัวอย่างสด <span class="page-sub">— ขนาดนี้ใช้กับสมุดคะแนน สแกน เช็คชื่อ รายงานทั้งหมด</span></div>
        <div class="fs-prev">
          <div class="fs-prev-title">ใบงานบทที่ 3 การคูณ</div>
          <div class="page-sub">คณิตศาสตร์ · ป.6/1 · ส่งภายใน 3 พ.ย.</div>
          <div class="fs-trow"><b>21</b><span class="grow">นักเรียน ตัวอย่าง</span><span class="fs-pill" style="background:var(--bg-warning);color:var(--text-warning)">8</span><span class="fs-pill" style="background:var(--bg-accent);color:var(--text-accent)"><Icon name="check" size={18} /></span><span class="fs-pill" style="background:var(--bg-danger);color:var(--text-danger)">–</span></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="circle-check" size={16} /> เครื่องยิงพร้อม</span><button class="primary" tabIndex={-1} aria-hidden="true">บันทึก 8/10</button><button tabIndex={-1} aria-hidden="true">ยกเลิก</button></div>
        </div>
      </div>
    </>
  );
}

function ThisDevice() {
  return <span class="chip set-scope" title="ค่านี้ไม่ซิงก์ไปเครื่องอื่น" style="background:var(--surface-1);color:var(--text-secondary)"><Icon name="device-mobile" size={13} /> เครื่องนี้เท่านั้น</span>;
}

export function AppearanceSection() {
  const saved = appearance.value;
  const savedMode: ThemeChoice = settings.value?.theme ?? "system";
  const [status, setStatus] = useState<Status>("idle");
  const [pend, setPend] = useState<Patch>({}); // taps not sent yet: arrow keys walk through the cards, only where they stop is saved (R-3207)
  const { ask, node: askNode } = useConfirm();
  const resetBtn = useRef<HTMLButtonElement>(null);
  const pending = useRef<Patch>({});
  const settle = useRef<number | undefined>(undefined);
  const inflight = useRef(0);
  const anyFailed = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const look = { skin: pend.skin ?? saved.skin, layout: pend.layout ?? saved.layout, timetable: pend.timetable ?? saved.timetable };
  const mode: ThemeChoice = pend.theme ?? savedMode;

  // the cards show the fonts of all three skins: ask for them while this section is open (they are cached after that)
  useEffect(() => { for (const s of SKIN_OPTIONS) void loadSkinAssets(s.key); return () => { window.clearTimeout(timer.current); window.clearTimeout(settle.current); }; }, []);

  async function save(patch: Patch, withUndo = true) {
    const same = (patch.skin === undefined || patch.skin === appearance.value.skin) && (patch.layout === undefined || patch.layout === appearance.value.layout) && (patch.timetable === undefined || patch.timetable === appearance.value.timetable) && (patch.theme === undefined || patch.theme === (settings.value?.theme ?? "system"));
    if (same) return;
    const prevTheme: ThemeChoice = settings.value?.theme ?? "system";
    window.clearTimeout(timer.current);
    setStatus("saving");
    inflight.current++;
    const done = await saveAppearance(patch, { silent: true });
    inflight.current--;
    if (!done) anyFailed.current = true;
    if (inflight.current > 0) return; // the last answer owns the chip — but an earlier failure still shows (R-3201)
    const failed = anyFailed.current;
    anyFailed.current = false;
    if (!failed) {
      // AC-214: light/dark is saved at once with a toast and an undo that sends the old value back
      if (patch.theme !== undefined && patch.theme !== prevTheme) {
        notify("success", `บันทึกแล้ว · สว่าง/มืด: ${MODE_OPTIONS.find((m) => m.key === patch.theme)?.name ?? ""}`, withUndo ? { action: { label: "เลิกทำ", run: () => { void save({ theme: prevTheme }, false); } } } : {});
      }
      setStatus("saved");
      timer.current = window.setTimeout(() => setStatus("idle"), 3000);
    } else setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "failed");
  }

  function choose(patch: Patch) {
    pending.current = { ...pending.current, ...patch };
    setPend(pending.current);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(flush, SETTLE_MS);
  }
  function flush() {
    window.clearTimeout(settle.current);
    const patch = pending.current;
    pending.current = {};
    setPend({});
    void save(patch);
  }

  async function reset() {
    const yes = await ask({ title: "คืนค่าหน้าตาเป็นค่าเริ่มต้น?", body: "โครง ก · อบอุ่น · ตารางสอน ก · ตามเครื่อง (ไม่แตะขนาดตัวอักษรและการซ่อนการ์ด)", yes: "ใช่ คืนค่า", no: "ไม่" });
    resetBtn.current?.focus(); // the dialog closes: put focus back where the teacher was
    if (yes) { pending.current = {}; setPend({}); window.clearTimeout(settle.current); void save({ ...DEFAULT_APPEARANCE, theme: "system" }); }
  }

  const L = LAYOUT_OPTIONS.find((x) => x.key === look.layout)!;
  const S = SKIN_OPTIONS.find((x) => x.key === look.skin)!;
  const M = MODE_OPTIONS.find((x) => x.key === mode)!;
  const st = status === "idle" ? null : STATUS_TEXT[status];

  return (
    <section class="card ap" aria-labelledby="ap-h">
      <div class="ap-head">
        <h2 id="ap-h" class="set-section-title"><Icon name="palette" /> หน้าตา</h2>
        <span class="ap-status-wrap" role="status" aria-live="polite">
          {st && <span class={"ap-status " + status}><Icon name={st.icon} size={16} class={status === "saving" ? "spin" : undefined} />{st.text}</span>}
        </span>
      </div>
      <p class="page-sub ap-lead">เลือกแล้วเห็นผลทันที · บันทึกอัตโนมัติ</p>

      <div class="ap-grid">
        <aside class="ap-preview" aria-label="ตัวอย่างสด">
          <div class="ap-pv-title"><Icon name="eye" size={18} /> ตัวอย่างสด</div>
          <LayoutThumb k={look.layout} />
          <div class="ap-hero" aria-hidden="true"><small>สวัสดีตอนสาย ครูตัวอย่าง</small><div class="ap-hero-n"><b>5</b> อย่างที่ต้องทำวันนี้</div></div>
          <div class="ap-chips" aria-hidden="true">
            <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="check-circle" size={16} /> ส่งแล้ว</span>
            <span class="chip" style="background:var(--bg-warning);color:var(--text-warning)"><Icon name="clock" size={16} /> รอตรวจ</span>
            <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)"><Icon name="calendar-x" size={16} /> ค้างส่ง</span>
          </div>
          <button class="primary ap-go" onClick={() => navigate("/")}><Icon name="house" size={20} /> ไปดูหน้าหลัก</button>
          <p class="page-sub">โครง {L.name} · ธีม{S.name} · {M.name}</p>
        </aside>

        <div class="ap-opts">
          <fieldset class="ap-fs" role="radiogroup" aria-label="โครงหน้าหลัก">
            <legend>โครงหน้าหลัก</legend>
            <p class="ap-scope"><Scope all /> <SaveMode mode="now" /></p>
            <div class="ap-choices">
              {LAYOUT_OPTIONS.map((o) => (
                <ChoiceCard name="ap-layout" value={o.key} label={`${o.name} — ${o.hint}`} checked={look.layout === o.key} onPick={() => choose({ layout: o.key })}>
                  <LayoutThumb k={o.key} />
                  <span class="ap-txt"><b>{o.name}</b><small>{o.hint}</small></span>
                </ChoiceCard>
              ))}
            </div>
          </fieldset>

          <fieldset class="ap-fs" role="radiogroup" aria-label="ธีม">
            <legend>ธีม</legend>
            <p class="ap-scope"><Scope all /> <SaveMode mode="now" /></p>
            <div class="ap-choices">
              {SKIN_OPTIONS.map((o) => (
                <ChoiceCard name="ap-skin" value={o.key} skin={o.key} label={`ธีม${o.name} — ${o.hint}`} checked={look.skin === o.key} onPick={() => choose({ skin: o.key })}>
                  <span class="ap-sw" aria-hidden="true"><i class="s1" /><i class="s2" /><i class="s3" /><i class="s4" /></span>
                  <span class="ap-txt"><span class="ap-sample" aria-hidden="true">กขค 123</span><b>{o.name}</b><small>{o.hint}</small></span>
                </ChoiceCard>
              ))}
            </div>
          </fieldset>

          <fieldset class="ap-fs" role="radiogroup" aria-label="รูปแบบตารางสอน">
            <legend>รูปแบบตารางสอน</legend>
            <p class="ap-scope"><Scope all /> <SaveMode mode="now" /></p>
            <div class="ap-choices">
              {TIMETABLE_OPTIONS.map((o) => (
                <ChoiceCard name="ap-timetable" value={o.key} label={`${o.name} — ${o.hint}`} checked={look.timetable === o.key} onPick={() => choose({ timetable: o.key })}>
                  <TimetableThumb k={o.key} />
                  <span class="ap-txt"><b>{o.name}</b><small>{o.hint}</small></span>
                </ChoiceCard>
              ))}
            </div>
            <p class="page-sub ap-tt-link">เปิด/ปิดแถบ ตอนนี้/ต่อไป ได้ที่ <button type="button" class="lk" onClick={() => navigate("/?customize=1")}>หน้าหลัก › ปรับหน้าหลัก ›</button></p>
          </fieldset>

          <fieldset class="ap-fs" role="radiogroup" aria-label="สว่าง หรือ มืด">
            <legend>สว่าง / มืด</legend>
            <p class="ap-scope"><Scope all /> <SaveMode mode="now" /></p>
            <div class="ap-modes">
              {MODE_OPTIONS.map((o) => (
                <label class={"ap-mode" + (mode === o.key ? " on" : "")}>
                  <input type="radio" name="ap-mode" value={o.key} checked={mode === o.key} aria-label={o.name} onChange={() => choose({ theme: o.key })} />
                  <Icon name={o.icon} size={20} />{o.name}{mode === o.key && <span class="ap-used"><Icon name="check-circle" size={18} />ใช้อยู่</span>}
                </label>
              ))}
            </div>
            <p class="page-sub">ใช้กับทุกเครื่อง · เลือก "ตามเครื่อง" ให้แอปสลับตามเวลากลางวัน/กลางคืนของเครื่อง</p>
          </fieldset>

          <fieldset class="ap-fs">
            <legend>ขนาดตัวอักษรและความหนาแน่น</legend>
            <DisplayRows />
          </fieldset>

          <div class="ap-reset">
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
              <button ref={resetBtn} onClick={reset}><Icon name="arrow-counter-clockwise" size={20} /> คืนค่าเริ่มต้น</button>
              <span class="page-sub">ค่าเริ่มต้น: โครง ก · อบอุ่น · ตารางสอน ก · ตามเครื่อง (ไม่แตะขนาดตัวอักษรและการซ่อนการ์ด)</span>
            </div>
          </div>
        </div>
      </div>
      {askNode}
    </section>
  );
}
