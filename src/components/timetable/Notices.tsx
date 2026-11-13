// What the timetable store says back: an error banner that stays (retry / OK), a polite "saved" line, and the 5-second
// "เลิกทำ" bar after a delete. Ctrl/⌘+Z undoes while the bar is up. No motion.
import { useEffect } from "preact/hooks";
import { Icon } from "../Icon";
import { MSG } from "../../lib/timetable/messages";
import { dismissNotice, retryLast, ttNotice, ttUndo, undoRemove } from "../../lib/timetable/store";

export function Notices() {
  const n = ttNotice.value;
  const u = ttUndo.value;

  // a plain "saved" line goes by itself; an error, or a list of skipped slots, waits for the teacher
  useEffect(() => {
    if (!n || n.kind !== "ok" || n.detail) return;
    const id = n.id;
    const t = setTimeout(() => { if (ttNotice.peek()?.id === id) dismissNotice(); }, 4000);
    return () => clearTimeout(t);
  }, [n?.id]);

  useEffect(() => {
    if (!u) return;
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); void undoRemove(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [u?.id]);

  return (
    <>
      <div class="ttn-wrap">
        {n?.kind === "error" && (
          <div class="ttn ttn-err" role="alert">
            <Icon name="alert-circle" size={18} />
            <div class="ttn-txt">{n.text}{n.detail && <div class="ttn-detail">{n.detail}</div>}</div>
            {n.retry && <button type="button" onClick={() => { void retryLast(); }}>{MSG.retry}</button>}
            <button type="button" onClick={dismissNotice}>ตกลง</button>
          </div>
        )}
        <div class="ttn-live" role="status" aria-live="polite">
          {n?.kind === "ok" && (
            <div class="ttn ttn-ok">
              <Icon name="check" size={18} />
              <div class="ttn-txt">{n.text}{n.detail && <div class="ttn-detail">{n.detail}</div>}</div>
              {n.detail && <button type="button" onClick={dismissNotice}>ปิด</button>}
            </div>
          )}
        </div>
      </div>
      {u && (
        <div class="ttu" role="status" aria-live="polite">
          <span>{u.message}</span>
          <button type="button" class="ttu-btn" onClick={() => { void undoRemove(); }}>เลิกทำ</button>
        </div>
      )}
    </>
  );
}
