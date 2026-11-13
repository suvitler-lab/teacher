import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { missingLine, type HeroNumbers } from "./studentsLogic";
import type { StuFilter } from "./StudentParts";

/**
 * The four numbers of the class (AC-176/177): นักเรียน · ส่งงานครบ · มีงานค้าง · มาเรียนเฉลี่ย. Icon + words, `aria-live=off`.
 * While the stats are not ready the three stat tiles show "—" (never 0) and the filter buttons are off.
 */
export function StudentsHero({ n, hasClass, ready, loading, hide, filter, onFilter }: {
  n: HeroNumbers; hasClass: boolean; ready: boolean; loading: boolean; hide: boolean; filter: StuFilter; onFilter: (f: StuFilter) => void;
}) {
  const dash = "—";
  const line = ready && n.withMissing > 0 ? missingLine(n.missingKids, hide) : "";
  const avg = ready && n.avgAtt != null ? `${n.avgAtt}%` : dash;
  return (
    <section class="stu-hero" aria-labelledby="sk-sum" aria-live="off" aria-busy={loading || undefined}>
      <h2 id="sk-sum" class="sr-only">สรุปห้อง</h2>
      <div class="stu-tile">
        <Icon name="users" size={20} /><span class="tx"><span class="tl">นักเรียน</span><span class="tv">{hasClass ? `${n.total} คน` : dash}</span></span>
      </div>
      <button type="button" class="stu-tile" aria-pressed={filter === "done"} disabled={!ready}
        aria-label={ready ? `ส่งงานครบ ${n.done} คน — กรองรายการ` : "ส่งงานครบ ยังไม่พร้อม"} onClick={() => onFilter(filter === "done" ? "all" : "done")}>
        <Icon name="circle-check" size={20} class="ok" /><span class="tx"><span class="tl">ส่งงานครบ</span><span class="tv ok">{ready ? `${n.done} คน` : dash}</span></span>
      </button>
      <button type="button" class="stu-tile" aria-pressed={filter === "missing"} disabled={!ready || n.withMissing === 0}
        aria-label={ready ? `มีงานค้าง ${n.withMissing} คน — กรองรายการ` : "มีงานค้าง ยังไม่พร้อม"} onClick={() => onFilter(filter === "missing" ? "all" : "missing")}>
        <Icon name="alert-circle" size={20} class={ready && n.withMissing > 0 ? "bad" : undefined} />
        <span class="tx"><span class="tl">มีงานค้าง</span><span class={"tv" + (ready && n.withMissing > 0 ? " bad" : "")}>{ready ? `${n.withMissing} คน` : dash}</span>{line && <span class="ts">{line}</span>}</span>
      </button>
      <div class="stu-tile">
        <Icon name="user-check" size={20} /><span class="tx"><span class="tl">มาเรียนเฉลี่ย</span><span class="tv">{avg}</span>{ready && n.avgAtt != null && <span class="ts">{n.attended}/{n.sessions} ครั้ง · ทุกวิชา</span>}</span>
      </div>
    </section>
  );
}

/** "ตัวเลขสถิติ: ทุกวิชา · ทั้งเทอม · ข้อมูลล่าสุด 16:42" + [โหลดใหม่] (P2). Reload is off offline. */
export function StatsMeta({ updatedAt, onReload, found, total, sortText }: { updatedAt: number | null; onReload: () => void; found: number; total: number; sortText: string }) {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);
  const hhmm = updatedAt ? new Date(updatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }) : null;
  return (
    <div class="stu-meta">
      <span>ตัวเลขสถิติ: ทุกวิชา · ทั้งเทอม{hhmm ? ` · ข้อมูลล่าสุด ${hhmm}` : ""}</span>
      <span role="status" aria-live="polite" class="stu-found">พบ {found} จาก {total} คน · เรียงตาม {sortText}</span>
      <button type="button" class="ghost stu-reload" onClick={onReload} disabled={!online} title={online ? undefined : "โหลดใหม่ได้เมื่อมีเน็ต"}>
        <Icon name="refresh" size={16} /> <span class="stu-rl">โหลดใหม่</span>{!online && <span class="page-sub"> · โหลดใหม่ได้เมื่อมีเน็ต</span>}
      </button>
    </div>
  );
}

/** Keep the latest successful load time (the page owns the data, this only stamps it). */
export function useStamp(ready: boolean, key: unknown): number | null {
  const [t, setT] = useState<number | null>(null);
  const last = useRef(key);
  useEffect(() => { if (ready) { setT(Date.now()); last.current = key; } }, [ready, key]);
  return t;
}

