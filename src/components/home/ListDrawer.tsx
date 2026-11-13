import { Drawer, EmptyState } from "../ui";
import { Chip } from "./shared";
import type { ListKind } from "./meta";
import { classById, subjectById } from "../../store";
import { navigate } from "../../router";
import { formatThaiDate } from "../../lib/dates";
import type { AssignmentDashboard } from "@shared/types";

interface ListRow { a: AssignmentDashboard; classId: string; n: number; total: number }

/**
 * The rows behind a number, built from the same payload as the number, so the list always adds up to the figure the
 * teacher tapped. Closed work still needs grading, so "รอตรวจ" includes it; nobody chases it, so "ยังไม่ส่ง" does not.
 */
export function listRows(kind: ListKind, open: AssignmentDashboard[], grading: AssignmentDashboard[]): ListRow[] {
  const out: ListRow[] = [];
  const source = kind === "awaiting" ? [...open, ...grading] : open;
  for (const a of source) for (const p of a.perClass) {
    const n = kind === "open" ? p.submitted : kind === "awaiting" ? p.awaiting : p.missing;
    if (kind === "open" || n > 0) out.push({ a, classId: p.classId, n, total: p.total });
  }
  return out.sort((x, y) =>
    (classById(x.classId)?.name ?? "").localeCompare(classById(y.classId)?.name ?? "", "th") ||
    (x.a.assignment.due_date ?? "9999").localeCompare(y.a.assignment.due_date ?? "9999"));
}

const TITLE: Record<ListKind, string> = { open: "งานที่เปิดรับ", awaiting: "งานรอตรวจ", missing: "ยังไม่ส่ง" };
const HINT: Record<ListKind, string> = {
  open: "ส่งแล้ว / ทั้งห้อง แยกตามห้องและงาน",
  awaiting: "รวมงานที่ปิดรับแล้วแต่ยังตรวจไม่เสร็จ",
  missing: "เฉพาะงานที่ยังเปิดรับ — งานที่ปิดแล้วไม่นับ",
};

export function ListDrawer({ kind, open, grading, onClose }: { kind: ListKind; open: AssignmentDashboard[]; grading: AssignmentDashboard[]; onClose: () => void }) {
  const rows = listRows(kind, open, grading);
  return (
    <Drawer label={TITLE[kind]} title={<><h2 class="hm-drawer-t">{TITLE[kind]} · {kind === "open" ? open.length : rows.reduce((n, r) => n + r.n, 0)}</h2><div class="page-sub">{HINT[kind]}</div></>} onClose={onClose}>
      {rows.length === 0 ? <EmptyState icon="circle-check" text="ไม่มีรายการ" /> : rows.map((r) => {
        const subj = subjectById(r.a.assignment.subject_id);
        return (
          <button class="hm-follow" onClick={() => {
            onClose();
            navigate("/gradebook", {
              class: r.classId, subject: r.a.assignment.subject_id, asg: r.a.assignment.id,
              rows: kind === "awaiting" ? "awaiting" : kind === "missing" ? "missing" : undefined,
            });
          }}>
            <Chip tone="muted">{classById(r.classId)?.name}</Chip>
            <div class="grow" style="min-width:0">
              <div class="hm-ell" style="font-weight:500" title={r.a.assignment.title}>{r.a.assignment.title}</div>
              <div class="page-sub">{subj?.name}{r.a.assignment.status === "closed" ? " · ปิดรับแล้ว" : ""}{r.a.assignment.due_date ? ` · ส่ง ${formatThaiDate(r.a.assignment.due_date)}` : ""}</div>
            </div>
            {kind === "open"
              ? <Chip tone="muted">{r.n}/{r.total}</Chip>
              : <Chip tone={kind === "missing" ? "danger" : "accent"} icon={kind === "missing" ? "alert-circle" : "hourglass-empty"}>{kind === "missing" ? "ยังไม่ส่ง" : "รอตรวจ"} {r.n}</Chip>}
          </button>
        );
      })}
    </Drawer>
  );
}
