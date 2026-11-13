import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon";
import { activeClasses, studentsByClass } from "../../store";
import type { ScanMode } from "@shared/types";
import { bkkToday } from "@shared/time";
import { workState, countWorkStates } from "@shared/metrics";
import { api } from "../../lib/api";
import { online } from "../../lib/outbox";
import { kvSet } from "../../lib/idb";
import { notify } from "../../lib/notify";
import { scanLayout } from "../../lib/pageCards";
import { isHiddenCard } from "../../lib/cardLayout";
import { PageCardSettings } from "../../components/cards/PageCardSettings";
import { projectorOn } from "../../lib/projector";
import { isCoarse } from "../../lib/display";
import { installHidScanner } from "../../lib/hid";
import { fullName, shortName } from "../../lib/names";
import { serverReachable } from "../../lib/session";
import { navigate } from "../../router";
import { session, recvDate, subsBox, resetSubs, recent, feedback, pending, useCamera, cameraProblem, ended, scannerReady, excusedAsk, choices, activeAssignment, closedReason, fullScoreNow, restartRound, loadSubs, startPolling, effSub, markOf, handleScan, commitStudent, focusScan, MODE_LABEL, hidTestOn, hidLog, testHid, setScanViewLeft } from "./state";
import { useNarrow, Ring, HidBadge, HidTestPanel } from "./widgets";
import { RecentCard, RecentAllSheet, OptionsSheet, FailedPanel, FeedbackCard, SEAT_WORD, SEAT_ICON, ScorePad } from "./ScanParts";
import { ScanProjector } from "./ScanSummary";
import { ScanHero } from "./ScanHero";
import { UnsentCard, QueueCard, SCAN_META, SCAN_LOCKED_TEXT } from "./ScanSide";
import { ResumeBar } from "./ResumeBar";
import { HideNotice, scanHiding, whoLabel } from "./hide";

