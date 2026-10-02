import { useEffect, useState } from "preact/hooks";
import "../styles/report.css";
import { Icon } from "../components/Icon";
import { LoadError, TermPicker, YearBanner, PageHeader, ClassChips, Segmented, StatCard, StackBar, EmptyState, NoClassState } from "../components/ui";
import { StudentDrawer } from "../components/StudentDrawer";
import { viewClasses, activeSubjects, rosterCount, classById, workTypeById, selectedTermId, terms, UNASSIGNED } from "../store";
import { api } from "../lib/api";
import { useLoadGuard, type LoadStatus } from "../lib/loader";
import { computeReport, followUpText, type ReportModel, type ReportPayload } from "../lib/report";
import { fullName } from "../lib/names";
import { formatThaiDate, currentMonthIso, monthOptions, formatThaiDateMs } from "../lib/dates";
import { StudentModal } from "./Students";
import type { Student } from "@shared/types";

type SortKey = "number" | "submit" | "score" | "att";

export function ReportsPage() {
  const [classId, setClassId] = useState(viewClasses.value[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState<"term" | "month">("term");
  const [month, setMonth] = useState(currentMonthIso());
  const [att, setAtt] = useState<"daily" | "subject">("daily");
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [model, setModel] = useState<ReportModel | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const begin = useLoadGuard();
  const [msg, setMsg] = useState("");
  const [sort, setSort] = useState<SortKey>("submit");
  const [drawer, setDrawer] = useState<string | null>(null);
  const [editStu, setEditStu] = useState<Student | null>(null);

  async function load() {
    if (!classId) { setStatus("ready"); return; }
    const fresh = begin();
    // never keep showing the previous class/term/month while the new one loads (or fails)
    setStatus("loading"); setPayload(null); setModel(null);
    try {
      const q = new URLSearchParams({ class: classId });
      if (selectedTermId.value) q.set("term", selectedTermId.value);
      if (period === "month") q.set("month", month);
      if (subjectId) q.set("subject", subjectId);
      if (att === "subject" && subjectId) q.set("att", "subject");
      const p = await api.get<ReportPayload>(`/api/reports/summary?${q}`);
      if (!fresh()) return; // the teacher already picked something else
      setPayload(p);
      setModel(computeReport(p));
      setStatus("ready");
    } catch {
      if (fresh()) setStatus("error");
    }
  }
  useEffect(() => { load(); }, [classId, subjectId, month, period, att, selectedTermId.value]);
  // the term changed: the class we were on may not exist in that year
  useEffect(() => {
    if (!viewClasses.value.some((c) => c.id === classId)) setClassId(viewClasses.value[0]?.id ?? "");
  }, [selectedTermId.value]);

  const cls = classById(classId);
  const subj = activeSubjects.value.find((s) => s.id === subjectId);
  const term = terms.value.find((t) => t.id === selectedTermId.value);
  const termLabel = selectedTermId.value === UNASSIGNED ? "ยังไม่ระบุเทอม" : (term?.name ?? "ทั้งเทอม");
  const periodLabel = period === "term" ? termLabel : (monthOptions().find((m) => m.value === month)?.label ?? month);

  async function exportExcel() {
    if (!model || !payload) return;
    setMsg("กำลังสร้างไฟล์ Excel…");
    const { exportExcel } = await import("../lib/excel");
    await exportExcel(model, payload, {
      className: cls?.name ?? "", subjectName: subj?.name ?? "ทุกวิชา", periodLabel,
      workTypeName: (id) => workTypeById(id)?.name ?? "-", fullName,
    });
    setMsg("ดาวน์โหลด Excel แล้ว"); setTimeout(() => setMsg(""), 2500);
  }
  function copyLine() {
    if (!model) return;
    const lines = followUpText(model.followUp, `${cls?.name ?? ""} ${subj?.name ?? ""}`, formatThaiDateMs(Date.now()));
    navigator.clipboard?.writeText(lines).then(() => { setMsg("คัดลอกไปวางใน LINE ได้เลย"); setTimeout(() => setMsg(""), 2500); }, () => setMsg("คัดลอกไม่สำเร็จ"));
  }

  const unitLabel = model?.attendance.unit === "period" ? "คาบ" : "วัน";

  // attendance mix
  const attMix = model ? model.students.reduce((a, s) => ({
    present: a.present + s.attendance.present, late: a.late + s.attendance.late, leave: a.leave + s.attendance.leave,
    sick: a.sick + s.attendance.sick, absent: a.absent + s.attendance.absent,
  }), { present: 0, late: 0, leave: 0, sick: 0, absent: 0 }) : null;
  const attTotal = attMix ? attMix.present + attMix.late + attMix.leave + attMix.sick + attMix.absent : 0;

  // score distribution buckets
  const buckets = [0, 0, 0, 0, 0]; // <50, 50-59, 60-69, 70-79, 80+
  if (model) for (const s of model.students) {
    if (!s.fullScore) continue;
    const pct = (s.score / s.fullScore) * 100;
    const i = pct < 50 ? 0 : pct < 60 ? 1 : pct < 70 ? 2 : pct < 80 ? 3 : 4;
    buckets[i]++;
  }
  const maxBucket = Math.max(1, ...buckets);
  const bucketColor = ["var(--fill-danger)", "var(--fill-warning)", "var(--fill-accent)", "var(--fill-accent)", "var(--fill-success)"];

  const sorted = model ? [...model.students].sort((a, b) => {
    if (sort === "number") return (a.student.number ?? 0) - (b.student.number ?? 0);
    if (sort === "submit") return a.percent - b.percent;
    if (sort === "score") return (a.fullScore ? a.score / a.fullScore : 1) - (b.fullScore ? b.score / b.fullScore : 1);
    const ar = a.attendance.daysMarked ? (a.attendance.present + a.attendance.late) / a.attendance.daysMarked : 1;
    const br = b.attendance.daysMarked ? (b.attendance.present + b.attendance.late) / b.attendance.daysMarked : 1;
    return ar - br;
  }) : [];

  const classItems = viewClasses.value.map((c) => ({ id: c.id, name: c.name, count: rosterCount(c.id, selectedTermId.value) }));

  if (viewClasses.value.length === 0) return <div><PageHeader icon="chart-bar" title="รายงานสรุป" actions={<TermPicker />} /><NoClassState /></div>;

  return (
    <div>
      <PageHeader icon="chart-bar" title="รายงานสรุป" sub={<span>{cls?.name} · {subj?.name ?? "ทุกวิชา"} · {periodLabel}</span>}
        actions={<>
          <TermPicker />
          {msg && <span class="chip" style="background:var(--bg-success);color:var(--text-success)">{msg}</span>}
          <button onClick={() => window.print()} disabled={status !== "ready" || !model}><Icon name="printer" size={16} /> พิมพ์</button>
          <button class="primary" onClick={exportExcel} disabled={status !== "ready" || !model}><Icon name="file-spreadsheet" size={16} /> ส่งออก Excel</button>
        </>}
      />

      <YearBanner note="รายงานและ Excel ตรงกับตอนนั้น" />
      <div style="margin-bottom:8px"><ClassChips items={classItems} value={classId} onPick={setClassId} /></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <select value={subjectId} onInput={(e) => setSubjectId((e.target as HTMLSelectElement).value)} style="width:auto;height:32px">
          <option value="">ทุกวิชา</option>
          {activeSubjects.value.map((s) => <option value={s.id}>{s.name}</option>)}
        </select>
        <Segmented value={period} onChange={setPeriod} options={[{ value: "term", label: "ทั้งเทอม" }, { value: "month", label: "รายเดือน" }]} />
        {period === "month" && (
          <select value={month} onInput={(e) => setMonth((e.target as HTMLSelectElement).value)} style="width:auto;height:32px">
            {monthOptions().map((m) => <option value={m.value}>{m.label}</option>)}
          </select>
        )}
        <span class="grow" />
        <span class="page-sub">เช็คชื่อ:</span>
        <Segmented value={att} onChange={setAtt} options={[{ value: "daily", label: "รายวัน" }, { value: "subject", label: "รายคาบ (วิชานี้)", disabled: !subjectId }]} />
      </div>

      {payload?.range.termDatesMissing && (
        <div class="row" style="gap:8px;padding:8px 12px;border-radius:10px;background:var(--bg-warning);color:var(--text-warning);margin-bottom:10px;font-size:13px">
          <Icon name="alert-triangle" size={16} /> เทอมนี้ยังไม่ได้ตั้งช่วงวันที่ การนับเช็คชื่ออาจไม่ครบ — ตั้งวันเริ่ม/สิ้นสุดในหน้าตั้งค่า
        </div>
      )}
      {payload?.range.from && (
        <div class="rp-range"><Icon name="calendar-stats" size={14} /> ช่วงข้อมูล {formatThaiDate(payload.range.from)} – {payload.range.to ? formatThaiDate(payload.range.to) : "ปัจจุบัน"} · งาน {payload.assignments.length} ชิ้น · เช็คชื่อ {payload.attendanceSessions.length} {payload.range.att === "subject" ? "คาบ" : "วัน"}</div>
      )}

      {status === "error" ? (
        <LoadError onRetry={load} />
      ) : !model ? (
        <div class="card"><EmptyState icon="loader-2" text="กำลังโหลด…" /></div>
      ) : model.students.length === 0 ? (
        <div class="card"><EmptyState text="ห้องนี้ยังไม่มีนักเรียน" /></div>
      ) : (
        <>
          <div class="stat-row" style="margin-bottom:12px">
            <StatCard label="อัตราส่งงาน" value={`${model.metrics.submitRate}%`} tone="success" icon="checks" hint={`ส่งแล้ว ${model.students.reduce((n, s) => n + s.submitted, 0)} จาก ${model.students.reduce((n, s) => n + s.applicable, 0)} ที่ถึงกำหนด` + (model.students.reduce((n, s) => n + s.pending, 0) > 0 ? ` · ยังไม่ถึงกำหนด ${model.students.reduce((n, s) => n + s.pending, 0)}` : "")} />
            <StatCard label="งานค้าง" value={model.metrics.missingCount} unit="ชิ้น" valueTone="danger" tone="danger" icon="alert-circle" hint={`นักเรียน ${model.followUp.length} คน`} />
            <StatCard label="คะแนนเฉลี่ย" value={`${model.metrics.avgScorePercent}%`} icon="star" hint="เฉพาะงานที่ตรวจแล้ว" />
            <StatCard label="มาเรียน" value={model.metrics.attendanceRate == null ? "—" : `${model.metrics.attendanceRate}%`} tone="success" icon="user-check"
              hint={model.metrics.attendanceRate == null ? "ยังไม่มีข้อมูลเช็คชื่อในช่วงนี้" : `จาก ${model.attendance.sessions} ${unitLabel} · ขาดรวม ${attMix?.absent ?? 0} ครั้ง`} />
          </div>

          <div class="rp-cols">
            <div class="card">
              <div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:500">อัตราการส่งรายงาน</span></div>
              {model.assignments.length === 0 ? <div class="page-sub">ยังไม่มีงานในช่วงนี้</div> : (
                <div class="rp-bars">
                  {model.assignments.map((a) => {
                    const overdue = a.assignment.due_date && model.today > a.assignment.due_date;
                    const color = !overdue ? "var(--border-strong)" : a.rate >= 85 ? "var(--fill-accent)" : a.rate >= 60 ? "var(--fill-warning)" : "var(--fill-danger)";
                    return (
                      <div>
                        <span class="lbl" title={a.assignment.title}>{a.assignment.title}</span>
                        <div class="track"><div style={`width:${a.rate}%;background:${color}`} /></div>
                        <span class="num">{a.submitted}/{a.total}</span>
                        <span class="pct" style={overdue ? "" : "color:var(--text-secondary);font-weight:400"}>{overdue ? a.rate + "%" : "เก็บอยู่"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div class="rp-legend">
                <span><span class="dot" style="background:var(--fill-accent)" />85% ขึ้นไป</span>
                <span><span class="dot" style="background:var(--fill-warning)" />60–84%</span>
                <span><span class="dot" style="background:var(--fill-danger)" />ต่ำกว่า 60%</span>
                <span><span class="dot" style="background:var(--border-strong)" />ยังไม่ถึงกำหนด</span>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
              <div class="card">
                <div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:500">การมาเรียน{model.attendance.unit === "period" ? " (รายคาบ)" : ""}</span><span class="page-sub" style="font-variant-numeric:tabular-nums">{attTotal.toLocaleString("th-TH")} ครั้ง · {model.attendance.sessions} {unitLabel}</span></div>
                {attTotal === 0 && <div class="page-sub">ยังไม่มีข้อมูลเช็คชื่อในช่วงนี้</div>}
                {attMix && attTotal > 0 && <StackBar segments={[
                  { value: attMix.present, color: "var(--fill-success)" }, { value: attMix.late, color: "var(--fill-warning)" },
                  { value: attMix.leave, color: "var(--fill-accent)" }, { value: attMix.sick, color: "var(--fill-purple)" }, { value: attMix.absent, color: "var(--fill-danger)" },
                ]} />}
                {attMix && attTotal > 0 && <div class="rp-legend" style="margin-top:6px">
                  <span><span class="dot" style="background:var(--fill-success)" />มา {attMix.present}</span>
                  <span><span class="dot" style="background:var(--fill-warning)" />สาย {attMix.late}</span>
                  <span><span class="dot" style="background:var(--fill-accent)" />ลา {attMix.leave}</span>
                  <span><span class="dot" style="background:var(--fill-purple)" />ป่วย {attMix.sick}</span>
                  <span><span class="dot" style="background:var(--fill-danger)" />ขาด {attMix.absent}</span>
                </div>}
              </div>
              <div class="card">
                <div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-weight:500">การกระจายคะแนนสะสม</span><span class="page-sub">{model.students.length} คน</span></div>
                <div class="rp-hist">
                  {buckets.map((n, i) => <div class="col"><span class="n">{n}</span><div class="bar" style={`height:${Math.round((n / maxBucket) * 54)}px;background:${bucketColor[i]}`} /></div>)}
                </div>
                <div class="rp-histx"><span>&lt;50</span><span>50–59</span><span>60–69</span><span>70–79</span><span>80+</span></div>
              </div>
            </div>
          </div>

          <div class="rp-cols">
            <div class="card">
              <div class="row" style="justify-content:space-between;margin-bottom:6px">
                <span style="font-weight:500">ต้องติดตาม ({model.followUp.length} คน)</span>
                <button class="ghost" style="height:26px;font-size:12px" onClick={copyLine}><Icon name="brand-line" size={14} /> คัดลอกไป LINE</button>
              </div>
              {model.followUp.length === 0 ? (
                <div class="page-sub" style="color:var(--text-success)"><Icon name="circle-check" size={14} /> ส่งงานครบทุกคน</div>
              ) : model.followUp.slice(0, 8).map((f) => (
                <button class="rp-follow" onClick={() => setDrawer(f.student.id)}>
                  <span class="muted num" style="width:16px">{f.student.number ?? "-"}</span>
                  <div class="grow" style="min-width:0"><div style="font-size:13px">{fullName(f.student)}</div><div class="page-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{f.missing.slice(0, 3).join(" · ")}{f.missing.length > 3 ? " …" : ""}</div></div>
                  <span class="chip" style="background:var(--bg-danger);color:var(--text-danger)">ค้าง {f.missing.length}</span>
                </button>
              ))}
            </div>

            <div class="card" style="padding:6px 8px">
              <div class="row" style="justify-content:space-between;padding:4px 4px 6px"><span style="font-weight:500">รายบุคคล</span></div>
              <table class="rp-table">
                <colgroup><col style="width:22px" /><col /><col style="width:52px" /><col style="width:78px" /><col style="width:44px" /></colgroup>
                <thead><tr>
                  <th class={sort === "number" ? "on" : ""} onClick={() => setSort("number")}>#</th>
                  <th>ชื่อ</th>
                  <th class={"num " + (sort === "submit" ? "on" : "")} onClick={() => setSort("submit")}>ส่ง</th>
                  <th class={"num " + (sort === "score" ? "on" : "")} onClick={() => setSort("score")}>สะสม</th>
                  <th class={"num " + (sort === "att" ? "on" : "")} onClick={() => setSort("att")}>มา</th>
                </tr></thead>
                <tbody>
                  {sorted.map((s) => {
                    const scorePct = s.fullScore ? Math.round((s.score / s.fullScore) * 100) : null;
                    const attPct = s.attendance.daysMarked ? Math.round(((s.attendance.present + s.attendance.late) / s.attendance.daysMarked) * 100) : null;
                    return (
                      <tr onClick={() => setDrawer(s.student.id)}>
                        <td class="muted">{s.student.number ?? "-"}</td>
                        <td class="name">{fullName(s.student)}</td>
                        <td class="num" style={s.missing > 0 ? "color:var(--text-danger)" : ""}>{s.submitted}/{s.applicable}</td>
                        <td class="num">{scorePct != null ? <><span class="rp-mini"><i style={`width:${scorePct}%;background:${scorePct < 60 ? "var(--fill-warning)" : "var(--fill-success)"}`} /></span>{scorePct}%</> : "—"}</td>
                        <td class="num">{attPct != null ? attPct + "%" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {drawer && <StudentDrawer studentId={drawer} classId={classId} onClose={() => setDrawer(null)} onEdit={(s) => { setDrawer(null); setEditStu(s); }} />}
      {editStu && <StudentModal student={editStu} classId={classId} onClose={() => setEditStu(null)} onSaved={() => { setEditStu(null); load(); }} />}
    </div>
  );
}
