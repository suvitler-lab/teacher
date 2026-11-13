import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { err, ok } from "../../../lib/notify";
import { useConfirm } from "../../ConfirmDialog";
import { isPersisted, isInstalledApp, requestPersist } from "../../../lib/storage";
import { pendingCount } from "../../../lib/outbox";
import { attDraftCount } from "../../../lib/attSync";
import { clearLocalPrefs } from "../../../lib/localPrefs";
import { offlineState, offlineNote, applyUpdate, type OfflineState } from "../../../lib/offline";
import { collectDeviceFacts, judgeDevice, worst, VERDICT, deviceReportText, describeAgent, type Check, type DeviceFacts } from "../../../lib/deviceCheck";
import { Scope } from "./shared";

// Where unsent work waits on this device — and whether the browser promises to keep it.
export function StorageRow() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const installed = isInstalledApp();
  useEffect(() => { isPersisted().then(setPersisted); }, []);
  const safe = persisted === true || installed;
  return (
    <div class="set-row">
      <div>
        <div class="set-label">ที่เก็บข้อมูลในเครื่องนี้ <Scope /></div>
        <div class="page-sub">
          {safe
            ? "เบราว์เซอร์มีโอกาสลบข้อมูลของเว็บนี้น้อยลง แต่ไม่ใช่การรับประกัน — งานที่ยังรอส่งควรถูกส่งขึ้นระบบให้เร็วที่สุด (ดูตัวเลข \"รอส่ง\" แล้วต่อเน็ต)"
            : "ถ้าไม่ได้เปิดเว็บนี้นานราว 7 วัน (เช่นช่วงปิดเทอม) Safari บน iPad อาจลบงานที่ยังไม่ได้ส่ง — แนะนำให้เพิ่มไว้ที่หน้าจอโฮม และอย่าปล่อยงานค้างส่งข้ามช่วงปิดเทอม"}
        </div>
      </div>
      {safe
        ? <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="shield-check" size={13} /> {installed ? "ติดตั้งแล้ว" : "ขอเก็บถาวรแล้ว"}</span>
        : <button style="font-size:var(--fs-sm);white-space:nowrap;flex:none" onClick={async () => { const okk = await requestPersist(); setPersisted(okk); if (!okk) err("เบราว์เซอร์ไม่อนุญาต — ลองเพิ่มไว้ที่หน้าจอโฮม"); }}>ขอเก็บถาวร</button>}
    </div>
  );
}

// Can this device open the app and keep scanning with no network at all?
export function OfflineRow() {
  const st = offlineState.value;
  const text: Record<OfflineState, string> = {
    unsupported: "เบราว์เซอร์หรือที่อยู่นี้ใช้ออฟไลน์ไม่ได้ (ต้องเปิดผ่านลิงก์ https:// ของระบบ และเป็นแอปที่ deploy แล้ว ไม่ใช่โหมดพัฒนา)",
    preparing: "กำลังดาวน์โหลดไฟล์ของแอปไว้ในเครื่อง — รอให้เสร็จก่อนพาไปห้องที่สัญญาณไม่ดี",
    ready: "เปิดแอปและสแกนได้แม้ไม่มีอินเทอร์เน็ต — งานที่สแกนจะเข้าคิวในเครื่อง แล้วส่งเองเมื่อกลับมาออนไลน์",
    update: "มีเวอร์ชันใหม่ดาวน์โหลดไว้แล้ว — กดอัปเดตเมื่อสะดวก (งานที่ค้างส่งไม่หาย)",
    error: offlineNote.value || "เตรียมไฟล์สำหรับใช้ออฟไลน์ไม่สำเร็จ — ต่อเน็ตแล้วเปิดแอปใหม่อีกครั้ง",
  };
  return (
    <div class="set-row">
      <div>
        <div class="set-label">ใช้ออฟไลน์ <Scope /></div>
        <div class="page-sub">{text[st]}{st === "ready" && offlineNote.value ? " · " + offlineNote.value : ""}</div>
      </div>
      {st === "ready" && <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="circle-check" size={13} /> พร้อม</span>}
      {st === "preparing" && <span class="chip" style="background:var(--bg-accent);color:var(--text-accent)"><Icon name="loader-2" size={13} class="spin" /> กำลังเตรียม</span>}
      {st === "update" && <button class="primary" style="font-size:var(--fs-sm);white-space:nowrap;flex:none" onClick={applyUpdate}>อัปเดตเลย</button>}
      {st === "error" && <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)"><Icon name="alert-triangle" size={13} /> ไม่พร้อม</span>}
      {st === "unsupported" && <span class="chip" style="background:var(--surface-1);color:var(--text-secondary)">ไม่รองรับ</span>}
    </div>
  );
}

