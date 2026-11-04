import type { Assignment, Student } from "@shared/types";
import type { WorkState } from "@shared/metrics";
import { Icon } from "../Icon";
import { WorkCell } from "../ui";
import { fullName } from "../../lib/names";
import { CellInput } from "./CellInput";
import { memoShallow } from "./memo";
import type { CellMark } from "./matrix";

/**
 * What a grid cell may ask the page to do. The page refreshes `current` on every render, so a cell that was NOT drawn
 * again still calls the newest handlers (a stale closure would commit a score against an old roster / old columns).
 */
export interface CellHandlers {
  focus(aid: string, sid: string): void;
  key(e: KeyboardEvent, a: Assignment, sid: string, row: number, isEditing: boolean): void;
  pointerDown(e: PointerEvent, aid: string, sid: string): void;
  endHold(): void;
  click(e: MouseEvent, aid: string, sid: string, isEditing: boolean): void;
  commit(aid: string, sid: string, row: number, initial: string, v: string, next: boolean): void;
  cancel(aid: string, sid: string): void;
  /** open the full cell editor (status · score · received day) */
  more(aid: string, sid: string): void;
}
export interface CellRef { current: CellHandlers }

export interface GradebookCellProps {
  h: CellRef;
  a: Assignment;
  st: Student;
  /** index among the rows drawn */
  row: number;
  state: WorkState;
  score: number | null | undefined;
  mark: CellMark;
  isEditing: boolean;
  /** the one cell Tab stops on */
  isFoc: boolean;
  /** show the ⌄ button (editing, or focused by the keyboard) */
  showMore: boolean;
  /** this cell's column is the picked work */
  isSel: boolean;
  /** the digit typed on the cell, handed to the input (only while editing) */
  seed: string | null;
}

const STATE_TEXT: Record<WorkState, string> = { scored: "มีคะแนน", late: "ส่งช้า", awaiting: "รับงานแล้ว รอตรวจ", missing: "ค้างส่ง", pending: "ยังไม่ถึงกำหนด", excused: "ยกเว้น" };
const MARK_TEXT: Record<"pend" | "fail" | "unsaved", string> = { pend: " · รอส่งขึ้นระบบ", fail: " · ส่งไม่สำเร็จ", unsaved: " · ยังไม่ได้บันทึก" };

function CellView({ h, a, st, row, state, score, mark, isEditing, isFoc, showMore, isSel, seed }: GradebookCellProps) {
  const aid = a.id, sid = st.id;
  const markText = mark ? MARK_TEXT[mark] : "";
  return (
    <td data-aid={aid} data-sid={sid} tabIndex={isEditing ? -1 : isFoc ? 0 : -1} onFocus={(e) => { if (e.target === e.currentTarget) h.current.focus(aid, sid); }}
      aria-label={`${fullName(st)} · ${a.title} · ${a.publish_scores ? score ?? "ยังไม่มีคะแนน" : "ซ่อนคะแนน"} · ${STATE_TEXT[state]}${markText}`}
      onKeyDown={(e) => h.current.key(e, a, sid, row, isEditing)} class={"cell" + (isSel ? " sel" : "")}
      onPointerDown={(e) => h.current.pointerDown(e, aid, sid)} onPointerUp={() => h.current.endHold()} onPointerLeave={() => h.current.endHold()} onPointerCancel={() => h.current.endHold()}
      onClick={(e) => h.current.click(e, aid, sid, isEditing)}>
      {isEditing ? (
        <CellInput initial={score != null ? String(score) : ""} seed={seed}
          onCommit={(initial, v, next) => h.current.commit(aid, sid, row, initial, v, next)}
          onCancel={() => h.current.cancel(aid, sid)} onMore={() => h.current.more(aid, sid)} />
      ) : (
        <WorkCell state={state} score={score} mark={mark} hidden={!a.publish_scores} />
      )}
      {showMore && <button type="button" class="cell-more" aria-label="เปิดตัวแก้ไขช่อง" title="สถานะ · คะแนน · วันที่รับงาน (Alt+Enter)" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); h.current.more(aid, sid); }}><Icon name="chevron-down" size={14} /></button>}
    </td>
  );
}

/** One score cell. Drawn again only when something it shows changes — focusing a cell no longer redraws the other ~1,000. */
export const GradebookCell = memoShallow(CellView);
