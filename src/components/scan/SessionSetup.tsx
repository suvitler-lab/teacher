import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon";
import { PageHeader, TermPicker } from "../../components/ui";
import { activeClasses, activeSubjects, assignments, studentsByClass, subjectById, workTypeById, selectedTermId, setSelectedTerm, currentTermId, viewingPastYear, UNASSIGNED, loadBootstrap } from "../../store";
import type { ScanMode } from "@shared/types";
import { bkkToday } from "@shared/time";
import { api } from "../../lib/api";
import { scanLayout } from "../../lib/pageCards";
import { PageCardSettings } from "../../components/cards/PageCardSettings";
import { HideButton, HideNotice } from "./hide";
import { ProjectorButton } from "../../components/Projector";
import { projectorOn } from "../../lib/projector";
import { SCAN_META, SCAN_LOCKED_TEXT } from "./ScanSide";
import { dashboard, loadDashboard } from "../../lib/dashboard";
import { routeParams, navigate } from "../../router";
import { startSession, thaiDayMonth, dueWord, MODE_LABEL, startSetupRefresh } from "./state";
import { ScanProjectorIdle } from "./ScanSummary";

// ---------------------------------------------------------------------------
// The picker: choose the work, the room, how to score — then start the round.
// ---------------------------------------------------------------------------
export function SessionSetup() {
  const params = routeParams();
  // an earlier academic year's classes are closed: scanning is for this year's work only
  const past = viewingPastYear.value;
  const open = past ? [] : assignments.value.filter((a) => a.status === "open" && (
    !selectedTermId.value ? true
      : selectedTermId.value === UNASSIGNED ? a.term_id == null
      : a.term_id === selectedTermId.value));
  const [subjectFilter, setSubjectFilter] = useState("");
  // the work due soonest is offered first (and picked at the start): it is the one the teacher is most likely collecting
  const byDue = (a: { due_date: string | null }, b: { due_date: string | null }) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  const [assignmentId, setAssignmentId] = useState(params.asg || open.slice().sort(byDue)[0]?.id || "");
  const asg = open.find((a) => a.id === assignmentId) ?? null;
  const classesForAsg = asg ? activeClasses.value.filter((c) => asg.class_ids.includes(c.id)) : [];
  const [classId, setClassId] = useState(params.class || classesForAsg[0]?.id || "");
  // a link opened before the lists were loaded starts empty: pick the usual defaults as soon as they arrive
  useEffect(() => {
    if (assignmentId || open.length === 0) return;
    const first = open.slice().sort(byDue)[0];
    if (first) { setAssignmentId(first.id); if (!classId) setClassId(first.class_ids[0] ?? ""); }
  }, [open.length]);
  const [mode, setMode] = useState<ScanMode>("full");
  const [showAll, setShowAll] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const layout = scanLayout.value;
  const today = bkkToday();

  // Home just read it (and nothing was written since): do not read ~10,000 rows again to show the same numbers
  useEffect(() => { loadDashboard(selectedTermId.value, { maxAgeMs: 60_000 }); }, [selectedTermId.value]);
  useEffect(() => startSetupRefresh(() => loadBootstrap()) /* NOT the dashboard: it reads ~10,000 rows per call at school size */, []);
  useEffect(() => {
    // only a room that is still in use can be picked (an archived room is never offered or started)
    if (asg && !classesForAsg.some((c) => c.id === classId)) setClassId(classesForAsg[0]?.id ?? "");
  }, [assignmentId, activeClasses.value.length]);

  const filtered = (subjectFilter ? open.filter((a) => a.subject_id === subjectFilter) : open).slice().sort(byDue);
  // the picked work always stays in the list, even when it is not among the first five
  const first = filtered.slice(0, 5);
  const shown = showAll || filtered.length <= 5 ? filtered : (asg && !first.some((a) => a.id === asg.id) && filtered.some((a) => a.id === asg.id) ? [...first, asg] : first);
  // The picked work's "ส่งแล้ว x/y" is read fresh from the server (the dashboard is loaded once and goes stale while
  // the teacher scans). y = the class without the children marked ยกเว้น. Other works keep the dashboard's numbers.
  const [liveFailed, setLiveFailed] = useState(false);
  const [live, setLive] = useState<{ aid: string; rows: { student_id: string; status: string }[] } | null>(null);
  const fetchLive = () => {
    const aid = assignmentId;
    if (!aid) return Promise.resolve();
    return api.get<{ submissions: { student_id: string; status: string }[] }>(`/api/assignments/${aid}/submissions`)
      .then((r) => { if (aid !== assignmentIdRef.current) return; setLiveFailed(false); setLive((cur) => (aid === assignmentIdRef.current ? { aid, rows: r.submissions } : cur)); })
      .catch(() => { if (aid !== assignmentIdRef.current) return; setLiveFailed(true); /* offline: keep the remembered numbers, and say they may be old */ });
  };
  const assignmentIdRef = useRef(assignmentId);
  assignmentIdRef.current = assignmentId;
  useEffect(() => { setLive(null); void fetchLive(); }, [assignmentId]);
  useEffect(() => startSetupRefresh(fetchLive), [assignmentId]);
  const progressFor = (aid: string, cid: string) => {
    if (live && live.aid === aid) {
      const kids = studentsByClass.value.get(cid) ?? [];
      const by = new Map(live.rows.map((r) => [r.student_id, r.status]));
      const excused = kids.filter((k) => by.get(k.id) === "excused").length;
      const submitted = kids.filter((k) => by.get(k.id) === "submitted").length;
      return { submitted, total: kids.length - excused, excused };
    }
    const da = dashboard.value?.openAssignments.find((x) => x.assignment.id === aid);
    const p = da?.perClass.find((x) => x.classId === cid);
    return p ? { submitted: p.submitted, total: p.total, excused: 0 } : null;
  };
  /** whole days from today to the due date (negative = already past) */
  const daysTo = (due: string) => Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
  const room = classesForAsg.find((c) => c.id === classId);
  const why = !asg ? "เลือกงานก่อน" : !classId ? "เลือกห้องก่อน" : "";

  return (
    <div class="sc-page sc-setup">
      <PageHeader icon="scan" title="สแกนส่งงาน" sub="เลือกงาน ห้อง และวิธีให้คะแนน" actions={<>
        <TermPicker />
        <button class="ghost" aria-label="ปรับการ์ด" onClick={() => setPrefsOpen(true)}><Icon name="layout-grid" size={18} /> <span class="att-hide-sm">ปรับการ์ด</span></button>
        <HideButton cls="ghost" />
        <ProjectorButton />
      </>} />
      <HideNotice />
      {prefsOpen && <PageCardSettings page="scan" title="หน้าสแกน" layout={layout} meta={SCAN_META} locked={SCAN_LOCKED_TEXT} onClose={() => setPrefsOpen(false)} />}
      {projectorOn.value && <ScanProjectorIdle />}
      {open.length === 0 ? (
        <div class="card empty">
          {past ? (<>
            สแกนใช้ได้กับงานของปีการศึกษาปัจจุบันเท่านั้น (ตอนนี้เลือกดูปีที่ผ่านมา) — ตรวจ/แก้คะแนนของปีนั้นได้ที่หน้าสมุดคะแนน
            <div style="margin-top:8px"><button class="primary" onClick={() => setSelectedTerm(currentTermId.value)}>กลับไปภาคเรียนปัจจุบัน</button></div>
          </>) : (<>
            <Icon name="inbox" size={32} />
            <div style="margin-top:6px">ยังไม่มีงานที่เปิดรับในเทอมนี้ — สร้างงานในหน้าสมุดคะแนนก่อน</div>
            <div style="margin-top:10px"><button class="primary" onClick={() => navigate("/gradebook", { new: 1 })}><Icon name="plus" size={18} /> สร้างงาน</button></div>
          </>)}
        </div>
      ) : (
        <>
          <div class="sc-step"><span class="sn">1</span>เลือกงาน
            <span class="grow" />
            {liveFailed
              ? <span class="sc-chip warning" role="status"><Icon name="wifi-off" size={14} /> ข้อมูลเก่า</span>
              : <span class="tip"><Icon name="refresh" size={14} /> ตัวเลขอัปเดตสดจากงานที่เลือก</span>}
          </div>
          {activeSubjects.value.length > 1 && (
            <div class="chips-row" style="margin-bottom:8px">
              <button class={"pill" + (subjectFilter === "" ? " on" : "")} aria-pressed={subjectFilter === ""} onClick={() => setSubjectFilter("")}>ทุกวิชา</button>
              {activeSubjects.value.map((s) => <button class={"pill" + (subjectFilter === s.id ? " on" : "")} aria-pressed={subjectFilter === s.id} onClick={() => setSubjectFilter(s.id)}>{s.name}</button>)}
            </div>
          )}
          <div class="sc-asg-grid" role="group" aria-label="เลือกงาน">
            {shown.map((a) => {
              const wt = workTypeById(a.type_id);
              const left = a.due_date ? daysTo(a.due_date) : null;
              const dueTone = left == null ? "" : left < 0 ? " over" : left <= 2 ? " soon" : "";
              return (
                <button class={"sc-asg" + (a.id === assignmentId ? " on" : "")} aria-pressed={a.id === assignmentId} onClick={() => setAssignmentId(a.id)}>
                  {a.id === assignmentId && <span class="tick"><Icon name="circle-check" size={20} /></span>}
                  <div class="row wrap" style="gap:6px">
                    {wt && <span class={"chip " + wt.color}><Icon name={wt.icon} size={13} /> {wt.name}</span>}
                    <span class="tip">{subjectById(a.subject_id)?.name} · เต็ม {a.full_score}</span>
                  </div>
                  <div class="ttl" title={a.title}>{a.title}</div>
                  <div class="pc">
                    {a.class_ids.map((cid) => {
                      const p = progressFor(a.id, cid);
                      const c = activeClasses.value.find((x) => x.id === cid);
                      return <span class="xy">{c?.name} <b>{p ? `${p.submitted}/${p.total}` : "…"}</b></span>;
                    })}
                    {a.due_date && <span class={"xy" + dueTone}><Icon name="calendar-event" size={14} /> {dueWord(left)} · {thaiDayMonth(a.due_date)}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {filtered.length > 5 && !showAll && (
            <button class="ghost sc-showall" onClick={() => setShowAll(true)}>ดูทั้งหมด ({filtered.length}) <Icon name="chevron-down" size={16} /></button>
          )}

          <div class="sc-step"><span class="sn">2</span>เลือกห้อง</div>
          {classesForAsg.length === 0 && (
            <div class="card empty sc-noroom" role="status">
              <Icon name="users" size={28} />
              <div style="margin-top:6px"><b style="font-weight:500">งานนี้ยังไม่มีห้องที่ใช้งานอยู่</b></div>
              <div class="page-sub">เพิ่มห้องในตั้งค่า หรือเลือกงานอื่น</div>
              <div style="margin-top:8px"><button class="primary" onClick={() => navigate("/settings", { section: "catalog" })}>ตั้งค่าห้องเรียน</button></div>
            </div>
          )}
          <div class="chips-row" role="group" aria-label="เลือกห้อง">
            {classesForAsg.map((c) => {
              const p = progressFor(assignmentId, c.id);
              return (
                <button class={"pill sc-room" + (c.id === classId ? " on" : "")} aria-pressed={c.id === classId} onClick={() => setClassId(c.id)}>
                  {c.id === classId && <Icon name="check" size={13} />}{c.name}
                  <span class="n">{p ? `ส่งแล้ว ${p.submitted}/${p.total}${p.excused > 0 ? ` · ยกเว้น ${p.excused}` : ""}` : "กำลังนับ…"}</span>
                </button>
              );
            })}
          </div>

          <div class="sc-step"><span class="sn">3</span>วิธีให้คะแนน</div>
          <div class="sc-modes" role="group" aria-label="วิธีให้คะแนน">
            {([
              { m: "full", icon: "circle-check", t: "ให้คะแนนเต็ม", s: "ยิงแล้วได้เต็มทันที" },
              { m: "type", icon: "pencil", t: "กรอกทีละคน", s: "ยิงแล้วพิมพ์คะแนน" },
              { m: "later", icon: "inbox", t: "รับงานก่อน", s: "ตรวจแล้วค่อยให้คะแนน" },
            ] as const).map((o) => (
              <button class={"sc-mode" + (mode === o.m ? " on" : "")} aria-pressed={mode === o.m} onClick={() => setMode(o.m)}>
                <Icon name={o.icon} size={24} />
                <span><div class="mt">{o.t}</div><div class="page-sub">{o.s}</div></span>
              </button>
            ))}
          </div>

          <div class="sc-startbar">
            <div class="grow sb-info">
              {asg
                ? (<><div class="sb-t" role="status">รอบนี้: <b>{asg.title}</b>{room?.name ? ` · ${room.name}` : ""} · เต็ม {asg.full_score} · {MODE_LABEL[mode]}</div></>)
                : <div class="page-sub">เลือกงานเพื่อเริ่ม</div>}
            </div>
            <span class="page-sub sb-src"><Icon name="barcode" size={16} /> เครื่องยิง · <Icon name="camera" size={16} /> กล้อง</span>
            <div class="sb-go">
              {why && <span class="page-sub" role="status">{why}</span>}
              <button class="primary" disabled={!classId || !asg} onClick={() => startSession(assignmentId, classId, mode)}>
                <Icon name="scan" size={24} /> เริ่มสแกน {room?.name ?? ""}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
