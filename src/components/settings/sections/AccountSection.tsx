import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../Icon";
import { api, ApiError } from "../../../lib/api";
import { err, ok, withToast } from "../../../lib/notify";
import type { DeviceInfo } from "@shared/types";
import { useConfirm } from "../../ConfirmDialog";
import { describeAgent } from "../../../lib/deviceCheck";
import { formatThaiDayMonthMs } from "../../../lib/dates";
import { DEVICE_NAME_MAX, cleanDeviceName, setDeviceName } from "../../../lib/device";
import { logout } from "../../../store";
import { pendingCount, failedCount } from "../../../lib/outbox";
import { attDraftCount } from "../../../lib/attSync";
import { useOffline, useReadOnly, NeedOnline, deviceLabel } from "./shared";

/** Password rules of BR-58: the new one is 6+ characters and equals the confirmation. The server has the last word. */
export const PASSWORD_MIN = 6;
export function checkPasswords(cur: string, next: string, again: string): { cur?: string; next?: string; again?: string } {
  const e: { cur?: string; next?: string; again?: string } = {};
  if (!cur) e.cur = "ใส่รหัสผ่านเดิม";
  if (next.length < PASSWORD_MIN) e.next = `รหัสใหม่อย่างน้อย ${PASSWORD_MIN} ตัว`;
  else if (again !== next) e.again = "รหัสใหม่ไม่ตรงกัน";
  return e;
}

/** The sign-in e-mail, read only (G-T9): changing it needs the administrator. Hidden while projecting (AC-248). */
function EmailRow() {
  const ro = useReadOnly();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => { api.get<{ email?: string | null }>("/api/auth/me").then((m) => setEmail(m.email ?? null), () => setEmail(null)); }, []);
  return (
    <div class="set-row">
      <div class="set-l">
        <div class="set-label">อีเมลเข้าสู่ระบบ</div>
        <div class="page-sub">ใช้ยืนยันตัวตนตอนเข้าสู่ระบบ · เปลี่ยนอีเมล: แจ้งผู้ดูแลระบบ · ลืมรหัสผ่าน: แจ้งผู้ดูแลระบบให้รีเซ็ตให้</div>
      </div>
      <div class="set-r"><span class="acct-email" data-email>{ro ? "ซ่อนอยู่" : email === undefined ? "กำลังโหลด…" : email ?? "ยังไม่ได้ตั้ง"}</span></div>
    </div>
  );
}

function PasswordField({ id, label, value, auto, error, onInput, inputRef }: {
  id: string; label: string; value: string; auto: "current-password" | "new-password"; error?: string;
  onInput: (v: string) => void; inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div class="field">
      <label for={id}><span>{label}</span></label>
      <div class="acct-pw-in">
        <input id={id} ref={inputRef} type={show ? "text" : "password"} autocomplete={auto} value={value} aria-invalid={error ? "true" : undefined} aria-describedby={error ? id + "-e" : undefined}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
        <button type="button" class="ghost" aria-pressed={show} aria-label={(show ? "ซ่อน" : "แสดง") + label} onClick={() => setShow(!show)}>
          <Icon name={show ? "eye-off" : "eye"} size={20} />
        </button>
      </div>
      {error && <p id={id + "-e"} class="acct-err" role="alert"><Icon name="alert-triangle" size={16} /> {error}</p>}
    </div>
  );
}

