// ตารางสอน (#/timetable?term=<id>) — the week of one term, in the look the teacher chose (appearance.timetable: ก ข ค).
// This page owns everything the three layouts share: the term, header, empty/loading/error/offline states, the add-edit sheet (S4),
// the cell menu, the delete-undo bar, the confirmations (S9), the time sheet (S5) and the print sheet (S8). A layout only draws cells
// and reports taps through `onCell`. The store (src/lib/timetable/store.ts) does every save; this file never calls the API itself.
import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/timetable.css";
import { Icon } from "../components/Icon";
import { appearance } from "../lib/appearance";
import { online } from "../lib/outbox";
import { navigate, route, routeParams } from "../router";
import { classes, currentTermId, subjects, terms } from "../store";
import { ttFrame, ttFrameBroken, ttLoad, loadTerm, ttOfflineStamp, copySourceFor, prepareCopy, commitCopy, clearTerm, removeSlot } from "../lib/timetable/store";
import { tableOf } from "../lib/timetable/state";
import { startTimetableClock } from "../lib/timetable/clock";
import { summarize } from "../lib/timetable/logic";
import { MSG } from "../lib/timetable/messages";
import type { CopyPlan } from "../lib/timetable/copy";
import type { Slot, Weekday } from "@shared/timetable";
import { LayoutA } from "../components/timetable/a";
import { LayoutB } from "../components/timetable/b";
import { LayoutC } from "../components/timetable/c";
import { FrameSheet } from "../components/timetable/frame";
import { PrintSheet, canPrintTimetable, printTimetable } from "../components/timetable/print";
import { focusCell } from "../components/timetable/layoutTypes";
import { CellMenu } from "../components/timetable/CellMenu";
import { ConfirmBox } from "../components/timetable/ConfirmBox";
import { Notices } from "../components/timetable/Notices";
import { SlotSheet } from "../components/timetable/SlotSheet";
import { TtHeader } from "../components/timetable/TtHeader";
import { entryMap, keyOf, useMobile } from "../components/timetable/ttCells";

/** "2/2569" — the short name the messages use (a term's own name may read "ภาคเรียนที่ 2/2569") */
const short = (t: { term: number; year: number }) => `${t.term}/${t.year}`;
const NOT_DOWNLOADED = "ยังไม่ได้ดาวน์โหลดตารางสอนไว้ เชื่อมต่อเน็ตแล้วเปิดหน้านี้อีกครั้ง";

const shortOf = (all: { id: string; term: number; year: number }[], src: { termId: string; name: string }) => {
  const t = all.find((x) => x.id === src.termId);
  return t ? short(t) : src.name;
};

type Confirm = { kind: "clear" } | { kind: "replace"; text: string; plan: CopyPlan };