/** Everything worth knowing about THIS device before class, in one tap — readable aloud, or copied into the trial log. */
function DeviceCheck() {
  const [state, setState] = useState<{ checks: Check[]; facts: DeviceFacts } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const facts = await collectDeviceFacts();
      setState({ facts, checks: judgeDevice(facts) });
    } catch (e) {
      err("ตรวจเครื่องไม่สำเร็จ: " + ((e as Error)?.message || "ไม่ทราบสาเหตุ"));
    } finally { setBusy(false); }
  }
  async function copy() {
    if (!state) return;
    const text = deviceReportText(state.checks, state.facts);
    try { await navigator.clipboard.writeText(text); ok("คัดลอกผลตรวจแล้ว"); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      const done = document.execCommand?.("copy"); ta.remove();
      done ? ok("คัดลอกผลตรวจแล้ว") : err("คัดลอกไม่ได้ — ถ่ายหน้าจอแทน");
    }
  }
  const verdict = state ? worst(state.checks) : null;
  const tone = { ok: "var(--bg-success);color:var(--text-success)", warn: "var(--bg-warning);color:var(--text-warning)", fail: "var(--bg-danger);color:var(--text-danger)" };
  const icon = { ok: ["circle-check", "var(--text-success)"], warn: ["alert-triangle", "var(--text-warning)"], fail: ["circle-x", "var(--text-danger)"] } as const;
  return (
    <div class="card">
      <h2 class="set-section-title"><Icon name="device-mobile-check" /> ตรวจเครื่องนี้ <Scope /></h2>
      <div class="page-sub" style="margin-bottom:8px">รันก่อนเข้าห้องทุกครั้งที่เปลี่ยนเครื่อง — ตรวจ HTTPS, เซิร์ฟเวอร์, การใช้ออฟไลน์, ที่เก็บข้อมูล, นาฬิกา และงานค้าง (ตรวจกล้องแบบละเอียดที่ การสแกน › ทดสอบกล้อง)</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="primary" onClick={run} disabled={busy}>{busy ? <Icon name="loader-2" size={16} class="spin" /> : <Icon name="stethoscope" size={16} />} {state ? "ตรวจอีกครั้ง" : "ตรวจเครื่องนี้"}</button>
        {state && <button onClick={copy}><Icon name="copy" size={16} /> คัดลอกผลตรวจ</button>}
      </div>
      {state && verdict && (
        <div style="margin-top:8px">
          <div class="imp-warn" style={`margin:0 0 6px;background:${tone[verdict]}`} role="status">
            <Icon name={icon[verdict][0]} size={15} /> <span>{VERDICT[verdict]}</span>
          </div>
          {state.checks.map((c) => (
            <div class="row" style="gap:8px;align-items:flex-start;padding:5px 0;border-top:0.5px solid var(--border);font-size:var(--fs-sm)">
              <Icon name={icon[c.level][0]} size={16} style={`color:${icon[c.level][1]};margin-top:2px`} />
              <div style="min-width:0"><div style="font-weight:500">{c.label}</div><div class="page-sub" style="word-break:break-word">{c.detail}</div></div>
            </div>
          ))}
          <div class="page-sub" style="margin-top:6px">{describeAgent(state.facts.userAgent)} · จอ {state.facts.screen}{state.facts.touch ? " · จอสัมผัส" : ""}</div>
        </div>
      )}
    </div>
  );
}