function ChangePassword() {
  const offline = useOffline();
  const ro = useReadOnly();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errs, setErrs] = useState<{ cur?: string; next?: string; again?: string }>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const sending = useRef(false);

  function reset() { setCur(""); setNext(""); setAgain(""); setErrs({}); }
  async function submit(e?: Event) {
    e?.preventDefault();
    if (sending.current || offline || ro) return;
    setDone(false);
    const found = checkPasswords(cur, next, again);
    setErrs(found);
    const first = (["cur", "next", "again"] as const).find((k) => found[k]);
    if (first) { inputs.current[first]?.focus(); return; }
    sending.current = true; setBusy(true);
    try {
      await api.post("/api/auth/change-password", { current: cur, next });
      reset(); setOpen(false); setDone(true);
    } catch (x) {
      const wrong = x instanceof ApiError && (x.code === "wrong_password" || x.status === 403);
      setErrs({ cur: wrong ? "รหัสผ่านเดิมไม่ถูกต้อง" : undefined, ...(wrong ? {} : { next: (x as Error)?.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ — ลองอีกครั้ง" }) });
      inputs.current[wrong ? "cur" : "next"]?.focus();
    } finally { sending.current = false; setBusy(false); }
  }

  return (
    <div class="set-row">
      <div class="set-l">
        <div class="set-label">รหัสผ่าน</div>
        <div class="page-sub">ไม่แสดงรหัสเดิม · เมื่อเปลี่ยนแล้ว เครื่องอื่นจะถูกออกจากระบบ (เครื่องนี้ยังอยู่)</div>
        <div role="status">{done && <p class="acct-ok"><Icon name="circle-check" size={16} /> เปลี่ยนรหัสผ่านแล้ว</p>}</div>
      </div>
      <div class="set-r">
        {!open ? (
          <>
            <button onClick={() => { setDone(false); setOpen(true); }} disabled={offline || ro}><Icon name="key" size={20} /> เปลี่ยนรหัสผ่าน</button>
            {offline && <NeedOnline />}
          </>
        ) : (
          <form class="acct-pw" onSubmit={submit} aria-label="เปลี่ยนรหัสผ่าน" noValidate>
            <PasswordField id="pw-cur" label="รหัสผ่านเดิม" value={cur} auto="current-password" error={errs.cur} onInput={setCur} inputRef={(el) => (inputs.current.cur = el)} />
            <PasswordField id="pw-new" label="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" value={next} auto="new-password" error={errs.next} onInput={setNext} inputRef={(el) => (inputs.current.next = el)} />
            <PasswordField id="pw-again" label="ยืนยันรหัสผ่านใหม่" value={again} auto="new-password" error={errs.again} onInput={setAgain} inputRef={(el) => (inputs.current.again = el)} />
            <div class="acct-dev-acts">
              <button type="submit" class="primary" disabled={busy || offline || ro}>{busy ? <><Icon name="loader-2" size={20} class="spin" /> กำลังบันทึก…</> : "บันทึกรหัสผ่านใหม่"}</button>
              <button type="button" onClick={() => { reset(); setOpen(false); }} disabled={busy}>ยกเลิก</button>
              {offline && <NeedOnline />}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** The devices signed in to this account: rename (1–40), sign out another one (confirmed). This device has no sign-out button in the list. */
function DeviceList() {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null); // null = loading
  const [loadFailed, setLoadFailed] = useState(false);
  const offline = useOffline();
  const ro = useReadOnly();
  const [editId, setEditId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [signing, setSigning] = useState("");
  const { ask, node: askNode } = useConfirm();
  async function load() { setLoadFailed(false); try { const r = await api.get<{ devices: DeviceInfo[] }>("/api/devices"); setDevices(r.devices); } catch { setLoadFailed(true); setDevices((d) => d ?? []); } }
  useEffect(() => { load(); }, []);

  async function signout(d: DeviceInfo, label: string) {
    if (signing || offline || ro) return;
    if (!(await ask({ title: `ออกจากระบบ "${label}"?`, body: "เครื่องนั้นต้องเข้าสู่ระบบใหม่ · ข้อมูลของคุณไม่หาย", yes: "ออกจากระบบเครื่องนั้น", danger: true }))) return;
    setSigning(d.id);
    const done = await withToast(() => api.post(`/api/devices/${d.id}/signout`), "ออกจากระบบเครื่องนั้นไม่สำเร็จ");
    setSigning("");
    if (done) { ok("ออกจากระบบเครื่องนั้นแล้ว"); load(); }
  }
  function startRename(d: DeviceInfo) { setEditId(d.id); setNameDraft(d.name); setNameErr(""); }
  async function rename(d: DeviceInfo) {
    if (renaming || offline || ro) return;
    const name = cleanDeviceName(nameDraft);
    if (!name) { setNameErr(`ชื่อเครื่องต้องยาว 1–${DEVICE_NAME_MAX} ตัวอักษร`); return; }
    if (name === d.name) { setEditId(null); return; }
    setRenaming(true);
    try {
      await api.post(`/api/devices/${d.id}/rename`, { name });
      if (d.current) setDeviceName(name);
      setEditId(null);
      ok("เปลี่ยนชื่อเครื่องแล้ว");
      await load();
    } catch (e: any) {
      const m = e?.message || "เปลี่ยนชื่อเครื่องไม่สำเร็จ";
      setNameErr(m); err(m);
    } finally { setRenaming(false); }
  }

  return (
    <section class="card" aria-labelledby="se-dv">
      {askNode}
      <h2 id="se-dv" class="set-section-title"><Icon name="devices" /> อุปกรณ์ที่เข้าสู่ระบบ</h2>
      {devices === null && <div class="set-skel" aria-busy="true"><p role="status" class="page-sub">กำลังโหลดรายการเครื่อง…</p><span class="set-skel-bar" /><span class="set-skel-bar" /></div>}
      {loadFailed && (
        <div class="set-banner warn" role="alert">
          <Icon name="cloud-off" size={20} />
          <span class="grow">โหลดรายการเครื่องไม่สำเร็จ</span>
          <button onClick={load}>ลองอีกครั้ง</button>
        </div>
      )}
      {devices !== null && !loadFailed && devices.length === 0 && <p class="page-sub">ยังไม่มีรายการเครื่อง</p>}
      <ul class="set-list" style="list-style:none;margin:0;padding:0">
        {(devices ?? []).map((d, i) => {
          const label = deviceLabel(d.name, i, ro);
          return (
            <li class="set-row acct-dev" key={d.id}>
              <div class="row" style="gap:10px;min-width:0;flex:1 1 12em;align-items:flex-start"><Icon name="device-mobile" size={20} class="muted" />
                <div style="min-width:0;flex:1">
                  {editId === d.id && !ro ? (
                    <div>
                      <div class="acct-dev-edit">
                        <input value={nameDraft} maxLength={DEVICE_NAME_MAX} aria-label={`ชื่อเครื่อง ${d.name}`} autofocus aria-invalid={nameErr ? "true" : undefined} aria-describedby={nameErr ? "dv-e" : undefined}
                          onInput={(e) => { setNameDraft((e.target as HTMLInputElement).value); setNameErr(""); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(d); } else if (e.key === "Escape") { e.stopPropagation(); setEditId(null); } }} />
                        <button class="primary" onClick={() => rename(d)} disabled={renaming || offline || ro || !cleanDeviceName(nameDraft)}>บันทึกชื่อ</button>
                        <button onClick={() => setEditId(null)} disabled={renaming}>ยกเลิก</button>
                      </div>
                      {nameErr && <p id="dv-e" class="acct-err" role="alert"><Icon name="alert-triangle" size={16} /> {nameErr}</p>}
                    </div>
                  ) : (
                    <div class="acct-dev-name">{label} {d.current && <span class="chip" style="background:var(--bg-success);color:var(--text-success)"><Icon name="check" size={13} /> เครื่องนี้</span>}</div>
                  )}
                  <div class="page-sub">{d.user_agent ? describeAgent(d.user_agent) + " · " : ""}ใช้ล่าสุด {formatThaiDayMonthMs(d.last_seen)}</div>
                </div>
              </div>
              <div class="acct-dev-acts">
                {editId !== d.id && <button class="ghost" aria-label={`เปลี่ยนชื่อเครื่อง ${label}`} onClick={() => startRename(d)}><Icon name="pencil" size={16} /> เปลี่ยนชื่อ</button>}
                {!d.current && <button class="ghost" aria-label={`ออกจากระบบ ${label}`} onClick={() => signout(d, label)} disabled={offline || ro || signing === d.id}>ออกจากระบบ</button>}
                {!d.current && offline && <NeedOnline />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "ออกจากระบบเครื่องนี้" (P5): the same question as the menu — work still waiting on this device is named first. */
function SignOutThis() {
  const { ask, node } = useConfirm();
  async function go() {
    const parts = [
      pendingCount.value > 0 && `คะแนน/การส่งงานรอส่ง ${pendingCount.value} รายการ`,
      failedCount.value > 0 && `ส่งไม่สำเร็จ ${failedCount.value} รายการ`,
      attDraftCount.value > 0 && `เช็คชื่อที่ยังไม่ได้ส่ง ${attDraftCount.value} รายการ`,
    ].filter(Boolean) as string[];
    const yes = await ask({
      title: "ออกจากระบบเลยไหม?",
      body: parts.length
        ? <><p style="margin:0 0 6px">ยังมีข้อมูลค้างในเครื่องนี้:</p><ul style="margin:0 0 6px;padding-left:1.2em">{parts.map((p) => <li>{p}</li>)}</ul><p style="margin:0">จะเก็บไว้และส่งให้เมื่อเข้าสู่ระบบใหม่</p></>
        : "เครื่องนี้จะกลับไปหน้าเข้าสู่ระบบ",
      yes: "ออกจากระบบ", no: "อยู่ต่อ", danger: true,
    });
    if (yes) await logout();
  }
  return (
    <section class="card" aria-labelledby="se-so">
      {node}
      <h2 id="se-so" class="set-section-title"><Icon name="logout" /> ออกจากระบบเครื่องนี้</h2>
      <div class="set-row">
        <div class="set-l"><div class="page-sub">เมื่อใช้เครื่องร่วมกับผู้อื่น ควรออกจากระบบทุกครั้งที่ใช้เสร็จ</div></div>
        <div class="set-r"><button onClick={go}><Icon name="logout" size={20} /> ออกจากระบบเครื่องนี้</button></div>
      </div>
    </section>
  );
}

/** บัญชีและอุปกรณ์ (P5): e-mail (read only), password, devices, sign out of this device. 🔐 the server decides; nothing here changes who may do what. */
export function AccountSection() {
  return (
    <>
      <section class="card" aria-labelledby="se-ph">
        <h2 id="se-ph" class="set-section-title"><Icon name="key" /> บัญชีและรหัสผ่าน</h2>
        <EmailRow />
        <ChangePassword />
      </section>
      <DeviceList />
      <SignOutThis />
    </>
  );
}
