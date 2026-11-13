// The content of one filled cell, used by every layout at its own size. Teaching = room icon + room (+ subject);
// activity = star icon + name + the word "กิจกรรม"; an archived room/subject carries the word "เก็บแล้ว" (never just paler).
import { Icon } from "../Icon";
import type { TtEntry } from "../../lib/timetable/logic";
import { MSG } from "../../lib/timetable/messages";

export function PeriodChip({ e, size = "cell" }: { e: TtEntry; size?: "cell" | "row" | "block" }) {
  const act = e.kind === "activity";
  return (
    <span class={`ttp ttp-${size} ${act ? "ttp-act" : "ttp-cls"}${e.archived ? " ttp-arch" : ""}`} title={`${act ? e.label : e.title}${e.archived ? ` · ${MSG.archivedBadge}` : ""}`}>
      <span class="ttp-l1">
        <Icon name={act ? "star" : "door"} size={14} />
        <b class="ttp-name">{act ? e.label : e.className ?? e.title}</b>
      </span>
      {!act && e.subjectName && e.className && <span class="ttp-l2">{e.subjectName}</span>}
      {(act || e.archived) && (
        <span class="ttp-tags">
          {act && <span class="ttp-tag">กิจกรรม</span>}
          {e.archived && <span class="ttp-tag ttp-tag-arch">{MSG.archivedBadge}</span>}
        </span>
      )}
    </span>
  );
}
