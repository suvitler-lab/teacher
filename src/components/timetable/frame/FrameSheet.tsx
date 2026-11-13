// S5 as a sheet: a centred dialog on a wide screen, full screen on a phone (save button pinned at the bottom).
import { useEffect, useRef } from "preact/hooks";
import { Dialog } from "../../Dialog";
import { Icon } from "../../Icon";
import { FrameEditor } from "./FrameEditor";
import "../../../styles/timetable-frame.css";

export function FrameSheet({ open, onClose, returnFocus }: { open: boolean; onClose: () => void; returnFocus?: HTMLElement | null }) {
  const was = useRef(open);
  useEffect(() => {
    // Esc / ✕ / saved: Dialog already put focus back on the opener; only when that opener is gone (a closed menu) use the fallback
    if (was.current && !open) {
      const a = document.activeElement;
      if ((!a || a === document.body) && returnFocus?.isConnected) returnFocus.focus();
    }
    was.current = open;
  }, [open]);
  if (!open) return null;
  return (
    <div class="modal-overlay tf-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog label="ตั้งเวลาคาบ" onClose={onClose} class="modal tf-dlg">
        <div class="tf-head">
          <div class="tf-grow"><h2>ตั้งเวลาคาบ</h2></div>
          <button type="button" class="icon ghost" aria-label="ปิด" onClick={onClose}><Icon name="x" size={22} /></button>
        </div>
        <FrameEditor onSaved={onClose} onCancel={onClose} />
      </Dialog>
    </div>
  );
}