export function TimetablePage() {
  void route.value; // subscribe: ?term= changes
  const list = terms.value;
  const wanted = routeParams().term;
  const term = wanted ? list.find((t) => t.id === wanted) ?? null : list.find((t) => t.id === currentTermId.value) ?? list[0] ?? null;
  const termId = term?.id ?? null;
  const mobile = useMobile();
  const offline = !online.value;

  const [sheet, setSheet] = useState<{ weekday: Weekday; period: number; existing: Slot | null; anchor?: HTMLElement } | null>(null);
  const [menu, setMenu] = useState<{ weekday: Weekday; period: number; anchor: HTMLElement } | null>(null);
  const [frameOpen, setFrameOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [copying, setCopying] = useState(false);
  const frameBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => startTimetableClock(), []);
  // open (or switch to) a term: load its table (a copy already on screen is kept; offline never calls)
  useEffect(() => { if (termId) void loadTerm(termId); }, [termId]);
  useEffect(() => { if (termId && online.value && !tableOf(termId)) void loadTerm(termId, { force: true }); }, [termId, offline]);
  useEffect(() => { setSheet(null); setMenu(null); setConfirm(null); }, [termId]);

  const table = tableOf(termId);
  const load = termId ? ttLoad.value[termId] : undefined;
  const frame = ttFrame.value;
  const frameBroken = ttFrameBroken.value;
  const readOnly = !!table?.readOnly;
  const style = appearance.value.timetable;
  const Layout = style === "b" ? LayoutB : style === "c" ? LayoutC : LayoutA;

  // ---- an unknown ?term= id while terms exist (R-13) ----
  if (!term && wanted && list.length > 0) {
    return (
      <div class="tt-page pg" data-tt-state="term-not-found">
        <h1 class="tth-title tt-solo-title">{MSG.pageTitle}</h1>
        <div class="card tt-state"><p role="alert">{MSG.termNotFound}</p><a class="btn" href="#/timetable">ไปตารางสอนภาคปัจจุบัน</a></div>
      </div>
    );
  }
  // ---- no term at all (AC-10 ก) ----
  if (!term) {
    return (
      <div class="tt-page pg" data-tt-state="no-term">
        <h1 class="tth-title tt-solo-title">{MSG.pageTitle}</h1>
        <div class="card tt-state">
          <div class="ei"><Icon name="calendar-event" size={30} /></div>
          <p>{MSG.noTerm}</p>
          <button type="button" class="primary" onClick={() => navigate("/settings", { section: "catalog", tab: "terms" })}>ไปตั้งค่า › ภาคเรียน</button>
        </div>
      </div>
    );
  }

  const emap = table ? entryMap(term.id) : new Map();
  const hasSlots = (table?.slots.length ?? 0) > 0;
  const copySource = copySourceFor(term.id);
  const canPrint = !!table && canPrintTimetable(term.id);
  const stamp = ttOfflineStamp(term.id);

  const onCell = (weekday: Weekday, period: number, anchor: HTMLElement) => {
    if (!table || readOnly) return;
    if (!emap.has(keyOf(weekday, period))) {
      if (offline) return; // offline: the "+" is shown but off; the line under the header says why
      setSheet({ weekday, period, existing: null, anchor });
    } else setMenu({ weekday, period, anchor });
  };
  const doDelete = (weekday: Weekday, period: number) => {
    if (readOnly || offline) return;
    void removeSlot(term.id, weekday, period);
    refocus(weekday, period);
  };
  // back to the very element that was tapped (a layout may draw the same period twice, e.g. ค: today's list + the week); else look it up
  const refocus = (weekday: Weekday, period: number, anchor?: HTMLElement | null) =>
    setTimeout(() => { if (anchor?.isConnected) anchor.focus(); else focusCell(weekday, period); }, 0);
  const closeSheet = () => {
    const s = sheet;
    setSheet(null);
    if (s) refocus(s.weekday, s.period, s.anchor);
  };
  const closeMenu = () => {
    const m = menu;
    setMenu(null);
    if (m) refocus(m.weekday, m.period, m.anchor);
  };

  const startCopy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const r = await prepareCopy(term.id);
      if (!r.ok) return;
      if (r.needsConfirm) {
        const from = list.find((t) => t.id === r.source.termId);
        setConfirm({ kind: "replace", text: MSG.confirmReplace(r.existing, r.plan.copied, from ? short(from) : r.source.name), plan: r.plan });
      }
      else await commitCopy(term.id, r.plan);
    } finally { setCopying(false); }
  };

  // ---- body ----
  let body;
  if (!table && load?.state === "error") {
    body = (
      <div class="card tt-state" data-tt-state="error">
        <div class="ei"><Icon name="cloud-off" size={30} /></div>
        <p role="alert">{load.code === "offline" ? NOT_DOWNLOADED : load.message ?? MSG.loadFailed}</p>
        {load.code !== "offline" && <button type="button" onClick={() => void loadTerm(term.id, { force: true })}><Icon name="refresh" size={16} /> {MSG.retry}</button>}
      </div>
    );
  } else if (!table) {
    body = (
      <div class="tt-skel" data-tt-state="loading" role="status" aria-busy="true">
        <p>กำลังโหลดตารางสอน…</p>
        <div class="tt-skel-grid" aria-hidden="true">{Array.from({ length: 18 }, () => <span />)}</div>
      </div>
    );
  } else {
    const s = summarize(table.slots, frame); // layout ข draws its own summary in the bar under the header
    body = (
      <>
        {!hasSlots && (
          <div class="tt-empty" data-tt-state="empty">
            <div class="tt-empty-t">
              <b>ยังไม่มีตารางสอนภาคนี้</b>
              {!readOnly && <span>แตะช่องใดก็ได้เพื่อเพิ่มคาบ{copySource ? " หรือคัดลอกจากภาคก่อน" : ""}</span>}
            </div>
            {!readOnly && (
              <div class="tt-empty-a">
                {copySource && <button type="button" class="primary" disabled={copying} aria-disabled={offline ? "true" : undefined} onClick={() => { if (!offline) void startCopy(); }}>{MSG.copyButton(shortOf(list, copySource), copySource.count)}</button>}
                {!frame.saved && <button type="button" aria-disabled={offline ? "true" : undefined} onClick={() => { if (!offline) setFrameOpen(true); }}>ตั้งเวลาคาบ</button>}
              </div>
            )}
          </div>
        )}
        <div class="tt-layout" data-tt-layout={style}>
          <Layout termId={term.id} slots={table.slots} frame={frame} readOnly={readOnly} offline={offline} onCell={onCell} onDelete={doDelete} />
        </div>
        {style !== "b" && <p class="tt-sum" data-testid="tt-summary">{s.text}</p>}
      </>
    );
  }

  const menuEntry = menu ? emap.get(keyOf(menu.weekday, menu.period)) : undefined;

  return (
    <div class="tt-page pg" data-tt-layout={style}>
      <TtHeader
        term={term} termList={list} readOnly={readOnly} offline={offline} offlineStamp={stamp} hasSlots={hasSlots} loaded={!!table} canPrint={canPrint}
        copySource={copySource ? { ...copySource, name: shortOf(list, copySource) } : null} mobile={mobile} frameBtn={frameBtn}
        onTerm={(id) => navigate("/timetable", { term: id })}
        onFrame={() => setFrameOpen(true)}
        onPrint={() => printTimetable(term.id)}
        onCopy={() => void startCopy()}
        onClear={() => setConfirm({ kind: "clear" })}
      />
      <Notices />
      {frameBroken && (
        <div class="tt-broken" data-tt-state="frame-broken" role="alert">
          <Icon name="alert-circle" size={18} />
          <span class="tt-broken-t">{MSG.frameBroken}</span>
          <button type="button" aria-disabled={offline ? "true" : undefined} onClick={() => { if (!offline) setFrameOpen(true); }}>ตั้งเวลาคาบ</button>
        </div>
      )}
      {body}

      {sheet && table && (
        <SlotSheet term={term} frame={frame} weekday={sheet.weekday} period={sheet.period} existing={sheet.existing} classes={classes.value} subjects={subjects.value} onClose={closeSheet} />
      )}
      {menu && menuEntry && (
        <CellMenu
          entry={menuEntry} anchor={menu.anchor} offline={offline} onClose={closeMenu}
          onEdit={() => { const m = menu; setMenu(null); setSheet({ weekday: m.weekday, period: m.period, existing: table?.slots.find((x) => x.weekday === m.weekday && x.period === m.period) ?? null, anchor: m.anchor }); }}
          onDelete={() => { const m = menu; setMenu(null); doDelete(m.weekday, m.period); }}
        />
      )}
      {confirm?.kind === "clear" && table && (
        <ConfirmBox
          text={MSG.confirmClear(table.slots.length, short(term))} no="ไม่" yes="ลบทั้งหมด" busyText="กำลังลบ…"
          run={() => clearTerm(term.id)} onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "replace" && (
        <ConfirmBox
          text={confirm.text} no="ไม่" yes="แทนที่" busyText="กำลังคัดลอก…"
          run={() => commitCopy(term.id, confirm.plan)} onClose={() => setConfirm(null)}
        />
      )}
      <FrameSheet open={frameOpen} onClose={() => setFrameOpen(false)} returnFocus={frameBtn.current} />
      {table && <PrintSheet termId={term.id} />}
    </div>
  );
}
