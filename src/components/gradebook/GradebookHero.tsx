import { Icon } from "../Icon";
import type { WorkStateCounts } from "@shared/metrics";

/** The six cell states of the whole room, in the order of the bar: icon + word + count in the legend, never colour alone (AC-125). */
export const SEG_KEYS = [
  { key: "scored", label: "มีคะแนน", icon: "check" },
  { key: "late", label: "ส่งช้า", icon: "clock" },
  { key: "awaiting", label: "รอตรวจ", icon: "hourglass-empty" },
  { key: "missing", label: "ค้างส่ง", icon: "alert-circle" },
  { key: "pending", label: "ยังไม่ถึงกำหนด", icon: "circle-dashed" },
  { key: "excused", label: "ยกเว้น", icon: "ban" },
] as const;

/** The spoken form of the bar: "มีคะแนน 17 ส่งช้า 2 … จาก 32 ช่อง". */
export function segLabel(c: WorkStateCounts): string {
  return SEG_KEYS.map((s) => `${s.label} ${c[s.key]}`).join(" ") + ` จาก ${c.total} ช่อง`;
}

export interface HeroProps {
  className: string;
  subjectName: string;
  termName: string;
  workCount: number;
  counts: WorkStateCounts;
  submitRate: number;
  rowFilter: "all" | "missing" | "awaiting";
  onRows: (k: "all" | "missing" | "awaiting") => void;
  /** the pill that opens the side drawer: "รอตรวจ 3 งาน · ควรปิดรับ 1 · ต้องติดตาม 2 คน" */
  pill: { awaiting: number | null; close: number | null; follow: number | null };
  onDrawer: () => void;
  drawerOpen: boolean;
  offline: boolean;
  noData: boolean;
}

/** The band above the table: room · subject, the two big numbers (each one filters the rows), work count, submit rate, the 6-part bar. */
export function GradebookHero(p: HeroProps) {
  const c = p.counts;
  const seg = SEG_KEYS.filter((s) => c[s.key] > 0);
  const dash = p.noData ? "–" : undefined;
  // only the parts whose drawer card is on (null = the teacher hid it): the pill never promises what the drawer lacks
  const pillParts = [
    p.pill.awaiting != null ? `รอตรวจ ${p.pill.awaiting} งาน` : null,
    p.pill.close != null ? `ควรปิดรับ ${p.pill.close}` : null,
    p.pill.follow != null ? `ต้องติดตาม ${p.pill.follow} คน` : null,
  ].filter((x): x is string => x !== null);
  const pillSum = (p.pill.awaiting ?? 0) + (p.pill.close ?? 0) + (p.pill.follow ?? 0);
  return (
    <section class="gbh" aria-label="สรุปห้อง">
      <div class="gbh-t">
        <h2 class="gbh-h" title={`${p.className} · ${p.subjectName}`}>{p.className} · {p.subjectName}</h2>
        <span class="gbh-k">{p.termName}</span>
      </div>
      <div class="gbh-n" role="group" aria-label="สรุปห้อง" aria-live="off">
        <button type="button" class="gbh-big" aria-pressed={p.rowFilter === "awaiting"} aria-label={`รอตรวจ ${c.awaiting}`} disabled={p.noData} onClick={() => p.onRows(p.rowFilter === "awaiting" ? "all" : "awaiting")}>
          <Icon name="hourglass-empty" size={18} /><span class="num">{dash ?? c.awaiting}</span><small>รอตรวจ</small>
        </button>
        <button type="button" class="gbh-big" aria-pressed={p.rowFilter === "missing"} aria-label={`ค้างส่ง ${c.missing} ชิ้น`} disabled={p.noData} onClick={() => p.onRows(p.rowFilter === "missing" ? "all" : "missing")}>
          <Icon name="alert-circle" size={18} /><span class="num">{dash ?? c.missing}</span><small>ค้างส่ง</small>
        </button>
        <span class="gbh-sm"><b>{p.workCount}</b><small>งาน</small></span>
        <span class="gbh-sm" tabIndex={0} title="อัตราส่งรวม = ส่งแล้ว ÷ (ส่งแล้ว + ค้างส่ง) ไม่นับยังไม่ถึงกำหนดและยกเว้น" aria-label={`อัตราส่ง ${p.noData ? "ไม่มีข้อมูล" : p.submitRate + " เปอร์เซ็นต์"} · อัตราส่งรวม คือ ส่งแล้ว หารด้วย ส่งแล้ว บวก ค้างส่ง ไม่นับยังไม่ถึงกำหนดและยกเว้น`}>
          <small>อัตราส่ง</small>{" "}<b>{dash ?? `${p.submitRate}%`}</b>
        </span>
      </div>
      <div class="gbh-a">
        {p.offline && <span class="gbh-off" role="status"><Icon name="wifi-off" size={16} /> ออฟไลน์ — คะแนนที่กรอกจะส่งเองเมื่อมีเน็ต</span>}
        <button type="button" class="gbh-pill" aria-haspopup="dialog" aria-expanded={p.drawerOpen} aria-label={pillParts.length ? pillParts.join(" · ") : "ดูสรุป"} onClick={p.onDrawer}>
          <span class="lng">{pillParts.length ? pillParts.join(" · ") : "ดูสรุป"}</span>
          <span class="sht">ดูสรุป{pillParts.length ? ` (${pillSum})` : ""}</span>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      {!p.noData && c.total > 0 && (
        <div class="gbh-p">
          <div class="gbh-bar" role="img" aria-label={segLabel(c)}>
            {seg.map((s) => <i key={s.key} class={"gl-" + s.key} style={`flex:${c[s.key]} 1 0`} />)}
          </div>
          <ul class="gbh-leg" aria-hidden="true">
            {SEG_KEYS.map((s) => <li key={s.key}><span class={"sw gl-" + s.key} /><Icon name={s.icon} size={12} />{s.label} {c[s.key]}</li>)}
            <li class="tot">รวม {c.total} ช่อง</li>
          </ul>
        </div>
      )}
    </section>
  );
}
