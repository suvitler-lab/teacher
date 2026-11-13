// S8 · print sheet of the timetable (BR-16, AC-60..63, AC-65). Mounted by the timetable page, invisible on screen,
// the only thing on paper when the browser prints. The grid is always layout "ก" and the same for the 3 layouts.
// It reads the stores but never writes anything (printing leaves no history).
import { useEffect } from "preact/hooks";
import { createPortal } from "preact/compat";
import { settings, terms } from "../../../store";
import { online } from "../../../lib/outbox";
import { bangkok, bangkokHM, now } from "../../../lib/timetable/clock";
import { ttInputFor } from "../../../lib/timetable/store";
import { tableOf } from "../../../lib/timetable/state";
import { type PrintModel, buildPrintModel } from "./model";
import "../../../styles/timetable-print.css";

export { buildPrintModel, printNameLine, printColumns, thaiDate } from "./model";
export type { PrintModel } from "./model";

const PAGE_STYLE_ID = "tt-print-page";

function modelFor(termId: string): PrintModel | null {
  const input = ttInputFor(termId);
  const table = tableOf(termId);
  if (!input || !table) return null;
  const term = terms.value.find((t) => t.id === termId) ?? null;
  return buildPrintModel({
    slots: table.slots,
    frame: input.frame,
    term: term ? { year: term.year, term: term.term, start_date: term.start_date, end_date: term.end_date } : null,
    classes: input.classes,
    subjects: input.subjects,
    teacherName: settings.value?.teacher_name,
    schoolName: settings.value?.school_name,
    readOnly: table.readOnly,
    offline: !online.value,
    loadedHM: bangkokHM(table.loadedAt),
    todayIso: bangkok(now()).date,
  });
}

/** True when the page may enable "พิมพ์ตารางสอน" (a table with at least one period in the frame). */
export function canPrintTimetable(termId: string | null | undefined): boolean {
  return !!termId && modelFor(termId) !== null;
}

/** Opens the browser's print dialog. Does nothing for an empty table. */
export function printTimetable(termId: string | null | undefined): void {
  if (canPrintTimetable(termId)) window.print();
}

export function PrintSheet(p: { termId: string }) {
  // Other pages print A4 portrait (print.css): while this sheet exists the page is A4 landscape, 12 mm margins.
  useEffect(() => {
    const el = document.createElement("style");
    el.id = PAGE_STYLE_ID;
    el.textContent = "@media print { @page { size: A4 landscape; margin: 12mm; } }";
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  const m = modelFor(p.termId);
  if (!m || typeof document === "undefined") return null;
  return createPortal(
    <section class="tt-print" aria-hidden="true" data-testid="tt-print">
      <header class="tt-print-head">
        <h1>{m.title}</h1>
        {m.nameLine && <p class="tt-print-names">{m.nameLine}</p>}
      </header>
      <table class="tt-print-table">
        <thead>
          <tr>
            <th class="tt-print-day" scope="col">วัน / คาบ</th>
            {m.columns.map((c, i) => c.k === "p"
              ? <th key={i} scope="col">คาบ {c.period}<small>{c.start}–{c.end}</small></th>
              : <th key={i} class="tt-print-brk" scope="col"><span>พัก</span></th>)}
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r, ri) => (
            <tr key={r.weekday}>
              <th scope="row" class="tt-print-day">{r.name}</th>
              {m.columns.map((c, i) => {
                if (c.k === "b") return ri === 0 ? <td key={i} class="tt-print-brk" rowSpan={m.rows.length}><span>{c.name} {c.start}–{c.end}</span></td> : null;
                const cell = r.cells[c.period];
                return (
                  <td key={i} class={cell ? `tt-print-${cell.kind}` : undefined}>
                    {cell && (cell.kind === "class"
                      ? <div class="tt-print-txt"><b>{cell.full}</b></div>
                      : <div class="tt-print-txt"><i>กิจกรรม: {cell.text}</i></div>)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <footer class="tt-print-foot">
        <span>{m.summary.text}</span>
        <span class="tt-print-meta">
          {[m.pastYear ? "ภาคปีที่ผ่านมา" : "", m.dataStamp ?? "", `พิมพ์เมื่อ ${m.printedOn}`].filter(Boolean).join(" · ")}
        </span>
      </footer>
    </section>,
    document.body,
  );
}
