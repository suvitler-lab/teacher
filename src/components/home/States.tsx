import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { EmptyState } from "../ui";
import { navigate } from "../../router";
import { QuickActions } from "./QuickActions";
import type { Layout } from "../../lib/appearance";

/** a grey block that stands where text or a number will be (still, no shimmer) */
const Skel = ({ w, big }: { w: number; big?: boolean }) => <div class={"hm-skel" + (big ? " big" : "")} style={`width:${w}%`} />;
const SkelCard = ({ lines, class: cls }: { lines: number[]; class?: string }) => (
  <div class={"card hm-skel-card" + (cls ? " " + cls : "")} aria-hidden="true"><Skel w={40} />{lines.map((w) => <Skel w={w} />)}</div>
);

/**
 * The home page while the dashboard is on its way: grey blocks in the shape of the layout the teacher chose (no spinner, no motion;
 * the quick buttons are the real ones and can be pressed at once). After three seconds the words appear, so a slow network
 * is not mistaken for a frozen page (AC-11).
 */
export function HomeSkeleton({ layout }: { layout: Layout }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 3000); return () => clearTimeout(t); }, []);
  return (
    <div aria-busy="true" class={"hm-skeleton hm-skel-" + layout}>
      {layout === "a" && (<>
        <div class="card hm-skel-hero" aria-hidden="true"><Skel w={30} /><Skel w={22} big /><Skel w={60} /></div>
        <QuickActions />
        <div class="hm-skel-cols">
          <SkelCard lines={[100, 85, 60]} /><SkelCard lines={[100, 70]} />
        </div>
      </>)}
      {layout === "b" && (<>
        <QuickActions />
        <div class="hm-skel-panels">{[1, 2, 3].map((n) => <SkelCard key={n} lines={[50, 80, 60]} />)}</div>
        <SkelCard lines={[100, 80, 60]} />
      </>)}
      {layout === "c" && (<>
        <div class="hm-skel-focus">
          <div class="card hm-skel-hero" aria-hidden="true"><Skel w={25} /><Skel w={45} big /><Skel w={70} /></div>
          <SkelCard lines={[90, 80, 70]} />
        </div>
        <QuickActions />
        <div class="hm-skel-panels">{[1, 2, 3].map((n) => <SkelCard key={n} lines={[100, 60]} />)}</div>
      </>)}
      <div class={slow ? "page-sub hm-slow" : "sr-only"} role="status">กำลังโหลดหน้าหลัก…</div>
    </div>
  );
}

/**
 * The dashboard could not be fetched: say whether it is the network or the server, and offer the retry. After a tap the button says
 * "กำลังลอง…" and waits (at most 10 seconds), so a second tap cannot pile a second request on the first.
 */
export function HomeError({ online, onRetry }: { online: boolean; onRetry: () => void | Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 10_000);
    return () => clearTimeout(t);
  }, [busy]);
  const retry = () => {
    if (busy) return;
    setBusy(true);
    Promise.resolve(onRetry()).catch(() => undefined).finally(() => setBusy(false));
  };
  return (
    <div class="card" role="status">
      <EmptyState
        icon={online ? "cloud-x" : "cloud-off"}
        text={online ? "โหลดข้อมูลหน้าหลักไม่สำเร็จ" : "ออฟไลน์ — เครื่องนี้ยังไม่เคยโหลดข้อมูลของเทอมนี้ · สแกนและเช็คชื่อยังใช้ได้"}
        action={<>
          {online && <div class="page-sub" style="margin-bottom:8px">ลองอีกครั้ง หรือรอสักครู่แล้วเปิดใหม่</div>}
          <button disabled={busy} aria-busy={busy} onClick={retry}><Icon name="refresh" size={20} /> {busy ? "กำลังลอง…" : "ลองอีกครั้ง"}</button>
        </>} />
    </div>
  );
}

/** A teacher who got past the first-run set-up but has no class in this year: one card that says what to do next. */
export function NoClassesCard() {
  return (
    <div class="card">
      <EmptyState icon="mood-empty" text="ยังไม่มีห้องเรียน"
        action={<>
          <div class="page-sub" style="margin-bottom:8px">เริ่มจากสร้างห้องแรก แล้วค่อยนำเข้านักเรียน</div>
          <button class="primary" onClick={() => navigate("/settings", { section: "catalog" })}><Icon name="school" size={20} /> ตั้งค่าห้องเรียน</button>
        </>} />
    </div>
  );
}

/** Classes exist, but nobody is in them yet. */
export function NoStudentsCard() {
  return (
    <div class="card">
      <EmptyState icon="mood-empty" text="ยังไม่มีนักเรียนในห้อง"
        action={<>
          <div class="page-sub" style="margin-bottom:8px">นำเข้ารายชื่อจาก Excel หรือเพิ่มทีละคน</div>
          <button class="primary" onClick={() => navigate("/students")}><Icon name="table-import" size={20} /> นำเข้านักเรียน</button>
        </>} />
    </div>
  );
}
