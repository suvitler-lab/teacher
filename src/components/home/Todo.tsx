import { Icon } from "../Icon";
import { classById, currentTerm, settings, startTermOpen, viewingPastYear } from "../../store";
import { navigate } from "../../router";
import { dashboard } from "../../lib/dashboard";
import { pendingCount, failedCount } from "../../lib/outbox";
import { attDraftCount, attDrafts } from "../../lib/attSync";
import { failedPanelOpen } from "../Overlays";
import { todoRows, uncheckedRooms, type TodoRow } from "../../lib/homeLogic";
import { bkkParts, bkkToday } from "@shared/time";

function run(r: TodoRow) {
  if (r.action === "failed") failedPanelOpen.value = true;
  // the roll-call that is waiting to be sent: open that room, not the room list
  else if (r.action === "queue") navigate(attDraftCount.value > 0 ? "/attendance" : "/gradebook", { class: attDrafts.value[0]?.ctx.classId });
  else if (r.action === "term") startTermOpen.value = true;
  else if (r.action === "room") navigate("/attendance", { class: r.classId });
  else navigate("/settings", { section: "backup" });
}

/** One card for everything that needs the teacher now (it replaces the stack of yellow banners). Hidden when there is nothing. */
export function TodoCard() {
  if (viewingPastYear.value) return null; // an old year has no "now"
  const t = currentTerm.value;
  const today = bkkToday();
  const last = settings.value?.last_backup_at ? Number(settings.value.last_backup_at) : 0;
  const att = dashboard.value?.attendanceToday ?? [];
  const rows = todoRows({
    failed: failedCount.value,
    pending: pendingCount.value,
    attDrafts: attDraftCount.value,
    termEnded: t?.end_date && t.end_date < today ? { name: t.name, end: t.end_date } : null,
    unchecked: uncheckedRooms(att, bkkParts(Date.now()).minutes, settings.value?.late_after ?? "08:30")
      .map((a) => ({ classId: a.classId, name: classById(a.classId)?.name ?? "", total: a.total })),
    backupDays: last ? Math.round((Date.now() - last) / 86_400_000) : null,
  });
  if (rows.length === 0) return null;
  return (
    <section class="card hm-todo" aria-labelledby="hm-todo-h">
      <div class="hm-todo-h">
        <span class="ic warn"><Icon name="alert-triangle" size={20} /></span>
        <h2 id="hm-todo-h">ต้องทำตอนนี้</h2>
        <span class="hm-chip warning hm-todo-n">{rows.length}</span>
      </div>
      {rows.map((r) => (
        <div class="hm-todo-row">
          <span class={"ic " + (r.tone === "danger" ? "dan" : "warn")}><Icon name={r.icon} size={20} /></span>
          <span class="t"><b>{r.title}</b>{r.detail ? ` · ${r.detail}` : ""}</span>
          <button onClick={() => run(r)}>{r.label}</button>
        </div>
      ))}
    </section>
  );
}
