import { useEffect } from "preact/hooks";
import { Icon } from "../Icon";
import { studentsByClass, assignments, activeClasses } from "../../store";
import { session, resumedRound, recent, feedback, effSub, focusScan, subsBox } from "./state";
import type { Session } from "./state";

/**
 * AC-54: a round found on this device when the app opened. The page goes straight into it (as before) and this bar says so:
 * "ต่อรอบเดิม · <work> · <room> — ส่งแล้ว x จาก y". [สแกนต่อ] closes it; [จบรอบ] goes to the summary; the first scan closes it too.
 * x / y follow BR-13: y = the room without the children marked ยกเว้น.
 */
export function ResumeBar({ s, onEnd }: { s: Session; onEnd: () => void }) {
  // R-3703: the first scan (or any answer card) closes the bar for good — taking it back / declining an exempt child must not bring it back
  const scanned = recent.value.length > 0 || !!feedback.value;
  useEffect(() => { if (scanned && session.value?.id === s.id) resumedRound.value = false; }, [scanned]);
  if (!resumedRound.value || session.value?.id !== s.id || scanned) return null;
  // R-3701: same condition as ScanView's `known` — until the server's answer is in, the count is unknown, never "0"
  const known = subsBox.value.aid === s.assignmentId && subsBox.value.status === "ready";
  const kids = studentsByClass.value.get(s.classId) ?? [];
  let x = 0, excused = 0;
  for (const k of kids) {
    const st = effSub(k.id);
    if (st?.status === "submitted") x++;
    else if (st?.status === "excused") excused++;
  }
  const y = kids.length - excused;
  const title = assignments.value.find((a) => a.id === s.assignmentId)?.title ?? "งานที่ค้างอยู่";
  const room = activeClasses.value.find((c) => c.id === s.classId)?.name ?? "";
  return (
    <div class="sc-resume" role="status">
      <Icon name="history" size={20} />
      <span class="grow sc-resume-t">ต่อรอบเดิม · <b>{title}</b>{room ? ` · ${room}` : ""} — {known ? `ส่งแล้ว ${x} จาก ${y}` : "ส่งแล้ว … จาก …"}</span>
      <button class="sc-cb" onClick={() => { resumedRound.value = false; focusScan(); }}>สแกนต่อ</button>
      <button class="sc-cb" onClick={() => { resumedRound.value = false; onEnd(); }}>จบรอบ</button>
    </div>
  );
}
