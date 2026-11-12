// Works the home page's numbers out once, so ก / ข / ค show the same figures (BR-09), and runs what a row's button does.
import { settings, classById, currentTerm, viewClasses, studentsByClass, viewingPastYear, startTermOpen } from "../../store";
import { navigate } from "../../router";
import { pendingCount, failedCount } from "../../lib/outbox";
import { attDraftCount, attDrafts } from "../../lib/attSync";
import { dashboardAt, dashboardStale } from "../../lib/dashboard";
import { failedPanelOpen } from "../Overlays";
import { followGroups, homeSummary, roomStats, todayCount, todayList, withDeferred, dueGroups, type TodayGo } from "../../lib/homeLogic";
import { bkkParts, bkkToday } from "@shared/time";
import type { DashboardPayload } from "@shared/types";
import type { HomeModel, HomeRoom } from "./meta";

/** The model for the payload on screen. `deferred` = the rows the teacher pushed back this visit (BR-02). */
export function buildHomeModel(raw: DashboardPayload, deferred: string[], hide = false): HomeModel {
  // a copy saved before dueSoon / absentToday existed has neither: give the layouts arrays, never undefined
  const d: DashboardPayload = { ...raw, dueSoon: raw.dueSoon ?? [], absentToday: raw.absentToday ?? [] };
  const today = bkkToday(); // the real today, never the date inside an offline copy
  const t = currentTerm.value;
  const last = settings.value?.last_backup_at ? Number(settings.value.last_backup_at) : 0;
  const past = viewingPastYear.value; // an earlier year has no "now": nothing to do today
  const rows = past ? [] : todayList({
    today,
    nowMinutes: bkkParts(Date.now()).minutes,
    lateAfter: settings.value?.late_after ?? "08:30",
    failed: failedCount.value,
    pending: pendingCount.value,
    attDrafts: attDraftCount.value,
    summary: d,
    queueClassId: attDrafts.value[0]?.ctx.classId,
    termEnded: t?.end_date && t.end_date < today ? { name: t.name, end: t.end_date } : null,
    backupDays: last ? Math.round((Date.now() - last) / 86_400_000) : null,
    classNameOf: (id) => classById(id)?.name ?? "",
  });
  // names hidden: no "copy to LINE" for any layout to remember to leave out
  const safe = hide ? rows.map((r) => (r.secondary ? { ...r, secondary: undefined } : r)) : rows;
  const ranked = withDeferred(safe, deferred);
  const rooms = viewClasses.value;
  const stats = roomStats(d, rooms.map((c) => c.id));
  const homeRooms: HomeRoom[] = stats.map((s, i) => ({ ...s, name: rooms[i].name, studentCount: studentsByClass.value.get(rooms[i].id)?.length ?? 0,
    follow: followGroups(d.followUp, rooms[i].id), absent: d.absentToday.filter((x) => x.classId === rooms[i].id).map((x) => ({ studentId: x.studentId, status: x.status })) }));
  return {
    d,
    today,
    summary: homeSummary(d, today),
    rooms: homeRooms,
    todo: ranked,
    todayCount: todayCount(ranked),
    deferred: deferred.filter((k) => ranked.some((r) => r.key === k)),
    due: dueGroups(d, today),
    follow: followGroups(d.followUp),
    stale: dashboardStale.value,
    at: dashboardAt.value,
  };
}

/** What the button of a row does: the same places the old "ต้องทำตอนนี้" card went to (BR-09). */
export function runTodayGo(go: TodayGo): void {
  if (go.type === "failed") failedPanelOpen.value = true;
  else if (go.type === "term") startTermOpen.value = true;
  else navigate(go.path, go.params);
}
