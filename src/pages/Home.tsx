import { useEffect, useState } from "preact/hooks";
import type { JSX } from "preact";
import "../styles/home.css";
import { YearBanner } from "../components/ui";
import { HomeSkeleton, HomeError, NoClassesCard, NoStudentsCard } from "../components/home/States";
import { HomeTopbar } from "../components/home/Topbar";
import { HideBanner } from "../components/home/HideBanner";
import { Greeting } from "../components/home/Greeting";
import { QuickActions } from "../components/home/QuickActions";
import { ResumeScan } from "../components/home/Resume";
import { CardSettings } from "../components/home/CardSettings";
import { ListDrawer } from "../components/home/ListDrawer";
import { TodayLive } from "../components/home/today";
import { buildHomeModel } from "../components/home/model";
import type { HomeLayoutProps, ListKind } from "../components/home/meta";
import { LayoutA } from "../components/home/a";
import { LayoutB } from "../components/home/b";
import { LayoutC } from "../components/home/c";
import { selectedTermId, viewingPastYear, viewClasses, studentsByClass } from "../store";
import { online } from "../lib/outbox";
import { dashboard, dashboardStale, dashboardAt, dashboardStatus, loadDashboard } from "../lib/dashboard";
import { hideNames } from "../lib/homePrefs";
import { appearance, type Layout } from "../lib/appearance";
import { layoutCardsOf, visibleLayoutCards } from "../lib/homeLayout";

const BODY: Record<Layout, (p: HomeLayoutProps) => JSX.Element> = { a: LayoutA, b: LayoutB, c: LayoutC };

/**
 * The home page: the part every layout shares (top bar, hide-names strip, "ปรับหน้าหลัก", the numbers, the states — loading, empty,
 * offline, error) lives here; the picture of the page is one of three layouts chosen in ตั้งค่า > หน้าตา (a / b / c in components/home).
 * The order of the states is the old one: no rooms -> failed with nothing saved -> loading -> nobody in the rooms -> the page.
 */
export function Home() {
  const layout = appearance.value.layout;
  const [list, setList] = useState<ListKind | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  // BR-02: rows the teacher pushed back; this visit only (not saved), so a reload goes back to the BR-01 order
  const [deferred, setDeferred] = useState<string[]>([]);
  const [said, setSaid] = useState<string | undefined>(undefined);

  useEffect(() => { loadDashboard(selectedTermId.value); setDeferred([]); }, [selectedTermId.value]);

  const d = dashboard.value;
  const status = dashboardStatus.value;
  const pastYear = viewingPastYear.value;
  const rooms = viewClasses.value;
  const noClasses = rooms.length === 0;
  const open = d?.openAssignments ?? [];
  const grading = d?.gradingAssignments ?? [];
  const hasKids = (d?.attendanceToday ?? []).some((a) => a.total > 0);
  // classes exist but nobody is in them (judged from the roster, and only once the dashboard agrees)
  const noStudents = !noClasses && !!d && !hasKids && [...open, ...grading].every((a) => a.perClass.every((p) => p.total === 0)) && rooms.every((c) => (studentsByClass.value.get(c.id)?.length ?? 0) === 0);
  const model = d ? buildHomeModel(d, deferred, hideNames.value) : null;
  const showBody = !noClasses && !!model && !noStudents;

  // the big number changed because the data changed (a row went away): say it again; a push-back message stands until then
  const count = model?.todayCount ?? 0;
  useEffect(() => { setSaid(undefined); }, [count]);

  const props: HomeLayoutProps | null = model ? {
    layout, model,
    cards: visibleLayoutCards(layoutCardsOf(layout)),
    hide: hideNames.value,
    pastYear,
    onDefer: (key) => {
      const row = model.todo.find((r) => r.key === key);
      if (!row || row.later) return;
      setDeferred((cur) => [...cur.filter((k) => k !== key), key]);
      setSaid(`ย้าย ${row.title} ไปท้ายคิวแล้ว`);
    },
    openList: setList,
    openCustomize: () => setPrefsOpen(true),
  } : null;
  const Body = BODY[layout];

  return (
    <div class="hm pg" data-hm-layout={layout}>
      <HomeTopbar stale={dashboardStale.value} at={dashboardAt.value} onCustomize={() => setPrefsOpen(true)} />
      <YearBanner note="สิ่งที่ค้างของปีนั้นยังตรวจและแก้คะแนนได้" />
      <HideBanner />
      {showBody && !pastYear && <TodayLive count={count} said={said} />}

      {showBody && props ? <Body {...props} /> : (<>
        <Greeting />
        {noClasses ? (<>
          <QuickActions />
          {!pastYear && <ResumeScan />}
          <NoClassesCard />
        </>) : status === "error" && !d ? (<>
          <QuickActions />
          {!pastYear && <ResumeScan />}
          <HomeError online={online.value && navigator.onLine} onRetry={() => loadDashboard(selectedTermId.value, { force: true })} />
        </>) : !d ? (
          <HomeSkeleton layout={layout} />
        ) : (<>
          <QuickActions />
          {!pastYear && <ResumeScan />}
          <NoStudentsCard />
        </>)}
      </>)}

      {prefsOpen && <CardSettings layout={layout} onClose={() => setPrefsOpen(false)} />}
      {list && <ListDrawer kind={list} open={open} grading={grading} onClose={() => setList(null)} />}
    </div>
  );
}
