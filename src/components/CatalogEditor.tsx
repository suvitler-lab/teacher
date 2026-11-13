import { useEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import "../styles/settings-catalog.css";
import { Icon } from "./Icon";
import { useConfirm, type AskOptions } from "./ConfirmDialog";
import { classes, subjects, workTypes, terms, currentTerm, currentTermId, assignments, studentsByClass, startTermOpen, loadBootstrap } from "../store";
import type { Class, Subject, Term, WorkType } from "@shared/types";
import { api } from "../lib/api";
import { ok, err, notify } from "../lib/notify";
import { DateField } from "./ui";
import { useOffline, useReadOnly } from "./settings/sections/shared";
import { termLine } from "./settings/SettingsCards";

export type CatalogEditorTab = "classes" | "subjects" | "terms";
const TABS: { key: CatalogEditorTab; label: string }[] = [
  { key: "classes", label: "ห้องเรียน" },
  { key: "subjects", label: "วิชา" },
  { key: "terms", label: "ภาคเรียน" },
];

const COLORS = ["blue", "aqua", "violet", "orange", "green", "magenta", "red"];
const COLOR_TH: Record<string, string> = { blue: "น้ำเงิน", aqua: "ฟ้า", violet: "ม่วง", orange: "ส้ม", green: "เขียว", magenta: "ชมพู", red: "แดง" };

/** Spoken to screen readers (role=status) after a change that has no other sign on screen. */
const announce = signal("");

/**
 * One write at a time for the whole catalog: a second tap (or a quick Enter) while a request is on its way does nothing, and
 * an old answer can never land after a newer request. Every write button is switched off while it is held (AC-222, data-integrity).
 */
const writing = signal(false);
async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (writing.value) return undefined;
  writing.value = true;
  try { return await fn(); } finally { writing.value = false; }
}
const refresh = () => loadBootstrap().catch(() => {});

interface SaveResult { ok: boolean; dup?: string }

/**
 * Save one row. A name that is already taken (server 409 duplicate_name) comes back as `dup` — the server's own Thai sentence,
 * for the caller to put under the name field; the form stays open. Any other failure is a toast with the editor's own words.
 */
async function saveTo(endpoint: string, body: unknown, failMsg: string, okMsg = "บันทึกแล้ว"): Promise<SaveResult> {
  const r = await guarded(async (): Promise<SaveResult> => {
    try {
      await api.post(endpoint, body);
    } catch (e: any) {
      if (e?.code === "duplicate_name" && e.message) return { ok: false, dup: e.message };
      err(failMsg);
      return { ok: false };
    }
    await refresh();
    if (okMsg) ok(okMsg);
    return { ok: true };
  });
  return r ?? { ok: false };
}

/**
 * Move a row up/down (BR-54). The order is the `sort` column: swap with the neighbour in the visible active list, number the list
 * 1..n and write only the rows whose number changed. If a write fails the true order is loaded again and the teacher is told the old order stands.
 */
async function reorder<T extends { id: string; sort: number; name: string }>(
  endpoint: string, list: T[], i: number, dir: -1 | 1, toBody: (x: T, sort: number) => unknown, failMsg: string,
) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const order = [...list];
  [order[i], order[j]] = [order[j], order[i]];
  const changes = order.map((x, idx) => ({ x, sort: idx + 1 })).filter((c) => c.x.sort !== c.sort);
  const moved = list[i];
  const done = await guarded(async () => {
    let good = true;
    try { for (const c of changes) await api.post(endpoint, toBody(c.x, c.sort)); }
    catch { good = false; err(`${failMsg} — ลำดับเดิมยังอยู่`); }
    await refresh();
    return good;
  });
  if (done) announce.value = `ย้าย ${moved.name} ${dir < 0 ? "ขึ้น" : "ลง"} เป็นลำดับที่ ${j + 1}`;
  // the row moved in the list: keep the keyboard on its button (or on the other arrow when it reached an end)
  setTimeout(() => {
    const q = (d: number) => document.querySelector<HTMLElement>(`[data-mv="${moved.id}:${d}"]:not([disabled])`);
    (q(dir) ?? q(-dir))?.focus();
  }, 0);
}

function FieldErr({ id, msg }: { id: string; msg?: string }) {
  return msg ? <div id={id} role="alert" class="cat-err"><Icon name="alert-triangle" size={14} /> {msg}</div> : null;
}

const FALLBACK = '.cat-add input, .cat-addbox input, [role="tab"][aria-selected="true"]';
const rowSel = (id?: string) => (id ? `[data-row="${id}"] [data-trigger]` : FALLBACK);
/** Put the keyboard somewhere sensible once a write has changed the list (a button that was switched off or removed loses it). */
function focusSoon(sel: string) {
  setTimeout(() => { (document.querySelector<HTMLElement>(sel) ?? document.querySelector<HTMLElement>(FALLBACK))?.focus(); }, 40);
}

/** True on a phone narrower than 480px (AC-246): the row buttons fold into a menu there. */
function useNarrow(): boolean {
  const q = typeof matchMedia === "function" ? matchMedia("(max-width: 479px)") : null;
  const [n, setN] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const f = () => setN(q.matches);
    q.addEventListener?.("change", f);
    return () => q.removeEventListener?.("change", f);
  }, []);
  return n;
}