/** What this app is, and how to put it on the iPad home screen (P4). No version number: there is no value to read (SGQ1). */
function AboutApp() {
  const installed = isInstalledApp();
  return (
    <section class="card" aria-labelledby="dv-ab">
      <h2 id="dv-ab" class="set-section-title"><Icon name="info-circle" /> เกี่ยวกับแอป <Scope /></h2>
      <div class="set-row">
        <div class="set-l"><div class="set-label">งานครบ</div>
          <div class="page-sub">{installed ? "เปิดจากแอปที่ติดตั้งในเครื่องนี้" : "ตอนนี้เปิดในเบราว์เซอร์ — เพิ่มไว้ที่หน้าจอโฮมจะเปิดได้เร็วและเก็บงานที่รอส่งได้ปลอดภัยกว่า"}</div></div>
        <span class="chip" style={installed ? "background:var(--bg-success);color:var(--text-success)" : "background:var(--surface-1);color:var(--text-secondary)"}>
          <Icon name={installed ? "shield-check" : "device-mobile"} size={13} /> {installed ? "ติดตั้งแล้ว" : "เปิดในเบราว์เซอร์"}
        </span>
      </div>
      {!installed && <div class="page-sub dv-howto">วิธีเพิ่มบน iPad: เปิดเว็บนี้ใน Safari → แตะปุ่มแชร์ → เลือก "เพิ่มไปยังหน้าจอโฮม"</div>}
    </section>
  );
}

/** Forget this device's remembered choices (BR-60). Never the queue, the sign-in, the offline copy or any synced value. */
function ClearPrefs() {
  const { ask, node } = useConfirm();
  const btn = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  async function clear() {
    if (busy) return;
    const waiting = pendingCount.value + attDraftCount.value;
    const yes = await ask({
      title: "ล้างค่าที่จำไว้ในเครื่องนี้?",
      body: (
        <>
          <p style="margin:0 0 6px"><b>จะกลับเป็นค่าเริ่มต้น:</b> ขนาดตัวอักษรและความหนาแน่น · ซ่อนชื่อทุกหน้า · ค่าของจอฉาย · เสียง "ติ๊ง" · ห้อง/การเรียง/คอลัมน์ที่แต่ละหน้าจำไว้</p>
          <p style="margin:0"><b>ไม่แตะ:</b> งานที่รอส่ง{waiting > 0 ? ` ${waiting} รายการ` : ""} · การเข้าสู่ระบบ · ข้อมูลในระบบ · ค่าที่ใช้กับทุกเครื่อง (ธีม โครงหน้าหลัก การ์ด เสียงสแกน)</p>
        </>
      ),
      yes: "ล้างค่าในเครื่องนี้", danger: true,
    });
    btn.current?.focus(); // the dialog closes: put focus back where the teacher was
    if (!yes) return;
    setBusy(true);
    try {
      const n = clearLocalPrefs().length;
      ok(`ล้างค่าที่จำไว้ในเครื่องนี้แล้ว (${n} รายการ) · งานที่รอส่งยังอยู่ครบ`);
    } catch (e) {
      err("ล้างค่าไม่สำเร็จ: " + ((e as Error)?.message || "ไม่ทราบสาเหตุ"));
    } finally { setBusy(false); }
  }
  return (
    <section class="card" aria-labelledby="dv-cl">
      {node}
      <h2 id="dv-cl" class="set-section-title"><Icon name="arrow-counter-clockwise" /> ล้างค่าที่จำไว้ <Scope /></h2>
      <div class="set-row">
        <div class="set-l"><div class="set-label">ล้างค่าที่จำไว้ในเครื่องนี้</div>
          <div class="page-sub">คืนค่าเริ่มต้นของสิ่งที่เครื่องนี้จำไว้ (ขนาดตัวอักษร ซ่อนชื่อ จอฉาย ฯลฯ) · งานที่รอส่ง การเข้าสู่ระบบ และค่าที่ใช้กับทุกเครื่องไม่เปลี่ยน</div></div>
        <button ref={btn} onClick={clear} disabled={busy}><Icon name="arrow-counter-clockwise" size={20} /> ล้างค่าที่จำไว้ในเครื่องนี้</button>
      </div>
    </section>
  );
}

/** ตรวจเครื่องและออฟไลน์: everything about THIS device (BR-51: nothing here is synced). */
export function DeviceSection() {
  return (
    <>
      <DeviceCheck />
      <section class="card" aria-labelledby="se-dh">
        <h2 id="se-dh" class="set-section-title"><Icon name="device-mobile" /> การแสดงผลบนเครื่องนี้ <Scope /></h2>
        <OfflineRow />
        <StorageRow />
      </section>
      <AboutApp />
      <ClearPrefs />
    </>
  );
}
