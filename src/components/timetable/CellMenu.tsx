// The small menu of a filled cell (AC-28): เช็คชื่อ · สแกนส่งงาน (teaching, room still open) · แก้คาบนี้ · ลบคาบนี้.
// The shortcuts only open another page — they never write roll-call or hand-in data. Does not depend on the time of day.
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { type TtEntry, slotActions } from "../../lib/timetable/logic";
import { MSG, dayWord } from "../../lib/timetable/messages";
import { focusFirstItem, menuKeys } from "../../lib/menuKeys";

export interface CellMenuProps {
  entry: TtEntry;
  anchor: HTMLElement;
  offline: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function CellMenu({ entry, anchor, offline, onEdit, onDelete, onClose }: CellMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const a = slotActions(entry);

  // place under the cell, kept inside the screen
  useEffect(() => {
    const el = ref.current;
    const r = anchor.getBoundingClientRect();
    const w = el?.offsetWidth ?? 240, h = el?.offsetHeight ?? 200;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    setPos({ top, left });
  }, [anchor]);

  // a tap outside closes it
  useEffect(() => {
    const down = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  const when = `${dayWord(entry.weekday)} คาบ ${entry.period} ${entry.start}–${entry.end}`;
  const dis = offline ? { "aria-disabled": "true" as const } : {};
  return (
    <div
      ref={(el) => { (ref as { current: HTMLDivElement | null }).current = el; focusFirstItem(el); }}
      class="ttm" role="menu" aria-label={`${when} ${entry.kind === "activity" ? entry.label ?? "" : entry.title}`}
      style={pos ? `top:${pos.top}px;left:${pos.left}px` : "visibility:hidden"} onKeyDown={menuKeys(onClose)}
    >
      <div class="ttm-head" role="presentation">
        <b>{entry.kind === "activity" ? entry.label : entry.title}</b>
        <span>{when}{a.archivedBadge ? ` · ${MSG.archivedBadge}` : ""}</span>
        {entry.archived && <span class="ttm-arch">ห้องนี้{MSG.archivedBadge}</span>}
      </div>
      {a.attendance && a.attendanceHref && <a role="menuitem" class="ttm-item" href={a.attendanceHref} onClick={onClose}><Icon name="user-check" size={18} /> {a.attendance}</a>}
      {a.scan && a.scanHref && <a role="menuitem" class="ttm-item" href={a.scanHref} onClick={onClose}><Icon name="scan" size={18} /> {a.scan}</a>}
      <button type="button" role="menuitem" class="ttm-item" {...dis} onClick={() => { if (!offline) onEdit(); }}><Icon name="pencil" size={18} /> {a.edit}</button>
      <button type="button" role="menuitem" class="ttm-item ttm-danger" {...dis} onClick={() => { if (!offline) onDelete(); }}><Icon name="trash" size={18} /> {a.delete}</button>
      {offline && <p class="ttm-off">{MSG.offlineEdit}</p>}
    </div>
  );
}
