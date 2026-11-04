import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { EmptyState } from "../ui";
import { navigate } from "../../router";
import { PageCols } from "../PageCols";

/**
 * The home page while the dashboard is on its way: four grey tiles and three grey cards where the numbers and cards
 * will be (no spinner, no motion). After three seconds the words appear, so a slow network is not mistaken for a frozen page.
 */
export function HomeSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 3000); return () => clearTimeout(t); }, []);
  const card = (key: number, lines: number[]) => (
    <div class="card" key={key} aria-hidden="true">
      <div class="hm-skel" style="width:40%" />
      {lines.map((w) => <div class="hm-skel" style={`width:${w}%`} />)}
    </div>
  );
  return (
    <div aria-busy="true">
      <div class="stat-row hm-stats">
        {[1, 2, 3, 4].map((n) => (
          <div class="uc-stat" key={n} aria-hidden="true">
            <div class="hm-skel" style="width:50%" />
            <div class="hm-skel big" style="width:35%" />
            <div class="hm-skel" style="width:70%" />
          </div>
        ))}
      </div>
      <PageCols keys={["1", "2", "3"]} max={3} weightOf={(k) => (k === "3" ? 2 : 3)} render={(k) => card(Number(k), k === "3" ? [100, 70] : [100, 85, 60])} />
      <div class={slow ? "page-sub hm-slow" : "sr-only"} role="status">กำลังโหลดหน้าหลัก…</div>
    </div>
  );
}

/** The dashboard could not be fetched: say whether it is the network or the server, and offer the retry. */
export function HomeError({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  return (
    <div class="card" role="status">
      <EmptyState
        icon={online ? "cloud-x" : "cloud-off"}
        text={online ? "โหลดข้อมูลหน้าหลักไม่สำเร็จ" : "ออฟไลน์ — เครื่องนี้ยังไม่เคยโหลดข้อมูลของเทอมนี้ · สแกนและเช็คชื่อยังใช้ได้"}
        action={<button onClick={onRetry}><Icon name="refresh" size={20} /> ลองอีกครั้ง</button>} />
    </div>
  );
}

/** A teacher who got past the first-run set-up but has no class in this year: one card that says what to do next. */
export function NoClassesCard() {
  return (
    <div class="card">
      <EmptyState icon="mood-empty" text="ยังไม่มีห้องเรียน"
        action={<button class="primary" onClick={() => navigate("/settings", { section: "catalog" })}><Icon name="school" size={20} /> ตั้งค่าห้องเรียน</button>} />
    </div>
  );
}

/** Classes exist, but nobody is in them yet. */
export function NoStudentsCard() {
  return (
    <div class="card">
      <EmptyState icon="mood-empty" text="ยังไม่มีนักเรียนในห้อง"
        action={<button class="primary" onClick={() => navigate("/students")}><Icon name="table-import" size={20} /> นำเข้านักเรียน</button>} />
    </div>
  );
}
