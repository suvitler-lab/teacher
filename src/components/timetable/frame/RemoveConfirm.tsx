// S9-ข: asked before a frame change deletes slots that fall outside the new frame (BR-08, AC-15). Cancel keeps everything as it was.
import { DAY_NAMES } from "../../../lib/timetable/messages";
import { describeRemoves, removeGroups, removeSummary, type FrameRemove } from "../../../lib/timetable/store";
import { Dialog } from "../../Dialog";

/** "จะลบ 2 คาบในคาบ 7: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์)" · one day, several periods: "จะลบ 5 คาบของวันศุกร์: …" */
export function removeSentence(removes: FrameRemove[]): string {
  const days = new Set(removes.map((r) => r.weekday));
  const periods = new Set(removes.map((r) => r.period));
  if (days.size === 1 && periods.size > 1) {
    const groups = removeGroups(removes, (r) => `${describeRemoves([r])[0].replace(/ \([^)]*\)$/, "")} (คาบ ${r.period})`);
    const head = `จะลบ ${removes.length} คาบของวัน${DAY_NAMES[removes[0].weekday]}`;
    return groups.length <= 1 ? `${head}: ${groups[0].items.join(", ")}` : `${head} — ${groups.map((g) => `ภาค ${g.name}: ${g.items.join(", ")}`).join(" · ")}`;
  }
  return removeSummary(removes);
}

export function RemoveConfirm({ removes, busy, onNo, onYes }: { removes: FrameRemove[]; busy: boolean; onNo: () => void; onYes: () => void }) {
  return (
    <div class="modal-overlay tf-ov tf-ov-confirm" onClick={(e) => { if (e.target === e.currentTarget && !busy) onNo(); }}>
      <Dialog role="alertdialog" label={`ลบ ${removes.length} คาบนอกโครงเวลาใหม่`} onClose={() => { if (!busy) onNo(); }} class="modal tf-confirm">
        <h2 class="tf-ctitle">จะลบ {removes.length} คาบที่อยู่นอกโครงเวลาใหม่</h2>
        <p class="tf-csum">{removeSentence(removes)}</p>
        <p class="tf-hint">ลบจากทุกภาคของปีนี้</p>
        <div class="tf-cfoot">
          <button type="button" data-autofocus disabled={busy} onClick={onNo}>ยกเลิก</button>
          <button type="button" class="danger" disabled={busy} onClick={onYes}>{busy ? "กำลังลบ…" : "ลบและบันทึก"}</button>
        </div>
      </Dialog>
    </div>
  );
}