/** `แก้ไข` + `เก็บ` on the row; < 480px one 44px menu button "จัดการ {ชื่อ}" with the same two items (Esc closes it and gives the focus back). Up/down stay on the row. */
function RowActions({ label, editRef, editing, lock, onEdit, onArchive }: {
  label: string; editRef: { current: HTMLButtonElement | null }; editing: boolean; lock: boolean; onEdit: () => void; onArchive: () => void;
}) {
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); editRef.current?.focus(); } };
    document.addEventListener("keydown", key, true);
    menu.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => document.removeEventListener("keydown", key, true);
  }, [open]);
  if (!narrow) {
    return <>
      <button ref={editRef} data-trigger class="cat-btn" aria-expanded={editing} onClick={onEdit}>แก้ไข</button>
      <button class="cat-btn" disabled={lock} onClick={onArchive}>เก็บ</button>
    </>;
  }
  return (
    <span class="cat-menu">
      <button ref={editRef} data-trigger class="icon ghost cat-more" aria-label={`จัดการ ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name="dots-vertical" size={20} /></button>
      {open && (<>
        <div class="cat-menu-back" onClick={() => { setOpen(false); editRef.current?.focus(); }} />
        <div class="cat-pop" role="menu" aria-label={`จัดการ ${label}`} ref={menu}>
          <button role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>แก้ไข</button>
          <button role="menuitem" disabled={lock} onClick={() => { setOpen(false); editRef.current?.focus(); onArchive(); }}>เก็บ</button>
        </div>
      </>)}
    </span>
  );
}

/** Round colour buttons with the colour's name as the accessible name; a radiogroup, left/right arrows pick (AC-230). */
function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  function key(e: KeyboardEvent) {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = COLORS[(COLORS.indexOf(value) + d + COLORS.length) % COLORS.length];
    onChange(n);
    setTimeout(() => box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(), 0);
  }
  return (
    <div class="cat-colors" role="radiogroup" aria-label={label} ref={box} onKeyDown={key}>
      {COLORS.map((c) => (
        <button type="button" role="radio" aria-checked={c === value} aria-label={COLOR_TH[c]} title={COLOR_TH[c]} tabIndex={c === value ? 0 : -1}
          class={"cat-sw " + c + (c === value ? " on" : "")} onClick={() => onChange(c)}>
          {c === value && <Icon name="check" size={18} />}
        </button>
      ))}
      <span class="page-sub cat-colorname">{COLOR_TH[value] ?? value}</span>
    </div>
  );
}

function MoveButtons({ id, i, n, label, move, off }: { id: string; i: number; n: number; label: string; move: (dir: -1 | 1) => void; off: boolean }) {
  const lock = off || writing.value;
  return (
    <span class="row cat-move">
      <button class="icon ghost" data-mv={`${id}:-1`} aria-label={`เลื่อน ${label} ขึ้น`} title="เลื่อนขึ้น" disabled={i === 0 || lock} onClick={() => move(-1)}><Icon name="chevron-up" size={16} /></button>
      <button class="icon ghost" data-mv={`${id}:1`} aria-label={`เลื่อน ${label} ลง`} title="เลื่อนลง" disabled={i === n - 1 || lock} onClick={() => move(1)}><Icon name="chevron-down" size={16} /></button>
    </span>
  );
}

function OfflineNote({ off }: { off: boolean }) {
  return off ? <div class="page-sub cat-offline" role="status"><Icon name="alert-triangle" size={14} /> ต้องออนไลน์ — เพิ่ม แก้ไข เก็บ และจัดลำดับได้เมื่อเชื่อมต่อ</div> : null;
}

type Ask = (o: AskOptions) => Promise<boolean>;
const ROW = "cat-row";

/* ---------- editor with tabs ---------- */

/** ห้องเรียน · วิชา · ภาคเรียน. `initialTab` (from `?tab=`) picks the tab to open; changing it while open moves to that tab. */
export function CatalogEditor({ initialTab }: { initialTab?: CatalogEditorTab }) {
  const [tab, setTab] = useState<CatalogEditorTab>(initialTab ?? "classes");
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const bar = useRef<HTMLDivElement>(null);
  function key(e: KeyboardEvent) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = TABS[(TABS.findIndex((t) => t.key === tab) + d + TABS.length) % TABS.length].key;
    setTab(n);
    setTimeout(() => bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(), 0);
  }
  return (
    <div>
      <div class="stu-tabs cat-tabs" role="tablist" aria-label="ห้องเรียน วิชา ภาคเรียน" ref={bar} onKeyDown={key}>
        {TABS.map((t) => (
          <button role="tab" id={`cat-tab-${t.key}`} aria-selected={t.key === tab} aria-controls="cat-panel" tabIndex={t.key === tab ? 0 : -1}
            class={"stu-tab cat-tab " + (t.key === tab ? "on" : "")} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <div id="cat-panel" role="tabpanel" aria-labelledby={`cat-tab-${tab}`}>
        {tab === "classes" && <ClassEditor />}
        {tab === "subjects" && <SubjectEditor />}
        {tab === "terms" && <TermEditor />}
      </div>
      <div class="sr-only" role="status">{announce.value}</div>
    </div>
  );
}

/* ---------- classes ---------- */

const gradeOf = (name: string) => (name.includes("/") ? name.split("/")[0].trim() : "");

function ClassRow({ c, i, n, move, ask, off, next }: { c: Class; i: number; n: number; move: (dir: -1 | 1) => void; ask: Ask; off: boolean; next?: string }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(c.name);
  const [dup, setDup] = useState("");
  const editBtn = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (edit) nameRef.current?.focus(); }, [edit]); // opening the editor puts the keyboard in the name field
  useEffect(() => { if (dup) nameRef.current?.focus(); }, [dup]); // a taken name (409): back to the field it is about
  const body = (over: Record<string, unknown>) => ({ id: c.id, name: c.name, grade: c.grade, sort: c.sort, archived: c.archived, ...over });
  const nm = name.trim();
  const count = studentsByClass.value.get(c.id)?.length ?? 0;
  const lock = off || writing.value;
  const grade = gradeOf(nm);
  const close = () => { setEdit(false); setDup(""); setTimeout(() => editBtn.current?.focus(), 0); };
  async function archive() {
    const yes = await ask({
      title: `เก็บห้อง ${c.name}?`, yes: "เก็บห้อง",
      body: <>ห้องนี้จะหายจากรายการห้องในหน้าเช็คชื่อและสแกน · นักเรียน {count} คน คะแนน และเช็คชื่อยังอยู่ครบ · นำกลับได้ภายหลังจากพับ “เก็บไว้”</>,
    });
    if (yes && (await saveTo("/api/classes", body({ archived: true }), "บันทึกห้องไม่สำเร็จ")).ok) focusSoon(rowSel(next)); // the row is gone: next row, else the add field
  }
  return (
    <div class={ROW} data-row={c.id}>
      <div class="row cat-line">
        <MoveButtons id={c.id} i={i} n={n} label={c.name} move={move} off={off} />
        <span class="grow cat-name">{c.name} <span class="page-sub">· ปีการศึกษา {c.year ?? "—"} · {count} คน</span></span>
        <RowActions label={c.name} editRef={editBtn} editing={edit} lock={lock} onArchive={archive} onEdit={() => { setName(c.name); setDup(""); setEdit((v) => !v); }} />
      </div>
      {edit && (
        <div class="cat-edit" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <div class="row cat-fields">
            <input value={name} aria-label={`ชื่อห้อง ${c.name}`} aria-invalid={!!dup || !nm} aria-describedby={`ce-${c.id}-e ce-${c.id}-g`} ref={nameRef}
              onInput={(e) => { setName((e.target as HTMLInputElement).value); setDup(""); }} class="cat-grow"
              onKeyDown={(e) => { if (e.key === "Enter" && nm && nm !== c.name && !lock) (e.currentTarget.parentElement?.querySelector(".primary") as HTMLButtonElement | null)?.click(); }} />
            <button class="primary cat-btn" disabled={!nm || nm === c.name || lock}
              onClick={async () => { const r = await saveTo("/api/classes", body({ name: nm, grade: grade || c.grade }), "บันทึกห้องไม่สำเร็จ"); if (r.dup) setDup(r.dup); else if (r.ok) close(); }}>บันทึก</button>
            <button class="cat-btn" onClick={close}>ยกเลิก</button>
          </div>
          <div id={`ce-${c.id}-g`} class="page-sub">{grade ? `ระดับชั้น: ${grade}` : "ระดับชั้นดูจากส่วนหน้าเครื่องหมาย “/” เช่น ป.6/3 = ป.6"}</div>
          <FieldErr id={`ce-${c.id}-e`} msg={dup || (!nm ? "ใส่ชื่อห้อง เช่น ป.6/3" : "")} />
        </div>
      )}
    </div>
  );
}

function ClassEditor() {
  const { ask, node } = useConfirm();
  const off0 = useOffline();
  const ro = useReadOnly();
  const off = off0 || ro; // while projecting nothing writes (AC-248) - not left to the page-level observer
  const [name, setName] = useState("");
  const [dup, setDup] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // A class belongs to one academic year. Last year's classes (closed when the new year started) are kept
  // for the reports and can't be brought back — a new year gets new classes.
  const year = currentTerm.value?.year;
  const isPast = (c: { year: number | null }) => year != null && c.year != null && c.year < year;
  const now = classes.value.filter((c) => !isPast(c));
  const active = now.filter((c) => !c.archived);
  const kept = now.filter((c) => c.archived);
  const past = classes.value.filter(isPast);
  const nm = name.trim();
  const lock = off || writing.value;
  const empty = active.length === 0 && kept.length === 0;
  useEffect(() => { if (empty && !ro) input.current?.focus(); }, [empty]);
  async function add() {
    if (!nm || lock) return;
    const r = await saveTo("/api/classes", { name: nm, grade: gradeOf(nm) || nm.split("/")[0], sort: Math.max(0, ...now.map((c) => c.sort)) + 10 }, "บันทึกห้องไม่สำเร็จ", "");
    if (r.dup) { setDup(r.dup); input.current?.focus(); return; }
    if (r.ok) { ok(`เพิ่มห้อง ${nm} แล้ว`); announce.value = `เพิ่มห้อง ${nm} แล้ว`; setName(""); setDup(""); input.current?.focus(); }
  }
  const mv = (i: number, dir: -1 | 1) => reorder<Class>("/api/classes", active, i, dir, (c, sort) => ({ id: c.id, name: c.name, grade: c.grade, sort, archived: c.archived }), "จัดลำดับห้องไม่สำเร็จ");
  return (
    <div>
      <OfflineNote off={off0} />
      {empty && (
        <div class="cat-empty"><b>ยังไม่มีห้องเรียนในปีการศึกษา {year ?? "—"}</b><div class="page-sub">เพิ่มห้องก่อน แล้วค่อยนำเข้านักเรียน</div></div>
      )}
      {active.map((c, i) => <ClassRow key={c.id} c={c} next={(active[i + 1] ?? active[i - 1])?.id} i={i} n={active.length} move={(d) => mv(i, d)} ask={ask} off={off} />)}
      {kept.length > 0 && (
        <details class="cat-fold">
          <summary class="page-sub">เก็บไว้ ({kept.length})</summary>
          {kept.map((c) => <RestoreRow key={c.id} id={c.id} label={c.name} sub={`ปีการศึกษา ${c.year ?? "—"} · ${studentsByClass.value.get(c.id)?.length ?? 0} คน`} what="ห้อง" off={off}
            restore={() => saveTo("/api/classes", { id: c.id, name: c.name, grade: c.grade, sort: c.sort, archived: false }, "บันทึกห้องไม่สำเร็จ")} />)}
        </details>
      )}
      {past.length > 0 && (
        <details class="cat-fold">
          <summary class="page-sub">ห้องของปีที่ผ่านมา ({past.length}) — เก็บไว้ดูรายงานย้อนหลัง</summary>
          <div class="page-sub cat-note">ห้องของปีก่อนนำกลับไม่ได้ — ปีใหม่ได้ห้องใหม่ชื่อเดิม</div>
          {past.map((c) => (
            <div class={ROW}><span class="cat-name">{c.name} <span class="page-sub">· ปีการศึกษา {c.year} · จบปีการศึกษา · อ่านอย่างเดียว</span></span></div>
          ))}
        </details>
      )}
      <div class="row cat-add">
        <input ref={input} placeholder="เพิ่มห้อง เช่น ป.6/3" aria-label="ชื่อห้องใหม่" value={name} aria-invalid={!!dup} aria-describedby="ca-e"
          onInput={(e) => { setName((e.target as HTMLInputElement).value); setDup(""); }} onKeyDown={(e) => { if (e.key === "Enter") add(); }} class="cat-grow" />
        <button class="primary" disabled={!nm || lock} onClick={add}><Icon name="plus" size={16} /> {empty ? "เพิ่มห้องแรก" : "เพิ่ม"}</button>
        {off0 && <span class="page-sub">ต้องออนไลน์</span>}
      </div>
      <FieldErr id="ca-e" msg={dup} />
      {node}
    </div>
  );
}

/** A kept row in the "เก็บไว้" fold: `นำกลับ`; a name that is active again (409) is told under the row. */
function RestoreRow({ id, label, sub, what, restore, off }: { id: string; label: string; sub?: string; what: string; restore: () => Promise<SaveResult>; off: boolean }) {
  const [dup, setDup] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div class={ROW}>
      <div class="row cat-line">
        <span class="grow cat-name">{label} <span class="page-sub">{sub ? `· ${sub} ` : ""}· เก็บแล้ว</span></span>
        <button ref={btn} class="cat-btn" disabled={off || writing.value} aria-label={`นำกลับ${what} ${label}`}
          onClick={async () => { const r = await restore(); setDup(r.dup ?? ""); if (r.ok) focusSoon(rowSel(id)); else setTimeout(() => btn.current?.focus(), 0); }}>นำกลับ</button>
      </div>
      <FieldErr id={`rs-${id}`} msg={dup} />
    </div>
  );
}

/* ---------- subjects ---------- */

/** Tasks of the current term that use this subject / work type (BR-61, SGQ5); "—" with no current term. */
const workCount = (field: "subject_id" | "type_id", id: string): string => {
  if (!currentTermId.value) return "—";
  return `${assignments.value.filter((a) => a.term_id === currentTermId.value && a[field] === id).length} งาน`;
};

function SubjectRow({ s, i, n, move, ask, off, next }: { s: Subject; i: number; n: number; move: (dir: -1 | 1) => void; ask: Ask; off: boolean; next?: string }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(s.name);
  const [code, setCode] = useState(s.code ?? "");
  const [color, setColor] = useState(s.color);
  const [dup, setDup] = useState("");
  const editBtn = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (edit) nameRef.current?.focus(); }, [edit]); // opening the editor puts the keyboard in the name field
  useEffect(() => { if (dup) nameRef.current?.focus(); }, [dup]); // a taken name (409): back to the field it is about
  const body = (over: Record<string, unknown>) => ({ id: s.id, code: s.code, name: s.name, color: s.color, sort: s.sort, archived: s.archived, ...over });
  const nm = name.trim();
  const codeBad = code.trim().length > 30;
  const changed = nm !== s.name || code.trim() !== (s.code ?? "") || color !== s.color;
  const lock = off || writing.value;
  const close = () => { setEdit(false); setDup(""); setTimeout(() => editBtn.current?.focus(), 0); };
  async function archive() {
    const yes = await ask({
      title: `เก็บวิชา ${s.name}?`, yes: "เก็บวิชา",
      body: <>วิชานี้จะไม่ขึ้นตอนสร้างงานใหม่ · งานและคะแนนเดิมยังอยู่ครบ ({workCount("subject_id", s.id)} ในภาคเรียนนี้) · นำกลับได้ภายหลังจากพับ “เก็บไว้”</>,
    });
    if (yes && (await saveTo("/api/subjects", body({ archived: true }), "บันทึกวิชาไม่สำเร็จ")).ok) focusSoon(rowSel(next)); // the row is gone: next row, else the add field
  }
  return (
    <div class={ROW} data-row={s.id}>
      <div class="row cat-line">
        <MoveButtons id={s.id} i={i} n={n} label={s.name} move={move} off={off} />
        <span class={"chip " + s.color}>{s.name}</span>
        <span class="grow page-sub">{s.code ? `${s.code} · ` : ""}{workCount("subject_id", s.id)}</span>
        <RowActions label={s.name} editRef={editBtn} editing={edit} lock={lock} onArchive={archive} onEdit={() => { setName(s.name); setCode(s.code ?? ""); setColor(s.color); setDup(""); setEdit((v) => !v); }} />
      </div>
      {edit && (
        <div class="cat-edit" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <div class="row cat-fields">
            <input value={name} aria-label={`ชื่อวิชา ${s.name}`} aria-invalid={!!dup || !nm} aria-describedby={`se-${s.id}-e`} ref={nameRef} class="cat-grow"
              onInput={(e) => { setName((e.target as HTMLInputElement).value); setDup(""); }} />
            <input value={code} aria-label={`รหัสวิชา ${s.name}`} placeholder="รหัส" maxLength={40} aria-invalid={codeBad} aria-describedby={`sc-${s.id}-e`} onInput={(e) => setCode((e.target as HTMLInputElement).value)} class="cat-code" />
          </div>
          <ColorPicker value={color} onChange={setColor} label={`สีของ ${s.name}`} />
          <FieldErr id={`se-${s.id}-e`} msg={dup || (!nm ? "ใส่ชื่อวิชา" : "")} />
          <FieldErr id={`sc-${s.id}-e`} msg={codeBad ? "รหัสวิชาต้องไม่เกิน 30 ตัวอักษร" : ""} />
          <div class="row cat-fields">
            <button class="primary cat-btn" disabled={!nm || codeBad || !changed || lock}
              onClick={async () => { const r = await saveTo("/api/subjects", body({ name: nm, code: code.trim() || null, color }), "บันทึกวิชาไม่สำเร็จ"); if (r.dup) setDup(r.dup); else if (r.ok) close(); }}>บันทึก</button>
            <button class="cat-btn" onClick={close}>ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectEditor() {
  const { ask, node } = useConfirm();
  const off0 = useOffline();
  const ro = useReadOnly();
  const off = off0 || ro; // while projecting nothing writes (AC-248)
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("blue");
  const [dup, setDup] = useState("");
  const list = subjects.value.filter((s) => !s.archived);
  const kept = subjects.value.filter((s) => s.archived);
  const nm = name.trim();
  const codeBad = code.trim().length > 30;
  const lock = off || writing.value;
  async function add() {
    if (!nm || codeBad || lock) return;
    const r = await saveTo("/api/subjects", { name: nm, code: code.trim() || null, color, sort: (list.length + 1) * 10 }, "บันทึกวิชาไม่สำเร็จ");
    if (r.dup) setDup(r.dup);
    else if (r.ok) { setName(""); setCode(""); setDup(""); }
    focusSoon('input[aria-label="ชื่อวิชาใหม่"]');
  }
  const mv = (i: number, dir: -1 | 1) => reorder<Subject>("/api/subjects", list, i, dir, (s, sort) => ({ id: s.id, code: s.code, name: s.name, color: s.color, sort, archived: s.archived }), "จัดลำดับวิชาไม่สำเร็จ");
  return (
    <div>
      <OfflineNote off={off0} />
      {list.length === 0 && kept.length === 0 && <div class="cat-empty"><b>ยังไม่มีวิชา</b><div class="page-sub">เพิ่มวิชาที่สอน เช่น คณิตศาสตร์ เพื่อสร้างงานได้</div></div>}
      {list.map((s, i) => <SubjectRow key={s.id} s={s} next={(list[i + 1] ?? list[i - 1])?.id} i={i} n={list.length} move={(d) => mv(i, d)} ask={ask} off={off} />)}
      {kept.length > 0 && (
        <details class="cat-fold">
          <summary class="page-sub">เก็บไว้ ({kept.length})</summary>
          {kept.map((s) => <RestoreRow key={s.id} id={s.id} label={s.name} sub={s.code ?? undefined} what="วิชา" off={off}
            restore={() => saveTo("/api/subjects", { id: s.id, code: s.code, name: s.name, color: s.color, sort: s.sort, archived: false }, "บันทึกวิชาไม่สำเร็จ")} />)}
        </details>
      )}
      <div class="cat-addbox">
        <div class="row cat-fields">
          <input placeholder="ชื่อวิชา" aria-label="ชื่อวิชาใหม่" value={name} aria-invalid={!!dup} aria-describedby="sa-e" onInput={(e) => { setName((e.target as HTMLInputElement).value); setDup(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} class="cat-grow" />
          <input placeholder="รหัส (เช่น ว16101)" aria-label="รหัสวิชาใหม่" value={code} aria-invalid={codeBad} onInput={(e) => setCode((e.target as HTMLInputElement).value)} class="cat-code" />
        </div>
        <ColorPicker value={color} onChange={setColor} label="สีของวิชาใหม่" />
        <FieldErr id="sa-e" msg={dup || (codeBad ? "รหัสวิชาต้องไม่เกิน 30 ตัวอักษร" : "")} />
        <div class="row cat-fields"><button class="primary" disabled={!nm || codeBad || lock} onClick={add}><Icon name="plus" size={16} /> เพิ่ม</button>{off0 && <span class="page-sub">ต้องออนไลน์</span>}</div>
      </div>
      {node}
    </div>
  );
}

/* ---------- work types (its own section: WorktypesSection) ---------- */

/** A default full score is a whole number 1–100 (what the assignment form and the API accept). */
const validFull = (v: string) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100;
const FULL_ERR = "คะแนนเต็มต้องเป็นเลข 1–100";

function TypeRow({ w, i, n, move, ask, off, next }: { w: WorkType; i: number; n: number; move: (dir: -1 | 1) => void; ask: Ask; off: boolean; next?: string }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(w.name);
  const [color, setColor] = useState(w.color);
  const [full, setFull] = useState(String(w.default_full));
  const [isExam, setIsExam] = useState(w.is_exam);
  const [dup, setDup] = useState("");
  const editBtn = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (edit) nameRef.current?.focus(); }, [edit]); // opening the editor puts the keyboard in the name field
  useEffect(() => { if (dup) nameRef.current?.focus(); }, [dup]); // a taken name (409): back to the field it is about
  const body = (over: Record<string, unknown>) => ({ id: w.id, name: w.name, icon: w.icon, color: w.color, is_exam: w.is_exam, default_full: w.default_full, sort: w.sort, archived: w.archived, ...over });
  const nm = name.trim();
  const changed = nm !== w.name || color !== w.color || Number(full) !== w.default_full || isExam !== w.is_exam;
  const lock = off || writing.value;
  const close = () => { setEdit(false); setDup(""); setTimeout(() => editBtn.current?.focus(), 0); };
  async function archive() {
    const yes = await ask({
      title: `เก็บประเภทงาน ${w.name}?`, yes: "เก็บประเภทงาน",
      body: <>ประเภทงานนี้จะไม่ขึ้นตอนสร้างงานใหม่ · งานและคะแนนเดิมยังอยู่ครบ ({workCount("type_id", w.id)} ในภาคเรียนนี้) · นำกลับได้ภายหลังจากพับ “เก็บไว้”</>,
    });
    if (yes && (await saveTo("/api/work-types", body({ archived: true }), "บันทึกประเภทงานไม่สำเร็จ")).ok) focusSoon(rowSel(next)); // the row is gone: next row, else the add field
  }
  return (
    <div class={ROW} data-row={w.id}>
      <div class="row cat-line">
        <MoveButtons id={w.id} i={i} n={n} label={w.name} move={move} off={off} />
        <span class={"chip " + w.color}>{w.name}</span>
        <span class="grow page-sub">เต็ม {w.default_full}{w.is_exam ? " · สอบ" : ""} · {workCount("type_id", w.id)}</span>
        <RowActions label={w.name} editRef={editBtn} editing={edit} lock={lock} onArchive={archive} onEdit={() => { setName(w.name); setColor(w.color); setFull(String(w.default_full)); setIsExam(w.is_exam); setDup(""); setEdit((v) => !v); }} />
      </div>
      {edit && (
        <div class="cat-edit" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <div class="row cat-fields">
            <input value={name} aria-label={`ชื่อประเภทงาน ${w.name}`} aria-invalid={!!dup || !nm} aria-describedby={`te-${w.id}-e`} ref={nameRef} class="cat-grow"
              onInput={(e) => { setName((e.target as HTMLInputElement).value); setDup(""); }} />
            <label class="row page-sub cat-full">คะแนนเต็มเริ่มต้น
              <input type="number" min={1} max={100} value={full} aria-label={`คะแนนเต็มเริ่มต้นของ ${w.name}`} aria-invalid={!validFull(full)} aria-describedby={`tf-${w.id}-e tf-${w.id}-h`} onInput={(e) => setFull((e.target as HTMLInputElement).value)} class="cat-num" />
            </label>
          </div>
          <ColorPicker value={color} onChange={setColor} label={`สีของ ${w.name}`} />
          <label class="row page-sub cat-check"><input type="checkbox" checked={isExam} onChange={(e) => setIsExam((e.target as HTMLInputElement).checked)} /> เป็นการสอบ</label>
          <div id={`tf-${w.id}-h`} class="page-sub">คะแนนเต็มเริ่มต้นใช้กับงานที่สร้างใหม่เท่านั้น — งานที่มีอยู่ไม่เปลี่ยน</div>
          <FieldErr id={`te-${w.id}-e`} msg={dup || (!nm ? "ใส่ชื่อประเภทงาน" : "")} />
          <FieldErr id={`tf-${w.id}-e`} msg={validFull(full) ? "" : FULL_ERR} />
          <div class="row cat-fields">
            <button class="primary cat-btn" disabled={!nm || !validFull(full) || !changed || lock}
              onClick={async () => { const r = await saveTo("/api/work-types", body({ name: nm, color, default_full: Number(full), is_exam: isExam }), "บันทึกประเภทงานไม่สำเร็จ"); if (r.dup) setDup(r.dup); else if (r.ok) close(); }}>บันทึก</button>
            <button class="cat-btn" onClick={close}>ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ประเภทงาน — add / edit / order / keep; there is no delete (AC-234). */
export function TypeEditor() {
  const { ask, node } = useConfirm();
  const off0 = useOffline();
  const ro = useReadOnly();
  const off = off0 || ro; // while projecting nothing writes (AC-248)
  const [name, setName] = useState("");
  const [color, setColor] = useState("violet");
  const [full, setFull] = useState("10");
  const [isExam, setIsExam] = useState(false);
  const [dup, setDup] = useState("");
  const list = workTypes.value.filter((w) => !w.archived);
  const kept = workTypes.value.filter((w) => w.archived);
  const nm = name.trim();
  const lock = off || writing.value;
  async function add() {
    if (!nm || !validFull(full) || lock) return;
    const r = await saveTo("/api/work-types", { name: nm, icon: "file-text", color, is_exam: isExam, default_full: Number(full), sort: (list.length + 1) * 10 }, "บันทึกประเภทงานไม่สำเร็จ");
    if (r.dup) setDup(r.dup);
    else if (r.ok) { setName(""); setDup(""); setIsExam(false); }
    focusSoon('input[aria-label="ชื่อประเภทงานใหม่"]');
  }
  const mv = (i: number, dir: -1 | 1) => reorder<WorkType>("/api/work-types", list, i, dir,
    (w, sort) => ({ id: w.id, name: w.name, icon: w.icon, color: w.color, is_exam: w.is_exam, default_full: w.default_full, sort, archived: w.archived }), "จัดลำดับประเภทงานไม่สำเร็จ");
  return (
    <div>
      <OfflineNote off={off0} />
      {list.length === 0 && kept.length === 0 && <div class="cat-empty"><b>ยังไม่มีประเภทงาน</b><div class="page-sub">เพิ่มประเภทงาน เช่น ใบงาน การบ้าน สอบ เพื่อสร้างงานได้</div></div>}
      {list.map((w, i) => <TypeRow key={w.id} w={w} next={(list[i + 1] ?? list[i - 1])?.id} i={i} n={list.length} move={(d) => mv(i, d)} ask={ask} off={off} />)}
      {kept.length > 0 && (
        <details class="cat-fold">
          <summary class="page-sub">เก็บไว้ ({kept.length})</summary>
          {kept.map((w) => <RestoreRow key={w.id} id={w.id} label={w.name} sub={`เต็ม ${w.default_full}`} what="ประเภทงาน" off={off}
            restore={() => saveTo("/api/work-types", { id: w.id, name: w.name, icon: w.icon, color: w.color, is_exam: w.is_exam, default_full: w.default_full, sort: w.sort, archived: false }, "บันทึกประเภทงานไม่สำเร็จ")} />)}
        </details>
      )}
      <div class="cat-addbox">
        <div class="row cat-fields">
          <input placeholder="เพิ่มประเภทงาน" aria-label="ชื่อประเภทงานใหม่" value={name} aria-invalid={!!dup} aria-describedby="ta-e" onInput={(e) => { setName((e.target as HTMLInputElement).value); setDup(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} class="cat-grow" />
          <label class="row page-sub cat-full">เต็ม
            <input type="number" min={1} max={100} value={full} aria-label="คะแนนเต็มเริ่มต้นของประเภทใหม่" aria-invalid={!validFull(full)} aria-describedby="tn-e" onInput={(e) => setFull((e.target as HTMLInputElement).value)} class="cat-num" />
          </label>
        </div>
        <ColorPicker value={color} onChange={setColor} label="สีของประเภทงานใหม่" />
        <label class="row page-sub cat-check"><input type="checkbox" checked={isExam} onChange={(e) => setIsExam((e.target as HTMLInputElement).checked)} /> เป็นการสอบ</label>
        <FieldErr id="ta-e" msg={dup} />
        <FieldErr id="tn-e" msg={validFull(full) ? "" : FULL_ERR} />
        <div class="row cat-fields">
          <button class="primary" disabled={!nm || !validFull(full) || lock} onClick={add}><Icon name="plus" size={16} /> เพิ่ม</button>
          {off0 && <span class="page-sub">ต้องออนไลน์</span>}
        </div>
      </div>
      {node}
    </div>
  );
}

/* ---------- terms ---------- */

const termBody = (t: Term, over: Record<string, unknown> = {}) => ({ id: t.id, year: t.year, term: t.term, name: t.name, start_date: t.start_date, end_date: t.end_date, is_current: t.is_current, ...over });

function TermRow({ t, ask, off, readOnlyYear }: { t: Term; ask: Ask; off: boolean; readOnlyYear: boolean }) {
  const [start, setStart] = useState(t.start_date ?? "");
  const [end, setEnd] = useState(t.end_date ?? "");
  const [editing, setEditing] = useState(false);
  const [termNo, setTermNo] = useState(t.term);
  const [name, setName] = useState(t.name);
  const [msg, setMsg] = useState("");
  const cur = currentTerm.value;
  const lock = off || writing.value;
  // switching between the terms of the SAME academic year is one tap; another year needs "เริ่มภาคเรียนใหม่" (BR-55)
  const canSwitch = !readOnlyYear && !t.is_current && !!cur && t.year === cur.year;
  const changed = start !== (t.start_date ?? "") || end !== (t.end_date ?? "") || termNo !== t.term || name.trim() !== t.name;
  // the school year can't change here (classes are filed under it); the term number and name can
  function pickTerm(n: number) {
    // keep an automatic name ("2/2569") in step with the number; a name the teacher typed is left alone
    if (name === `${termNo}/${t.year}`) setName(`${n}/${t.year}`);
    setTermNo(n);
  }
  async function write(body: unknown, okMsg: string, undo?: () => void) {
    const r = await guarded(async () => {
      try { await api.post("/api/terms", body); }
      catch (e: any) { setMsg(e?.message || "บันทึกภาคเรียนไม่สำเร็จ"); return false; }
      await refresh();
      if (undo) notify("success", okMsg, { action: { label: "เลิกทำ", run: undo } }); else ok(okMsg);
      return true;
    });
    if (r) setMsg(""); else focusSoon(rowSel(t.id));
    return !!r;
  }
  async function makeCurrent() {
    const prev = cur;
    const yes = await ask({
      title: `ตั้ง ${t.name} เป็นภาคเรียนปัจจุบัน?`, yes: "ตั้งเป็นปัจจุบัน",
      body: <>ตัวเลขในหน้าหลักและรายงานจะนับตามภาคเรียน {t.name} · ข้อมูลของภาคเรียน {prev?.name} ไม่หาย กลับมาตั้งเป็นปัจจุบันได้อีก</>,
    });
    if (!yes) return;
    const done = await write(termBody(t, { is_current: true }), `ตั้ง ${t.name} เป็นภาคเรียนปัจจุบันแล้ว`,
      prev ? () => { void guarded(async () => { try { await api.post("/api/terms", termBody(prev, { is_current: true })); await refresh(); ok(`กลับไปใช้ ${prev.name} แล้ว`); } catch { err("เลิกทำไม่สำเร็จ"); } }); } : undefined);
    if (done) focusSoon(rowSel(t.id)); // the button that was pressed is gone: the row's edit button
  }
  if (readOnlyYear) {
    return <div class={ROW}><span class="cat-name">{t.name} <span class="page-sub">· จบปีการศึกษา · อ่านอย่างเดียว</span></span></div>;
  }
  return (
    <div class={ROW} data-row={t.id}>
      <div class="row cat-line">
        <div class="grow cat-name">{t.name}{t.is_current ? " · ปัจจุบัน" : ""}</div>
        <button data-trigger class="cat-btn" aria-expanded={editing} onClick={() => setEditing((v) => !v)}><Icon name="edit" size={14} /> {editing ? "ซ่อน" : "แก้ไข"}</button>
        {canSwitch && <button class="cat-btn" disabled={lock} onClick={makeCurrent}>ตั้งเป็นปัจจุบัน</button>}
      </div>
      {editing && (
        <div class="modal-grid2 cat-edit">
          <label class="field"><span>ภาคเรียน</span>
            <select value={termNo} onInput={(e) => pickTerm(Number((e.target as HTMLSelectElement).value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select>
          </label>
          <label class="field"><span>ชื่อที่แสดง</span><input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          <div class="page-sub" style="grid-column:1/-1">ปีการศึกษา {t.year} แก้ไขไม่ได้ — ห้องเรียนผูกกับปีนี้</div>
        </div>
      )}
      <div class="row cat-fields">
        <DateField value={start} onChange={setStart} label={`วันเริ่ม ${t.name}`} />
        <span class="page-sub">–</span>
        <DateField value={end} onChange={setEnd} label={`วันสิ้นสุด ${t.name}`} />
        {changed && <button class="primary cat-btn" disabled={!name.trim() || lock}
          onClick={() => write(termBody(t, { term: termNo, name: name.trim(), start_date: start || null, end_date: end || null }), "บันทึกภาคเรียนแล้ว")}>บันทึก</button>}
      </div>
      <FieldErr id={`tr-${t.id}-e`} msg={msg} />
    </div>
  );
}

function TermEditor() {
  const { ask, node } = useConfirm();
  const off0 = useOffline();
  const ro = useReadOnly();
  const off = off0 || ro; // while projecting nothing writes (AC-248)
  const cur = currentTerm.value;
  const curYear = cur?.year ?? new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear() + 543;
  const [year, setYear] = useState(curYear);
  const [term, setTerm] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [msg, setMsg] = useState("");
  const lock = off || writing.value;
  const line = termLine(cur);
  const sorted = [...terms.value].sort((a, b) => b.year - a.year || b.term - a.term);
  const years = [...new Set(sorted.map((t) => t.year))];
  const nowYears = years.filter((y) => y >= curYear);
  const pastYears = years.filter((y) => y < curYear);
  async function add() {
    const r = await guarded(async () => {
      try { await api.post("/api/terms", { year, term, name: `${term}/${year}`, start_date: start || null, end_date: end || null }); }
      catch (e: any) { setMsg(e?.message || "บันทึกภาคเรียนไม่สำเร็จ"); return false; }
      await refresh(); ok("บันทึกภาคเรียนแล้ว"); return true;
    });
    if (r) { setMsg(""); setStart(""); setEnd(""); } else focusSoon("#tm-year");
  }
  const yearOptions = Array.from({ length: 7 }, (_, i) => curYear - 3 + i);
  return (
    <div>
      <OfflineNote off={off0} />
      <div class="row cat-termhead">
        <div class="grow">
          {line.none ? <><b>ยังไม่ได้ตั้งภาคเรียน</b><div class="page-sub">ภาคเรียนใช้แบ่งงาน คะแนน และรายงาน</div></>
            : <span>ภาคเรียนปัจจุบัน: <b>{line.text}</b></span>}
        </div>
        <button class="primary" disabled={off} onClick={() => { startTermOpen.value = true; }}><Icon name="calendar-plus" size={16} /> {line.none ? "ตั้งภาคเรียนแรก" : "เริ่มภาคเรียนใหม่"}</button>
      </div>
      {nowYears.map((y) => (
        <div key={y}>
          <div class="page-sub cat-year">ปีการศึกษา {y}</div>
          {sorted.filter((t) => t.year === y).map((t) => <TermRow key={t.id + (t.start_date ?? "") + (t.end_date ?? "") + t.name} t={t} ask={ask} off={off} readOnlyYear={false} />)}
        </div>
      ))}
      {pastYears.map((y) => (
        <details key={y} class="cat-fold">
          <summary class="page-sub">ปีการศึกษา {y} ({sorted.filter((t) => t.year === y).length} ภาค) — อ่านอย่างเดียว</summary>
          {sorted.filter((t) => t.year === y).map((t) => <TermRow key={t.id} t={t} ask={ask} off={off} readOnlyYear />)}
        </details>
      ))}
      <details class="cat-fold">
        <summary class="page-sub">เพิ่มภาคเรียนที่ผ่านมา/ล่วงหน้า</summary>
        <div class="modal-grid2 cat-edit">
          <label class="field"><span>ปีการศึกษา (พ.ศ.)</span>
            <select id="tm-year" value={year} onInput={(e) => { setYear(Number((e.target as HTMLSelectElement).value)); setMsg(""); }} aria-describedby="tm-e" aria-invalid={!!msg}>{yearOptions.map((y) => <option value={y}>{y}</option>)}</select>
          </label>
          <label class="field"><span>ภาคเรียน</span>
            <select value={term} onInput={(e) => { setTerm(Number((e.target as HTMLSelectElement).value)); setMsg(""); }} aria-describedby="tm-e"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select>
          </label>
          <label class="field"><span>วันเริ่ม</span><DateField value={start} onChange={setStart} /></label>
          <label class="field"><span>วันสิ้นสุด</span><DateField value={end} onChange={setEnd} /></label>
        </div>
        <FieldErr id="tm-e" msg={msg} />
        <button class="primary" disabled={lock} onClick={add}><Icon name="plus" size={16} /> เพิ่มภาคเรียน (ไม่เปลี่ยนภาคเรียนปัจจุบัน)</button>
      </details>
      {node}
    </div>
  );
}