// ---------------------------------------------------------------------------
// The round on screen
// ---------------------------------------------------------------------------
export function ScanView() {
  const s = session.value!;
  const asg = activeAssignment.value;
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const camCtl = useRef<any>(null);
  const [torch, setTorch] = useState(false);
  const [seatSheet, setSeatSheet] = useState<string | null>(null); // a tap on a seat that is already in, or a recent row's ⋮: ask what to do, never undo at once
  const [recentAll, setRecentAll] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [rove, setRove] = useState(0); // the one seat of the grid that Tab lands on (arrows move it)
  const narrow = useNarrow();
  const hide = scanHiding(); // this page's own switch (AC-77)
  // on the TV the score pad would show a child's score: a round in "type a score" mode takes hand-ins first instead
  useEffect(() => {
    if (!projectorOn.value || s.mode !== "type") return;
    pending.value = null;
    const next = { ...s, mode: "later" as ScanMode };
    session.value = next; void kvSet("scanSession", next);
    notify("info", "โหมดกรอกคะแนนถูกสลับเป็น “รับงานก่อน” ระหว่างฉายจอ");
  }, [projectorOn.value, s.mode]);
  // P-2: on a computer or an iPad with a keyboard the scan field gets focus back after a dialog closes or a click on
  // empty space, so the next scan (or typed number) lands in it. A touch-only device is left alone.
  useEffect(() => {
    if (isCoarse()) return;
    const input = inputRef.current;
    if (!input) return;
    const back = () => {
      if (document.visibilityState !== "visible" || pending.value || document.querySelector('[role="dialog"]')) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && a !== input && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; // typing elsewhere
      input.focus({ preventScroll: true });
    };
    const out = (e: FocusEvent) => { if (!e.relatedTarget) setTimeout(back, 0); };
    input.addEventListener("focusout", out);
    document.addEventListener("visibilitychange", back);
    back();
    return () => { input.removeEventListener("focusout", out); document.removeEventListener("visibilitychange", back); };
  }, []);
  const layout = scanLayout.value;
  // the cards in the order the teacher chose ("ปรับการ์ด"); the badge row rides in the hero while it is the first one
  const cards = layout.order.filter((k) => !isHiddenCard(layout, k));
  const hidInTitle = cards[0] === "hid";

  // a session restored from storage (e.g. after a reload) has no submissions
  // loaded yet — fetch them so the grid and ring are correct
  useEffect(() => {
    if (subsBox.value.aid !== s.assignmentId) resetSubs(s.assignmentId);
    if (subsBox.value.status !== "ready") loadSubs(s.assignmentId).catch(() => {});
  }, [s.assignmentId]);

  useEffect(() => {
    const off = installHidScanner((raw) => { if (hidTestOn.value) testHid(raw); else handleScan(raw, "hid"); });
    return () => { off(); hidTestOn.value = false; hidLog.value = []; };
  }, []);
  useEffect(() => {
    const on = () => (scannerReady.value = true);
    const offf = () => (scannerReady.value = false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", offf);
    return () => { window.removeEventListener("focus", on); window.removeEventListener("blur", offf); };
  }, []);
  useEffect(() => startPolling(), []);
  useEffect(() => { setScanViewLeft(false); return () => { setScanViewLeft(true); }; }, []);
  useEffect(() => {
    let ctl: any = null;
    if (useCamera.value && videoRef.current) {
      cameraProblem.value = null;
      const fail = (e: unknown, explain: (e: unknown) => { title: string; hint: string }) => { useCamera.value = false; cameraProblem.value = explain(e); };
      import("../../lib/camera").then(({ startCamera, explainCamera }) =>
        startCamera(videoRef.current!, (raw) => handleScan(raw, "camera"), {
          onError: (e) => fail(e, explainCamera),
        }).then((c) => { ctl = c; camCtl.current = c; }).catch((e) => fail(e, explainCamera)),
      ).catch(() => {
        // the camera code itself could not be fetched (offline on a page that was never opened online)
        useCamera.value = false;
        cameraProblem.value = { title: "โหลดตัวอ่านกล้องไม่สำเร็จ", hint: "ต่อเน็ตแล้วลองอีกครั้ง — ระหว่างนี้ใช้เครื่องยิงหรือพิมพ์เลขที่ได้" };
      });
    }
    return () => { ctl?.stop?.(); camCtl.current = null; };
  }, [useCamera.value]);

  function endSession() {
    if (s) api.post(`/api/scan-sessions/${s.id}/end`).catch(() => {});
    ended.value = s;
    session.value = null;
    recvDate.value = null;
    kvSet("scanSession", null);
    useCamera.value = false;
  }

  const cls = activeClasses.value.find((c) => c.id === s.classId);
  const classStudents = studentsByClass.value.get(s.classId) ?? [];
  function switchMode(m: ScanMode) {
    if (m === s.mode) return;
    const hadScore = pending.value != null;
    pending.value = null; // a score being typed for the last child is left for the gradebook; the next scan follows the new mode
    const next = { ...s, mode: m };
    // R-09: the mode is kept on this device only; `scan_sessions.mode` on the server stays the mode the round STARTED in
    // (no update route exists, and nothing reads it for a number or a report) — see dev-notes
    session.value = next; void kvSet("scanSession", next);
    notify("info", `เปลี่ยนเป็น “${MODE_LABEL[m]}” — มีผลกับสแกนครั้งถัดไป` + (hadScore ? " · คะแนนที่ยังไม่ได้ใส่ ไปใส่ต่อได้ที่สมุดคะแนน" : ""));
  }
  const today = bkkToday();
  // the legend counts every seat by the same work state that colours it, so the groups add up to the
  // whole class; the ring is hand-ins ÷ (class − excused), the same rate as Home / Gradebook / Reports
  const states = classStudents.map((st) => {
    const sub = effSub(st.id);
    return asg ? workState(sub ? { status: sub.status, score: sub.score, late: sub.late === true } : null, asg, today) : "pending";
  });
  const seat = countWorkStates(states);
  const unsent = classStudents.filter((_, i) => states[i] === "missing" || states[i] === "pending"); // BR-14: not handed in and not excused
  const queued = classStudents.filter((st) => markOf(st.id) === "pend");
  const waiting = queued.length;
  const overdue = !!asg?.due_date && today > asg.due_date;
  const LEGEND: { n: number; label: string; swatch: string; icon?: string }[] = [
    { n: seat.scored, label: "ส่งแล้ว", icon: "check", swatch: "background:var(--bg-success);border:0.5px solid var(--border-success);color:var(--text-success)" },
    { n: seat.late, label: "ส่งช้า", icon: "clock", swatch: "background:var(--bg-warning);border:0.5px solid var(--border-warning);color:var(--text-warning)" },
    { n: seat.awaiting, label: "รอตรวจ", icon: "pencil", swatch: "background:var(--bg-accent);border:0.5px solid var(--border-accent);color:var(--text-accent)" },
    { n: seat.missing + seat.pending, label: "ยังไม่ส่ง", swatch: overdue ? "border:0.5px dashed var(--border-danger)" : "border:0.5px dashed var(--text-secondary)" },
    { n: seat.excused, label: "ยกเว้น", icon: "ban", swatch: "background:var(--surface-1);border:0.5px solid var(--border);color:var(--text-secondary)" },
  ];
  const known = subsBox.value.aid === s.assignmentId && subsBox.value.status === "ready";
  const up = online.value && serverReachable.value;
  const newFull = fullScoreNow.value;

  // arrows move between the seats (Tab enters and leaves the grid once)
  function gridKey(e: KeyboardEvent) {
    const grid = gridRef.current;
    if (!grid || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const cells = [...grid.querySelectorAll<HTMLButtonElement>("button.sc-cell")];
    const cur = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (cur < 0) return;
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
    const to = e.key === "ArrowLeft" ? cur - 1 : e.key === "ArrowRight" ? cur + 1 : e.key === "ArrowUp" ? cur - cols : e.key === "ArrowDown" ? cur + cols : e.key === "Home" ? 0 : cells.length - 1;
    e.preventDefault();
    if (to < 0 || to >= cells.length || to === cur) return;
    setRove(to);
    cells[to].focus();
  }

  return (
    <div class="sc-page sc-live">
      <ResumeBar s={s} onEnd={endSession} />
      <HideNotice />
      {!known && (
        <div class="imp-warn" role="status" style="margin:0 0 8px;font-size:var(--fs-sm)">
          <Icon name={subsBox.value.status === "unknown" ? "cloud-off" : "loader-2"} size={15} class={subsBox.value.status === "unknown" ? "" : "spin"} />
          <span class="grow">{subsBox.value.status === "unknown"
            ? "ยังไม่ทราบว่าใครส่งงานนี้แล้วบ้าง (โหลดจากระบบไม่ได้) — สแกนต่อได้ ทุกรายการเข้าคิวและระบบจะตรวจซ้ำตอนส่ง"
            : "กำลังโหลดข้อมูลของงานนี้…"}</span>
          {subsBox.value.status === "unknown" && <button class="ghost" style="height:1.73rem;font-size:var(--fs-xs)" onClick={() => loadSubs(s.assignmentId).catch(() => {})}>ลองอีกครั้ง</button>}
        </div>
      )}
      {closedReason.value && (
        <div class="sc-closed" role="alert">
          <Icon name="lock" size={20} />
          <div class="grow"><b style="font-weight:500">{closedReason.value === "closed" ? "งานนี้ปิดรับแล้ว" : "งานนี้ถูกลบแล้ว"}</b> — สแกนแล้วจะไม่บันทึก ให้คะแนนย้อนหลังได้ที่ <a href={`#/gradebook?class=${s.classId}&asg=${s.assignmentId}`}>สมุดคะแนน</a></div>
          <button style="height:2rem;font-size:var(--fs-xs)" onClick={endSession}>จบรอบ</button>
        </div>
      )}
      {/* AC-60: stays until the round is restarted or ended — the card of the refused scan is gone with the next scan */}
      {newFull != null && !closedReason.value && (
        <div class="sc-closed sc-fullchg" role="alert">
          <Icon name="alert-triangle" size={20} />
          <div class="grow"><b style="font-weight:500">คะแนนเต็มถูกแก้ไข</b><br />คะแนนเต็มปัจจุบันคือ {newFull} — เริ่มรอบใหม่เพื่อความถูกต้อง</div>
          <button class="primary" onClick={restartRound}><Icon name="refresh" size={18} /> เริ่มรอบใหม่</button>
          <button onClick={endSession}>จบรอบ</button>
        </div>
      )}
      <ScanHero x={seat.submitted} y={seat.counted} known={known} up={up} waiting={waiting} hid={hidInTitle ? <HidBadge /> : null}
        onEnd={endSession} onMode={switchMode} onPrefs={() => setPrefsOpen(true)} />
      {projectorOn.value && <ScanProjector s={s} classStudents={classStudents} known={known} />}
      {seatSheet && <OptionsSheet id={seatSheet} onClose={() => { setSeatSheet(null); focusScan(); }} />}
      {recentAll && <RecentAllSheet onClose={() => { setRecentAll(false); focusScan(); }} onOpen={(id) => { setRecentAll(false); setSeatSheet(id); }} />}
      {prefsOpen && <PageCardSettings page="scan" title="หน้าสแกน" layout={layout} meta={SCAN_META} locked={SCAN_LOCKED_TEXT} onClose={() => setPrefsOpen(false)} />}

      <div class="sc-layout">
      <div class="scan-input-row">
        <label class="scan-input">
          <Icon name="qrcode" size={24} class="muted" />
          <input
            ref={inputRef} autocomplete="off" inputMode="numeric" placeholder="ยิง QR หรือพิมพ์เลขที่ แล้วกด Enter" aria-label="รหัสนักเรียน"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value;
                (e.target as HTMLInputElement).value = "";
                if (v.trim()) handleScan(v, "manual");
              }
            }}
          />
        </label>
        <button class="icon sc-cam" aria-label="สแกนด้วยกล้อง" aria-pressed={useCamera.value} onClick={() => (useCamera.value = !useCamera.value)}>
          <Icon name={useCamera.value ? "camera-off" : "camera"} size={28} />
        </button>
      </div>

      <div class="sc-mid">
      {cameraProblem.value && (
        <div class="imp-warn danger" role="alert" style="margin:0 0 12px;font-size:var(--fs-sm)">
          <Icon name="camera-off" size={16} />
          <span class="grow"><b style="font-weight:500">{cameraProblem.value.title}</b><br />{cameraProblem.value.hint}<br />เครื่องยิง/พิมพ์เลขที่ใช้ได้ตามปกติ</span>
          <button class="ghost" style="height:1.73rem;font-size:var(--fs-xs)" onClick={() => (cameraProblem.value = null)}>ปิด</button>
        </div>
      )}

      {useCamera.value && (
        <div class="cam-wrap" style="margin-bottom:12px">
          <video ref={videoRef} muted playsinline />
          <div class="cam-frame" />
          <div class="cam-tools">
            {camCtl.current?.hasTorch?.() && (
              <button class="icon" aria-label="ไฟฉาย" onClick={async () => setTorch(await camCtl.current.toggleTorch())}><Icon name={torch ? "bulb-off" : "bulb"} size={18} /></button>
            )}
            <button class="icon" aria-label="สลับกล้อง" onClick={() => camCtl.current?.switchCamera?.()}><Icon name="camera-rotate" size={18} /></button>
          </div>
        </div>
      )}

      {hidTestOn.value && <HidTestPanel />}
      {/* while the score pad is open its header already names the child, so the "รับงานแล้ว" card would repeat it */}
      {pending.value
        ? <ScorePad />
        : <FeedbackCard />}
      {feedback.value && pending.value && <FeedbackCard hidden />}
      {excusedAsk.value && (
        <div class="card sc-choose" role="group" aria-label="เด็กที่ได้รับการยกเว้น">
          <div style="font-weight:500;margin-bottom:8px"><Icon name="ban" size={18} /> {whoLabel(excusedAsk.value.student, hide)} ถูกตั้งเป็น “ยกเว้น” ในงานนี้ — รับงานจริงไหม?</div>
          <div class="page-sub" style="margin-bottom:8px">รับงานแล้วจะเปลี่ยนจาก “ยกเว้น” เป็น “ส่งแล้ว”</div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="sc-pick primary" onClick={() => { const q = excusedAsk.value!; excusedAsk.value = null; commitStudent(q.student, q.method, true); }}>
              <span style="font-weight:500">รับงานนี้</span>
              <span class="page-sub">เปลี่ยนจากยกเว้นเป็นส่งแล้ว</span>
            </button>
            <button class="sc-pick" onClick={() => { excusedAsk.value = null; feedback.value = null; focusScan(); }}>
              <span style="font-weight:500">ไม่รับ คงยกเว้น</span>
              <span class="page-sub">ไม่เปลี่ยนอะไร</span>
            </button>
          </div>
        </div>
      )}
      {choices.value && (
        <div class="card sc-choose" role="alert" aria-label="เลือกนักเรียน">
          <div class="row" style="justify-content:space-between;gap:8px;margin-bottom:8px">
            <span style="font-weight:500">เลขที่ {choices.value.raw} มี {choices.value.students.length} คน — เลือกคนที่ถูกต้อง</span>
            <button class="ghost" style="height:1.87rem;font-size:var(--fs-xs)" onClick={() => { choices.value = null; focusScan(); }}>ยกเลิก</button>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            {choices.value.students.map((st) => (
              <button class="sc-pick" onClick={() => { const m = choices.value!.method; choices.value = null; commitStudent(st, m); focusScan(); }}>
                <span style="font-weight:500">{hide ? `เลขที่ ${st.number ?? "-"}` : fullName(st)}</span>
                <span class="page-sub">รหัส {st.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <FailedPanel assignmentId={s.assignmentId} classId={s.classId} />
      </div>

        <div class="sc-zone">
          {cards.map((k) => {
            if (k === "hid") return hidInTitle ? null : <div class="sc-hidbar" key="hid"><HidBadge /></div>;
            if (k === "hint") return pending.value ? null : (
              <div class="page-sub sc-hint" key="hint">{s.mode === "full" ? "โหมดให้คะแนนเต็ม: ยิงแล้วได้คะแนนเต็มทันที · แตะช่องที่ส่งแล้วเพื่อแก้หรือยกเลิก" : s.mode === "later" ? "โหมดรับงานก่อน: ยิงแล้วบันทึกว่าส่ง ให้คะแนนทีหลังในสมุดคะแนน" : "โหมดกรอกทีละคน: ยิงแล้วพิมพ์คะแนน กด “บันทึก” หรือ Enter"}</div>
            );
            if (k === "unsent") return <UnsentCard key="unsent" people={unsent} known={known} narrow={narrow} />;
            return <RecentCard key="recent" s={s} strip={narrow && s.mode === "type"} onOpen={setSeatSheet} onAll={() => setRecentAll(true)} />;
          })}
          <QueueCard people={queued} narrow={narrow} />
        </div>

        <section class="card sc-gridcard" aria-labelledby="sc-grid-h">
          <div class="ghead">
            <Ring value={known ? seat.submitted : 0} total={known ? seat.counted : classStudents.length} size={56} label={known ? undefined : "ไม่ทราบ"} />
            <div class="gh-main">
              <h2 id="sc-grid-h" class="sc-h2">ผังเลขที่ {cls?.name}</h2>
              <div class="sc-legend">
                {known
                  ? LEGEND.filter((g) => g.n > 0).map((g) => <div class="row" style="gap:6px"><span class="sw" style={g.swatch}>{g.icon && <Icon name={g.icon} size={12} />}</span>{g.label} {g.n}</div>)
                  : <div class="row" style="gap:6px"><span class="sw" style="border:0.5px dashed var(--text-secondary)" />ยังไม่ทราบ ?</div>}
                {waiting > 0 && <div class="row wait" style="gap:6px"><span class="sw" style="background:var(--bg-warning);color:var(--text-warning);border:0.5px solid var(--border-warning)"><Icon name="cloud-upload" size={12} /></span>รอส่งขึ้นระบบ {waiting}</div>}
              </div>
              <div class="page-sub">{known && seat.submitted === 0 && classStudents.length > 0 ? "ยังไม่มีใครส่ง — ยิงได้เลย · " : ""}แตะช่องว่าง = รับงานให้คนนั้น · แตะช่องที่ส่งแล้ว = แก้/ยกเลิก</div>
            </div>
          </div>
          {classStudents.length === 0 ? (
            <div class="sc-empty" role="status">
              <Icon name="users" size={28} />
              <div class="grow"><b style="font-weight:500">ห้องนี้ยังไม่มีนักเรียน</b><div class="page-sub">นำเข้ารายชื่อจาก Excel หรือเพิ่มทีละคน</div></div>
              <button onClick={() => navigate("/students")}><Icon name="table-import" size={18} /> นำเข้านักเรียน</button>
            </div>
          ) : (
            <div class="sc-grid" ref={gridRef} role="group" aria-label={`ผังเลขที่ ${cls?.name ?? ""}`} onKeyDown={gridKey}>
              {classStudents.map((st, i) => {
                const sub = effSub(st.id);
                const mark = markOf(st.id);
                const state = asg ? workState(sub ? { status: sub.status, score: sub.score, late: sub.late === true } : null, asg, today) : "pending";
                const hit = recent.value[0]?.studentId === st.id;
                const word = known ? SEAT_WORD[state] : "ยังไม่ทราบ";
                const tail = (mark === "pend" ? " · รอส่งขึ้นระบบ" : mark === "fail" ? " · ส่งไม่สำเร็จ" : "") + (hit ? " · ล่าสุด" : "");
                return (
                  <button class={`sc-cell ${known ? state : "pending unk"}${hit ? " hit" : ""}${mark ? " " + mark : ""}`} title={(hide ? `เลขที่ ${st.number ?? "-"}` : fullName(st)) + tail}
                    tabIndex={i === Math.min(rove, classStudents.length - 1) ? 0 : -1} onFocus={() => setRove(i)}
                    aria-label={`${whoLabel(st, hide)} · ${word}${tail}`}
                    onClick={() => (sub && sub.status === "submitted") ? setSeatSheet(st.id) : commitStudent(st, "manual")}>
                    <span class="t"><span>{st.number ?? "-"}</span>
                      {!known ? <span class="sc-ic" aria-hidden="true">?</span> : SEAT_ICON[state] && <Icon name={SEAT_ICON[state]} size={14} class="sc-ic" />}</span>
                    {!hide && <span class="nm">{shortName(st)}</span>}
                    {mark && <span class={"sc-corner " + mark} aria-hidden="true"><Icon name={mark === "pend" ? "cloud-upload" : "cloud-x"} size={12} /></span>}
                    {hit && <span class="sc-lasttag" aria-hidden="true">ล่าสุด</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
