import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { PageHeader } from "../ui";
import { useConfirm } from "../ConfirmDialog";
import { activeClasses, assignments, studentsByClass, patchAssignment } from "../../store";
import type { Student } from "@shared/types";
import { api } from "../../lib/api";
import { online } from "../../lib/outbox";
import { err, notify } from "../../lib/notify";
import { fullName, shortName } from "../../lib/names";
import { navigate } from "../../router";
import { serverReachable } from "../../lib/session";
import { ended, subsBox, effSubOf, roundHowOf, startSession, Session } from "./state";
import { markOf2 } from "./ScanParts";
import { HideNotice, scanHiding } from "./hide";
import { roundNumbers, nextRoom } from "./summary";

const CAP = 18; // chips per group (UX S9); the rest is "และอีก n คน"

/** The ring of the summary (AC-72): 120px, the percentage big with "ส่งแล้ว" under it. `pct` null = nobody is counted / not known. */
function SummaryRing({ pct, done, of, known }: { pct: number | null; done: number; of: number; known: boolean }) {
  const size = 120, stroke = 12;
  const r = size / 2 - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;
  const frac = known && pct != null ? Math.min(1, pct / 100) : 0;
  const label = !known ? "ยังไม่ทราบว่าใครส่งแล้วบ้าง" : pct == null ? `ส่งแล้ว ${done} จาก ${of} คน` : `ส่งแล้ว ${done} จาก ${of} คน ร้อยละ ${pct}`;
  return (
    <div class="sc-sring" role="img" aria-label={label} style={`width:${size}px;height:${size}px`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hero-chip)" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hero-fg)" stroke-width={stroke}
          stroke-linecap="round" stroke-dasharray={`${circ * frac} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div class="cap" aria-hidden="true">
        <b>{!known ? "ไม่ทราบ" : pct == null ? "—" : `${pct}%`}</b>
        {known && pct != null && <span>ส่งแล้ว</span>}
      </div>
    </div>
  );
}

function Names({ list, tone }: { list: Student[]; tone: string }) {
  const hide = scanHiding();
  return (
    <div class="sc-names">
      {list.slice(0, CAP).map((st) => <span class={"sc-chip " + tone}>{hide ? `เลขที่ ${st.number ?? "-"}` : `${st.number ?? "-"} ${shortName(st)}`}</span>)}
      {list.length > CAP && <span class="sc-chip muted">และอีก {list.length - CAP} คน</span>}
    </div>
  );
}

/**
 * The page after "จบรอบ" (S9 / AC-72–75). Every number is read on this device (the server's copy of the round plus what
 * is still waiting in the queue) — nothing waits for the network. It changes how the round is shown, never how it was
 * decided: the numbers are BR-13/BR-14 and the buttons go where they always went.
 */
export function ScanSummary({ s }: { s: Session }) {
  const asg = assignments.value.find((a) => a.id === s.assignmentId);
  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const classStudents = studentsByClass.value.get(s.classId) ?? [];
  const box = subsBox.value;
  // never say "0 handed in" for a round whose hand-ins were not read (the same rule as the live page)
  const known = box.aid === s.assignmentId && box.status === "ready";
  const subOf = (id: string) => effSubOf(s.assignmentId, id);
  const n = roundNumbers(s.id, classStudents, subOf, roundHowOf);
  const waiting = classStudents.filter((st) => markOf2(s.assignmentId, st.id) === "pend").length;
  const isOpen = asg?.status === "open";
  const next = known && isOpen
    ? nextRoom(asg, s.classId, new Set(activeClasses.value.map((c) => c.id)), (id) => activeClasses.value.find((c) => c.id === id)?.name ?? "", (id) => studentsByClass.value.get(id) ?? [], subOf)
    : null;

  const head = useRef<HTMLDivElement>(null);
  // the page that replaces the round: keyboard and screen-reader users start at its top, not at <body> (♿ S12)
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, []);
  const [copied, setCopied] = useState(false);
  const [copyFail, setCopyFail] = useState(false);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const confirm = useConfirm();
  const hide = scanHiding();
  const up = online.value && serverReachable.value;
  const toBook = (extra?: Record<string, string>) => navigate("/gradebook", { class: s.classId, asg: s.assignmentId, ...extra });

  // said once when the page opens (and again only if the numbers move) — a region that starts empty is announced when it is filled
  const said = known ? `จบรอบ: ส่งแล้ว ${n.submitted.length} จาก ${n.counted} คน` : "";
  const [live, setLive] = useState("");
  useEffect(() => { setLive(said); }, [said]);

  async function copyMissing() {
    if (copied || hide) return; // hidden names: nothing with names may leave the page (AC-77)
    const text = `รายชื่อยังไม่ส่ง "${asg?.title}" ${cls?.name}\n` + n.missing.map((st) => `${st.number ?? "-"}. ${fullName(st)}`).join("\n");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopyFail(false); setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { setCopied(false); timer.current = null; }, 2000);
    } catch { setCopied(false); setCopyFail(true); }
  }
  async function closeWork() {
    if (!asg || closing) return;
    setClosing(true);
    try {
      const res = await api.post<{ assignment: typeof asg }>("/api/assignments", {
        id: asg.id, subject_id: asg.subject_id, type_id: asg.type_id, title: asg.title, unit: asg.unit, assigned_date: asg.assigned_date,
        due_date: asg.due_date, note: asg.note, publish_scores: asg.publish_scores, status: "closed", class_ids: asg.class_ids, term_id: asg.term_id,
      });
      patchAssignment(asg.id, { status: res.assignment.status });
      notify("success", "ปิดรับงานแล้ว · ทุกห้อง");
      head.current?.focus({ preventScroll: true }); // the close button is gone: keep the focus on the page, not <body>
    } catch (e) {
      const msg = (e as Error).message || "";
      err("ปิดรับงานไม่สำเร็จ" + (/[฀-๿]/.test(msg) ? ` — ${msg}` : ""));
    } finally { setClosing(false); }
  }
  async function askClose() {
    if (closing) return;
    const yes = await confirm.ask({
      title: `ปิดรับ “${asg?.title}” ทุกห้อง?`,
      body: <>{n.missing.length > 0 ? <>ห้อง {cls?.name} ยังไม่ส่ง <b>{n.missing.length} คน</b> จะนับเป็นค้างส่ง</> : "ทุกคนในห้องนี้ส่งแล้ว"} · ให้คะแนนย้อนหลังได้ · เปิดรับอีกครั้งได้ในสมุดคะแนน</>,
      yes: "ปิดรับงาน", no: "ยังไม่ปิด", danger: true,
    });
    if (yes) await closeWork();
  }
  // "สแกนต่อ" / "ห้องถัดไป": a new round (a new id) with the same work and mode — the same function that starts any round
  const again = (classId: string) => { ended.value = null; void startSession(s.assignmentId, classId, s.mode); };

  const closeWhy = !up ? "ต้องออนไลน์ถึงปิดรับงานได้" : waiting > 0 ? "รอรายการค้างส่งขึ้นระบบก่อน" : "ปิดทุกห้องของงานนี้ ไม่รับเพิ่มอีก";
  const showLate = !!asg?.due_date || n.late > 0; // no due date → nothing can be late: no box

  return (
    <div class="sc-page sc-sumpage">
      <div ref={head} tabIndex={-1} class="sc-sumfocus"><PageHeader icon="flag-check" title="จบรอบสแกน" sub={asg?.title} /></div>
      <p class="sr-only" role="status" aria-label="ผลจบรอบ">{live}</p>
      <HideNotice />
      {waiting > 0 && (
        <div class="imp-warn sc-sumwait" role="status"><Icon name="cloud-upload" size={18} />
          <span class="grow">รอส่งขึ้นระบบ {waiting} คน — จะส่งเองเมื่อมีเน็ต อย่าเพิ่งปิดงาน</span></div>
      )}
      <div class="sc-sumgrid">
        <section class="sc-sumhero" aria-label="สรุปผลรอบนี้">
          <div class="sc-sumtop">
            <SummaryRing pct={n.pct} done={n.submitted.length} of={n.counted} known={known} />
            <div class="sc-sumhead">
              <div class="sc-sum-t" title={asg?.title}>{asg?.title}</div>
              {known
                ? <p class="sc-sumbig"><b>{n.submitted.length}</b> จาก {n.counted} คน</p>
                : <p class="sc-sumbig dim">{box.status === "loading" ? "กำลังโหลดผลของงานนี้…" : "ยังไม่ทราบว่าใครส่งแล้วบ้าง"}</p>}
              <p class="sc-sumdet">{cls?.name} · เต็ม {s.fullScore}{n.excused.length > 0 ? ` · ไม่นับยกเว้น ${n.excused.length} คน` : ""}</p>
            </div>
          </div>
          {known && (
            <>
              <dl class="sc-sumnums">
                <div><dt><Icon name="check" size={16} /> ส่งแล้ว</dt><dd>{n.submitted.length}</dd></div>
                <div><dt><Icon name="circle-dashed" size={16} /> ยังไม่ส่ง</dt><dd>{n.missing.length}</dd></div>
                {showLate && <div><dt><Icon name="clock" size={16} /> ส่งช้า</dt><dd>{n.late}{n.lateUnknown > 0 && <span class="sc-latewait"> · รอตัดสิน {n.lateUnknown}</span>}</dd></div>}
              </dl>
              {n.how.length > 0 && (
                <p class="sc-sumhow">
                  <span>รอบนี้:</span>
                  {n.how.map((h, i) => (
                    <>
                      {i > 0 && <span aria-hidden="true">·</span>}
                      <span class="sc-howi" data-method={h.key}><Icon name={h.icon} size={16} /> {h.word} {h.n}</span>
                    </>
                  ))}
                </p>
              )}
            </>
          )}
        </section>
        {known ? (
          <div class="sc-sumgroups">
            {n.submitted.length > 0 && (
              <section class="card sc-grp ok" aria-label="ส่งแล้ว">
                <h2 class="sc-h2 tone"><Icon name="check" size={20} /> ส่งแล้ว {n.submitted.length} คน</h2>
                <Names list={n.submitted} tone="success" />
              </section>
            )}
            {n.ungraded.length > 0 && (
              <section class="card sc-grp warn" aria-label="ยังไม่มีคะแนน">
                <div class="row sc-grp-h"><h2 class="sc-h2 tone"><Icon name="pencil" size={20} /> ยังไม่มีคะแนน {n.ungraded.length} คน</h2>
                  <button onClick={() => toBook({ rows: "awaiting" })}>ให้คะแนนตอนนี้</button></div>
                <Names list={n.ungraded} tone="accent" />
              </section>
            )}
            <section class={"card sc-grp " + (n.missing.length > 0 ? "bad" : "ok")} aria-label="ยังไม่ส่ง">
              {n.missing.length > 0 ? (
                <>
                  <div class="row sc-grp-h"><h2 class="sc-h2 tone"><Icon name="circle-dashed" size={20} /> ยังไม่ส่ง {n.missing.length} คน</h2>
                    <button onClick={copyMissing} disabled={hide} title={hide ? "ปิดใช้ตอนซ่อนชื่อ" : undefined} aria-describedby={copyFail ? "sc-copyfail" : undefined}>
                      <Icon name={copied ? "check" : "list-numbers"} size={18} /> <span aria-live="polite">{copied ? "คัดลอกแล้ว" : "คัดลอกรายชื่อ"}</span></button></div>
                  {copyFail && <p id="sc-copyfail" class="sc-copyfail" role="status"><Icon name="alert-triangle" size={16} /> คัดลอกไม่ได้ — กดค้างที่รายชื่อเพื่อคัดลอกเอง</p>}
                  <Names list={n.missing} tone="danger dashed" />
                </>
              ) : (
                <h2 class="sc-h2 tone sc-alldone"><Icon name="check" size={28} /> ทุกคนส่งครบแล้ว</h2>
              )}
            </section>
            {(waiting > 0 || n.excused.length > 0) && (
              <section class="card sc-grp" aria-label="ยกเว้นและรอส่ง">
                {n.excused.length > 0 && <div class="row sc-sumrow"><Icon name="ban" size={20} /> ยกเว้น {n.excused.length} คน</div>}
                {waiting > 0 && <div class="row sc-sumrow" style="color:var(--text-accent)"><Icon name="cloud-upload" size={20} /> รอส่งขึ้นระบบ {waiting} คน</div>}
              </section>
            )}
          </div>
        ) : (
          <div class="sc-sumgroups"><section class="card sc-grp"><p class="page-sub" style="margin:0">ต่อเน็ตแล้วเปิดสมุดคะแนนเพื่อดูว่าใครส่งแล้วบ้าง — ที่สแกนไว้ไม่หาย</p></section></div>
        )}
      </div>
      {isOpen && (
        <div class="sc-sumclose">
          <button disabled={!up || waiting > 0 || closing} aria-describedby="sc-close-why" onClick={askClose}><Icon name="lock" size={20} /> ปิดรับงาน</button>
          <span id="sc-close-why" class="page-sub">{closeWhy}</span>
        </div>
      )}
      <div class="sc-sumbar" role="group" aria-label="ทำต่อ">
        <button class="primary sb-main" onClick={() => toBook()}><Icon name="notebook" size={20} /> ไปสมุดคะแนน</button>
        {next && (
          <button class="sb-next" onClick={() => again(next.classId)}>
            <Icon name="arrow-right" size={20} /> สแกนห้องถัดไป: {next.name} · ส่งแล้ว {next.done}/{next.of}</button>
        )}
        <button disabled={!isOpen} aria-describedby={isOpen ? undefined : "sc-again-why"} onClick={() => again(s.classId)}><Icon name="player-play" size={20} /> กลับไปสแกนต่อ</button>
        {!isOpen && <span id="sc-again-why" class="page-sub sb-why">งานนี้ปิดรับแล้ว</span>}
        <button onClick={() => { ended.value = null; }}><Icon name="list-check" size={20} /> เลือกงานอื่น</button>
      </div>
      {confirm.node}
    </div>
  );
}
